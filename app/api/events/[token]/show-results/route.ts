export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { emit } from '@/lib/realtime';
import { z } from 'zod';

const showResultsSchema = z.object({
  showResultsToEveryone: z.boolean(),
});

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const json = await req.json().catch(() => null);
  const parsed = showResultsSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { token } = await context.params;
  const { showResultsToEveryone } = parsed.data;

  const invite = await prisma.inviteToken.findUnique({
    where: { token },
    include: { event: true },
  });
  if (!invite?.event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const event = invite.event;
  
  // Enhanced host detection with JWT session error handling
  let session = null;
  let sessionUserId = null;
  try {
    session = await auth();
    sessionUserId = session?.user?.id;
  } catch (error) {
    console.warn('⚠️ JWT session error in show-results, continuing without auth:', error);
  }
  
  // Check if user is the host using multiple methods
  const isHostBySession = sessionUserId === event.hostId;
  
  // Additional fallback: Check session key for host identification
  const sessionKey = req.headers.get('cookie')?.match(/next-auth\.session-token=([^;]+)/)?.[1];
  const isHostBySessionKey = sessionKey && sessionKey.includes('user_') && 
    sessionKey.includes(event.hostId.substring(0, 8));
  
  const isHost = isHostBySession || isHostBySessionKey;
  
  if (!isHost) {
    return NextResponse.json({ error: 'Only the host can change this setting' }, { status: 403 });
  }

  const updated = await prisma.event.update({
    where: { id: event.id },
    data: { showResultsToEveryone },
  });

  // Emit realtime event to update all clients
  await emit(event.id, 'showResults.changed', { showResultsToEveryone });

  return NextResponse.json({ ok: true, showResultsToEveryone: updated.showResultsToEveryone });
}
