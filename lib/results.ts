// lib/results.ts
// Utilities for summarising availability across event days.

export interface DayBlockLike {
  attendeeNameId: string;
  date: Date | string;
}

export interface AvailabilityDay {
  date: Date;
  available: number;
  blockedAttendees: string[];
}

export interface ComputeAvailabilityResult {
  availability: AvailabilityDay[];
  earliestAll: AvailabilityDay | null;
  earliestMost: AvailabilityDay | null;
  top3: AvailabilityDay[];
}

function normaliseDate(value: Date | string): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

export function computeAvailability(
  attendeesIn: string[],
  blocks: DayBlockLike[],
  days: Date[],
): ComputeAvailabilityResult {
  console.log(`🔍 ComputeAvailability Debug:`);
  console.log(`   Attendees In: ${attendeesIn.length} - [${attendeesIn.join(', ')}]`);
  console.log(`   Blocks: ${blocks.length}`);
  console.log(`   Days: ${days.length}`);
  
  const inSet = new Set(attendeesIn);
  const totalIn = attendeesIn.length;

  const blocksByDay = new Map<string, Set<string>>();
  for (const block of blocks) {
    if (!inSet.has(block.attendeeNameId)) {
      console.log(`   Skipping block from ${block.attendeeNameId} (not in attendeesIn)`);
      continue; // ignore blocks from attendees who are not "in"
    }
    const key = normaliseDate(block.date);
    const set = blocksByDay.get(key) ?? new Set<string>();
    set.add(block.attendeeNameId);
    blocksByDay.set(key, set);
    console.log(`   Added block for ${block.attendeeNameId} on ${key}`);
  }

  console.log(`   Blocks by day: ${blocksByDay.size} days have blocks`);

  const availability: AvailabilityDay[] = days.map((day) => {
    const key = normaliseDate(day);
    const blocked = blocksByDay.get(key) ?? new Set<string>();
    const blockedCount = blocked.size;
    const available = Math.max(0, totalIn - blockedCount);
    return {
      date: new Date(key),
      available,
      blockedAttendees: [...blocked],
    };
  });

  console.log(`   Availability calculated: ${availability.length} days`);
  availability.forEach(day => {
    console.log(`     ${day.date.toISOString()}: ${day.available} available (${day.blockedAttendees.length} blocked)`);
  });

  const earliestAll = availability.find((day) => day.available === totalIn) ?? null;

  let earliestMost: AvailabilityDay | null = null;
  for (const day of availability) {
    if (!earliestMost || day.available > earliestMost.available ||
      (day.available === earliestMost.available && day.date.getTime() < earliestMost.date.getTime())) {
      earliestMost = day;
    }
  }

  const top3 = [...availability]
    .sort((a, b) => {
      if (b.available !== a.available) return b.available - a.available;
      return a.date.getTime() - b.date.getTime();
    })
    .slice(0, 3);

  return { availability, earliestAll, earliestMost, top3 };
}
