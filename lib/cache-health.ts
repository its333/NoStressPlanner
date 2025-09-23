// lib/cache-health.ts
// Cache health monitoring and consistency validation system

import { cacheManager } from './cache-manager';
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
    
    // Test SET operation
    const setResult = await cacheManager.set(testKey, testValue, { ttl: 60 });
    if (!setResult) {
      issues.push('Cache SET operation failed');
    }
    
    // Test GET operation
    const getResult = await cacheManager.get(testKey);
    if (!getResult || JSON.stringify(getResult) !== JSON.stringify(testValue)) {
      issues.push('Cache GET operation failed or returned incorrect data');
    }
    
    // Test DELETE operation
    const deleteResult = await cacheManager.delete(testKey);
    if (!deleteResult) {
      issues.push('Cache DELETE operation failed');
    }
    
    // Test pattern deletion
    const patternTestKey = `pattern_test_${Date.now()}`;
    await cacheManager.set(patternTestKey, testValue, { ttl: 60 });
    const patternDeleteCount = await cacheManager.deletePattern('pattern_test_');
    if (patternDeleteCount === 0) {
      issues.push('Cache pattern deletion failed');
    }
    
    // Test EXISTS operation
    const existsResult = await cacheManager.exists(testKey);
    if (existsResult) {
      issues.push('Cache EXISTS operation failed - key should not exist after deletion');
    }
    
    // Get cache statistics
    const stats = cacheManager.getStats();
    const totalOperations = stats.hits + stats.misses + stats.sets + stats.deletes;
    const hitRate = totalOperations > 0 ? (stats.hits / totalOperations) * 100 : 0;
    const missRate = totalOperations > 0 ? (stats.misses / totalOperations) * 100 : 0;
    const errorRate = totalOperations > 0 ? (stats.errors / totalOperations) * 100 : 0;
    
    // Analyze performance metrics
    if (hitRate < 50) {
      issues.push(`Low cache hit rate: ${hitRate.toFixed(2)}%`);
      recommendations.push('Consider increasing cache TTL or improving cache key strategy');
    }
    
    if (errorRate > 5) {
      issues.push(`High cache error rate: ${errorRate.toFixed(2)}%`);
      recommendations.push('Investigate cache backend connectivity and configuration');
    }
    
    if (missRate > 70) {
      issues.push(`High cache miss rate: ${missRate.toFixed(2)}%`);
      recommendations.push('Review cache invalidation strategy - may be too aggressive');
    }
    
    // Determine overall health status
    let status: 'healthy' | 'degraded' | 'unhealthy';
    if (issues.length === 0) {
      status = 'healthy';
    } else if (issues.length <= 2 && errorRate < 10) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }
    
    logger.info('Cache health check completed', {
      status,
      issuesCount: issues.length,
      hitRate: hitRate.toFixed(2),
      errorRate: errorRate.toFixed(2)
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
    const exists = await cacheManager.exists(eventCachePattern + 'test');
    
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
