// lib/realtime-fallback.ts
// Fallback real-time system for development when Pusher is not configured

import { logger } from './logger';

interface RealtimeEvent {
  eventId: string;
  event: string;
  payload: unknown;
  timestamp: number;
}

class FallbackRealtimeManager {
  private eventQueue: RealtimeEvent[] = [];
  private subscribers: Map<string, Set<(event: RealtimeEvent) => void>> = new Map();
  private isProcessing = false;

  // Subscribe to events for a specific event ID
  subscribe(eventId: string, callback: (event: RealtimeEvent) => void): () => void {
    const channel = `event-${eventId}`;
    
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Set());
    }
    
    this.subscribers.get(channel)!.add(callback);
    
    logger.debug('Fallback realtime: Subscribed to channel', { channel });
    
    // Return unsubscribe function
    return () => {
      const subscribers = this.subscribers.get(channel);
      if (subscribers) {
        subscribers.delete(callback);
        if (subscribers.size === 0) {
          this.subscribers.delete(channel);
        }
      }
    };
  }

  // Emit an event (simulates Pusher trigger)
  async emit(eventId: string, event: string, payload: unknown): Promise<void> {
    const realtimeEvent: RealtimeEvent = {
      eventId,
      event,
      payload,
      timestamp: Date.now()
    };

    this.eventQueue.push(realtimeEvent);
    
    logger.debug('Fallback realtime: Event queued', { 
      eventId, 
      event, 
      queueSize: this.eventQueue.length 
    });

    // Process events asynchronously
    this.processEvents();
  }

  private async processEvents(): Promise<void> {
    if (this.isProcessing || this.eventQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.eventQueue.length > 0) {
      const event = this.eventQueue.shift()!;
      const channel = `event-${event.eventId}`;
      
      const subscribers = this.subscribers.get(channel);
      if (subscribers && subscribers.size > 0) {
        logger.debug('Fallback realtime: Broadcasting event', { 
          channel, 
          event: event.event, 
          subscriberCount: subscribers.size 
        });
        
        // Broadcast to all subscribers
        subscribers.forEach(callback => {
          try {
            callback(event);
          } catch (error) {
            logger.error('Fallback realtime: Callback error', { error, event });
          }
        });
      } else {
        logger.debug('Fallback realtime: No subscribers for event', { channel, event: event.event });
      }
    }

    this.isProcessing = false;
  }

  // Get connection stats
  getStats() {
    const totalSubscribers = Array.from(this.subscribers.values())
      .reduce((sum, set) => sum + set.size, 0);
    
    return {
      totalChannels: this.subscribers.size,
      totalSubscribers,
      queuedEvents: this.eventQueue.length,
      isProcessing: this.isProcessing
    };
  }
}

// Singleton instance
export const fallbackRealtime = new FallbackRealtimeManager();

// Export types
export type { RealtimeEvent };
