// lib/redis.ts
// Redis connection manager with connection pooling and error handling

import Redis from 'ioredis';

import { logger } from './logger';

interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
  lazyConnect?: boolean;
}

class RedisManager {
  private client: Redis | null = null;
  private isConnected = false;
  private config: RedisConfig;

  constructor(config?: Partial<RedisConfig>) {
    this.config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      ...config,
    };
  }

  async connect(): Promise<void> {
    if (this.client && this.isConnected) {
      return;
    }

    try {
      this.client = new Redis(this.config);

      this.client.on('connect', () => {
        this.isConnected = true;
        logger.info('Redis connected successfully');
      });

      this.client.on('error', error => {
        this.isConnected = false;
        logger.error('Redis connection error', { error: error.message });
      });

      this.client.on('close', () => {
        this.isConnected = false;
        logger.warn('Redis connection closed');
      });

      // Test connection
      await this.client.ping();
      logger.info('Redis connection established');
    } catch (error) {
      logger.error('Failed to connect to Redis', { error });
      this.client = null;
      this.isConnected = false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      logger.info('Redis disconnected');
    }
  }

  getClient(): Redis | null {
    return this.client;
  }

  isHealthy(): boolean {
    return this.isConnected && this.client !== null;
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  // Cache operations
  async get(key: string): Promise<string | null> {
    if (!this.client) return null;
    try {
      return await this.client.get(key);
    } catch (error) {
      logger.error('Redis GET error', { key, error });
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (!this.client) return false;
    try {
      if (ttlSeconds) {
        await this.client.setex(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
      return true;
    } catch (error) {
      logger.error('Redis SET error', { key, error });
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      logger.error('Redis DEL error', { key, error });
      return false;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.client) return [];
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error('Redis KEYS error', { pattern, error });
      return [];
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.client) return false;
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Redis EXISTS error', { key, error });
      return false;
    }
  }

  async flushall(): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.flushall();
      return true;
    } catch (error) {
      logger.error('Redis FLUSHALL error', { error });
      return false;
    }
  }

  // Batch operations
  async mget(keys: string[]): Promise<(string | null)[]> {
    if (!this.client) return keys.map(() => null);
    try {
      return await this.client.mget(...keys);
    } catch (error) {
      logger.error('Redis MGET error', { keys, error });
      return keys.map(() => null);
    }
  }

  async mset(keyValuePairs: Record<string, string>): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.client.mset(keyValuePairs);
      return true;
    } catch (error) {
      logger.error('Redis MSET error', { keyValuePairs, error });
      return false;
    }
  }
}

// Singleton instance
const redisManager = new RedisManager();

// Auto-connect in production
if (process.env.NODE_ENV === 'production') {
  redisManager.connect().catch(error => {
    logger.error('Failed to auto-connect Redis', { error });
  });
}

export { redisManager, RedisManager };
export type { RedisConfig };
