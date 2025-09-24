/**
 * TIMEZONE CONVERSION UTILITIES
 *
 * This module handles conversion between UTC and Local timezones.
 * Use this when you need to convert between the two systems.
 *
 * IMPORTANT: Always be explicit about which timezone you're working with!
 */

import { createLocalDate, LocalDateRange } from './local';
import { createUtcDate, UtcDateRange } from './utc';

/**
 * Convert UTC date to Local date
 * Preserves the same calendar date in user's timezone
 */
export function utcToLocal(utcDate: Date): Date {
  return new Date(
    utcDate.getUTCFullYear(),
    utcDate.getUTCMonth(),
    utcDate.getUTCDate()
  );
}

/**
 * Convert Local date to UTC date
 * Preserves the same calendar date in UTC
 */
export function localToUtc(localDate: Date): Date {
  return new Date(
    Date.UTC(localDate.getFullYear(), localDate.getMonth(), localDate.getDate())
  );
}

/**
 * Convert UTC date range to Local date range
 */
export function utcRangeToLocal(utcRange: UtcDateRange): LocalDateRange {
  return new LocalDateRange(
    utcToLocal(utcRange.start),
    utcToLocal(utcRange.end)
  );
}

/**
 * Convert Local date range to UTC date range
 */
export function localRangeToUtc(localRange: LocalDateRange): UtcDateRange {
  return new UtcDateRange(
    localToUtc(localRange.start),
    localToUtc(localRange.end)
  );
}

/**
 * Convert array of UTC dates to Local dates
 */
export function utcDatesToLocal(utcDates: Date[]): Date[] {
  return utcDates.map(utcToLocal);
}

/**
 * Convert array of Local dates to UTC dates
 */
export function localDatesToUtc(localDates: Date[]): Date[] {
  return localDates.map(localToUtc);
}

/**
 * Convert UTC date string to Local date string
 */
export function utcDateStringToLocal(utcDateString: string): string {
  const utcDate = createUtcDate(utcDateString);
  const localDate = utcToLocal(utcDate);
  const year = localDate.getFullYear();
  const month = String(localDate.getMonth() + 1).padStart(2, '0');
  const day = String(localDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convert Local date string to UTC date string
 */
export function localDateStringToUtc(localDateString: string): string {
  const localDate = createLocalDate(localDateString);
  const utcDate = localToUtc(localDate);
  return utcDate.toISOString().split('T')[0];
}

/**
 * Get user's timezone offset in minutes
 */
export function getTimezoneOffset(): number {
  return new Date().getTimezoneOffset();
}

/**
 * Get user's timezone name (e.g., "America/New_York")
 */
export function getTimezoneName(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Check if a date is in daylight saving time
 */
export function isDST(date: Date): boolean {
  const jan = new Date(date.getFullYear(), 0, 1);
  const jul = new Date(date.getFullYear(), 6, 1);
  return (
    date.getTimezoneOffset() <
    Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset())
  );
}
