// lib/query-optimizations.ts
// Specific query optimizations for common patterns

import { logger } from './logger';
import { prisma } from './prisma';

// Query result cache for ultra-fast repeated requests
const queryCache = new Map<string, { data: any; timestamp: number }>();
const QUERY_CACHE_TTL = 30 * 1000; // 30 seconds for query results

/**
 * ULTRA-OPTIMIZED event fetching - minimal data, maximum speed with caching
 */
export async function getEventWithOptimizedIncludes(token: string) {
  const startTime = Date.now();

  try {
    // Check cache first
    const cacheKey = `event_query:${token}`;
    const cached = queryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < QUERY_CACHE_TTL) {
      const executionTime = Date.now() - startTime;
      logger.debug('Query cache hit', {
        token: token.substring(0, 8) + '...',
        executionTime,
        cached: true,
      });
      return cached.data;
    }

    // STEP 1: Get basic event data with minimal includes
    const invite = await prisma.inviteToken.findUnique({
      where: { token },
      include: {
        event: {
          include: {
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
          },
        },
      },
    });

    if (!invite?.event) {
      return null;
    }

    const eventId = invite.event.id;

    // STEP 2: Get all related data in parallel with minimal selects
    const [attendeeSessions, votes, blocks] = await Promise.all([
      prisma.attendeeSession.findMany({
        where: { eventId, isActive: true },
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
      }),
      prisma.vote.findMany({
        where: { eventId },
        select: {
          attendeeNameId: true,
          in: true,
        },
      }),
      prisma.dayBlock.findMany({
        where: { eventId },
        select: {
          attendeeNameId: true,
          date: true,
          anonymous: true,
        },
      }),
    ]);

    // STEP 3: Attach the data to the event object
    const event = {
      ...invite.event,
      attendeeSessions,
      votes,
      blocks,
    };

    const executionTime = Date.now() - startTime;
    logger.debug('Ultra-optimized event query executed', {
      token: token.substring(0, 8) + '...',
      executionTime,
      hasEvent: true,
      attendeeSessions: attendeeSessions.length,
      votes: votes.length,
      blocks: blocks.length,
      cached: false,
    });

    const result = { event };

    // Cache the result
    queryCache.set(cacheKey, {
      data: result,
      timestamp: Date.now(),
    });

    return result;
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
 * Optimized attendee session lookup
 */
export async function findAttendeeSessionOptimized(
  eventId: string,
  sessionKey?: string,
  userId?: string
) {
  const startTime = Date.now();

  try {
    // Use a single query with OR conditions instead of multiple queries
    const session = await prisma.attendeeSession.findFirst({
      where: {
        eventId,
        isActive: true,
        OR: [
          ...(sessionKey ? [{ sessionKey }] : []),
          ...(userId ? [{ userId }] : []),
        ],
      },
      include: {
        attendeeName: {
          select: {
            id: true,
            label: true,
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
    logger.debug('Optimized attendee session query executed', {
      eventId: eventId.substring(0, 8) + '...',
      executionTime,
      found: !!session,
    });

    return session;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    logger.error('Optimized attendee session query failed', {
      eventId: eventId.substring(0, 8) + '...',
      executionTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Optimized availability computation with batch queries
 */
export async function computeAvailabilityOptimized(eventId: string) {
  const startTime = Date.now();

  try {
    // Get all necessary data in parallel
    const [attendeeSessions, votes, dayBlocks] = await Promise.all([
      prisma.attendeeSession.findMany({
        where: { eventId, isActive: true },
        select: { id: true },
      }),
      prisma.vote.findMany({
        where: {
          eventId,
          in: true,
        },
        select: { attendeeNameId: true },
      }),
      prisma.dayBlock.findMany({
        where: {
          eventId,
        },
        select: {
          date: true,
          attendeeNameId: true,
          anonymous: true,
        },
      }),
    ]);

    const executionTime = Date.now() - startTime;
    logger.debug('Optimized availability computation executed', {
      eventId: eventId.substring(0, 8) + '...',
      executionTime,
      attendeeCount: attendeeSessions.length,
      voteCount: votes.length,
      blockCount: dayBlocks.length,
    });

    return {
      attendeeSessions,
      votes,
      dayBlocks,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    logger.error('Optimized availability computation failed', {
      eventId: eventId.substring(0, 8) + '...',
      executionTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Optimized batch operations for real-time updates
 */
export async function batchUpdateEventData(
  eventId: string,
  updates: {
    phase?: 'VOTE' | 'PICK_DAYS' | 'FINALIZED' | 'FAILED' | 'RESULTS';
    finalDate?: Date | null;
    showResultsToEveryone?: boolean;
  }
) {
  const startTime = Date.now();

  try {
    // Use a single update operation
    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: updates,
      select: {
        id: true,
        phase: true,
        finalDate: true,
        showResultsToEveryone: true,
        updatedAt: true,
      },
    });

    const executionTime = Date.now() - startTime;
    logger.debug('Batch event update executed', {
      eventId: eventId.substring(0, 8) + '...',
      executionTime,
      updates: Object.keys(updates),
    });

    return updatedEvent;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    logger.error('Batch event update failed', {
      eventId: eventId.substring(0, 8) + '...',
      executionTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Optimized user lookup with caching
 */
const userCache = new Map<string, { user: any; timestamp: number }>();
const USER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getUserOptimized(userId: string) {
  const startTime = Date.now();

  try {
    // Check cache first
    const cached = userCache.get(userId);
    if (cached && Date.now() - cached.timestamp < USER_CACHE_TTL) {
      const executionTime = Date.now() - startTime;
      logger.debug('User cache hit', {
        userId: userId.substring(0, 8) + '...',
        executionTime,
      });
      return cached.user;
    }

    // Fetch from database
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        discordId: true,
        createdAt: true,
      },
    });

    // Cache the result
    if (user) {
      userCache.set(userId, {
        user,
        timestamp: Date.now(),
      });
    }

    const executionTime = Date.now() - startTime;
    logger.debug('Optimized user query executed', {
      userId: userId.substring(0, 8) + '...',
      executionTime,
      found: !!user,
      cached: false,
    });

    return user;
  } catch (error) {
    const executionTime = Date.now() - startTime;
    logger.error('Optimized user query failed', {
      userId: userId.substring(0, 8) + '...',
      executionTime,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Clear user cache (useful for testing or when user data changes)
 */
export function clearUserCache(): void {
  userCache.clear();
  logger.debug('User cache cleared');
}

/**
 * Clear query cache (useful when event data changes)
 */
export function clearQueryCache(token?: string): void {
  if (token) {
    queryCache.delete(`event_query:${token}`);
    logger.debug('Query cache cleared for token', {
      token: token.substring(0, 8) + '...',
    });
  } else {
    queryCache.clear();
    logger.debug('All query cache cleared');
  }
}
