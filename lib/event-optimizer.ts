// lib/event-optimizer.ts
// Event payload optimization and compression

import { logger } from './logger';

interface OptimizedPayload {
  eventId: string;
  timestamp: number;
  data: unknown;
  compressed?: boolean;
  size: number;
}

interface EventOptimizationConfig {
  maxPayloadSize: number;
  enableCompression: boolean;
  compressionThreshold: number;
}

class EventOptimizer {
  private config: EventOptimizationConfig;

  constructor(config?: Partial<EventOptimizationConfig>) {
    this.config = {
      maxPayloadSize: 1024 * 1024, // 1MB
      enableCompression: true,
      compressionThreshold: 1024, // 1KB
      ...config,
    };
  }

  compressPayload(payload: OptimizedPayload): OptimizedPayload {
    try {
      const serialized = JSON.stringify(payload.data);
      const size = serialized.length;

      if (this.config.enableCompression && size > this.config.compressionThreshold) {
        // Simple compression simulation (in production, use actual compression)
        const compressed = this.simpleCompress(serialized);
        return {
          ...payload,
          data: compressed,
          compressed: true,
          size: compressed.length,
        };
      }

      return {
        ...payload,
        size,
      };
    } catch (error) {
      logger.error('Payload compression failed', { error });
      return payload;
    }
  }

  private simpleCompress(data: string): string {
    // Simple compression simulation - remove whitespace and common patterns
    return data
      .replace(/\s+/g, ' ')
      .replace(/"/g, "'")
      .replace(/([{,])/g, '$1')
      .trim();
  }

  validatePayloadSize(payload: OptimizedPayload): boolean {
    return payload.size <= this.config.maxPayloadSize;
  }

  splitLargePayload(payload: OptimizedPayload): OptimizedPayload[] {
    try {
      const data = payload.data as any;
      
      if (Array.isArray(data)) {
        // Split array into chunks
        const chunkSize = Math.ceil(data.length / Math.ceil(payload.size / this.config.maxPayloadSize));
        const chunks: OptimizedPayload[] = [];

        for (let i = 0; i < data.length; i += chunkSize) {
          const chunk = data.slice(i, i + chunkSize);
          chunks.push({
            ...payload,
            data: chunk,
            size: JSON.stringify(chunk).length,
          });
        }

        return chunks;
      }

      if (typeof data === 'object' && data !== null) {
        // Split object into smaller objects
        const keys = Object.keys(data);
        const chunkSize = Math.ceil(keys.length / Math.ceil(payload.size / this.config.maxPayloadSize));
        const chunks: OptimizedPayload[] = [];

        for (let i = 0; i < keys.length; i += chunkSize) {
          const chunkKeys = keys.slice(i, i + chunkSize);
          const chunk = chunkKeys.reduce((obj, key) => {
            obj[key] = data[key];
            return obj;
          }, {} as any);

          chunks.push({
            ...payload,
            data: chunk,
            size: JSON.stringify(chunk).length,
          });
        }

        return chunks;
      }

      // For primitive values, return as is
      return [payload];
    } catch (error) {
      logger.error('Payload splitting failed', { error });
      return [payload];
    }
  }

  // Event-specific optimizers
  optimizeVoteEvent(eventId: string, attendeeNameId: string, voteIn: boolean): OptimizedPayload {
    const data = {
      attendeeNameId,
      voteIn,
      timestamp: Date.now(),
    };

    return this.compressPayload({
      eventId,
      timestamp: Date.now(),
      data,
      size: JSON.stringify(data).length,
    });
  }

  optimizeBlockEvent(
    eventId: string, 
    attendeeNameId: string, 
    date: string, 
    action: 'add' | 'remove'
  ): OptimizedPayload {
    const data = {
      attendeeNameId,
      date,
      action,
      timestamp: Date.now(),
    };

    return this.compressPayload({
      eventId,
      timestamp: Date.now(),
      data,
      size: JSON.stringify(data).length,
    });
  }

  optimizePhaseEvent(eventId: string, phase: string, reason?: string): OptimizedPayload {
    const data = {
      phase,
      reason,
      timestamp: Date.now(),
    };

    return this.compressPayload({
      eventId,
      timestamp: Date.now(),
      data,
      size: JSON.stringify(data).length,
    });
  }

  optimizeAttendeeEvent(
    eventId: string, 
    attendeeId: string, 
    action: 'joined' | 'left' | 'switched'
  ): OptimizedPayload {
    const data = {
      attendeeId,
      action,
      timestamp: Date.now(),
    };

    return this.compressPayload({
      eventId,
      timestamp: Date.now(),
      data,
      size: JSON.stringify(data).length,
    });
  }

  optimizeFinalDateEvent(eventId: string, finalDate: string, setBy: string): OptimizedPayload {
    const data = {
      finalDate,
      setBy,
      timestamp: Date.now(),
    };

    return this.compressPayload({
      eventId,
      timestamp: Date.now(),
      data,
      size: JSON.stringify(data).length,
    });
  }

  optimizeAvailabilityEvent(eventId: string, availability: any[]): OptimizedPayload {
    const data = {
      availability,
      timestamp: Date.now(),
    };

    return this.compressPayload({
      eventId,
      timestamp: Date.now(),
      data,
      size: JSON.stringify(data).length,
    });
  }

  // Utility methods
  getPayloadSize(payload: unknown): number {
    try {
      return JSON.stringify(payload).length;
    } catch {
      return 0;
    }
  }

  isPayloadTooLarge(payload: unknown): boolean {
    return this.getPayloadSize(payload) > this.config.maxPayloadSize;
  }

  // Batch optimization
  optimizeBatch(events: OptimizedPayload[]): OptimizedPayload[] {
    return events.map(event => this.compressPayload(event));
  }

  // Statistics
  getOptimizationStats(): {
    totalOptimized: number;
    totalCompressed: number;
    averageCompressionRatio: number;
  } {
    // This would track stats in a real implementation
    return {
      totalOptimized: 0,
      totalCompressed: 0,
      averageCompressionRatio: 0,
    };
  }
}

// Singleton instance
export const eventOptimizer = new EventOptimizer();
export type { OptimizedPayload, EventOptimizationConfig };
