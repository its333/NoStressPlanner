// lib/cache-manager.ts
// High-performance cache manager with Redis backend and fallback

import { redisManager } from './redis';
import { logger } from './logger';

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  namespace?: string; // Cache namespace for organization
}

interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
}

class CacheManager {
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
  };

  private memoryCache = new Map<string, { value: any; expires: number }>();
  private readonly MEMORY_CACHE_MAX_SIZE = 1000;

  private getKey(key: string, namespace?: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  private isExpired(expires: number): boolean {
    return Date.now() > expires;
  }

  private cleanupMemoryCache(): void {
    for (const [key, data] of this.memoryCache.entries()) {
      if (this.isExpired(data.expires)) {
        this.memoryCache.delete(key);
      }
    }

    // Remove oldest entries if cache is too large
    if (this.memoryCache.size > this.MEMORY_CACHE_MAX_SIZE) {
      const entries = Array.from(this.memoryCache.entries());
      entries.sort((a, b) => a[1].expires - b[1].expires);
      
      const toRemove = entries.slice(0, entries.length - this.MEMORY_CACHE_MAX_SIZE);
      toRemove.forEach(([key]) => this.memoryCache.delete(key));
    }
  }

  async get<T = any>(key: string, options?: CacheOptions): Promise<T | null> {
    const cacheKey = this.getKey(key, options?.namespace);
    
    try {
      // Try Redis first
      if (redisManager.isHealthy()) {
        const redisValue = await redisManager.get(cacheKey);
        if (redisValue) {
          this.stats.hits++;
          console.log(`🎯 Cache HIT (Redis): ${cacheKey.substring(0, 50)}...`);
          return JSON.parse(redisValue);
        }
      }

      // Fallback to memory cache
      const memoryData = this.memoryCache.get(cacheKey);
      if (memoryData && !this.isExpired(memoryData.expires)) {
        this.stats.hits++;
        console.log(`🎯 Cache HIT (Memory): ${cacheKey.substring(0, 50)}...`);
        return memoryData.value;
      }

      this.stats.misses++;
      console.log(`❌ Cache MISS: ${cacheKey.substring(0, 50)}...`);
      return null;
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache GET error', { key: cacheKey, error });
      return null;
    }
  }

  async set<T = any>(key: string, value: T, options?: CacheOptions): Promise<boolean> {
    const cacheKey = this.getKey(key, options?.namespace);
    const ttl = options?.ttl || 300; // Default 5 minutes
    
    try {
      const serializedValue = JSON.stringify(value);
      
      // Set in Redis
      if (redisManager.isHealthy()) {
        const redisSuccess = await redisManager.set(cacheKey, serializedValue, ttl);
        if (redisSuccess) {
          this.stats.sets++;
          logger.debug('Cache set (Redis)', { key: cacheKey, ttl });
        }
      }

      // Set in memory cache as backup
      const expires = Date.now() + (ttl * 1000);
      this.memoryCache.set(cacheKey, { value, expires });
      this.cleanupMemoryCache();

      this.stats.sets++;
      console.log(`💾 Cache SET: ${cacheKey.substring(0, 50)}... (TTL: ${ttl}s)`);
      return true;
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache SET error', { key: cacheKey, error });
      return false;
    }
  }

  async delete(key: string, options?: CacheOptions): Promise<boolean> {
    const cacheKey = this.getKey(key, options?.namespace);
    
    try {
      // Delete from Redis
      if (redisManager.isHealthy()) {
        await redisManager.del(cacheKey);
      }

      // Delete from memory cache
      this.memoryCache.delete(cacheKey);

      this.stats.deletes++;
      console.log(`🗑️ Cache DELETE: ${cacheKey.substring(0, 50)}...`);
      return true;
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache DELETE error', { key: cacheKey, error });
      return false;
    }
  }

  /**
   * Delete multiple cache keys with pattern matching
   * Critical for proper cache invalidation across session-specific keys
   */
  async deletePattern(pattern: string, options?: CacheOptions): Promise<number> {
    const cachePattern = this.getKey(pattern, options?.namespace);
    let deletedCount = 0;
    
    try {
      // Delete from Redis using pattern matching
      if (redisManager.isHealthy()) {
        const keys = await redisManager.keys(cachePattern + '*');       
        if (keys.length > 0) {
          for (const key of keys) {
            await redisManager.del(key);
          }
          deletedCount += keys.length;
        }
      }
      
      // Delete from memory cache using pattern matching
      const memoryKeys = Array.from(this.memoryCache.keys()).filter(key => 
        key.startsWith(cachePattern)
      );
      
      memoryKeys.forEach(key => {
        this.memoryCache.delete(key);
        deletedCount++;
      });
      
      this.stats.deletes += deletedCount;
      console.log(`🗑️ Cache DELETE PATTERN: ${cachePattern.substring(0, 50)}... (${deletedCount} keys deleted)`);
      
      return deletedCount;
    } catch (error) {
      this.stats.errors++;
      logger.error('Cache DELETE PATTERN error', { pattern: cachePattern, error });
      return 0;
    }
  }

  async exists(key: string, options?: CacheOptions): Promise<boolean> {
    const cacheKey = this.getKey(key, options?.namespace);
    
    try {
      // Check Redis first
      if (redisManager.isHealthy()) {
        const exists = await redisManager.exists(cacheKey);
        if (exists) return true;
      }

      // Check memory cache
      const memoryData = this.memoryCache.get(cacheKey);
      return memoryData ? !this.isExpired(memoryData.expires) : false;
    } catch (error) {
      logger.error('Cache EXISTS error', { key: cacheKey, error });
      return false;
    }
  }

  async flush(): Promise<boolean> {
    try {
      // Clear all memory cache
      this.memoryCache.clear();
      
      // Clear Redis cache if available
      if (redisManager.isHealthy()) {
        await redisManager.flushall();
      }
      
      logger.info('Cache flushed completely');
      return true;
    } catch (error) {
      logger.error('Cache FLUSH error', { error });
      return false;
    }
  }

  async clear(namespace?: string): Promise<boolean> {
    try {
      if (namespace) {
        // Clear namespace-specific keys
        const keys = Array.from(this.memoryCache.keys()).filter(key => 
          key.startsWith(`${namespace}:`)
        );
        keys.forEach(key => this.memoryCache.delete(key));
        
        // Note: Redis namespace clearing would require SCAN operation
        // For now, we'll rely on TTL expiration
        logger.info('Cache namespace cleared', { namespace });
      } else {
        // Clear all memory cache
        this.memoryCache.clear();
        logger.info('Cache cleared');
      }
      
      return true;
    } catch (error) {
      logger.error('Cache CLEAR error', { namespace, error });
      return false;
    }
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
    };
  }

  // Batch operations
  async mget<T = any>(keys: string[], options?: CacheOptions): Promise<(T | null)[]> {
    const cacheKeys = keys.map(key => this.getKey(key, options?.namespace));
    
    try {
      const results: (T | null)[] = [];
      
      // Try Redis batch get
      if (redisManager.isHealthy()) {
        const redisValues = await redisManager.mget(cacheKeys);
        for (let i = 0; i < redisValues.length; i++) {
          if (redisValues[i]) {
            try {
              results[i] = JSON.parse(redisValues[i]!);
              this.stats.hits++;
            } catch {
              results[i] = null;
              this.stats.misses++;
            }
          } else {
            results[i] = null;
            this.stats.misses++;
          }
        }
        return results;
      }

      // Fallback to individual memory cache lookups
      for (let i = 0; i < cacheKeys.length; i++) {
        const memoryData = this.memoryCache.get(cacheKeys[i]);
        if (memoryData && !this.isExpired(memoryData.expires)) {
          results[i] = memoryData.value;
          this.stats.hits++;
        } else {
          results[i] = null;
          this.stats.misses++;
        }
      }

      return results;
    } catch (error) {
      logger.error('Cache MGET error', { keys: cacheKeys, error });
      return keys.map(() => null);
    }
  }

  async mset<T = any>(keyValuePairs: Record<string, T>, options?: CacheOptions): Promise<boolean> {
    try {
      const serializedPairs: Record<string, string> = {};
      const ttl = options?.ttl || 300;

      // Prepare serialized data
      for (const [key, value] of Object.entries(keyValuePairs)) {
        const cacheKey = this.getKey(key, options?.namespace);
        serializedPairs[cacheKey] = JSON.stringify(value);
        
        // Set in memory cache
        const expires = Date.now() + (ttl * 1000);
        this.memoryCache.set(cacheKey, { value, expires });
      }

      // Set in Redis
      if (redisManager.isHealthy()) {
        await redisManager.mset(serializedPairs);
        
        // Set TTL for each key
        for (const cacheKey of Object.keys(serializedPairs)) {
          await redisManager.set(cacheKey, serializedPairs[cacheKey], ttl);
        }
      }

      this.cleanupMemoryCache();
      this.stats.sets += Object.keys(keyValuePairs).length;
      
      logger.debug('Cache MSET', { 
        keyCount: Object.keys(keyValuePairs).length, 
        ttl 
      });
      
      return true;
    } catch (error) {
      logger.error('Cache MSET error', { error });
      return false;
    }
  }
}

// Singleton instance
export const cacheManager = new CacheManager();
export type { CacheOptions, CacheStats };
