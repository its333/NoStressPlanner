// lib/cache-invalidation.ts
// Centralized cache invalidation system for consistent data management

import {
  eventCache,
  sessionCache,
  availabilityCache,
} from './intelligent-cache';
import { logger } from './logger';
import { clearQueryCache } from './query-optimizations';

/**
 * Invalidate all caches related to a specific event
 * This ensures data consistency across all session-specific cache keys
 */
export async function invalidateEventCache(token: string): Promise<void> {
  try {
    logger.info('Starting event cache invalidation', {
      token: token.substring(0, 8) + '...',
    });

    // 1. Clear query cache (database query results)
    clearQueryCache(token);

    // 2. Clear all event data caches using IntelligentCache (including user-specific keys)
    const eventDeletedCount = eventCache.deletePattern(`event_data:${token}`);

    // 3. Clear session caches
    const sessionDeletedCount = sessionCache.deletePattern(
      `event_data:${token}`
    );

    // 4. Clear availability caches
    const availabilityDeletedCount = availabilityCache.deletePattern(
      `event_data:${token}`
    );

    const totalDeletedCount =
      eventDeletedCount + sessionDeletedCount + availabilityDeletedCount;

    logger.info('Event cache invalidated', {
      token: token.substring(0, 8) + '...',
      eventDeletedCount,
      sessionDeletedCount,
      availabilityDeletedCount,
      totalDeletedCount,
    });
  } catch (error) {
    logger.error('Failed to invalidate event cache', {
      token: token.substring(0, 8) + '...',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Invalidate all caches related to a specific user
 * Useful when user data changes (name, permissions, etc.)
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  try {
    const deletedCount = eventCache.deletePattern(`user:${userId}`);

    logger.info('User cache invalidated', {
      userId: userId.substring(0, 8) + '...',
      deletedCount,
    });
  } catch (error) {
    logger.error('Failed to invalidate user cache', {
      userId: userId.substring(0, 8) + '...',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Invalidate all session-related caches
 * Useful when session data changes or user logs out
 */
export async function invalidateSessionCache(
  sessionKey?: string
): Promise<void> {
  try {
    if (sessionKey) {
      const deletedCount = sessionCache.deletePattern(`session:${sessionKey}`);
      logger.info('Session cache invalidated', {
        sessionKey: sessionKey.substring(0, 20) + '...',
        deletedCount,
      });
    } else {
      // Clear all session caches
      const deletedCount = sessionCache.deletePattern('session:');
      logger.info('All session caches invalidated', { deletedCount });
    }
  } catch (error) {
    logger.error('Failed to invalidate session cache', {
      sessionKey: sessionKey ? sessionKey.substring(0, 20) + '...' : 'all',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Comprehensive cache invalidation for event operations
 * This should be called after any event data modification
 */
export async function invalidateEventOperationCache(
  token: string,
  operation:
    | 'vote'
    | 'block'
    | 'join'
    | 'leave'
    | 'phase'
    | 'final'
    | 'switch-name'
): Promise<void> {
  try {
    logger.info('Invalidating event operation cache', {
      token: token.substring(0, 8) + '...',
      operation,
    });

    // Always invalidate event cache
    await invalidateEventCache(token);

    // Operation-specific invalidations
    switch (operation) {
      case 'vote':
      case 'block':
        // These operations affect availability calculations
        availabilityCache.deletePattern(`availability:${token}`);
        break;

      case 'join':
      case 'leave':
        // These operations affect attendee lists
        eventCache.deletePattern(`attendees:${token}`);
        break;

      case 'phase':
        // Phase changes affect the entire event state
        eventCache.deletePattern(`event_state:${token}`);
        break;

      case 'final':
        // Final date affects all event data
        eventCache.deletePattern(`event_final:${token}`);
        break;

      case 'switch-name':
        // Name changes affect session data
        sessionCache.deletePattern(`session_data:${token}`);
        break;
    }

    logger.info('Event operation cache invalidated', {
      token: token.substring(0, 8) + '...',
      operation,
    });
  } catch (error) {
    logger.error('Failed to invalidate event operation cache', {
      token: token.substring(0, 8) + '...',
      operation,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Emergency cache flush - use sparingly
 * This clears ALL caches and should only be used in extreme cases
 */
export async function emergencyCacheFlush(): Promise<void> {
  try {
    // Clear all caches
    eventCache.clear();
    sessionCache.clear();
    availabilityCache.clear();
    clearQueryCache(); // Clear all query caches

    logger.warn('Emergency cache flush executed');
  } catch (error) {
    logger.error('Failed to execute emergency cache flush', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
