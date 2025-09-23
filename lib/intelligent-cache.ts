// lib/intelligent-cache.ts
// Intelligent caching system with smart invalidation

import { logger } from '@/lib/logger';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  hitRate: number;
}

class IntelligentCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    hitRate: 0
  };

  constructor(private defaultTTL: number = 5 * 60 * 1000) {} // 5 minutes default

  /**
   * Get data from cache with intelligent TTL management
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Update access tracking
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    
    this.stats.hits++;
    this.updateHitRate();
    
    logger.debug('Cache HIT', { key: key.substring(0, 20) + '...', accessCount: entry.accessCount });
    return entry.data;
  }

  /**
   * Set data in cache with intelligent TTL
   */
  set(key: string, data: T, ttl?: number): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL,
      accessCount: 0,
      lastAccessed: Date.now()
    };

    this.cache.set(key, entry);
    this.stats.sets++;
    
    logger.debug('Cache SET', { key: key.substring(0, 20) + '...', ttl: entry.ttl });
  }

  /**
   * Delete specific key
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.stats.deletes++;
    }
    return deleted;
  }

  /**
   * Delete multiple keys matching pattern
   */
  deletePattern(pattern: string): number {
    let deletedCount = 0;
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deletedCount++;
      }
    }
    
    if (deletedCount > 0) {
      this.stats.deletes += deletedCount;
      logger.debug('Cache DELETE PATTERN', { pattern, deletedCount });
    }
    
    return deletedCount;
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.stats.deletes += this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.debug('Cache cleanup', { cleanedCount, remaining: this.cache.size });
    }
    
    return cleanedCount;
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Update hit rate calculation
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }
}

// Create specialized cache instances
export const eventCache = new IntelligentCache(2 * 60 * 1000); // 2 minutes for events
export const sessionCache = new IntelligentCache(5 * 60 * 1000); // 5 minutes for sessions
export const userCache = new IntelligentCache(10 * 60 * 1000); // 10 minutes for users
export const availabilityCache = new IntelligentCache(30 * 1000); // 30 seconds for availability

/**
 * Smart cache invalidation based on operation type
 */
export function invalidateCacheSmart(eventId: string, operation: 'vote' | 'block' | 'join' | 'phase' | 'final') {
  const patterns = {
    vote: [`event_data:*:${eventId}*`, `availability:*:${eventId}*`],
    block: [`event_data:*:${eventId}*`, `availability:*:${eventId}*`],
    join: [`event_data:*:${eventId}*`, `session:*:${eventId}*`],
    phase: [`event_data:*:${eventId}*`, `availability:*:${eventId}*`],
    final: [`event_data:*:${eventId}*`, `availability:*:${eventId}*`]
  };

  const operationPatterns = patterns[operation] || [];
  let totalDeleted = 0;

  for (const pattern of operationPatterns) {
    totalDeleted += eventCache.deletePattern(pattern);
    totalDeleted += sessionCache.deletePattern(pattern);
    totalDeleted += availabilityCache.deletePattern(pattern);
  }

  logger.debug('Smart cache invalidation', {
    eventId: eventId.substring(0, 8) + '...',
    operation,
    deletedCount: totalDeleted
  });

  return totalDeleted;
}

/**
 * Cache health monitoring
 */
export function getCacheHealth() {
  return {
    eventCache: {
      size: eventCache.size(),
      stats: eventCache.getStats()
    },
    sessionCache: {
      size: sessionCache.size(),
      stats: sessionCache.getStats()
    },
    userCache: {
      size: userCache.size(),
      stats: userCache.getStats()
    },
    availabilityCache: {
      size: availabilityCache.size(),
      stats: availabilityCache.getStats()
    }
  };
}

// Periodic cleanup
setInterval(() => {
  eventCache.cleanup();
  sessionCache.cleanup();
  userCache.cleanup();
  availabilityCache.cleanup();
}, 60 * 1000); // Cleanup every minute
