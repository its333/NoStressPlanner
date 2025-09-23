// app/api/events/[token]/join/route.ts
// Updated join API for the new schema

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';

import {
  createAttendeeSession,
  generateSessionKey,
  getCurrentAttendeeSession,
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
import type { AttendeeNameStatus, JoinSuccessResponse } from '@/types/api';

type ActiveSession = {
  id: string;
  attendeeNameId: string;
  userId: string | null;
  sessionKey: string;
  displayName: string;
  timeZone: string;
  anonymousBlocks: boolean;
  hasSavedAvailability: boolean;
  attendeeName: {
    id: string;
    label: string;
    slug: string;
  };
};

function normalizeSession(session: any): ActiveSession {
  return {
    id: session.id,
    attendeeNameId: session.attendeeNameId,
    userId: session.userId ?? null,
    sessionKey: session.sessionKey,
    displayName: session.displayName,
    timeZone: session.timeZone,
    anonymousBlocks: session.anonymousBlocks ?? true,
    hasSavedAvailability: session.hasSavedAvailability ?? false,
    attendeeName: {
      id: session.attendeeName.id,
      label: session.attendeeName.label,
      slug: session.attendeeName.slug,
    },
  };
}

function buildAttendeeNameStatuses(
  attendeeNames: Array<{ id: string; label: string; slug: string }>,
  sessions: ActiveSession[],
  viewerUserId?: string | null
): AttendeeNameStatus[] {
  const byNameId = new Map(
    sessions.map(session => [session.attendeeNameId, session])
  );

  return attendeeNames.map(name => {
    const session = byNameId.get(name.id);
    const takenBy = session ? (session.userId ? 'claimed' : 'taken') : null;

    return {
      id: name.id,
      label: name.label,
      slug: name.slug,
      takenBy,
      claimedByLoggedUser: !!viewerUserId && session?.userId === viewerUserId,
    };
  });
}

function createSuccessResponse(payload: JoinSuccessResponse) {
  const response = NextResponse.json(payload);
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  return response;
}

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

      const invite = await prisma.inviteToken.findUnique({
        where: { token },
        include: {
          event: {
            include: {
              attendeeNames: true,
              attendeeSessions: {
                where: { isActive: true },
                select: {
                  id: true,
                  attendeeNameId: true,
                  userId: true,
                  sessionKey: true,
                  displayName: true,
                  timeZone: true,
                  anonymousBlocks: true,
                  hasSavedAvailability: true,
                  attendeeName: {
                    select: {
                      id: true,
                      label: true,
                      slug: true,
                    },
                  },
                },
              },
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

      const attendeeNames = event.attendeeNames;
      const activeSessions = (event.attendeeSessions || []).map(
        normalizeSession
      );

      // Validate attendee name exists - prefer attendeeNameId if provided, otherwise use nameSlug
      const attendeeName = attendeeNameId
        ? attendeeNames.find(name => name.id === attendeeNameId)
        : nameSlug
          ? attendeeNames.find(name => name.slug === nameSlug)
          : undefined;

      if (!attendeeName) {
        debugLog('Join API: attendee name lookup failed', {
          attendeeNameId,
          nameSlug,
        });
        return NextResponse.json(
          {
            error: attendeeNameId
              ? 'Attendee name ID not found'
              : 'Name not found',
          },
          { status: attendeeNameId ? 404 : 400 }
        );
      }

      if (attendeeNameId && nameSlug && attendeeName.slug !== nameSlug) {
        debugLog('Join API: name slug mismatch', {
          expected: nameSlug,
          actual: attendeeName.slug,
        });
        return NextResponse.json(
          { error: 'Name slug does not match attendee name ID' },

          { status: 400 }
        );
      }

      debugLog('Join API: selected attendee name', {
        id: attendeeName.id,
        label: attendeeName.label,
        slug: attendeeName.slug,
      });

      let currentSession =
        (currentSessionKey
          ? activeSessions.find(
              session => session.sessionKey === currentSessionKey
            )
          : null) ||
        (userId
          ? activeSessions.find(session => session.userId === userId)
          : null) ||
        null;

      if (!currentSession && (currentSessionKey || userId)) {
        const fallbackSession = await getCurrentAttendeeSession(
          event.id,
          userId,
          currentSessionKey || undefined
        );
        if (fallbackSession) {
          currentSession = normalizeSession(fallbackSession);
          activeSessions.push(currentSession);
        }
      }

      const viewerUserId = userId ?? null;

      const buildJoinResponse = (
        attendeeSession: ActiveSession,
        sessions: ActiveSession[],
        mode: JoinSuccessResponse['mode'],
        message?: string
      ) =>
        createSuccessResponse({
          ok: true,
          attendeeId: attendeeSession.id,
          mode,
          you: {
            id: attendeeSession.id,
            displayName: attendeeSession.displayName,
            timeZone: attendeeSession.timeZone,
            anonymousBlocks: attendeeSession.anonymousBlocks,
            attendeeName: {
              id: attendeeSession.attendeeName.id,
              label: attendeeSession.attendeeName.label,
              slug: attendeeSession.attendeeName.slug,
            },
          },
          attendeeNames: buildAttendeeNameStatuses(
            attendeeNames,
            sessions,
            viewerUserId
          ),
          initialBlocks: [],
          yourVote: null,
          message,
        });

      if (currentSession && currentSession.attendeeNameId === attendeeName.id) {
        debugLog('Join API: user already joined with this name', {
          sessionId: currentSession.id,
        });

        await cookieManager.setSessionKey(
          currentSession.sessionKey,
          userId ? 'user' : 'anonymous'
        );
        sessionManager.clearCache();

        return buildJoinResponse(
          currentSession,
          activeSessions,
          'already_joined',
          'Already joined with this name'
        );
      }

      if (currentSession) {
        await prisma.attendeeSession.update({
          where: { id: currentSession.id },
          data: { isActive: false },
        });
      }

      const conflictingSession = activeSessions.find(
        session => session.attendeeNameId === attendeeName.id
      );

      if (conflictingSession && conflictingSession.id !== currentSession?.id) {
        return NextResponse.json(
          {
            error: `The name "${conflictingSession.attendeeName.label}" is currently taken. Please choose another name.`,
          },
          { status: 409 }
        );
      }

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

      const normalizedSession = normalizeSession(attendeeSession);

      debugLog('Join API: session created successfully', {
        sessionId: normalizedSession.id,
        attendeeNameId: normalizedSession.attendeeNameId,
      });

      const updatedSessions = activeSessions
        .filter(session => session.id !== currentSession?.id)
        .filter(
          session => session.attendeeNameId !== normalizedSession.attendeeNameId
        );
      updatedSessions.push(normalizedSession);
      await cookieManager.setSessionKey(
        sessionKey,
        userId ? 'user' : 'anonymous'
      );

      debugLog('Join API: session key stored in cookie');

      sessionManager.clearCache();

      await emit(event.id, 'attendee.joined', {
        attendeeId: normalizedSession.id,
      });

      debugLog('Join API: emitted attendee.joined event');

      await invalidateEventOperationCache(token, 'join');

      debugLog('Join API: cache invalidated');

      const mode: JoinSuccessResponse['mode'] = currentSession
        ? 'switched'
        : 'created';

      return buildJoinResponse(
        normalizedSession,
        updatedSessions,
        mode,
        mode === 'switched'
          ? `You've switched to "${normalizedSession.attendeeName.label}".`
          : `You're now joining as "${normalizedSession.attendeeName.label}".`
      );
    } catch (error) {
      console.error('Error joining event:', error);
      return NextResponse.json(
        { error: 'Failed to join event' },
        { status: 500 }
      );
    }
  }
);
