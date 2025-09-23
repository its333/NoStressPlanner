// lib/event-batcher.ts
// High-performance event batching system for real-time updates

import { logger } from './logger';

interface BatchedEvent {
  eventId: string;
  event: string;
  payload: unknown;
  timestamp: number;
  priority: number;
}

interface BatchConfig {
  maxBatchSize: number;
  maxWaitTime: number; // milliseconds
  maxPayloadSize: number; // bytes
}

class EventBatcher {
  private batches = new Map<string, BatchedEvent[]>();
  private timers = new Map<string, NodeJS.Timeout>();
  private config: BatchConfig;
  private flushCallback?: (events: BatchedEvent[]) => Promise<void>;

  constructor(config?: Partial<BatchConfig>) {
    this.config = {
      maxBatchSize: 50,
      maxWaitTime: 1000, // 1 second
      maxPayloadSize: 1024 * 1024, // 1MB
      ...config,
    };
  }

  setFlushCallback(callback: (events: BatchedEvent[]) => Promise<void>): void {
    this.flushCallback = callback;
  }

  addEvent(eventId: string, event: string, payload: unknown, priority = 0): void {
    const batchedEvent: BatchedEvent = {
      eventId,
      event,
      payload,
      timestamp: Date.now(),
      priority,
    };

    // Get or create batch for this event type
    const batchKey = `${eventId}:${event}`;
    if (!this.batches.has(batchKey)) {
      this.batches.set(batchKey, []);
    }

    const batch = this.batches.get(batchKey)!;
    batch.push(batchedEvent);

    // Sort by priority (higher priority first)
    batch.sort((a, b) => b.priority - a.priority);

    logger.debug('Event added to batch', { 
      eventId, 
      event, 
      batchSize: batch.length,
      priority 
    });

    // Check if batch should be flushed
    if (this.shouldFlushBatch(batch)) {
      this.flushBatch(batchKey);
    } else {
      // Set timer for automatic flush
      this.scheduleFlush(batchKey);
    }
  }

  private shouldFlushBatch(batch: BatchedEvent[]): boolean {
    // Flush if batch is full
    if (batch.length >= this.config.maxBatchSize) {
      return true;
    }

    // Flush if payload size is too large
    const payloadSize = this.calculateBatchSize(batch);
    if (payloadSize >= this.config.maxPayloadSize) {
      return true;
    }

    return false;
  }

  private calculateBatchSize(batch: BatchedEvent[]): number {
    try {
      return JSON.stringify(batch).length;
    } catch {
      return 0;
    }
  }

  private scheduleFlush(batchKey: string): void {
    // Clear existing timer
    const existingTimer = this.timers.get(batchKey);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(() => {
      this.flushBatch(batchKey);
    }, this.config.maxWaitTime);

    this.timers.set(batchKey, timer);
  }

  private async flushBatch(batchKey: string): Promise<void> {
    const batch = this.batches.get(batchKey);
    if (!batch || batch.length === 0) {
      return;
    }

    // Clear timer
    const timer = this.timers.get(batchKey);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(batchKey);
    }

    // Remove batch from map
    this.batches.delete(batchKey);

    try {
      if (this.flushCallback) {
        await this.flushCallback(batch);
        logger.debug('Batch flushed successfully', { 
          batchKey, 
          eventCount: batch.length 
        });
      } else {
        logger.warn('No flush callback set for batch', { 
          batchKey, 
          eventCount: batch.length 
        });
      }
    } catch (error) {
      logger.error('Batch flush failed', { 
        batchKey, 
        eventCount: batch.length, 
        error 
      });
    }
  }

  async flush(): Promise<void> {
    const batchKeys = Array.from(this.batches.keys());
    
    logger.info('Flushing all batches', { batchCount: batchKeys.length });

    // Flush all batches in parallel
    const flushPromises = batchKeys.map(batchKey => this.flushBatch(batchKey));
    await Promise.allSettled(flushPromises);

    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  getStats(): {
    activeBatches: number;
    totalEvents: number;
    activeTimers: number;
  } {
    let totalEvents = 0;
    for (const batch of this.batches.values()) {
      totalEvents += batch.length;
    }

    return {
      activeBatches: this.batches.size,
      totalEvents,
      activeTimers: this.timers.size,
    };
  }

  clear(): void {
    // Clear all timers
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();

    // Clear all batches
    this.batches.clear();

    logger.info('Event batcher cleared');
  }

  // Optimized batch operations for specific event types
  async flushEventType(eventId: string, event: string): Promise<void> {
    const batchKey = `${eventId}:${event}`;
    await this.flushBatch(batchKey);
  }

  async flushEventId(eventId: string): Promise<void> {
    const batchKeys = Array.from(this.batches.keys()).filter(key => 
      key.startsWith(`${eventId}:`)
    );

    const flushPromises = batchKeys.map(batchKey => this.flushBatch(batchKey));
    await Promise.allSettled(flushPromises);
  }

  // Health check
  isHealthy(): boolean {
    const stats = this.getStats();
    return stats.activeBatches < 100 && stats.totalEvents < 1000;
  }
}

// Singleton instance
export const eventBatcher = new EventBatcher();
export type { BatchedEvent, BatchConfig };
