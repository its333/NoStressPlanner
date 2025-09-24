// lib/client-realtime.ts
// Client-side real-time system with Pusher fallback

'use client';

import Pusher from 'pusher-js';
import { useEffect, useRef } from 'react';

import { logger } from './logger';

interface RealtimeEvent {
  eventId: string;
  event: string;
  payload: unknown;
  timestamp: number;
}

interface ClientRealtimeConfig {
  eventId: string;
  onEvent: (event: RealtimeEvent) => void;
  enabled?: boolean;
}

class ClientRealtimeManager {
  private pusherClient: Pusher | null = null;
  private fallbackInterval: NodeJS.Timeout | null = null;
  private lastEventTimestamp = 0;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor() {
    this.setupPusherClient();
  }

  private setupPusherClient() {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

    if (!key || !cluster) {
      logger.warn('Pusher client credentials missing, using fallback polling');
      return;
    }

    try {
      this.pusherClient = new Pusher(key, {
        cluster,
        forceTLS: true,
        enabledTransports: ['ws', 'wss'],
      });

      this.pusherClient.connection.bind('connected', () => {
        logger.info('Pusher client connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
      });

      this.pusherClient.connection.bind('disconnected', () => {
        logger.warn('Pusher client disconnected');
        this.isConnected = false;
      });

      this.pusherClient.connection.bind('error', (error: any) => {
        logger.error('Pusher client error', { error });
        this.isConnected = false;
        this.handleReconnection();
      });

      this.pusherClient.connection.bind('failed', (error: any) => {
        logger.error('Pusher client connection failed', { error });
        this.isConnected = false;
        this.handleReconnection();
      });
    } catch (error) {
      logger.error('Failed to initialize Pusher client', { error });
      this.pusherClient = null;
    }
  }

  private handleReconnection() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached, switching to fallback');
      this.pusherClient = null;
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);

    logger.info(
      `Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`
    );

    setTimeout(() => {
      if (this.pusherClient) {
        this.pusherClient.connect();
      }
    }, delay);
  }

  subscribe(config: ClientRealtimeConfig): () => void {
    const { eventId, onEvent, enabled = true } = config;

    if (!enabled) {
      return () => {};
    }

    logger.debug('Subscribing to real-time events', { eventId });

    // Try Pusher first
    if (this.pusherClient && this.isConnected) {
      return this.subscribeWithPusher(eventId, onEvent);
    }

    // Fallback to polling
    return this.subscribeWithPolling(eventId, onEvent);
  }

  private subscribeWithPusher(
    eventId: string,
    onEvent: (event: RealtimeEvent) => void
  ): () => void {
    if (!this.pusherClient) {
      return this.subscribeWithPolling(eventId, onEvent);
    }

    const channel = this.pusherClient.subscribe(`event-${eventId}`);

    const events = [
      'vote.updated',
      'blocks.updated',
      'phase.changed',
      'final.date.set',
      'attendee.nameChanged',
      'attendee.joined',
      'attendee.left',
      'showResults.changed',
    ];

    const handlers = events.map(eventName => {
      const handler = (data: any) => {
        logger.debug('Received Pusher event', {
          eventId,
          event: eventName,
          data,
        });
        onEvent({
          eventId,
          event: eventName,
          payload: data,
          timestamp: Date.now(),
        });
      };

      channel.bind(eventName, handler);
      return { eventName, handler };
    });

    logger.info('Subscribed to Pusher channel', {
      eventId,
      events: events.length,
    });

    // Return unsubscribe function
    return () => {
      handlers.forEach(({ eventName, handler }) => {
        channel.unbind(eventName, handler);
      });
      this.pusherClient?.unsubscribe(`event-${eventId}`);
      logger.debug('Unsubscribed from Pusher channel', { eventId });
    };
  }

  private subscribeWithPolling(
    eventId: string,
    onEvent: (event: RealtimeEvent) => void
  ): () => void {
    logger.info('Using polling fallback for real-time updates', { eventId });

    const pollInterval = 2000; // Poll every 2 seconds
    let isActive = true;

    const poll = async () => {
      if (!isActive) return;

      try {
        // Check for updates by fetching the latest event data
        const response = await fetch(
          `/api/events/${eventId}?refresh=${Date.now()}`,
          {
            method: 'GET',
            headers: {
              'Cache-Control': 'no-cache',
              Pragma: 'no-cache',
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          const currentTimestamp = Date.now();

          // Simple change detection - if this is the first poll or data has changed
          if (
            this.lastEventTimestamp === 0 ||
            currentTimestamp - this.lastEventTimestamp > pollInterval
          ) {
            logger.debug('Polling detected data change', { eventId });
            onEvent({
              eventId,
              event: 'polling.update',
              payload: data,
              timestamp: currentTimestamp,
            });
            this.lastEventTimestamp = currentTimestamp;
          }
        }
      } catch (error) {
        logger.error('Polling error', { eventId, error });
      }

      if (isActive) {
        setTimeout(poll, pollInterval);
      }
    };

    // Start polling
    poll();

    // Return unsubscribe function
    return () => {
      isActive = false;
      logger.debug('Stopped polling fallback', { eventId });
    };
  }

  // Get connection status
  getStatus() {
    return {
      isConnected: this.isConnected,
      hasPusherClient: !!this.pusherClient,
      reconnectAttempts: this.reconnectAttempts,
      usingFallback: !this.pusherClient || !this.isConnected,
    };
  }

  // Force reconnection
  reconnect() {
    if (this.pusherClient) {
      this.pusherClient.disconnect();
      this.pusherClient.connect();
    }
  }

  // Cleanup
  destroy() {
    if (this.pusherClient) {
      this.pusherClient.disconnect();
      this.pusherClient = null;
    }
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }
  }
}

// Singleton instance
const clientRealtime = new ClientRealtimeManager();

// React hook for real-time subscriptions
export function useRealtime(config: ClientRealtimeConfig) {
  const configRef = useRef(config);
  configRef.current = config;

  useEffect(() => {
    const unsubscribe = clientRealtime.subscribe(configRef.current);
    return unsubscribe;
  }, [config.eventId, config.enabled]);

  return {
    status: clientRealtime.getStatus(),
    reconnect: () => clientRealtime.reconnect(),
  };
}

export { clientRealtime, ClientRealtimeManager };
export type { RealtimeEvent, ClientRealtimeConfig };
