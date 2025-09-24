// app/api/events/[token]/join/route.ts
// Simplified join API using person-centric approach

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { invalidateEventOperationCache } from '@/lib/cache-invalidation';
import { debugLog } from '@/lib/debug';
import { prisma } from '@/lib/prisma';
import { rateLimiters } from '@/lib/rate-limiter';
import { emit } from '@/lib/realtime';
import { sessionManager } from '@/lib/session-manager';
import { setSelectedPerson } from '@/lib/simple-cookies';

const joinEventSchema = z
  .object({
    attendeeNameId: z.string().optional(),
    nameSlug: z.string().optional(),
    displayName: z.string().optional(),
    timeZone: z.string().optional(),
  })
  .refine(data => data.attendeeNameId || data.nameSlug, {
    message: 'Either attendeeNameId or nameSlug must be provided',
  });

export const POST = rateLimiters.general(
  async (req: NextRequest, context: { params: Promise<{ token: string }> }) => {
    try {
      const { token } = await context.params;
      const json = await req.json();
      debugLog('Join API: request received', json);

      const parsed = joinEventSchema.safeParse(json);
      if (!parsed.success) {
        debugLog('Join API: validation failed', parsed.error.flatten());
        return NextResponse.json(
          { ok: false, error: 'Invalid request data' },
          { status: 400 }
        );
      }

      const { attendeeNameId, nameSlug, displayName, timeZone } = parsed.data;

      // Get event with all necessary data
      const invite = await prisma.inviteToken.findUnique({
        where: { token },
        include: {
          event: {
            include: {
              attendeeNames: true,
              attendeeSessions: {
                where: { isActive: true },
                include: { attendeeName: true },
              },
            },
          },
        },
      });

      if (!invite?.event) {
        return NextResponse.json(
          { ok: false, error: 'Event not found' },
          { status: 404 }
        );
      }

      const event = invite.event;
      const session = await auth();
      const userId = session?.user?.id;

      // Validate attendee name exists - prefer attendeeNameId if provided, otherwise use nameSlug
      const attendeeName = attendeeNameId
        ? event.attendeeNames.find(name => name.id === attendeeNameId)
        : nameSlug
          ? event.attendeeNames.find(name => name.slug === nameSlug)
          : undefined;

      if (!attendeeName) {
        return NextResponse.json(
          { ok: false, error: 'Invalid attendee name' },
          { status: 400 }
        );
      }

      debugLog('Join API: attendee name validated', {
        eventId: event.id,
        attendeeNameId: attendeeName.id,
        attendeeNameLabel: attendeeName.label,
        attendeeNameSlug: attendeeName.slug,
      });

      // Check if name is already taken by a logged-in user
      const activeSessions = event.attendeeSessions || [];
      const conflictingSession = activeSessions.find(
        session => session.attendeeNameId === attendeeName.id
      );

      if (conflictingSession && conflictingSession.userId) {
        // Name is taken by a logged-in user
        return NextResponse.json(
          {
            ok: false,
            error: `The name "${conflictingSession.attendeeName.label}" is claimed by a logged-in user. Please choose another name.`,
          },
          { status: 409 }
        );
      }

      // For logged-in users, check if they already have a session
      if (userId) {
        const existingSession = activeSessions.find(
          session => session.userId === userId
        );
        if (existingSession) {
          // User already has a session, update it to use the new name
          await prisma.attendeeSession.update({
            where: { id: existingSession.id },
            data: {
              attendeeNameId: attendeeName.id,
              sessionKey: `person_${attendeeName.slug}_${Date.now()}`, // Temporary session key for compatibility
              displayName: displayName || attendeeName.label,
              timeZone: timeZone || 'UTC',
              updatedAt: new Date(),
            },
          });

          debugLog('Join API: updated existing session for logged-in user', {
            sessionId: existingSession.id,
            userId,
            attendeeNameId: attendeeName.id,
          });

          sessionManager.clearCache();

          await emit(event.id, 'attendee.nameChanged', {
            attendeeId: existingSession.id,
            newName: attendeeName.label,
          });

          await invalidateEventOperationCache(token, 'join');

          return NextResponse.json({
            success: true,
            mode: 'switched',
            message: `You've switched to "${attendeeName.label}".`,
            attendeeNames: event.attendeeNames.map(name => ({
              id: name.id,
              label: name.label,
              slug: name.slug,
              takenBy: activeSessions.find(s => s.attendeeNameId === name.id)
                ?.userId
                ? 'claimed'
                : null,
            })),
            you: {
              id: existingSession.id,
              displayName: displayName || attendeeName.label,
              timeZone: timeZone || 'UTC',
              attendeeName: {
                id: attendeeName.id,
                label: attendeeName.label,
                slug: attendeeName.slug,
              },
              anonymousBlocks: false,
            },
            initialBlocks: [],
            yourVote: null,
          });
        }
      }

      // Create new session for each browser (even for the same person name)
      const attendeeSession = await prisma.attendeeSession.create({
        data: {
          eventId: event.id,
          attendeeNameId: attendeeName.id,
          userId: userId || null,
          sessionKey: `browser_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Unique browser session key
          displayName: displayName || attendeeName.label,
          timeZone: timeZone || 'UTC',
          anonymousBlocks: !userId,
          isActive: true,
        },
      });

      debugLog('Join API: session created/updated successfully', {
        sessionId: attendeeSession.id,
        attendeeNameId: attendeeSession.attendeeNameId,
        userId: attendeeSession.userId,
      });

      console.log('🍪 Join API: Session created', {
        userId: attendeeSession.userId,
        isAnonymous: !attendeeSession.userId,
        attendeeNameSlug: attendeeName.slug,
      });

      // For anonymous users, set their selected person for UX
      if (!userId) {
        console.log('🍪 Setting cookie for anonymous user:', {
          userId,
          attendeeNameSlug: attendeeName.slug,
        });
        await setSelectedPerson(event.id, attendeeName.slug, req);
      } else {
        console.log('🍪 Skipping cookie for logged-in user:', {
          userId,
          attendeeNameSlug: attendeeName.slug,
        });
      }

      sessionManager.clearCache();

      await emit(event.id, 'attendee.joined', {
        attendeeId: attendeeSession.id,
      });

      debugLog('Join API: emitted attendee.joined event');

      await invalidateEventOperationCache(token, 'join');

      debugLog('Join API: cache invalidated');

      const mode = conflictingSession ? 'switched' : 'created';

      return NextResponse.json({
        ok: true,
        attendeeId: attendeeSession.id,
        mode,
        message:
          mode === 'switched'
            ? `You've switched to "${attendeeName.label}".`
            : `You're now joining as "${attendeeName.label}".`,
        attendeeNames: event.attendeeNames.map(name => ({
          id: name.id,
          label: name.label,
          slug: name.slug,
          takenBy: activeSessions.find(s => s.attendeeNameId === name.id)
            ?.userId
            ? 'claimed'
            : null,
        })),
        you: {
          id: attendeeSession.id,
          displayName: attendeeSession.displayName,
          timeZone: attendeeSession.timeZone,
          attendeeName: {
            id: attendeeName.id,
            label: attendeeName.label,
            slug: attendeeName.slug,
          },
          anonymousBlocks: attendeeSession.anonymousBlocks,
        },
        initialBlocks: [],
        yourVote: null,
      });
    } catch (error) {
      debugLog('Join API: error occurred', error);
      return NextResponse.json(
        { ok: false, error: 'Failed to join event' },
        { status: 500 }
      );
    }
  }
);
