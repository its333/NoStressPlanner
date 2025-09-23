export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';

import { getCurrentAttendeeSession } from '@/lib/attendees';
import { auth } from '@/lib/auth';
import { getSessionKey } from '@/lib/cookies';
import { debugLog } from '@/lib/debug';
import { prisma } from '@/lib/prisma';
import { emit } from '@/lib/realtime';

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;

  const invite = await prisma.inviteToken.findUnique({
    where: { token },
    include: { event: true },
  });
  if (!invite?.event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  const event = invite.event;
  const session = await auth();
  const sessionKey = await getSessionKey(event.id);
  const attendeeSession = await getCurrentAttendeeSession(
    event.id,
    session?.user?.id,
    sessionKey || undefined
  );

  if (!attendeeSession) {
    return NextResponse.json(
      { error: 'Not currently joined to this event' },
      { status: 404 }
    );
  }

  debugLog('Leave API: deactivating session', {
    sessionId: attendeeSession.id,
    attendeeNameId: attendeeSession.attendeeNameId,
    userId: attendeeSession.userId,
    sessionKey: sessionKey ? `${sessionKey.substring(0, 8)}...` : 'none',
  });

  // Deactivate the session instead of deleting it
  // This preserves the person's data (votes, blocks) for potential future access
  await prisma.attendeeSession.update({
    where: { id: attendeeSession.id },
    data: { isActive: false },
  });

  // Emit realtime event to update all clients
  await emit(event.id, 'attendee.left', { attendeeId: attendeeSession.id });

  return NextResponse.json({ ok: true });
}
