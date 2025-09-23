/**
 * UTC TIMEZONE OPERATIONS
 * 
 * This module contains ALL operations that work with UTC timezone.
 * Use this for:
 * - Database storage/retrieval
 * - API responses
 * - Event date ranges
 * - Cross-timezone calculations
 * 
 * NEVER mix with local timezone operations!
 */

/**
 * Creates a UTC Date object from various input types
 * Always returns midnight UTC for date-only operations
 */
export function createUtcDate(input: string | Date | number): Date {
  if (typeof input === 'string') {
    // Handle ISO strings and date strings
    const date = new Date(input);
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }
  
  if (input instanceof Date) {
    return new Date(Date.UTC(input.getUTCFullYear(), input.getUTCMonth(), input.getUTCDate()));
  }
  
  // Handle timestamps
  const date = new Date(input);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Gets UTC date string in YYYY-MM-DD format
 */
export function getUtcDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Creates UTC date from YYYY-MM-DD string
 */
export function parseUtcDateString(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * UTC Date Range Operations
 */
export class UtcDateRange {
  constructor(
    public readonly start: Date,
    public readonly end: Date
  ) {
    // Ensure both dates are UTC midnight
    this.start = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
    this.end = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  }

  /**
   * Check if a UTC date is within this range (inclusive)
   */
  contains(date: Date): boolean {
    const utcDate = createUtcDate(date);
    return utcDate.getTime() >= this.start.getTime() && utcDate.getTime() <= this.end.getTime();
  }

  /**
   * Get all UTC dates in this range (inclusive)
   */
  getAllDates(): Date[] {
    const dates: Date[] = [];
    const current = new Date(this.start);
    
    while (current.getTime() <= this.end.getTime()) {
      dates.push(new Date(current));
      current.setUTCDate(current.getUTCDate() + 1);
    }
    
    return dates;
  }

  /**
   * Get the number of days in this range (inclusive)
   */
  getDayCount(): number {
    return Math.floor((this.end.getTime() - this.start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  }
}

/**
 * UTC Calendar Grid Operations
 */
export class UtcCalendarGrid {
  constructor(
    public readonly viewMonth: Date,
    public readonly range: UtcDateRange
  ) {
    // Ensure viewMonth is UTC midnight
    this.viewMonth = new Date(Date.UTC(viewMonth.getUTCFullYear(), viewMonth.getUTCMonth(), 1));
  }

  /**
   * Generate UTC calendar grid for the view month
   * Returns array of UTC dates starting from Sunday of the first week
   */
  generateGrid(): Date[] {
    const year = this.viewMonth.getUTCFullYear();
    const month = this.viewMonth.getUTCMonth();
    
    // First day of month (UTC)
    const monthStart = new Date(Date.UTC(year, month, 1));
    
    // Last day of month (UTC)
    const monthEnd = new Date(Date.UTC(year, month + 1, 0));
    
    // Start of week (Sunday = 0) for grid
    const gridStart = new Date(monthStart);
    const dayOfWeek = monthStart.getUTCDay();
    gridStart.setUTCDate(gridStart.getUTCDate() - dayOfWeek);
    
    // End of week for grid
    const gridEnd = new Date(monthEnd);
    const endDayOfWeek = monthEnd.getUTCDay();
    gridEnd.setUTCDate(gridEnd.getUTCDate() + (6 - endDayOfWeek));
    
    // Generate grid days
    const days: Date[] = [];
    for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      days.push(new Date(cursor));
    }
    
    return days;
  }

  /**
   * Check if a UTC date is in the current view month
   */
  isInViewMonth(date: Date): boolean {
    const utcDate = createUtcDate(date);
    return utcDate.getUTCFullYear() === this.viewMonth.getUTCFullYear() && 
           utcDate.getUTCMonth() === this.viewMonth.getUTCMonth();
  }

  /**
   * Get previous UTC month
   */
  getPreviousMonth(): Date {
    const year = this.viewMonth.getUTCFullYear();
    const month = this.viewMonth.getUTCMonth();
    return new Date(Date.UTC(year, month - 1, 1));
  }

  /**
   * Get next UTC month
   */
  getNextMonth(): Date {
    const year = this.viewMonth.getUTCFullYear();
    const month = this.viewMonth.getUTCMonth();
    return new Date(Date.UTC(year, month + 1, 1));
  }

  /**
   * Check if can navigate to previous month
   */
  canGoPrevious(): boolean {
    const prevMonth = this.getPreviousMonth();
    const rangeStartMonth = new Date(Date.UTC(this.range.start.getUTCFullYear(), this.range.start.getUTCMonth(), 1));
    return prevMonth.getTime() >= rangeStartMonth.getTime();
  }

  /**
   * Check if can navigate to next month
   */
  canGoNext(): boolean {
    const nextMonth = this.getNextMonth();
    const rangeEndMonth = new Date(Date.UTC(this.range.end.getUTCFullYear(), this.range.end.getUTCMonth(), 1));
    return nextMonth.getTime() <= rangeEndMonth.getTime();
  }
}

/**
 * UTC Date Formatting
 */
export class UtcFormatter {
  /**
   * Format UTC date for month display (e.g., "September 2025")
   */
  static formatMonth(date: Date): string {
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      year: 'numeric', 
      timeZone: 'UTC' 
    });
  }

  /**
   * Format UTC date for day display (e.g., "25")
   */
  static formatDay(date: Date): string {
    return date.getUTCDate().toString();
  }

  /**
   * Format UTC date for short month display (e.g., "Sep")
   */
  static formatShortMonth(date: Date): string {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      timeZone: 'UTC' 
    });
  }

  /**
   * Format UTC date for full display (e.g., "September 25, 2025")
   */
  static formatFull(date: Date): string {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      timeZone: 'UTC' 
    });
  }
}

/**
 * UTC Date Validation
 */
export class UtcValidator {
  /**
   * Check if a UTC date is within a range
   */
  static isWithinRange(date: Date, start: Date, end: Date): boolean {
    const utcDate = createUtcDate(date);
    return utcDate.getTime() >= start.getTime() && utcDate.getTime() <= end.getTime();
  }

  /**
   * Check if a UTC date is disabled (outside range)
   */
  static isDisabled(date: Date, start: Date, end: Date): boolean {
    return !this.isWithinRange(date, start, end);
  }

  /**
   * Check if a UTC date should be muted (outside view month but within range)
   */
  static shouldMute(date: Date, viewMonth: Date, range: UtcDateRange): boolean {
    const utcDate = createUtcDate(date);
    const inViewMonth = utcDate.getUTCFullYear() === viewMonth.getUTCFullYear() && 
                       utcDate.getUTCMonth() === viewMonth.getUTCMonth();
    const inRange = range.contains(utcDate);
    
    return !inViewMonth && inRange;
  }
}
