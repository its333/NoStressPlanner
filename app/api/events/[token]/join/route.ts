// app/api/events/[token]/join/route.ts
// Updated join API for the new schema

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';

import {
  getCurrentAttendeeSession,
  createAttendeeSession,
  generateSessionKey,
} from '@/lib/attendees';
import { auth } from '@/lib/auth';
import { invalidateEventOperationCache } from '@/lib/cache-invalidation';
import { cookieManager } from '@/lib/cookie-manager';
import { debugLog } from '@/lib/debug';
import { prisma } from '@/lib/prisma';
import { rateLimiters } from '@/lib/rate-limiter';
import { emit } from '@/lib/realtime';
import { sessionManager } from '@/lib/session-manager';
import { joinEventSchema } from '@/lib/validators';

export const POST = rateLimiters.general(
  async (req: NextRequest, context: { params: Promise<{ token: string }> }) => {
    try {
      const { token } = await context.params;
      const json = await req.json();
      const parsed = joinEventSchema.safeParse(json);

      if (!parsed.success) {
        debugLog('Join API: validation failed', parsed.error.flatten());
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { attendeeNameId, nameSlug, displayName, timeZone } = parsed.data;

      debugLog('Join API: request received', {
        token: token.substring(0, 10) + '...',
        attendeeNameId,
        nameSlug,
        displayName,
        timeZone,
      });

      // Find event with attendee names
      const invite = await prisma.inviteToken.findUnique({
        where: { token },
        include: {
          event: {
            include: {
              attendeeNames: true,
            },
          },
        },
      });

      if (!invite?.event) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }

      const event = invite.event;
      const session = await auth();
      const userId = session?.user?.id;
      const currentSessionKey = await cookieManager.getSessionKey(event.id);

      // Validate attendee name exists - prefer attendeeNameId if provided, otherwise use nameSlug
      let attendeeName;
      if (attendeeNameId) {
        attendeeName = event.attendeeNames.find(
          name => name.id === attendeeNameId
        );
        debugLog('Join API: attendeeNameId lookup', {
          attendeeNameId,
          found: !!attendeeName,
        });
        if (!attendeeName) {
          return NextResponse.json(
            { error: 'Attendee name ID not found' },
            { status: 404 }
          );
        }
        // Verify the nameSlug matches the attendeeNameId (if both provided)
        if (nameSlug && attendeeName.slug !== nameSlug) {
          debugLog('Join API: name slug mismatch', {
            expected: nameSlug,
            actual: attendeeName.slug,
          });
          return NextResponse.json(
            { error: 'Name slug does not match attendee name ID' },
            { status: 400 }
          );
        }
      } else if (nameSlug) {
        attendeeName = event.attendeeNames.find(name => name.slug === nameSlug);
        debugLog('Join API: nameSlug lookup', {
          nameSlug,
          found: !!attendeeName,
        });
        if (!attendeeName) {
          return NextResponse.json(
            { error: 'Name not found' },
            { status: 404 }
          );
        }
      } else {
        return NextResponse.json(
          { error: 'Either attendeeNameId or nameSlug is required' },
          { status: 400 }
        );
      }

      debugLog('Join API: selected attendee name', {
        id: attendeeName.id,
        label: attendeeName.label,
        slug: attendeeName.slug,
      });

      // Check if user is already joined
      const currentSession = await getCurrentAttendeeSession(
        event.id,
        userId,
        currentSessionKey || undefined
      );

      // If user is already joined, allow them to switch names or rejoin
      if (currentSession) {
        if (currentSession.attendeeNameId === attendeeName.id) {
          // Same name - just return success (they're already joined)
          return NextResponse.json({
            ok: true,
            attendeeId: currentSession.id,
            message: 'Already joined with this name',
          });
        }

        // Different name - deactivate current session and allow join with new name
        await prisma.attendeeSession.update({
          where: { id: currentSession.id },
          data: { isActive: false },
        });
      }

      // Check if name is already taken by an active session
      const conflictingSession = await prisma.attendeeSession.findFirst({
        where: {
          eventId: event.id,
          attendeeNameId: attendeeName.id,
          isActive: true,
          ...(currentSession ? { id: { not: currentSession.id } } : {}),
        },
        select: {
          id: true,
          attendeeName: {
            select: { label: true },
          },
        },
      });

      if (conflictingSession) {
        return NextResponse.json(
          {
            error: `The name "${conflictingSession.attendeeName.label}" is currently taken. Please choose another name.`,
          },
          { status: 409 }
        );
      }

      // Create new session
      const sessionKey = generateSessionKey(userId, event.id);

      debugLog('Join API: creating new session', {
        eventId: event.id,
        attendeeNameId: attendeeName.id,
        userId,
        sessionKey: sessionKey.substring(0, 30) + '...',
        displayName: displayName || attendeeName.label,
        timeZone: timeZone || 'UTC',
      });

      await cookieManager.clearStaleSessionCookies(event.id);

      const attendeeSession = await createAttendeeSession({
        eventId: event.id,
        attendeeNameId: attendeeName.id,
        userId,
        sessionKey,
        displayName: displayName || attendeeName.label,
        timeZone: timeZone || 'UTC',
        anonymousBlocks: true,
      });

      debugLog('Join API: session created successfully', {
        sessionId: attendeeSession.id,
        attendeeNameId: attendeeSession.attendeeNameId,
      });

      // Set the cookie to this session
      await cookieManager.setSessionKey(
        sessionKey,
        userId ? 'user' : 'anonymous'
      );

      debugLog('Join API: session key stored in cookie');

      // Clear session cache to prevent conflicts
      sessionManager.clearCache();

      await emit(event.id, 'attendee.joined', {
        attendeeId: attendeeSession.id,
      });

      debugLog('Join API: emitted attendee.joined event');

      // Proper cache invalidation using centralized system
      await invalidateEventOperationCache(token, 'join');

      debugLog('Join API: cache invalidated');

      // Create response with cache-busting headers to prevent cookie contamination
      const response = NextResponse.json({
        ok: true,
        attendeeId: attendeeSession.id,
      });

      // Add headers to prevent caching and ensure fresh session
      response.headers.set(
        'Cache-Control',
        'no-cache, no-store, must-revalidate'
      );
      response.headers.set('Pragma', 'no-cache');
      response.headers.set('Expires', '0');

      return response;
    } catch (error) {
      console.error('Error joining event:', error);
      return NextResponse.json(
        { error: 'Failed to join event' },
        { status: 500 }
      );
    }
  }
);
