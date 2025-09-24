// app/api/events/[token]/leave/route.ts
// Simplified leave API using person-centric approach

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { invalidateEventOperationCache } from '@/lib/cache-invalidation';
import { debugLog } from '@/lib/debug';
import { prisma } from '@/lib/prisma';
import { rateLimiters } from '@/lib/rate-limiter';
import { emit } from '@/lib/realtime';
import { getSelectedPerson } from '@/lib/simple-cookies';

export const DELETE = rateLimiters.general(
  async (
    _req: NextRequest,
    context: { params: Promise<{ token: string }> }
  ) => {
    try {
      const { token } = await context.params;

      // Find event with all necessary data
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
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }

      const event = invite.event;
      const session = await auth();
      const userId = session?.user?.id;

      // Find the attendee session for the current user
      let attendeeSession = null;

      if (userId) {
        // Logged-in user: find their session
        attendeeSession = event.attendeeSessions.find(s => s.userId === userId);
      } else {
        // Anonymous user: find session by selected person
        const selectedPerson = await getSelectedPerson(event.id, _req);
        if (selectedPerson) {
          const selectedAttendeeName = event.attendeeNames.find(
            name => name.slug === selectedPerson
          );
          if (selectedAttendeeName) {
            attendeeSession = event.attendeeSessions.find(
              s => s.attendeeNameId === selectedAttendeeName.id
            );
          }
        }
      }

      if (!attendeeSession) {
        return NextResponse.json(
          { error: 'Not currently joined to this event' },
          { status: 404 }
        );
      }

      debugLog('Leave API: deactivating session', {
        sessionId: attendeeSession.id,
        attendeeNameId: attendeeSession.attendeeNameId,
        userId: attendeeSession.userId,
      });

      // Deactivate the session instead of deleting it
      // This preserves the person's data (votes, blocks) for potential future access
      await prisma.attendeeSession.update({
        where: { id: attendeeSession.id },
        data: { isActive: false },
      });

      // Emit realtime event to update all clients
      try {
        await emit(event.id, 'attendee.left', {
          attendeeId: attendeeSession.id,
        });
      } catch (emitError) {
        debugLog('Leave API: failed to emit attendee.left event', emitError);
      }

      // Invalidate cache
      try {
        await invalidateEventOperationCache(token, 'leave');
      } catch (cacheError) {
        debugLog('Leave API: failed to invalidate cache', cacheError);
      }

      debugLog('Leave API: session deactivated successfully', {
        sessionId: attendeeSession.id,
        attendeeNameId: attendeeSession.attendeeNameId,
      });

      return NextResponse.json({
        success: true,
        message: 'Successfully left the event',
      });
    } catch (error) {
      debugLog('Leave API: error occurred', error);
      return NextResponse.json(
        { error: 'Failed to leave event' },
        { status: 500 }
      );
    }
  }
);
