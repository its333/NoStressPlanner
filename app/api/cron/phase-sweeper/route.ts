export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { emit } from '@/lib/realtime';

export async function GET(req: NextRequest) {
  const authz = req.headers.get('authorization');
  if (process.env.CRON_SECRET && authz !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const overdueEvents = await prisma.event.findMany({
    where: { phase: 'VOTE', voteDeadline: { lt: now } },
    include: { votes: { where: { in: true } } },
  });

  const failedEvents = overdueEvents.filter(event => event.votes.length < event.quorum);

  if (failedEvents.length === 0) {
    return NextResponse.json({ ok: true, expired: 0 });
  }

  await prisma.event.updateMany({
    where: { id: { in: failedEvents.map((e) => e.id) } },
    data: { phase: 'FAILED' },
  });

  await Promise.all(failedEvents.map((event) => emit(event.id, 'phase.changed', { phase: 'FAILED' })));

  return NextResponse.json({ ok: true, expired: failedEvents.length });
}
