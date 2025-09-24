'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type PointerEvent,
} from 'react';

import { useDragAndDrop, isDateInDragRange } from '@/lib/hooks/useDragAndDrop';
import {
  UtcDateRange,
  UtcFormatter,
  UtcValidator,
  createUtcDate,
} from '@/lib/timezone/utc';

interface BlockCalendarProps {
  start: string;
  end: string;
  value: string[];
  onChange: (dates: string[]) => void;
}

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function normalize(date: string | Date): string {
  return createUtcDate(date).toISOString().split('T')[0];
}

export default function BlockCalendar({
  start,
  end,
  value,
  onChange,
}: BlockCalendarProps) {
  const rangeStart = useMemo(() => createUtcDate(start), [start]);
  const rangeEnd = useMemo(() => createUtcDate(end), [end]);
  const monthCount = useMemo(() => {
    const yearDiff = rangeEnd.getUTCFullYear() - rangeStart.getUTCFullYear();
    const monthDiff = rangeEnd.getUTCMonth() - rangeStart.getUTCMonth();
    return yearDiff * 12 + monthDiff + 1;
  }, [rangeEnd, rangeStart]);

  const allowedYears = useMemo(() => {
    const years: number[] = [];
    for (
      let year = rangeStart.getUTCFullYear();
      year <= rangeEnd.getUTCFullYear();
      year += 1
    ) {
      years.push(year);
    }
    return years;
  }, [rangeEnd, rangeStart]);

  const [viewMonthIndex, setViewMonthIndex] = useState(0);
  const viewMonthStart = useMemo(() => {
    const year = rangeStart.getUTCFullYear();
    const month = rangeStart.getUTCMonth();
    const targetYear = year + Math.floor((month + viewMonthIndex) / 12);
    const targetMonth = (month + viewMonthIndex) % 12;
    return new Date(Date.UTC(targetYear, targetMonth, 1));
  }, [rangeStart, viewMonthIndex]);

  const selected = useMemo(() => new Set(value.map(normalize)), [value]);

  // Enhanced drag & drop functionality
  const isDateDisabled = useCallback(
    (date: string) => {
      const day = createUtcDate(date);
      return UtcValidator.isDisabled(day, rangeStart, rangeEnd);
    },
    [rangeStart, rangeEnd]
  );

  const [dragState, dragHandlers] = useDragAndDrop(
    selected,
    onChange,
    isDateDisabled
  );

  const handlePointerDown = useCallback(
    (
      event: PointerEvent<HTMLButtonElement>,
      iso: string,
      disabled: boolean
    ) => {
      if (disabled) return;
      event.preventDefault();

      const alreadySelected = selected.has(iso);
      const mode = alreadySelected ? 'remove' : 'add';

      dragHandlers.onDragStart(iso, mode);
    },
    [selected, dragHandlers]
  );

  const handlePointerEnter = useCallback(
    (iso: string, disabled: boolean) => {
      if (disabled) return;
      dragHandlers.onDragEnter(iso);
    },
    [dragHandlers]
  );

  const handlePointerUp = useCallback(() => {
    dragHandlers.onDragEnd();
  }, [dragHandlers]);

  // Add global pointer up listener for drag cancellation
  useEffect(() => {
    const handleGlobalPointerUp = () => {
      if (dragState.isDragging) {
        dragHandlers.onDragCancel();
      }
    };

    window.addEventListener('pointerup', handleGlobalPointerUp);
    return () => window.removeEventListener('pointerup', handleGlobalPointerUp);
  }, [dragState.isDragging, dragHandlers]);

  const daysInGrid = useMemo(() => {
    const days: Date[] = [];

    // Get UTC month boundaries
    const year = viewMonthStart.getUTCFullYear();
    const month = viewMonthStart.getUTCMonth();

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
    for (
      let cursor = new Date(gridStart);
      cursor <= gridEnd;
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    ) {
      days.push(new Date(cursor));
    }

    return days;
  }, [viewMonthStart]);

  const canGoPrev = viewMonthIndex > 0;
  const canGoNext = viewMonthIndex < monthCount - 1;

  const changeMonth = (index: number) => {
    setViewMonthIndex(index);
  };

  const handlePrevMonth = () => {
    if (canGoPrev) changeMonth(viewMonthIndex - 1);
  };

  const handleNextMonth = () => {
    if (canGoNext) changeMonth(viewMonthIndex + 1);
  };

  const [isPickerOpen, setPickerOpen] = useState(false);

  const selectMonthYear = (year: number, month: number) => {
    const target = new Date(Date.UTC(year, month, 1));
    const yearDiff = target.getUTCFullYear() - rangeStart.getUTCFullYear();
    const monthDiff = target.getUTCMonth() - rangeStart.getUTCMonth();
    const index = yearDiff * 12 + monthDiff;
    if (index >= 0 && index < monthCount) {
      setViewMonthIndex(index);
      setPickerOpen(false);
    }
  };

  const viewYear = viewMonthStart.getUTCFullYear();
  const viewMonth = viewMonthStart.getUTCMonth();

  return (
    <div className='grid gap-3'>
      <div className='flex items-center justify-between text-sm text-slate-700'>
        <div className='flex items-center gap-2'>
          <button
            type='button'
            className='rounded-full border border-slate-200 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40'
            aria-label='Previous month'
            disabled={!canGoPrev}
            onClick={handlePrevMonth}
          >
            <svg
              className='h-4 w-4'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
              aria-hidden='true'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M15 19l-7-7 7-7'
              />
            </svg>
          </button>
          <button
            type='button'
            className='rounded-full border border-slate-200 px-4 py-1 text-sm font-medium hover:bg-slate-100'
            onClick={() => setPickerOpen(open => !open)}
            aria-haspopup='dialog'
            aria-expanded={isPickerOpen}
          >
            {UtcFormatter.formatMonth(viewMonthStart)}
          </button>
          <button
            type='button'
            className='rounded-full border border-slate-200 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40'
            aria-label='Next month'
            disabled={!canGoNext}
            onClick={handleNextMonth}
          >
            <svg
              className='h-4 w-4'
              fill='none'
              stroke='currentColor'
              viewBox='0 0 24 24'
              aria-hidden='true'
            >
              <path
                strokeLinecap='round'
                strokeLinejoin='round'
                strokeWidth={2}
                d='M9 5l7 7-7 7'
              />
            </svg>
          </button>
        </div>
      </div>

      {isPickerOpen && (
        <MonthYearPicker
          years={allowedYears}
          activeYear={viewYear}
          activeMonth={viewMonth}
          startDate={rangeStart}
          endDate={rangeEnd}
          onSelect={selectMonthYear}
        />
      )}

      <div className='grid gap-1'>
        <div className='grid grid-cols-7 text-xs font-medium uppercase tracking-wide text-slate-500'>
          {WEEKDAY_LABELS.map(label => (
            <div key={label} className='px-2 py-1 text-center'>
              {label}
            </div>
          ))}
        </div>
        <div className='grid grid-cols-7 gap-1'>
          {daysInGrid.map(day => {
            const iso = normalize(day);
            const withinRange = UtcValidator.isWithinRange(
              day,
              rangeStart,
              rangeEnd
            );
            const active = selected.has(iso);
            const muted = UtcValidator.shouldMute(
              day,
              viewMonthStart,
              new UtcDateRange(rangeStart, rangeEnd)
            );
            const disabled = !withinRange;
            const inDragRange = isDateInDragRange(iso, dragState);

            let visualClasses =
              'rounded-lg border px-2 py-2 text-sm transition ';

            if (disabled) {
              // Out of range days - very dark grey
              visualClasses +=
                'bg-slate-600 border-slate-700 text-slate-200 cursor-not-allowed';
            } else if (active) {
              // Blocked days (selected) - grey background
              visualClasses +=
                'bg-slate-300 border-slate-400 text-slate-700 cursor-pointer';
            } else if (muted) {
              // Days from previous/next month
              visualClasses +=
                'border-slate-200 bg-slate-50 text-slate-400 cursor-pointer hover:border-brand-200';
            } else if (inDragRange) {
              // Days in current drag range - enhanced visual feedback
              if (dragState.mode === 'add') {
                visualClasses +=
                  'bg-green-100 border-green-300 text-green-700 cursor-pointer';
              } else {
                visualClasses +=
                  'bg-red-100 border-red-300 text-red-700 cursor-pointer';
              }
            } else {
              // Available days - white background
              visualClasses +=
                'border-slate-200 bg-white text-slate-700 cursor-pointer hover:border-brand-200';
            }

            return (
              <button
                key={iso}
                type='button'
                className={visualClasses}
                aria-pressed={active}
                disabled={disabled}
                onPointerDown={event => handlePointerDown(event, iso, disabled)}
                onPointerEnter={() => handlePointerEnter(iso, disabled)}
                onPointerUp={handlePointerUp}
              >
                <span>{UtcFormatter.formatDay(day)}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className='text-xs text-slate-500'>
        Click or drag across days to mark when you are unavailable.
      </p>
      {/* DragPreview completely removed - no overlay */}
    </div>
  );
}

function MonthYearPicker({
  years,
  activeYear,
  activeMonth,
  startDate,
  endDate,
  onSelect,
}: {
  years: number[];
  activeYear: number;
  activeMonth: number;
  startDate: Date;
  endDate: Date;
  onSelect: (year: number, month: number) => void;
}) {
  return (
    <div className='rounded-2xl border border-slate-200 bg-white p-4 shadow-card'>
      <div className='grid gap-3 md:grid-cols-[8rem,1fr]'>
        <div className='flex flex-col gap-1 max-h-48 overflow-y-auto pr-2 border-r border-slate-200'>
          {years.map(year => (
            <button
              key={year}
              type='button'
              className={`rounded-lg px-3 py-2 text-sm text-left transition ${
                year === activeYear
                  ? 'bg-brand-100 text-brand-700'
                  : 'hover:bg-slate-100'
              }`}
              onClick={() => onSelect(year, activeMonth)}
            >
              {year}
            </button>
          ))}
        </div>
        <div className='grid grid-cols-3 gap-2'>
          {Array.from({ length: 12 }, (_, month) => month).map(month => {
            const candidate = new Date(Date.UTC(activeYear, month, 1));
            const startYear = startDate.getUTCFullYear();
            const startMonth = startDate.getUTCMonth();
            const endYear = endDate.getUTCFullYear();
            const endMonth = endDate.getUTCMonth();
            const startTime = new Date(
              Date.UTC(startYear, startMonth, 1)
            ).getTime();
            const endTime = new Date(
              Date.UTC(endYear, endMonth + 1, 0)
            ).getTime();
            const withinRange =
              candidate.getTime() >= startTime &&
              candidate.getTime() <= endTime;
            return (
              <button
                key={month}
                type='button'
                className={`rounded-lg px-3 py-2 text-sm transition ${
                  month === activeMonth
                    ? 'bg-brand-100 text-brand-700'
                    : 'hover:bg-slate-100'
                } ${withinRange ? '' : 'opacity-40 cursor-not-allowed'}`}
                disabled={!withinRange}
                onClick={() => withinRange && onSelect(activeYear, month)}
              >
                {UtcFormatter.formatShortMonth(
                  new Date(Date.UTC(2000, month, 1))
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
