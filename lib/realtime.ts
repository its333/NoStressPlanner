// lib/realtime.ts
// Enhanced real-time communication with optimizations and fallback
import Pusher from 'pusher';
import { eventBatcher } from './event-batcher';
import { connectionManager } from './connection-manager';
import { eventOptimizer } from './event-optimizer';
import { fallbackRealtime } from './realtime-fallback';
import { logger } from './logger';

const appId = process.env.PUSHER_APP_ID;
const key = process.env.PUSHER_KEY;
const secret = process.env.PUSHER_SECRET;
const cluster = process.env.PUSHER_CLUSTER;

const enabled = Boolean(appId && key && secret && cluster);

const serverPusher = enabled
  ? new Pusher({
      appId: appId!,
      key: key!,
      secret: secret!,
      cluster: cluster!,
      useTLS: true,
    })
  : null;

// Log configuration status
if (enabled) {
  logger.info('Pusher real-time system enabled', { 
    appId: appId?.substring(0, 8) + '...',
    cluster 
  });
} else {
  logger.warn('Pusher real-time system disabled - using fallback', {
    hasAppId: !!appId,
    hasKey: !!key,
    hasSecret: !!secret,
    hasCluster: !!cluster
  });
}

// Enhanced emit function with optimizations and fallback
export async function emit(eventId: string, event: string, payload: unknown) {
  if (!serverPusher) {
    // Use fallback real-time system for development
    logger.debug('Using fallback real-time system', { eventId, event });
    await fallbackRealtime.emit(eventId, event, payload);
    return;
  }

  try {
    // Optimize payload
    const optimizedPayload = eventOptimizer.compressPayload({
      eventId,
      timestamp: Date.now(),
      data: payload,
      size: JSON.stringify(payload).length
    });

    // Validate payload size
    if (!eventOptimizer.validatePayloadSize(optimizedPayload)) {
      logger.warn('Large payload detected, splitting', { eventId, event });
      const splitPayloads = eventOptimizer.splitLargePayload(optimizedPayload);
      
      for (const splitPayload of splitPayloads) {
        await serverPusher.trigger(`event-${eventId}`, event, splitPayload);
      }
    } else {
      await serverPusher.trigger(`event-${eventId}`, event, optimizedPayload);
    }

    logger.debug('Pusher event emitted successfully', { eventId, event });
  } catch (error) {
    logger.error('Failed to emit Pusher event, falling back', { eventId, event, error });
    // Fallback to local system if Pusher fails
    await fallbackRealtime.emit(eventId, event, payload);
  }
}

// Batched emit for high-frequency events
export async function emitBatched(eventId: string, event: string, payload: unknown) {
  await eventBatcher.addEvent(eventId, event, payload);
}

// Connection management
export function addConnection(eventId: string, connectionId: string, info?: any) {
  connectionManager.addConnection(eventId, connectionId, info);
}

export function removeConnection(eventId: string, connectionId: string) {
  connectionManager.removeConnection(eventId, connectionId);
}

export function updateConnectionLastSeen(connectionId: string) {
  connectionManager.updateLastSeen(connectionId);
}

export function getConnectionStats(eventId: string) {
  return connectionManager.getEventStats(eventId);
}

// Optimized event helpers
export async function emitVoteUpdate(eventId: string, attendeeNameId: string, voteIn: boolean) {
  const payload = eventOptimizer.optimizeVoteEvent(eventId, attendeeNameId, voteIn);
  await emitBatched(eventId, 'vote.updated', payload.data);
}

export async function emitBlockUpdate(eventId: string, attendeeNameId: string, date: string, action: 'add' | 'remove') {
  const payload = eventOptimizer.optimizeBlockEvent(eventId, attendeeNameId, date, action);
  await emitBatched(eventId, 'blocks.updated', payload.data);
}

export async function emitPhaseChange(eventId: string, phase: string, reason?: string) {
  const payload = eventOptimizer.optimizePhaseEvent(eventId, phase, reason);
  await emit(eventId, 'phase.changed', payload.data);
}

export async function emitAttendeeUpdate(eventId: string, attendeeId: string, action: 'joined' | 'left' | 'switched') {
  const payload = eventOptimizer.optimizeAttendeeEvent(eventId, attendeeId, action);
  await emit(eventId, 'attendee.updated', payload.data);
}

export async function emitFinalDateSet(eventId: string, finalDate: string, setBy: string) {
  const payload = eventOptimizer.optimizeFinalDateEvent(eventId, finalDate, setBy);
  await emit(eventId, 'final.date.set', payload.data);
}

export async function emitAvailabilityUpdate(eventId: string, availability: any[]) {
  const payload = eventOptimizer.optimizeAvailabilityEvent(eventId, availability);
  await emitBatched(eventId, 'availability.updated', payload.data);
}

// Flush all pending batched events
export async function flushBatchedEvents() {
  await eventBatcher.flush();
}