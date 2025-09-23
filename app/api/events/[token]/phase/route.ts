export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emit } from '@/lib/realtime';
import { phaseSchema } from '@/lib/validators';
import { sessionManager } from '@/lib/session-manager';
import { withCSRFProtection } from '@/lib/csrf-protection';
import { rateLimiters } from '@/lib/rate-limiter';

const ALLOWED_PHASES = new Set(['VOTE', 'PICK_DAYS', 'RESULTS', 'FAILED', 'FINALIZED']);

export const POST = rateLimiters.general(withCSRFProtection(async (req: NextRequest, context: { params: Promise<{ token: string }> }) => {
  const json = await req.json().catch(() => null);
  console.log('🔍 Phase API received data:', json);
  const parsed = phaseSchema.safeParse(json);
  if (!parsed.success) {
    console.log('❌ Phase validation failed:', parsed.error.flatten());
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const nextPhase = parsed.data.phase;
  if (!ALLOWED_PHASES.has(nextPhase)) {
    return NextResponse.json({ error: 'Invalid phase' }, { status: 400 });
  }

  const { token } = await context.params;
  const invite = await prisma.inviteToken.findUnique({
    where: { token },
    include: {
      event: {
        include: {
          host: {
            select: {
              id: true,
              name: true
            }
          }
        }
      }
    }
  });
  if (!invite?.event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  // Get session information using the new session manager
  const sessionInfo = await sessionManager.getSessionInfo(req);
  
  // Use the new host detection system
  const hostDetection = await sessionManager.detectHost(
    invite.event.hostId,
    invite.event.host?.name || '',
    sessionInfo.userId,
    undefined, // No attendee display name available in this context
    req.headers.get('cookie')?.match(/next-auth\.session-token=([^;]+)/)?.[1]
  );
  
  const isHost = hostDetection.isHost;
  
  console.log('🔍 Phase API host detection:', {
    sessionUserId: sessionInfo.userId,
    hostId: invite.event.hostId,
    isHost,
    method: hostDetection.method,
    confidence: hostDetection.confidence,
    details: hostDetection.details,
    fallbackUsed: sessionInfo.fallbackUsed
  });
  
  if (!isHost) {
    return NextResponse.json({ error: 'Only the host can change the phase' }, { status: 403 });
  }

  await prisma.event.update({ where: { id: invite.eventId }, data: { phase: nextPhase } });
  await emit(invite.eventId, 'phase.changed', { phase: nextPhase });
  console.log('📡 Emitted phase.changed event for event:', invite.eventId, 'phase:', nextPhase);
  
  // Proper cache invalidation using centralized system
  const { invalidateEventOperationCache } = await import('@/lib/cache-invalidation');
  await invalidateEventOperationCache(token, 'phase');
  
  return NextResponse.json({ ok: true });
}));