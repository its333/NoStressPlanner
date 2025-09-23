// app/api/user/delete-all-events/route.ts
// API endpoint to delete all events created by the authenticated user

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { rateLimiters } from '@/lib/rate-limiter';
import { logger } from '@/lib/logger';

export const POST = rateLimiters.general(async (_req: NextRequest) => {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const userId = session.user.id;
    logger.info('Delete all events request', { userId: userId.substring(0, 8) + '...' });

    // Get all events hosted by this user
    const userEvents = await prisma.event.findMany({
      where: { hostId: userId },
      select: { id: true, title: true }
    });

    if (userEvents.length === 0) {
      return NextResponse.json({ 
        message: 'No events found to delete',
        deletedCount: 0 
      });
    }

    // Delete all events in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Delete all related data first (due to foreign key constraints)
      const eventIds = userEvents.map(event => event.id);
      
      // Delete votes
      await tx.vote.deleteMany({
        where: { eventId: { in: eventIds } }
      });
      
      // Delete day blocks
      await tx.dayBlock.deleteMany({
        where: { eventId: { in: eventIds } }
      });
      
      // Delete attendee sessions
      await tx.attendeeSession.deleteMany({
        where: { eventId: { in: eventIds } }
      });
      
      // Delete attendee names
      await tx.attendeeName.deleteMany({
        where: { eventId: { in: eventIds } }
      });
      
      // Delete invite tokens
      await tx.inviteToken.deleteMany({
        where: { eventId: { in: eventIds } }
      });
      
      // Finally delete the events
      const deletedEvents = await tx.event.deleteMany({
        where: { hostId: userId }
      });
      
      return deletedEvents;
    });

    logger.info('All events deleted successfully', { 
      userId: userId.substring(0, 8) + '...',
      deletedCount: result.count,
      eventTitles: userEvents.map(e => e.title)
    });

    return NextResponse.json({ 
      message: `Successfully deleted ${result.count} events`,
      deletedCount: result.count,
      deletedEvents: userEvents.map(e => ({ id: e.id, title: e.title }))
    });

  } catch (error) {
    logger.error('Error deleting all events', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    return NextResponse.json({ 
      error: 'Failed to delete events' 
    }, { status: 500 });
  }
});
