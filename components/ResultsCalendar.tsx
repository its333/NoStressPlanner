'use client';

import { useMemo, useState } from 'react';

import { UtcFormatter, UtcValidator, createUtcDate } from '@/lib/timezone/utc';

interface ResultsCalendarProps {
  startDate: string;
  endDate: string;
  availability: Array<{ date: string; available: number }>;
  earliestAll: string | null;
  earliestMost: string | null;
  finalDate: string | null;
  totalAttendees: number;
  onDateClick?: (date: string) => void;
  selectedDate?: string | null;
  isInteractive?: boolean;
}

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function ResultsCalendar({
  startDate,
  endDate,
  availability,
  earliestAll,
  earliestMost,
  finalDate,
  totalAttendees,
  onDateClick,
  selectedDate,
  isInteractive = false,
}: ResultsCalendarProps) {
  const rangeStart = useMemo(() => createUtcDate(startDate), [startDate]);
  const rangeEnd = useMemo(() => createUtcDate(endDate), [endDate]);

  // Create a map for quick availability lookup
  const availabilityMap = useMemo(() => {
    const map = new Map();
    availability.forEach(day => {
      map.set(createUtcDate(day.date).toISOString(), day.available);
    });
    return map;
  }, [availability]);

  // Month navigation state
  const [viewMonthStart, setViewMonthStart] = useState(() => {
    const year = rangeStart.getUTCFullYear();
    const month = rangeStart.getUTCMonth();
    return new Date(Date.UTC(year, month, 1));
  });

  // Calculate navigation bounds manually (same as BlockCalendar)
  const canGoPrev =
    viewMonthStart.getUTCFullYear() > rangeStart.getUTCFullYear() ||
    (viewMonthStart.getUTCFullYear() === rangeStart.getUTCFullYear() &&
      viewMonthStart.getUTCMonth() > rangeStart.getUTCMonth());
  const canGoNext =
    viewMonthStart.getUTCFullYear() < rangeEnd.getUTCFullYear() ||
    (viewMonthStart.getUTCFullYear() === rangeEnd.getUTCFullYear() &&
      viewMonthStart.getUTCMonth() < rangeEnd.getUTCMonth());

  const handlePrevMonth = () => {
    if (canGoPrev) {
      const year = viewMonthStart.getUTCFullYear();
      const month = viewMonthStart.getUTCMonth();
      setViewMonthStart(new Date(Date.UTC(year, month - 1, 1)));
    }
  };

  const handleNextMonth = () => {
    if (canGoNext) {
      const year = viewMonthStart.getUTCFullYear();
      const month = viewMonthStart.getUTCMonth();
      setViewMonthStart(new Date(Date.UTC(year, month + 1, 1)));
    }
  };

  // Generate UTC calendar grid manually (same as BlockCalendar)
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

  return (
    <div className='grid gap-4'>
      {/* Calendar Header */}
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-3'>
          <div className='w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center'>
            <span className='text-blue-600 text-lg'>📅</span>
          </div>
          <div>
            <h3 className='text-lg font-semibold text-slate-900'>
              Availability Calendar
            </h3>
            <p className='text-sm text-slate-600'>
              {isInteractive
                ? 'Click on any date to select it as your final date'
                : 'View availability for all dates'}
            </p>
          </div>
        </div>

        {/* Month Navigation */}
        <div className='flex items-center gap-2'>
          <button
            type='button'
            className='rounded-full border border-slate-200 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40 transition-colors'
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

          <div className='px-4 py-2 bg-slate-50 rounded-lg border border-slate-200'>
            <h3 className='font-semibold text-slate-900'>
              {UtcFormatter.formatMonth(viewMonthStart)}
            </h3>
          </div>

          <button
            type='button'
            className='rounded-full border border-slate-200 px-3 py-1 text-sm hover:bg-slate-100 disabled:opacity-40 transition-colors'
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
            const iso = createUtcDate(day).toISOString();
            const withinRange = UtcValidator.isWithinRange(
              day,
              rangeStart,
              rangeEnd
            );
            const muted = !withinRange; // Only mute days outside the event range
            // Only show availability data for days within the event range
            const available = withinRange ? availabilityMap.get(iso) || 0 : 0;

            const isEarliestAll = earliestAll === iso;
            const isEarliestMost = earliestMost === iso;
            const isFinal = finalDate === iso;
            const isSelected = selectedDate === iso;
            const isClickable = isInteractive && withinRange && !muted;

            let bgColor = 'bg-white border-slate-200';
            let textColor = 'text-slate-700';
            let badgeText = '';
            let badgeColor = '';
            let cursorClass = '';

            if (!withinRange || muted) {
              bgColor = 'bg-slate-100 border-slate-200';
              textColor = 'text-slate-400';
            } else if (isFinal) {
              bgColor = 'bg-brand-100 border-brand-300';
              textColor = 'text-brand-800';
              badgeText = 'FINAL';
              badgeColor = 'bg-brand-600 text-white';
            } else if (isSelected) {
              bgColor = 'bg-blue-100 border-blue-400';
              textColor = 'text-blue-800';
              badgeText = 'SELECTED';
              badgeColor = 'bg-blue-600 text-white';
              cursorClass = 'cursor-pointer';
            } else if (isEarliestAll) {
              bgColor = 'bg-green-100 border-green-300';
              textColor = 'text-green-800';
              badgeText = 'ALL';
              badgeColor = 'bg-green-600 text-white';
              cursorClass = isClickable
                ? 'cursor-pointer hover:bg-green-200'
                : '';
            } else if (isEarliestMost) {
              bgColor = 'bg-blue-100 border-blue-300';
              textColor = 'text-blue-800';
              badgeText = 'BEST';
              badgeColor = 'bg-blue-600 text-white';
              cursorClass = isClickable
                ? 'cursor-pointer hover:bg-blue-200'
                : '';
            } else if (withinRange && available > 0) {
              const ratio = available / totalAttendees;
              if (ratio >= 0.8) {
                bgColor = 'bg-green-50 border-green-200';
                textColor = 'text-green-700';
                cursorClass = isClickable
                  ? 'cursor-pointer hover:bg-green-100'
                  : '';
              } else if (ratio >= 0.5) {
                bgColor = 'bg-yellow-50 border-yellow-200';
                textColor = 'text-yellow-700';
                cursorClass = isClickable
                  ? 'cursor-pointer hover:bg-yellow-100'
                  : '';
              } else {
                bgColor = 'bg-red-50 border-red-200';
                textColor = 'text-red-700';
                cursorClass = isClickable
                  ? 'cursor-pointer hover:bg-red-100'
                  : '';
              }
            } else if (withinRange) {
              bgColor = 'bg-red-100 border-red-300';
              textColor = 'text-red-800';
              cursorClass = isClickable
                ? 'cursor-pointer hover:bg-red-200'
                : '';
            }

            return (
              <div
                key={iso}
                className={`relative rounded-lg border px-2 py-3 text-sm transition ${bgColor} ${textColor} ${cursorClass} min-h-[60px] flex flex-col justify-between`}
                onClick={isClickable ? () => onDateClick?.(iso) : undefined}
              >
                <div className='font-medium'>{UtcFormatter.formatDay(day)}</div>

                {withinRange && !muted && (
                  <div className='text-xs text-center'>
                    <div className='font-medium'>
                      {available}/{totalAttendees}
                    </div>
                    {badgeText && (
                      <div
                        className={`inline-block px-1 py-0.5 rounded text-xs font-bold ${badgeColor} mt-1`}
                      >
                        {badgeText}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Enhanced Legend */}
      <div className='bg-slate-50 rounded-lg p-4 border border-slate-200'>
        <h4 className='text-sm font-semibold text-slate-900 mb-3'>Legend</h4>
        <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs'>
          <div className='space-y-2'>
            <div className='flex items-center gap-2'>
              <div className='w-3 h-3 bg-green-100 border border-green-300 rounded'></div>
              <span className='text-slate-700'>High availability (80%+)</span>
            </div>
            <div className='flex items-center gap-2'>
              <div className='w-3 h-3 bg-yellow-50 border border-yellow-200 rounded'></div>
              <span className='text-slate-700'>
                Medium availability (50-79%)
              </span>
            </div>
            <div className='flex items-center gap-2'>
              <div className='w-3 h-3 bg-red-50 border border-red-200 rounded'></div>
              <span className='text-slate-700'>Low availability (&lt;50%)</span>
            </div>
          </div>
          <div className='space-y-2'>
            <div className='flex items-center gap-2'>
              <div className='w-3 h-3 bg-green-100 border border-green-300 rounded flex items-center justify-center'>
                <span className='text-xs font-bold text-green-600'>ALL</span>
              </div>
              <span className='text-slate-700'>All attendees available</span>
            </div>
            <div className='flex items-center gap-2'>
              <div className='w-3 h-3 bg-blue-100 border border-blue-300 rounded flex items-center justify-center'>
                <span className='text-xs font-bold text-blue-600'>BEST</span>
              </div>
              <span className='text-slate-700'>Best available option</span>
            </div>
            {isInteractive && (
              <div className='flex items-center gap-2'>
                <div className='w-3 h-3 bg-blue-100 border border-blue-400 rounded flex items-center justify-center'>
                  <span className='text-xs font-bold text-blue-600'>SEL</span>
                </div>
                <span className='text-slate-700'>Your selected date</span>
              </div>
            )}
          </div>
        </div>
        {isInteractive && (
          <div className='mt-3 pt-3 border-t border-slate-200'>
            <p className='text-xs text-slate-600'>
              💡 <strong>Tip:</strong> Click on any date within the event range
              to select it as your final date
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
