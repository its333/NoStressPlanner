/**
 * DISPLAY TIMEZONE UTILITIES
 *
 * These helpers make sure all user-facing dates use the attendee's
 * selected timezone. Use presets that map to common formatting needs so
 * components stay consistent.
 */

export type TimeZoneFormatPreset =
  | 'mediumDate'
  | 'weekdayLong'
  | 'dateTime'
  | 'shortMonthDay';

const PRESET_OPTIONS: Record<TimeZoneFormatPreset, Intl.DateTimeFormatOptions> =
  {
    mediumDate: { dateStyle: 'medium' },
    weekdayLong: {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    },
    dateTime: {
      dateStyle: 'medium',
      timeStyle: 'short',
    },
    shortMonthDay: {
      month: 'short',
      day: 'numeric',
    },
  };

function toDate(input: string | Date): Date | null {
  const value = typeof input === 'string' ? new Date(input) : input;
  return value instanceof Date && !Number.isNaN(value.getTime()) ? value : null;
}

/**
 * Format a date using the provided preset in the supplied timezone.
 * Defaults to the user's browser locale unless one is provided.
 */
export function formatInTimeZone(
  input: string | Date,
  timeZone: string,
  preset: TimeZoneFormatPreset = 'mediumDate',
  locale = 'en-US'
): string {
  const date = toDate(input);
  if (!date) {
    return '';
  }

  const options = PRESET_OPTIONS[preset];
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(
      date
    );
  } catch (error) {
    console.error('timezone-format-error', {
      error,
      preset,
      timeZone,
      input,
    });
    return new Intl.DateTimeFormat(locale, options).format(date);
  }
}

/**
 * Convenience helper for formatting optional values. Returns undefined when
 * there is nothing to format to prevent sprinkling conditionals in callers.
 */
export function maybeFormatInTimeZone(
  input: string | Date | null | undefined,
  timeZone: string,
  preset: TimeZoneFormatPreset = 'mediumDate',
  locale = 'en-US'
): string | undefined {
  if (!input) {
    return undefined;
  }
  const formatted = formatInTimeZone(input, timeZone, preset, locale);
  return formatted || undefined;
}
