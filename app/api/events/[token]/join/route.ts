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
import {
  setSessionKey,
  getSessionKey,
  clearAttendeeSessionCookies,
} from '@/lib/cookies';
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
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { attendeeNameId, nameSlug, displayName, timeZone } = parsed.data;
      
      console.log('🔍 Join API Debug:', {
        token: token.substring(0, 10) + '...',
        attendeeNameId,
        nameSlug,
        displayName,
        timeZone
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
      const currentSessionKey = await getSessionKey(event.id);

      // Validate attendee name exists - prefer attendeeNameId if provided, otherwise use nameSlug
      let attendeeName;
      if (attendeeNameId) {
        attendeeName = event.attendeeNames.find(name => name.id === attendeeNameId);
        console.log('🔍 Looking for attendeeNameId:', attendeeNameId, 'Found:', !!attendeeName);
        if (!attendeeName) {
          return NextResponse.json({ error: 'Attendee name ID not found' }, { status: 404 });
        }
        // Verify the nameSlug matches the attendeeNameId (if both provided)
        if (nameSlug && attendeeName.slug !== nameSlug) {
          console.log('🔍 Name slug mismatch:', { expected: nameSlug, actual: attendeeName.slug });
          return NextResponse.json({ error: 'Name slug does not match attendee name ID' }, { status: 400 });
        }
      } else if (nameSlug) {
        attendeeName = event.attendeeNames.find(name => name.slug === nameSlug);
        console.log('🔍 Looking for nameSlug:', nameSlug, 'Found:', !!attendeeName);
        if (!attendeeName) {
          return NextResponse.json({ error: 'Name not found' }, { status: 404 });
        }
      } else {
        return NextResponse.json({ error: 'Either attendeeNameId or nameSlug is required' }, { status: 400 });
      }
      
      console.log('🔍 Selected attendee name:', {
        id: attendeeName.id,
        label: attendeeName.label,
        slug: attendeeName.slug
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
      
      console.log('🔍 Creating new session:', {
        eventId: event.id,
        attendeeNameId: attendeeName.id,
        userId,
        sessionKey: sessionKey.substring(0, 30) + '...',
        displayName: displayName || attendeeName.label,
        timeZone: timeZone || 'UTC'
      });

      await clearAttendeeSessionCookies();

      const attendeeSession = await createAttendeeSession({
        eventId: event.id,
        attendeeNameId: attendeeName.id,
        userId,
        sessionKey,
        displayName: displayName || attendeeName.label,
        timeZone: timeZone || 'UTC',
        anonymousBlocks: true,
      });
      
      console.log('🔍 Session created successfully:', {
        sessionId: attendeeSession.id,
        attendeeNameId: attendeeSession.attendeeNameId
      });

      // Set the cookie to this session
      await setSessionKey(sessionKey, userId ? 'user' : 'anonymous');
      
      console.log('🔍 Session key set in cookie');

      // Clear session cache to prevent conflicts
      sessionManager.clearCache();

      await emit(event.id, 'attendee.joined', {
        attendeeId: attendeeSession.id,
      });
      
      console.log('🔍 Emitted attendee.joined event');

      // Proper cache invalidation using centralized system
      await invalidateEventOperationCache(token, 'join');
      
      console.log('🔍 Cache invalidated');

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
