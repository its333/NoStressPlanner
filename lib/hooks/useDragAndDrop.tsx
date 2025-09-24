'use client';

import { useState, useCallback } from 'react';

export interface DragState {
  isDragging: boolean;
  startDate: string | null;
  mode: 'add' | 'remove' | null;
  currentDate: string | null;
}

export interface DragHandlers {
  onDragStart: (date: string, mode: 'add' | 'remove') => void;
  onDragEnter: (date: string) => void;
  onDragEnd: () => void;
  onDragCancel: () => void;
}

export function useDragAndDrop(
  selected: Set<string>,
  onChange: (dates: string[]) => void,
  isDateDisabled: (date: string) => boolean
): [DragState, DragHandlers] {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    startDate: null,
    mode: null,
    currentDate: null,
  });

  const onDragStart = useCallback(
    (date: string, mode: 'add' | 'remove') => {
      if (isDateDisabled(date)) return;

      setDragState({
        isDragging: true,
        startDate: date,
        mode,
        currentDate: date,
      });
    },
    [isDateDisabled]
  );

  const onDragEnter = useCallback(
    (date: string) => {
      if (!dragState.isDragging || isDateDisabled(date)) return;

      setDragState(prev => ({
        ...prev,
        currentDate: date,
      }));
    },
    [dragState.isDragging, isDateDisabled]
  );

  const onDragEnd = useCallback(() => {
    if (
      !dragState.isDragging ||
      !dragState.startDate ||
      !dragState.currentDate
    ) {
      setDragState({
        isDragging: false,
        startDate: null,
        mode: null,
        currentDate: null,
      });
      return;
    }

    // Handle single click (no drag)
    if (dragState.startDate === dragState.currentDate) {
      const newSelected = new Set(selected);
      if (dragState.mode === 'add') {
        newSelected.add(dragState.startDate);
      } else {
        newSelected.delete(dragState.startDate);
      }
      onChange(Array.from(newSelected));
    } else {
      // Handle drag range
      const start = new Date(dragState.startDate);
      const end = new Date(dragState.currentDate);
      const rangeStart = start <= end ? start : end;
      const rangeEnd = start <= end ? end : start;

      // Generate all dates in range
      const datesInRange: string[] = [];
      const current = new Date(rangeStart);

      while (current <= rangeEnd) {
        const iso = current.toISOString().split('T')[0];
        if (!isDateDisabled(iso)) {
          datesInRange.push(iso);
        }
        current.setDate(current.getDate() + 1);
      }

      // Apply changes based on mode
      const newSelected = new Set(selected);

      if (dragState.mode === 'add') {
        datesInRange.forEach(date => newSelected.add(date));
      } else if (dragState.mode === 'remove') {
        datesInRange.forEach(date => newSelected.delete(date));
      }

      const result = Array.from(newSelected);
      onChange(result);
    }

    setDragState({
      isDragging: false,
      startDate: null,
      mode: null,
      currentDate: null,
    });
  }, [dragState, selected, onChange, isDateDisabled]);

  const onDragCancel = useCallback(() => {
    setDragState({
      isDragging: false,
      startDate: null,
      mode: null,
      currentDate: null,
    });
  }, []);

  return [dragState, { onDragStart, onDragEnter, onDragEnd, onDragCancel }];
}

export function isDateInDragRange(date: string, dragState: DragState): boolean {
  if (!dragState.isDragging || !dragState.startDate || !dragState.currentDate) {
    return false;
  }

  const start = new Date(dragState.startDate);
  const end = new Date(dragState.currentDate);
  const target = new Date(date);

  const rangeStart = start <= end ? start : end;
  const rangeEnd = start <= end ? end : start;

  return target >= rangeStart && target <= rangeEnd;
}

export function DragPreview({
  dragState: _dragState,
}: {
  dragState: DragState;
}) {
  // No overlay at all - completely removed
  return null;
}
