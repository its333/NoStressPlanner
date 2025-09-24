// app/api/events/[token]/blocks/route.ts
// Simplified blocks API using person-centric approach

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';
import { invalidateEventOperationCache } from '@/lib/cache-invalidation';
import { debugLog } from '@/lib/debug';
import { prisma } from '@/lib/prisma';
import { rateLimiters } from '@/lib/rate-limiter';
import { emit } from '@/lib/realtime';
import { getSelectedPerson } from '@/lib/simple-cookies';
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
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { dates, anonymous } = parsed.data;

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
      
      if (userId) {
        // Logged-in user: find their session
        attendeeSession = event.attendeeSessions.find(s => s.userId === userId);
      } else {
        // Anonymous user: find session by selected person
        const selectedPerson = await getSelectedPerson(event.id, req);
        if (selectedPerson) {
          const selectedAttendeeName = event.attendeeNames.find(name => name.slug === selectedPerson);
          if (selectedAttendeeName) {
            attendeeSession = event.attendeeSessions.find(s => s.attendeeNameId === selectedAttendeeName.id);
          }
        }
      }

      if (!attendeeSession) {
        return NextResponse.json(
          { error: 'You must join the event before blocking days' },
          { status: 400 }
        );
      }

      // Check if event is in PICK_DAYS phase
      if (event.phase !== 'PICK_DAYS') {
        return NextResponse.json(
          { error: 'Day blocking is only allowed during the PICK_DAYS phase' },
          { status: 400 }
        );
      }

      // Validate dates are within event range
      const eventStart = toUtcDate(event.startDate);
      const eventEnd = toUtcDate(event.endDate);
      
      const invalidDates = dates.filter(date => !isWithinRange(toUtcDate(date), eventStart, eventEnd));
      if (invalidDates.length > 0) {
        return NextResponse.json(
          { error: `Some dates are outside the event range: ${invalidDates.join(', ')}` },
          { status: 400 }
        );
      }

      debugLog('Blocks API: attendee session found', {
        sessionId: attendeeSession.id,
        attendeeNameId: attendeeSession.attendeeNameId,
        userId: attendeeSession.userId,
        datesCount: dates.length,
        anonymous,
      });

      // Delete existing blocks for this attendee
      await prisma.dayBlock.deleteMany({
        where: { 
          eventId: event.id,
          attendeeNameId: attendeeSession.attendeeNameId 
        },
      });

      // Create new blocks
      const blocks = await prisma.dayBlock.createMany({
        data: dates.map(date => ({
          eventId: event.id,
          attendeeNameId: attendeeSession.attendeeNameId,
          date: toUtcDate(date),
          anonymous: anonymous ?? attendeeSession.anonymousBlocks,
        })),
      });

      debugLog('Blocks API: blocks created successfully', {
        blocksCount: blocks.count,
        attendeeNameId: attendeeSession.attendeeNameId,
      });

      // Update attendee session's anonymous blocks preference and mark as having saved availability
      await prisma.attendeeSession.update({
        where: { id: attendeeSession.id },
        data: { 
          anonymousBlocks: anonymous ?? attendeeSession.anonymousBlocks,
          hasSavedAvailability: true, // Mark that this person has saved their availability
        },
      });

      // Emit blocks update event
      try {
        await emit(event.id, 'blocks.updated', {
          attendeeId: attendeeSession.id,
          dates,
          anonymous: anonymous ?? attendeeSession.anonymousBlocks,
        });
      } catch (emitError) {
        debugLog('Blocks API: failed to emit blocks.updated event', emitError);
      }

      // Invalidate cache
      try {
        debugLog('Blocks API: attempting cache invalidation', { token: token.substring(0, 8) + '...' });
        await invalidateEventOperationCache(token, 'block');
        debugLog('Blocks API: cache invalidated successfully');
        
        // Small delay to ensure cache invalidation propagates
        await new Promise(resolve => setTimeout(resolve, 50));
      } catch (cacheError) {
        debugLog('Blocks API: failed to invalidate cache', cacheError);
      }

      debugLog('Blocks API: blocks completed successfully', {
        attendeeNameId: attendeeSession.attendeeNameId,
        blocksCount: blocks.count,
        anonymous: anonymous ?? attendeeSession.anonymousBlocks,
      });

      return NextResponse.json({
        success: true,
        blocks: {
          attendeeNameId: attendeeSession.attendeeNameId,
          dates,
          anonymous: anonymous ?? attendeeSession.anonymousBlocks,
        },
      });

    } catch (error) {
      debugLog('Blocks API: error occurred', error);
      return NextResponse.json(
        { error: 'Failed to update day blocks' },
        { status: 500 }
      );
    }
  }
);