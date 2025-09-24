export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sessionManager } from '@/lib/session-manager';
import { emit } from '@/lib/realtime';
import { z } from 'zod';

const showResultsSchema = z.object({
  showResultsToEveryone: z.boolean(),
});

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const json = await req.json().catch(() => null);
    console.log('Show Results API: request received', { json });
    
    const parsed = showResultsSchema.safeParse(json);
    if (!parsed.success) {
      console.log('Show Results API: validation failed', parsed.error.flatten());
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { token } = await context.params;
    const { showResultsToEveryone } = parsed.data;
    
    console.log('Show Results API: processing request', { 
      token: token.substring(0, 8) + '...', 
      showResultsToEveryone 
    });

  const invite = await prisma.inviteToken.findUnique({
    where: { token },
    include: { 
      event: {
        include: {
          host: true
        }
      }
    },
  });
  if (!invite?.event) {
    console.log('Show Results API: event not found', { token: token.substring(0, 8) + '...' });
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const event = invite.event;
  console.log('Show Results API: event found', { 
    eventId: event.id, 
    hostId: event.hostId,
    currentShowResults: event.showResultsToEveryone 
  });
  
  // Use the proper host detection system
  const sessionInfo = await sessionManager.getSessionInfo(req);
  console.log('Show Results API: session info', {
    userId: sessionInfo.userId,
    isAuthenticated: sessionInfo.isAuthenticated,
  });
  
  // Ensure host information is available
  if (!event.host) {
    console.error('Show Results API: host information missing', { eventId: event.id, hostId: event.hostId });
    return NextResponse.json({ error: 'Host information not found' }, { status: 500 });
  }

  const hostDetection = await sessionManager.detectHost(
    event.hostId,
    event.host.name || '',
    sessionInfo.userId,
    undefined, // displayName not needed for host detection
    undefined  // sessionKey not needed for host detection
  );
  
  console.log('Show Results API: host detection', {
    isHost: hostDetection.isHost,
    method: hostDetection.method,
    confidence: hostDetection.confidence,
  });
  
  if (!hostDetection.isHost) {
    console.log('Show Results API: not host, access denied');
    return NextResponse.json({ error: 'Only the host can change this setting' }, { status: 403 });
  }

  const updated = await prisma.event.update({
    where: { id: event.id },
    data: { showResultsToEveryone },
  });
  
  console.log('Show Results API: event updated', { 
    showResultsToEveryone: updated.showResultsToEveryone 
  });

  // Emit realtime event to update all clients
  try {
    await emit(event.id, 'showResults.changed', { showResultsToEveryone });
    console.log('Show Results API: event emitted successfully');
  } catch (emitError) {
    console.warn('Failed to emit showResults.changed event:', emitError);
  }

  // Invalidate cache to ensure all clients get updated data
  try {
    const { invalidateEventOperationCache } = await import('@/lib/cache-invalidation');
    await invalidateEventOperationCache(token, 'phase');
    console.log('Show Results API: cache invalidated successfully');
  } catch (cacheError) {
    console.warn('Failed to invalidate cache:', cacheError);
  }

  return NextResponse.json({ ok: true, showResultsToEveryone: updated.showResultsToEveryone });
  
  } catch (error) {
    console.error('Show Results API: unexpected error', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
