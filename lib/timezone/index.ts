/**
 * TIMEZONE SYSTEM INDEX
 *
 * This is the main entry point for the timezone system.
 * Import from here to ensure you're using the correct timezone operations.
 */

// UTC Operations - Use for database, API, and cross-timezone operations
export {
  createUtcDate,
  getUtcDateString,
  parseUtcDateString,
  UtcDateRange,
  UtcCalendarGrid,
  UtcFormatter,
  UtcValidator,
} from './utc';

// Local Operations - Use for user input, display, and user-facing operations
export {
  createLocalDate,
  getLocalDateString,
  parseLocalDateString,
  LocalDateRange,
  LocalCalendarGrid,
  LocalFormatter,
  LocalValidator,
} from './local';

// Conversion Operations - Use when converting between UTC and Local
export {
  utcToLocal,
  localToUtc,
  utcRangeToLocal,
  localRangeToUtc,
  utcDatesToLocal,
  localDatesToUtc,
  utcDateStringToLocal,
  localDateStringToUtc,
  getTimezoneOffset,
  getTimezoneName,
  isDST,
} from './conversion';

/**
 * TIMEZONE USAGE GUIDELINES:
 *
 * 1. DATABASE & API OPERATIONS:
 *    - Always use UTC operations (createUtcDate, UtcDateRange, etc.)
 *    - Store dates as UTC in database
 *    - Send UTC dates in API responses
 *
 * 2. USER INTERFACE OPERATIONS:
 *    - Use Local operations for user input handling
 *    - Use Local operations for display formatting
 *    - Convert to UTC before sending to API
 *
 * 3. CALENDAR COMPONENTS:
 *    - Use UTC operations for event date ranges
 *    - Use Local operations for user interactions
 *    - Convert between UTC and Local as needed
 *
 * 4. DATE PICKERS & INPUTS:
 *    - Use Local operations for user input
 *    - Convert to UTC before processing
 *
 * 5. DISPLAY FORMATTING:
 *    - Use Local operations for user-facing dates
 *    - Use UTC operations for internal calculations
 *
 * NEVER MIX UTC AND LOCAL OPERATIONS WITHOUT EXPLICIT CONVERSION!
 */

export {
  formatInTimeZone,
  maybeFormatInTimeZone,
  type TimeZoneFormatPreset,
} from './display';
