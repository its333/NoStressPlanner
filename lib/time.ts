/**
 * LEGACY TIME UTILITIES
 * 
 * This file contains legacy time utilities that are being phased out.
 * Use the new timezone system in lib/timezone/ instead.
 * 
 * @deprecated Use lib/timezone/utc.ts for UTC operations
 */

import { createUtcDate, UtcDateRange } from './timezone/utc';

/**
 * @deprecated Use createUtcDate from lib/timezone/utc.ts
 */
export function toUtcDate(value: Date | string): Date {
  return createUtcDate(value);
}

/**
 * @deprecated Use UtcDateRange.getAllDates() from lib/timezone/utc.ts
 */
export function eachDayInclusive(start: Date | string, end: Date | string): Date[] {
  const range = new UtcDateRange(createUtcDate(start), createUtcDate(end));
  return range.getAllDates();
}

/**
 * @deprecated Use UtcValidator.isWithinRange() from lib/timezone/utc.ts
 */
export function isWithinRange(value: Date | string, start: Date | string, end: Date | string): boolean {
  const range = new UtcDateRange(createUtcDate(start), createUtcDate(end));
  return range.contains(createUtcDate(value));
}
