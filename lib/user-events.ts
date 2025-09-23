import { prisma } from '@/lib/prisma';
import type { EventPhase } from '@prisma/client';

export interface UserEventSummary {
  id: string;
  title: string;
  startDate: Date;
  endDate: Date;
  voteDeadline: Date;
  finalDate: Date | null;
  phase: EventPhase;
  token: string;
}

export interface UserEventsResult {
  hosting: UserEventSummary[];
  attending: UserEventSummary[];
}

export async function getUserEvents(userId: string): Promise<UserEventsResult> {
  const hosting = await prisma.event.findMany({
    where: { hostId: userId },
    include: { invite: true },
    orderBy: { createdAt: 'desc' },
  });

  const attendingRecords = await prisma.attendeeSession.findMany({
    where: { userId },
    include: {
      event: {
        include: { invite: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const hostingSummaries: UserEventSummary[] = hosting
    .filter((event) => event.invite)
    .map((event) => ({
      id: event.id,
      title: event.title,
      startDate: event.startDate,
      endDate: event.endDate,
      voteDeadline: event.voteDeadline,
      finalDate: event.finalDate,
      phase: event.phase,
      token: event.invite!.token,
    }));

  const hostingIds = new Set(hostingSummaries.map((event) => event.id));

  const attendingSummaries: UserEventSummary[] = [];
  const seenAttending = new Set<string>();

  for (const record of attendingRecords) {
    const event = record.event;
    if (!event?.invite) continue;
    if (hostingIds.has(event.id)) continue;
    if (seenAttending.has(event.id)) continue;

    attendingSummaries.push({
      id: event.id,
      title: event.title,
      startDate: event.startDate,
      endDate: event.endDate,
      voteDeadline: event.voteDeadline,
      finalDate: event.finalDate,
      phase: event.phase,
      token: event.invite.token,
    });
    seenAttending.add(event.id);
  }

  return {
    hosting: hostingSummaries,
    attending: attendingSummaries,
  };
}