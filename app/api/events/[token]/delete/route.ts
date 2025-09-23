export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';

export async function DELETE(_req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const session = await auth();
  
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Login required to delete events' }, { status: 401 });
  }

  const invite = await prisma.inviteToken.findUnique({
    where: { token },
    include: { event: true },
  });

  if (!invite?.event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  if (invite.event.hostId !== session.user.id) {
    return NextResponse.json({ error: 'Only the host can delete this event' }, { status: 403 });
  }

  // Delete the event and all related data
  await prisma.$transaction(async (tx) => {
    // Delete all related records
    await tx.dayBlock.deleteMany({ where: { eventId: invite.event.id } });
    await tx.vote.deleteMany({ where: { eventId: invite.event.id } });
    await tx.attendeeSession.deleteMany({ where: { eventId: invite.event.id } });
    await tx.attendeeName.deleteMany({ where: { eventId: invite.event.id } });
    await tx.inviteToken.deleteMany({ where: { eventId: invite.event.id } });
    await tx.event.delete({ where: { id: invite.event.id } });
  });

  return NextResponse.json({ ok: true });
}
