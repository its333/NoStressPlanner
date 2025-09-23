// app/api/events/[token]/vote/route.ts
// Updated vote API for the new schema with centralized error handling

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { voteSchema } from '@/lib/validators';
import { getCurrentAttendeeSession } from '@/lib/attendees';
import { cookieManager } from '@/lib/cookie-manager';
import { emit } from '@/lib/realtime';
import { 
  ValidationError, 
  NotFoundError, 
  UnauthorizedError, 
  ConflictError,
  handleNextApiError,
  withErrorHandling 
} from '@/lib/error-handling';
import { rateLimiters } from '@/lib/rate-limiter';

export const POST = rateLimiters.voting(async (req: NextRequest, context: { params: Promise<{ token: string }> }) => {
  try {
    return await withErrorHandling(async () => {
      const { token } = await context.params;
      const json = await req.json();
      console.log('🔍 Vote API received data:', json);
      const parsed = voteSchema.safeParse(json);
      
      if (!parsed.success) {
        console.log('❌ Vote validation failed:', parsed.error.flatten());
        throw new ValidationError('Invalid vote data', parsed.error.flatten());
      }

      const { in: voteIn } = parsed.data;

      // Find event
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
        throw new NotFoundError('Event');
      }

      const event = invite.event;
      
      // Check if voting deadline has passed
      if (event.phase === 'VOTE' && new Date() > event.voteDeadline) {
        // Auto-fail the event if deadline passed without quorum
        const voteCount = await prisma.vote.count({
          where: { eventId: event.id, in: true }
        });
        
        if (voteCount < event.quorum) {
          await prisma.event.update({
            where: { id: event.id },
            data: { phase: 'FAILED' }
          });
          await emit(event.id, 'phase.changed', { phase: 'FAILED' });
          throw new ConflictError('Voting deadline has passed and quorum not reached');
        }
      }

      if (event.phase !== 'VOTE' && event.phase !== 'PICK_DAYS') {
        throw new ConflictError('Voting is only allowed during VOTE and PICK_DAYS phases');
      }

      const session = await auth();
      const currentSessionKey = await cookieManager.getSessionKey(event.id);
      
      // Find current session
      let currentSession = await getCurrentAttendeeSession(
        event.id,
        session?.user?.id,
        currentSessionKey || undefined
      );

      // If no session found but we have a session key, wait a bit and try again
      // This handles the case where a session was just created but not yet available
      if (!currentSession && currentSessionKey) {
        console.log('🔍 No session found for vote, waiting 200ms and retrying...');
        await new Promise(resolve => setTimeout(resolve, 200));
        currentSession = await getCurrentAttendeeSession(
          event.id,
          session?.user?.id,
          currentSessionKey || undefined
        );
      }

      if (!currentSession) {
        console.log('🔍 Vote API: No session found after retry', {
          eventId: event.id,
          userId: session?.user?.id,
          hasSessionKey: !!currentSessionKey,
          sessionKeyPreview: currentSessionKey ? `${currentSessionKey.substring(0, 20)}...` : null
        });
        throw new UnauthorizedError('Join the event before voting');
      }

      // Create or update vote for the person (attendeeName), not the session
      console.log('🔍 About to upsert vote:', {
        eventId: event.id,
        attendeeNameId: currentSession.attendeeNameId,
        voteIn: voteIn,
        sessionId: currentSession.id
      });
      
      const voteResult = await prisma.vote.upsert({
        where: {
          eventId_attendeeNameId: {
            eventId: event.id,
            attendeeNameId: currentSession.attendeeNameId
          }
        },
        update: {
          in: voteIn
        },
        create: {
          eventId: event.id,
          attendeeNameId: currentSession.attendeeNameId,
          in: voteIn
        }
      });
      
      console.log('🔍 Vote upsert result:', voteResult);

      // Check if quorum is reached and auto-advance phase
      const voteCount = await prisma.vote.count({
        where: {
          eventId: event.id,
          in: true
        }
      });

      if (voteCount >= event.quorum && event.phase === 'VOTE') {
        await prisma.event.update({
          where: { id: event.id },
          data: { phase: 'PICK_DAYS' }
        });
        
        await emit(event.id, 'phase.changed', { phase: 'PICK_DAYS' });
      }

      try {
        await emit(event.id, 'vote.updated', { attendeeId: currentSession.id });
        console.log('🔍 Vote event emitted successfully');
      } catch (emitError) {
        console.error('🔍 Error emitting vote event:', emitError);
        // Don't fail the vote if event emission fails
      }
      
      try {
        // Proper cache invalidation using centralized system
        const { invalidateEventOperationCache } = await import('@/lib/cache-invalidation');
        await invalidateEventOperationCache(token, 'vote');
        console.log('🔍 Cache invalidated successfully');
      } catch (cacheError) {
        console.error('🔍 Error invalidating cache:', cacheError);
        // Don't fail the vote if cache invalidation fails
      }
      
      return NextResponse.json({ ok: true });
    })();
  } catch (error) {
    const { status, body } = handleNextApiError(error as Error, req);
    return NextResponse.json(body, { status });
  }
});