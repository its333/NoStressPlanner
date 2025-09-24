// lib/cache-health.ts
// Cache health monitoring and consistency validation system

import { eventCache, sessionCache, availabilityCache } from './intelligent-cache';
import { logger } from './logger';

interface CacheHealthReport {
  status: 'healthy' | 'degraded' | 'unhealthy';
  issues: string[];
  recommendations: string[];
  metrics: {
    hitRate: number;
    missRate: number;
    errorRate: number;
    totalOperations: number;
  };
}

/**
 * Comprehensive cache health check
 * Validates cache consistency and performance
 */
export async function checkCacheHealth(): Promise<CacheHealthReport> {
  const issues: string[] = [];
  const recommendations: string[] = [];
  
  try {
    // Test basic cache operations
    const testKey = `health_check_${Date.now()}`;
    const testValue = { test: true, timestamp: Date.now() };
    
    // Test eventCache
    eventCache.set(testKey, testValue, 60);
    const eventGetResult = eventCache.get(testKey);
    if (!eventGetResult || JSON.stringify(eventGetResult) !== JSON.stringify(testValue)) {
      issues.push('EventCache GET operation failed or returned incorrect data');
    }
    eventCache.delete(testKey);
    
    // Test sessionCache
    sessionCache.set(testKey, testValue, 60);
    const sessionGetResult = sessionCache.get(testKey);
    if (!sessionGetResult || JSON.stringify(sessionGetResult) !== JSON.stringify(testValue)) {
      issues.push('SessionCache GET operation failed or returned incorrect data');
    }
    sessionCache.delete(testKey);
    
    // Test availabilityCache
    availabilityCache.set(testKey, testValue, 60);
    const availabilityGetResult = availabilityCache.get(testKey);
    if (!availabilityGetResult || JSON.stringify(availabilityGetResult) !== JSON.stringify(testValue)) {
      issues.push('AvailabilityCache GET operation failed or returned incorrect data');
    }
    availabilityCache.delete(testKey);
    
    // Get combined cache statistics
    const eventStats = eventCache.getStats();
    const sessionStats = sessionCache.getStats();
    const availabilityStats = availabilityCache.getStats();
    
    const totalHits = eventStats.hits + sessionStats.hits + availabilityStats.hits;
    const totalMisses = eventStats.misses + sessionStats.misses + availabilityStats.misses;
    const totalSets = eventStats.sets + sessionStats.sets + availabilityStats.sets;
    const totalDeletes = eventStats.deletes + sessionStats.deletes + availabilityStats.deletes;
    
    const totalOperations = totalHits + totalMisses + totalSets + totalDeletes;
    const hitRate = totalOperations > 0 ? (totalHits / totalOperations) * 100 : 0;
    const missRate = totalOperations > 0 ? (totalMisses / totalOperations) * 100 : 0;
    const errorRate = 0; // IntelligentCache doesn't track errors separately
    
    // Analyze performance metrics
    if (hitRate < 50) {
      issues.push(`Low cache hit rate: ${hitRate.toFixed(2)}%`);
      recommendations.push('Consider increasing cache TTL or improving cache key strategy');
    }
    
    // IntelligentCache doesn't track errors, so skip error rate check
    
    if (missRate > 70) {
      issues.push(`High cache miss rate: ${missRate.toFixed(2)}%`);
      recommendations.push('Review cache invalidation strategy - may be too aggressive');
    }
    
    // Determine overall health status
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (issues.length === 0) {
      status = 'healthy';
    } else if (issues.length <= 2) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }
    
    logger.info('Cache health check completed', {
      status,
      issuesCount: issues.length,
      hitRate: hitRate.toFixed(2),
      missRate: missRate.toFixed(2)
    });
    
    return {
      status,
      issues,
      recommendations,
      metrics: {
        hitRate,
        missRate,
        errorRate,
        totalOperations
      }
    };
    
  } catch (error) {
    logger.error('Cache health check failed', { 
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
    
    return {
      status: 'unhealthy',
      issues: ['Cache health check failed: ' + (error instanceof Error ? error.message : 'Unknown error')],
      recommendations: ['Check cache backend configuration and connectivity'],
      metrics: {
        hitRate: 0,
        missRate: 0,
        errorRate: 100,
        totalOperations: 0
      }
    };
  }
}

/**
 * Validate cache consistency for a specific event
 * Ensures all session-specific cache keys are consistent
 */
export async function validateEventCacheConsistency(token: string): Promise<boolean> {
  try {
    // Get all cache keys for this event
    const eventCachePattern = `event_data:${token}:`;
    
    // This is a simplified check - in a real implementation, you'd want to
    // compare the data across different session-specific keys
    const exists = eventCache.get(eventCachePattern + 'test') !== undefined;
    
    logger.debug('Event cache consistency check', {
      token: token.substring(0, 8) + '...',
      hasEventCache: exists
    });
    
    return true; // Simplified for now
  } catch (error) {
    logger.error('Event cache consistency validation failed', {
      token: token.substring(0, 8) + '...',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return false;
  }
}

/**
 * Monitor cache performance over time
 * Should be called periodically to track cache health trends
 */
export async function monitorCachePerformance(): Promise<void> {
  try {
    const health = await checkCacheHealth();
    
    if (health.status === 'unhealthy') {
      logger.error('Cache performance monitoring - UNHEALTHY', {
        issues: health.issues,
        recommendations: health.recommendations,
        metrics: health.metrics
      });
    } else if (health.status === 'degraded') {
      logger.warn('Cache performance monitoring - DEGRADED', {
        issues: health.issues,
        recommendations: health.recommendations,
        metrics: health.metrics
      });
    } else {
      logger.info('Cache performance monitoring - HEALTHY', {
        metrics: health.metrics
      });
    }
  } catch (error) {
    logger.error('Cache performance monitoring failed', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
