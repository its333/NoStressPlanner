// app/api/events/[token]/vote/route.ts
// Simplified vote API using person-centric approach

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { invalidateEventOperationCache } from '@/lib/cache-invalidation';
import { debugLog } from '@/lib/debug';
import { prisma } from '@/lib/prisma';
import { rateLimiters } from '@/lib/rate-limiter';
import { emit } from '@/lib/realtime';
import { getSelectedPerson } from '@/lib/simple-cookies';
import { voteSchema } from '@/lib/validators';

export const POST = rateLimiters.voting(
  async (req: NextRequest, context: { params: Promise<{ token: string }> }) => {
    try {
      const { token } = await context.params;
      const json = await req.json();
      debugLog('Vote API: request received', json);
      
      const parsed = voteSchema.safeParse(json);
      if (!parsed.success) {
        debugLog('Vote API: validation failed', parsed.error.flatten());
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { in: voteIn } = parsed.data;

      // Find event with all necessary data
      const invite = await prisma.inviteToken.findUnique({
        where: { token },
        include: {
          event: {
            include: {
              attendeeNames: true,
              attendeeSessions: {
                where: { isActive: true },
                include: { attendeeName: true }
              }
            }
          }
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
      
      debugLog('Vote API: session detection started', {
        userId,
        eventId: event.id,
        totalAttendeeSessions: event.attendeeSessions.length,
        totalAttendeeNames: event.attendeeNames.length,
      });
      
      if (userId) {
        // Logged-in user: find their session
        attendeeSession = event.attendeeSessions.find(s => s.userId === userId);
        debugLog('Vote API: logged-in user session lookup', {
          userId,
          foundSession: !!attendeeSession,
          totalSessions: event.attendeeSessions.length,
        });
      } else {
        // Anonymous user: find session by selected person
        const selectedPerson = await getSelectedPerson(event.id, req);
        debugLog('Vote API: anonymous user session lookup', {
          selectedPerson,
          eventId: event.id,
          availableAttendeeNames: event.attendeeNames.map(n => ({ id: n.id, slug: n.slug, label: n.label })),
          availableSessions: event.attendeeSessions.map(s => ({ 
            id: s.id, 
            attendeeNameId: s.attendeeNameId, 
            attendeeNameSlug: s.attendeeName?.slug,
            isActive: s.isActive 
          })),
        });
        
        if (selectedPerson) {
          const selectedAttendeeName = event.attendeeNames.find(name => name.slug === selectedPerson);
          if (selectedAttendeeName) {
            attendeeSession = event.attendeeSessions.find(s => s.attendeeNameId === selectedAttendeeName.id);
            debugLog('Vote API: found attendee name and session', {
              selectedPerson,
              attendeeNameId: selectedAttendeeName.id,
              foundSession: !!attendeeSession,
              sessionId: attendeeSession?.id,
            });
          } else {
            debugLog('Vote API: selected person not found in attendee names', {
              selectedPerson,
              availableSlugs: event.attendeeNames.map(n => n.slug),
            });
          }
        } else {
          debugLog('Vote API: no selected person cookie found');
        }
      }

      if (!attendeeSession) {
        return NextResponse.json(
          { error: 'You must join the event before voting' },
          { status: 400 }
        );
      }

      // Check if event is in VOTE or PICK_DAYS phase (allow vote changes in PICK_DAYS)
      debugLog('Vote API: checking event phase', {
        eventPhase: event.phase,
        eventId: event.id,
        token: token.substring(0, 8) + '...',
      });
      
      if (event.phase !== 'VOTE' && event.phase !== 'PICK_DAYS') {
        debugLog('Vote API: phase check failed', {
          currentPhase: event.phase,
          expectedPhase: 'VOTE or PICK_DAYS',
          eventId: event.id,
        });
        return NextResponse.json(
          { error: 'Voting is only allowed during the VOTE or PICK_DAYS phase' },
          { status: 400 }
        );
      }

      // Check if vote deadline has passed
      if (event.voteDeadline && new Date() > new Date(event.voteDeadline)) {
        return NextResponse.json(
          { error: 'Vote deadline has passed' },
          { status: 400 }
        );
      }

      debugLog('Vote API: attendee session found', {
        sessionId: attendeeSession.id,
        attendeeNameId: attendeeSession.attendeeNameId,
        userId: attendeeSession.userId,
        voteIn,
      });

      // Upsert the vote
      const vote = await prisma.vote.upsert({
        where: {
          eventId_attendeeNameId: {
            eventId: event.id,
            attendeeNameId: attendeeSession.attendeeNameId,
          },
        },
        update: {
          in: voteIn,
          updatedAt: new Date(),
        },
        create: {
          eventId: event.id,
          attendeeNameId: attendeeSession.attendeeNameId,
          in: voteIn,
        },
      });

      debugLog('Vote API: vote upserted successfully', {
        attendeeNameId: vote.attendeeNameId,
        in: vote.in,
      });

      // Check if quorum is met and auto-advance phase
      const allVotes = await prisma.vote.findMany({
        where: { 
          eventId: event.id,
          attendeeNameId: { in: event.attendeeNames.map(n => n.id) } 
        },
      });

      const inCount = new Set(allVotes.filter(v => v.in).map(v => v.attendeeNameId)).size;
      const quorum = event.quorum;

      debugLog('Vote API: quorum check', {
        inCount,
        quorum,
        phase: event.phase,
      });

      if (inCount >= quorum && event.phase === 'VOTE') {
        // Auto-advance to PICK_DAYS phase
        await prisma.event.update({
          where: { id: event.id },
          data: { phase: 'PICK_DAYS' },
        });

        debugLog('Vote API: phase advanced to PICK_DAYS', {
          eventId: event.id,
          inCount,
          quorum,
        });

        // Emit phase change event
        try {
          await emit(event.id, 'phase.changed', {
            phase: 'PICK_DAYS',
            reason: 'quorum_met',
            inCount,
            quorum,
          });
        } catch (emitError) {
          debugLog('Vote API: failed to emit phase.changed event', emitError);
        }

        // Force cache invalidation after phase change
        try {
          await invalidateEventOperationCache(token, 'phase');
          debugLog('Vote API: cache invalidated after phase change');
        } catch (cacheError) {
          debugLog('Vote API: failed to invalidate cache after phase change', cacheError);
        }
      }

      // Emit vote update event
      try {
        await emit(event.id, 'vote.updated', {
          attendeeId: attendeeSession.id,
          voteIn,
        });
      } catch (emitError) {
        debugLog('Vote API: failed to emit vote.updated event', emitError);
      }

      // Invalidate cache
      try {
        await invalidateEventOperationCache(token, 'vote');
      } catch (cacheError) {
        debugLog('Vote API: failed to invalidate cache', cacheError);
      }

      debugLog('Vote API: vote completed successfully', {
        attendeeNameId: vote.attendeeNameId,
        in: vote.in,
        phaseAdvanced: inCount >= quorum,
      });

      return NextResponse.json({
        success: true,
        vote: {
          in: vote.in,
          attendeeNameId: vote.attendeeNameId,
        },
        phaseAdvanced: inCount >= quorum,
        inCount,
        quorum,
      });

    } catch (error) {
      debugLog('Vote API: error occurred', error);
      return NextResponse.json(
        { error: 'Failed to submit vote' },
        { status: 500 }
      );
    }
  }
);