// components/DeleteAllEventsButton.tsx
// Button component for deleting all events with confirmation

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface DeleteAllEventsButtonProps {
  eventCount: number;
}

export default function DeleteAllEventsButton({
  eventCount,
}: DeleteAllEventsButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();

  const handleDeleteAll = async () => {
    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch('/api/user/delete-all-events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete events');
      }

      // Show success message
      alert(`Successfully deleted ${result.deletedCount} events!`);

      // Refresh the page to show updated state
      router.refresh();
    } catch (error) {
      console.error('Error deleting events:', error);
      alert(
        `Error: ${error instanceof Error ? error.message : 'Failed to delete events'}`
      );
    } finally {
      setIsDeleting(false);
      setShowConfirm(false);
    }
  };

  const handleCancel = () => {
    setShowConfirm(false);
  };

  if (eventCount === 0) {
    return null;
  }

  return (
    <div className='flex items-center gap-2'>
      {showConfirm && (
        <div className='flex items-center gap-2 text-sm text-red-600'>
          <span>Delete all {eventCount} events?</span>
          <button
            onClick={handleCancel}
            className='text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded'
            disabled={isDeleting}
          >
            Cancel
          </button>
        </div>
      )}
      <button
        onClick={handleDeleteAll}
        disabled={isDeleting}
        className={`text-xs px-3 py-1 rounded font-medium transition-colors ${
          showConfirm
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200'
        } ${isDeleting ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {isDeleting
          ? 'Deleting...'
          : showConfirm
            ? 'Confirm Delete'
            : 'Delete All Events'}
      </button>
    </div>
  );
}
