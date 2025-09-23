// app/api/events/[token]/blocks/route.ts
// Updated blocks API for the new schema

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';

import { getCurrentAttendeeSession } from '@/lib/attendees';
import { auth } from '@/lib/auth';
import { getSessionKey } from '@/lib/cookies';
import { debugLog } from '@/lib/debug';
import {
  handleNextApiError,
  ValidationError,
  NotFoundError,
  ConflictError,
} from '@/lib/error-handling';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { rateLimiters } from '@/lib/rate-limiter';
import { emit } from '@/lib/realtime';
import { isWithinRange, toUtcDate } from '@/lib/time';
import { blocksSchema } from '@/lib/validators';

export const POST = rateLimiters.voting(
  async (req: NextRequest, context: { params: Promise<{ token: string }> }) => {
    try {
      const { token } = await context.params;
      const json = await req.json();
      debugLog('Blocks API: request received', json);
      const parsed = blocksSchema.safeParse(json);

      if (!parsed.success) {
        debugLog('Blocks API: validation failed', parsed.error.flatten());
        throw new ValidationError(
          'Invalid blocks data',
          parsed.error.flatten()
        );
      }

      const { dates, anonymous } = parsed.data;

      // Find event
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
        throw new NotFoundError('Event');
      }

      const event = invite.event;

      if (event.phase !== 'PICK_DAYS') {
        throw new ConflictError(
          'Blocks can only be updated during PICK_DAYS phase'
        );
      }

      const session = await auth();
      const currentSessionKey = await getSessionKey(event.id);

      // Enhanced session handling with JWT error recovery
      let sessionUserId = null;
      try {
        sessionUserId = session?.user?.id;
      } catch (error) {
        console.warn(
          '⚠️ JWT session error in blocks API, continuing without auth:',
          error
        );
      }

      // Find current session
      const currentSession = await getCurrentAttendeeSession(
        event.id,
        sessionUserId || undefined,
        currentSessionKey || undefined
      );

      if (!currentSession) {
        return NextResponse.json(
          { error: 'Join the event before blocking days' },
          { status: 401 }
        );
      }

      // Check if user has voted "in" before allowing blocks
      const userVote = await prisma.vote.findUnique({
        where: {
          eventId_attendeeNameId: {
            eventId: event.id,
            attendeeNameId: currentSession.attendeeNameId,
          },
        },
      });

      if (!userVote || !userVote.in) {
        return NextResponse.json(
          {
            error: 'You must vote "I\'m in!" before marking unavailable dates',
          },
          { status: 409 }
        );
      }

      // Validate dates are within event range
      const normalizedDates = [
        ...new Set(dates.map(date => toUtcDate(date).toISOString())),
      ];
      for (const iso of normalizedDates) {
        if (!isWithinRange(iso, event.startDate, event.endDate)) {
          return NextResponse.json(
            { error: 'Date outside event range' },
            { status: 400 }
          );
        }
      }

      // Calculate changes needed
      const existingBlocks = await prisma.dayBlock.findMany({
        where: {
          eventId: event.id,
          attendeeNameId: currentSession.attendeeNameId,
        },
      });
      const existingSet = new Set(
        existingBlocks.map(block => toUtcDate(block.date).toISOString())
      );

      const toCreate = normalizedDates.filter(iso => !existingSet.has(iso));
      const toDelete = existingBlocks
        .map(block => toUtcDate(block.date).toISOString())
        .filter(iso => !normalizedDates.includes(iso));

      // Execute transaction
      const operations = [];

      if (toDelete.length) {
        operations.push(
          prisma.dayBlock.deleteMany({
            where: {
              eventId: event.id,
              attendeeNameId: currentSession.attendeeNameId,
              date: { in: toDelete.map(iso => new Date(iso)) },
            },
          })
        );
      }

      if (toCreate.length) {
        operations.push(
          prisma.dayBlock.createMany({
            data: toCreate.map(iso => ({
              eventId: event.id,
              attendeeNameId: currentSession.attendeeNameId,
              date: new Date(iso),
              anonymous,
            })),
          })
        );
      }

      // Update session's anonymous blocks preference and mark as having saved availability
      operations.push(
        prisma.attendeeSession.update({
          where: { id: currentSession.id },
          data: {
            anonymousBlocks: anonymous,
            hasSavedAvailability: true,
          },
        })
      );

      if (operations.length) {
        await prisma.$transaction(operations);
      }

      await emit(event.id, 'blocks.updated', { attendeeId: currentSession.id });
      debugLog('Blocks API: emitted blocks.updated event', {
        eventId: event.id,
      });

      // Proper cache invalidation using centralized system
      const { invalidateEventOperationCache } = await import(
        '@/lib/cache-invalidation'
      );
      await invalidateEventOperationCache(token, 'block');

      logger.api('Blocks updated successfully', {
        eventId: event.id,
        attendeeNameId: currentSession.attendeeNameId,
        blocksCount: dates.length,
      });

      return NextResponse.json({ ok: true });
    } catch (error) {
      const { status, body } = handleNextApiError(error as Error, req);
      return NextResponse.json(body, { status });
    }
  }
);
