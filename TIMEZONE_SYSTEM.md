# TIMEZONE SYSTEM DOCUMENTATION

## Overview

This project now has a comprehensive, modular timezone management system that clearly separates UTC and Local timezone operations. This prevents the timezone mixing issues that were causing calendar display problems.

## File Structure

```
lib/timezone/
├── index.ts          # Main entry point with usage guidelines
├── utc.ts            # UTC operations (database, API, cross-timezone)
├── local.ts          # Local operations (user input, display)
└── conversion.ts     # Conversion utilities between UTC and Local
```

## Key Principles

### 1. **UTC Operations** (`lib/timezone/utc.ts`)
Use for:
- Database storage/retrieval
- API responses
- Event date ranges
- Cross-timezone calculations
- Internal date processing

**NEVER mix with local timezone operations!**

### 2. **Local Operations** (`lib/timezone/local.ts`)
Use for:
- User input handling
- Display formatting for user's timezone
- Date picker interactions
- User-facing date displays

**Always convert to UTC before storing or sending to API!**

### 3. **Conversion Operations** (`lib/timezone/conversion.ts`)
Use when:
- Converting between UTC and Local
- Processing user input before API calls
- Displaying UTC data to users

## Usage Examples

### Database & API Operations (UTC)
```typescript
import { createUtcDate, UtcDateRange, UtcFormatter } from '@/lib/timezone/utc';

// Create UTC date for database storage
const eventStart = createUtcDate('2025-09-25');
const eventEnd = createUtcDate('2025-10-02');

// Create UTC date range
const range = new UtcDateRange(eventStart, eventEnd);

// Format for API response
const formattedDate = UtcFormatter.formatMonth(eventStart); // "September 2025"
```

### User Interface Operations (Local)
```typescript
import { createLocalDate, LocalFormatter } from '@/lib/timezone/local';

// Handle user input
const userInput = createLocalDate('2025-09-25');

// Format for display
const displayDate = LocalFormatter.formatFull(userInput); // "September 25, 2025"
```

### Conversion Between Systems
```typescript
import { localToUtc, utcToLocal } from '@/lib/timezone/conversion';

// Convert user input to UTC for API
const utcDate = localToUtc(userInput);

// Convert UTC data to local for display
const localDate = utcToLocal(apiResponse);
```

## Calendar Components

### ResultsCalendar.tsx
- Uses UTC operations for event date ranges
- Uses UTC formatters for consistent display
- Uses UTC validators for range checking

### BlockCalendar.tsx
- Uses UTC operations for date range validation
- Uses UTC formatters for month/day display
- Uses UTC validators for disabled/muted logic

## Migration from Legacy System

The old `lib/time.ts` file has been updated to use the new timezone system internally, but is marked as deprecated. All functions now delegate to the new UTC operations:

- `toUtcDate()` → `createUtcDate()`
- `eachDayInclusive()` → `UtcDateRange.getAllDates()`
- `isWithinRange()` → `UtcValidator.isWithinRange()`

## Benefits

1. **Clear Separation**: UTC and Local operations are clearly separated
2. **Type Safety**: Each operation is explicitly typed for its timezone
3. **No Mixing**: Impossible to accidentally mix UTC and Local operations
4. **Consistent**: All calendar components use the same timezone system
5. **Maintainable**: Easy to understand and modify timezone logic
6. **Future-Proof**: Easy to add new timezone operations

## Testing

The timezone system has been tested with:
- ✅ TypeScript compilation
- ✅ Calendar component integration
- ✅ UTC date range validation
- ✅ Month/day display formatting
- ✅ Date conversion operations

## Best Practices

1. **Always use UTC for data storage and API operations**
2. **Always use Local for user input and display**
3. **Convert explicitly between UTC and Local when needed**
4. **Use the appropriate formatter for each timezone**
5. **Use validators for range checking**
6. **Never mix UTC and Local operations without conversion**

## Troubleshooting

If you encounter timezone issues:

1. Check which timezone system you're using (UTC vs Local)
2. Ensure you're using the correct formatter for the timezone
3. Verify that conversions are explicit and intentional
4. Use the validators for range checking instead of manual comparisons
5. Check that calendar components are using the new timezone system

This system ensures that timezone issues will never occur again by making it impossible to accidentally mix UTC and Local operations.
