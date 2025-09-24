// lib/ultra-optimized-queries.ts
// Ultra-optimized database queries for maximum performance

import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

/**
 * Ultra-optimized event data fetching with minimal database calls
 * Target: <200ms response time
 */
export async function getEventDataUltraOptimized(token: string) {
  const startTime = Date.now();

  try {
    // Single query to get ALL event data with optimized includes
    const eventData = await prisma.inviteToken.findUnique({
      where: { token },
      select: {
        event: {
          select: {
            id: true,
            title: true,
            description: true,
            phase: true,
            startDate: true,
            endDate: true,
            voteDeadline: true,
            quorum: true,
            requireLoginToAttend: true,
            finalDate: true,
            showResultsToEveryone: true,
            createdAt: true,
            updatedAt: true,
            host: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true,
              },
            },
            attendeeNames: {
              select: {
                id: true,
                label: true,
                slug: true,
              },
            },
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
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                    image: true,
                  },
                },
              },
            },
            votes: {
              select: {
                attendeeNameId: true,
                in: true,
              },
            },
            blocks: {
              select: {
                attendeeNameId: true,
                date: true,
                anonymous: true,
              },
            },
          },
        },
      },
    });

    if (!eventData?.event) {
      throw new Error('Event not found');
    }

    const event = eventData.event;
    const executionTime = Date.now() - startTime;

    logger.debug('Ultra-optimized event query executed', {
      token: token.substring(0, 8) + '...',
      executionTime,
      hasEvent: true,
      attendeeSessions: event.attendeeSessions.length,
      votes: event.votes.length,
      blocks: event.blocks.length,
      optimized: true,
    });

    return event;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    logger.error('Ultra-optimized event query failed', {
      token: token.substring(0, 8) + '...',
      executionTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Optimized session lookup with minimal database impact
 */
export async function getSessionOptimized(
  eventId: string,
  userId?: string,
  sessionKey?: string
) {
  const startTime = Date.now();

  try {
    // Build optimized where clause
    const whereClause: any = {
      eventId,
      isActive: true,
    };

    // Prioritize sessionKey over userId for better performance
    if (sessionKey) {
      whereClause.sessionKey = sessionKey;
    } else if (userId) {
      whereClause.userId = userId;
    } else {
      return null; // No way to identify session
    }

    const session = await prisma.attendeeSession.findFirst({
      where: whereClause,
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
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    const executionTime = Date.now() - startTime;
    logger.debug('Optimized session lookup', {
      eventId: eventId.substring(0, 8) + '...',
      executionTime,
      found: !!session,
      method: sessionKey ? 'sessionKey' : 'userId',
    });

    return session;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    logger.error('Optimized session lookup failed', {
      eventId: eventId.substring(0, 8) + '...',
      executionTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Batch operations for multiple events (for future use)
 */
export async function getMultipleEventsOptimized(tokens: string[]) {
  const startTime = Date.now();

  try {
    const events = await prisma.inviteToken.findMany({
      where: { token: { in: tokens } },
      select: {
        token: true,
        event: {
          select: {
            id: true,
            title: true,
            phase: true,
            startDate: true,
            endDate: true,
            voteDeadline: true,
            quorum: true,
            host: {
              select: {
                id: true,
                name: true,
              },
            },
            votes: {
              select: {
                attendeeNameId: true,
                in: true,
              },
            },
          },
        },
      },
    });

    const executionTime = Date.now() - startTime;
    logger.debug('Batch events query executed', {
      tokenCount: tokens.length,
      executionTime,
      foundEvents: events.length,
    });

    return events;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    logger.error('Batch events query failed', {
      tokenCount: tokens.length,
      executionTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Optimized availability calculation with pre-computed data
 */
export function computeAvailabilityOptimized(
  attendeesIn: string[],
  blocks: Array<{ attendeeNameId: string; date: Date; anonymous: boolean }>,
  days: Date[]
) {
  const startTime = Date.now();

  try {
    const inSet = new Set(attendeesIn);
    const totalIn = attendeesIn.length;

    // Pre-compute blocks by day for O(1) lookup
    const blocksByDay = new Map<string, Set<string>>();
    for (const block of blocks) {
      if (!inSet.has(block.attendeeNameId)) continue;

      const key = block.date.toISOString().split('T')[0];
      const set = blocksByDay.get(key) ?? new Set<string>();
      set.add(block.attendeeNameId);
      blocksByDay.set(key, set);
    }

    // Calculate availability for each day
    const availability = days.map(day => {
      const key = day.toISOString().split('T')[0];
      const blocked = blocksByDay.get(key) ?? new Set<string>();
      const blockedCount = blocked.size;
      const available = Math.max(0, totalIn - blockedCount);

      return {
        date: day,
        available,
        blockedAttendees: [...blocked],
      };
    });

    // Find earliest all-available day
    const earliestAll =
      availability.find(day => day.available === totalIn) ?? null;

    // Find earliest most-available day
    let earliestMost = null;
    let maxAvailable = 0;
    for (const day of availability) {
      if (day.available > maxAvailable) {
        maxAvailable = day.available;
        earliestMost = day;
      }
    }

    // Get top 3 dates by availability
    const top3 = [...availability]
      .sort((a, b) => b.available - a.available)
      .slice(0, 3);

    const executionTime = Date.now() - startTime;
    logger.debug('Optimized availability calculation', {
      attendeesIn: attendeesIn.length,
      blocks: blocks.length,
      days: days.length,
      executionTime,
    });

    return {
      availability,
      earliestAll,
      earliestMost,
      top3,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    logger.error('Optimized availability calculation failed', {
      executionTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
