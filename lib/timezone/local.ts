/**
 * LOCAL TIMEZONE OPERATIONS
 * 
 * This module contains ALL operations that work with LOCAL timezone.
 * Use this for:
 * - User input handling
 * - Display formatting for user's timezone
 * - Date picker interactions
 * - User-facing date displays
 * 
 * NEVER mix with UTC operations!
 * Always convert to UTC before storing or sending to API!
 */

/**
 * Creates a Local Date object from various input types
 * Always returns midnight in user's local timezone
 */
export function createLocalDate(input: string | Date | number): Date {
  if (typeof input === 'string') {
    // Handle ISO strings and date strings
    const date = new Date(input);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }
  
  if (input instanceof Date) {
    return new Date(input.getFullYear(), input.getMonth(), input.getDate());
  }
  
  // Handle timestamps
  const date = new Date(input);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Gets local date string in YYYY-MM-DD format
 */
export function getLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Creates local date from YYYY-MM-DD string
 */
export function parseLocalDateString(dateString: string): Date {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Local Date Range Operations
 */
export class LocalDateRange {
  constructor(
    public readonly start: Date,
    public readonly end: Date
  ) {
    // Ensure both dates are local midnight
    this.start = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    this.end = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  }

  /**
   * Check if a local date is within this range (inclusive)
   */
  contains(date: Date): boolean {
    const localDate = createLocalDate(date);
    return localDate.getTime() >= this.start.getTime() && localDate.getTime() <= this.end.getTime();
  }

  /**
   * Get all local dates in this range (inclusive)
   */
  getAllDates(): Date[] {
    const dates: Date[] = [];
    const current = new Date(this.start);
    
    while (current.getTime() <= this.end.getTime()) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
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
 * Local Calendar Grid Operations
 */
export class LocalCalendarGrid {
  constructor(
    public readonly viewMonth: Date,
    public readonly range: LocalDateRange
  ) {
    // Ensure viewMonth is local midnight
    this.viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  }

  /**
   * Generate local calendar grid for the view month
   * Returns array of local dates starting from Sunday of the first week
   */
  generateGrid(): Date[] {
    const year = this.viewMonth.getFullYear();
    const month = this.viewMonth.getMonth();
    
    // First day of month (local)
    const monthStart = new Date(year, month, 1);
    
    // Last day of month (local)
    const monthEnd = new Date(year, month + 1, 0);
    
    // Start of week (Sunday = 0) for grid
    const gridStart = new Date(monthStart);
    const dayOfWeek = monthStart.getDay();
    gridStart.setDate(gridStart.getDate() - dayOfWeek);
    
    // End of week for grid
    const gridEnd = new Date(monthEnd);
    const endDayOfWeek = monthEnd.getDay();
    gridEnd.setDate(gridEnd.getDate() + (6 - endDayOfWeek));
    
    // Generate grid days
    const days: Date[] = [];
    for (let cursor = new Date(gridStart); cursor <= gridEnd; cursor.setDate(cursor.getDate() + 1)) {
      days.push(new Date(cursor));
    }
    
    return days;
  }

  /**
   * Check if a local date is in the current view month
   */
  isInViewMonth(date: Date): boolean {
    const localDate = createLocalDate(date);
    return localDate.getFullYear() === this.viewMonth.getFullYear() && 
           localDate.getMonth() === this.viewMonth.getMonth();
  }

  /**
   * Get previous local month
   */
  getPreviousMonth(): Date {
    const year = this.viewMonth.getFullYear();
    const month = this.viewMonth.getMonth();
    return new Date(year, month - 1, 1);
  }

  /**
   * Get next local month
   */
  getNextMonth(): Date {
    const year = this.viewMonth.getFullYear();
    const month = this.viewMonth.getMonth();
    return new Date(year, month + 1, 1);
  }

  /**
   * Check if can navigate to previous month
   */
  canGoPrevious(): boolean {
    const prevMonth = this.getPreviousMonth();
    return prevMonth.getTime() >= this.range.start.getTime();
  }

  /**
   * Check if can navigate to next month
   */
  canGoNext(): boolean {
    const nextMonth = this.getNextMonth();
    return nextMonth.getTime() <= this.range.end.getTime();
  }
}

/**
 * Local Date Formatting
 */
export class LocalFormatter {
  /**
   * Format local date for month display (e.g., "September 2025")
   */
  static formatMonth(date: Date): string {
    return date.toLocaleDateString('en-US', { 
      month: 'long', 
      year: 'numeric'
    });
  }

  /**
   * Format local date for day display (e.g., "25")
   */
  static formatDay(date: Date): string {
    return date.getDate().toString();
  }

  /**
   * Format local date for short month display (e.g., "Sep")
   */
  static formatShortMonth(date: Date): string {
    return date.toLocaleDateString('en-US', { 
      month: 'short'
    });
  }

  /**
   * Format local date for full display (e.g., "September 25, 2025")
   */
  static formatFull(date: Date): string {
    return date.toLocaleDateString('en-US', { 
      weekday: 'long',
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    });
  }
}

/**
 * Local Date Validation
 */
export class LocalValidator {
  /**
   * Check if a local date is within a range
   */
  static isWithinRange(date: Date, start: Date, end: Date): boolean {
    const localDate = createLocalDate(date);
    return localDate.getTime() >= start.getTime() && localDate.getTime() <= end.getTime();
  }

  /**
   * Check if a local date is disabled (outside range)
   */
  static isDisabled(date: Date, start: Date, end: Date): boolean {
    return !this.isWithinRange(date, start, end);
  }

  /**
   * Check if a local date should be muted (outside view month but within range)
   */
  static shouldMute(date: Date, viewMonth: Date, range: LocalDateRange): boolean {
    const localDate = createLocalDate(date);
    const inViewMonth = localDate.getFullYear() === viewMonth.getFullYear() && 
                       localDate.getMonth() === viewMonth.getMonth();
    const inRange = range.contains(localDate);
    
    return !inViewMonth && inRange;
  }
}
