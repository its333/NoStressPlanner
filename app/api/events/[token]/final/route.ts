export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emit } from '@/lib/realtime';
import { sessionManager } from '@/lib/session-manager';
import { isWithinRange, toUtcDate } from '@/lib/time';
import { finalDateSchema } from '@/lib/validators';
import { rateLimiters } from '@/lib/rate-limiter';

export const POST = rateLimiters.general(async (req: NextRequest, context: { params: Promise<{ token: string }> }) => {
  const json = await req.json().catch(() => null);
  console.log('🔍 Final API received data:', json);
  const parsed = finalDateSchema.safeParse(json);
  if (!parsed.success) {
    console.log('❌ Final API validation failed:', parsed.error.flatten());
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
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

  const event = invite.event;
  
  // Get session information using the new session manager
  const sessionInfo = await sessionManager.getSessionInfo(req);
  
  // Use the new host detection system
  const hostDetection = await sessionManager.detectHost(
    event.hostId,
    event.host?.name || '',
    sessionInfo.userId,
    undefined, // No attendee display name available in this context
    req.headers.get('cookie')?.match(/next-auth\.session-token=([^;]+)/)?.[1]
  );
  
  const isHost = hostDetection.isHost;
  
  console.log('🔍 Final API host detection:', {
    sessionUserId: sessionInfo.userId,
    hostId: event.hostId,
    isHost,
    method: hostDetection.method,
    confidence: hostDetection.confidence,
    details: hostDetection.details,
    fallbackUsed: sessionInfo.fallbackUsed
  });
  
  if (!isHost) {
    return NextResponse.json({ error: 'Only the host can pick the final date' }, { status: 403 });
  }

  const date = parsed.data.finalDate ? new Date(parsed.data.finalDate) : null;
  if (date && !isWithinRange(date, event.startDate, event.endDate)) {
    return NextResponse.json({ error: 'Final date must be within the event range' }, { status: 400 });
  }

  const updated = await prisma.event.update({
    where: { id: event.id },
    data: {
      finalDate: date ? toUtcDate(date) : null,
      phase: date ? 'FINALIZED' : event.phase,
    },
  });

  await emit(event.id, 'final.date.set', { date: updated.finalDate ? updated.finalDate.toISOString() : null });
  if (updated.phase === 'FINALIZED') {
    await emit(event.id, 'phase.changed', { phase: 'FINALIZED' });
  }
  return NextResponse.json({ ok: true });
});