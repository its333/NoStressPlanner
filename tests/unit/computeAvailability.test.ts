import { describe, expect, it } from 'vitest';

import { computeAvailability } from '@/lib/results';

describe('computeAvailability', () => {
  it('returns full availability when there are no blocks', () => {
    const attendeesIn = ['a1', 'a2'];
    const days = [
      new Date('2024-01-01T00:00:00Z'),
      new Date('2024-01-02T00:00:00Z'),
    ];

    const result = computeAvailability(attendeesIn, [], days);

    expect(result.availability).toHaveLength(2);
    expect(result.availability.map(day => day.available)).toEqual([2, 2]);
    expect(result.earliestAll?.date.toISOString()).toBe(
      '2024-01-01T00:00:00.000Z'
    );
    expect(result.earliestMost?.date.toISOString()).toBe(
      '2024-01-01T00:00:00.000Z'
    );
    expect(result.top3[0].available).toBe(2);
  });

  it('ignores blocks from attendees who are not marked as in', () => {
    const attendeesIn = ['host'];
    const days = [new Date('2024-02-01T00:00:00Z')];

    const result = computeAvailability(
      attendeesIn,
      [
        { attendeeNameId: 'host', date: new Date('2024-02-01T00:00:00Z') },
        { attendeeNameId: 'guest', date: new Date('2024-02-01T00:00:00Z') },
      ],
      days
    );

    expect(result.availability[0].available).toBe(0);
    expect(result.availability[0].blockedAttendees).toEqual(['host']);
  });

  it('finds the earliest day with the highest availability when no day fits everyone', () => {
    const attendeesIn = ['a1', 'a2', 'a3'];
    const days = [
      new Date('2024-03-01T00:00:00Z'),
      new Date('2024-03-02T00:00:00Z'),
      new Date('2024-03-03T00:00:00Z'),
    ];

    const blocks = [
      { attendeeNameId: 'a1', date: new Date('2024-03-01T00:00:00Z') },
      { attendeeNameId: 'a2', date: new Date('2024-03-02T00:00:00Z') },
      { attendeeNameId: 'a3', date: new Date('2024-03-03T00:00:00Z') },
    ];

    const result = computeAvailability(attendeesIn, blocks, days);

    expect(result.earliestAll).toBeNull();
    expect(result.earliestMost?.date.toISOString()).toBe(
      '2024-03-01T00:00:00.000Z'
    );
    expect(result.earliestMost?.available).toBe(2);
    expect(result.top3[0].date.toISOString()).toBe('2024-03-01T00:00:00.000Z');
  });
});
