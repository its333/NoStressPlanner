'use client';

import {
  format,
  isAfter,
  differenceInHours,
  differenceInMinutes,
} from 'date-fns';
import { useState, useEffect } from 'react';

interface DeadlineCardProps {
  voteDeadline?: string;
  phase: 'VOTE' | 'PICK_DAYS' | 'RESULTS' | 'FAILED' | 'FINALIZED';
  quorum: number;
  inCount: number;
  deadlineExpired?: boolean;
  deadlineStatus?:
    | 'expired_with_quorum'
    | 'expired_without_quorum'
    | 'active_with_quorum'
    | 'active_needs_quorum';
}

export default function DeadlineCard({
  voteDeadline,
  phase,
  quorum,
  inCount,
  deadlineExpired,
}: DeadlineCardProps) {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);

  useEffect(() => {
    if (!voteDeadline) return;

    const updateTimeLeft = () => {
      const now = new Date();
      const deadline = new Date(voteDeadline);
      const expired = isAfter(now, deadline);

      setIsExpired(expired);

      if (expired) {
        setTimeLeft('Expired');
        return;
      }

      const hoursLeft = differenceInHours(deadline, now);
      const minutesLeft = differenceInMinutes(deadline, now) % 60;

      if (hoursLeft > 24) {
        const daysLeft = Math.floor(hoursLeft / 24);
        setTimeLeft(`${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`);
      } else if (hoursLeft > 0) {
        setTimeLeft(`${hoursLeft}h ${minutesLeft}m left`);
      } else {
        setTimeLeft(`${minutesLeft} minutes left`);
      }
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [voteDeadline]);

  if (!voteDeadline) return null;

  const deadline = new Date(voteDeadline);
  const expired =
    deadlineExpired !== undefined
      ? deadlineExpired
      : isExpired || isAfter(new Date(), deadline);
  const isVotePhase = phase === 'VOTE';
  const needsMoreVotes = inCount < quorum;

  return (
    <div
      className={`p-4 rounded-lg border-2 ${
        expired
          ? 'bg-red-50 border-red-200'
          : isVotePhase && needsMoreVotes
            ? 'bg-yellow-50 border-yellow-200'
            : 'bg-green-50 border-green-200'
      }`}
    >
      <div className='flex items-center justify-between'>
        <div className='flex items-center space-x-3'>
          <div
            className={`w-3 h-3 rounded-full ${
              expired
                ? 'bg-red-500'
                : isVotePhase && needsMoreVotes
                  ? 'bg-yellow-500'
                  : 'bg-green-500'
            }`}
          />
          <div>
            <h3 className='font-semibold text-slate-900'>
              {expired ? 'Voting Deadline Expired' : 'Voting Deadline'}
            </h3>
            <p className='text-sm text-slate-600'>{format(deadline, 'PPpp')}</p>
          </div>
        </div>

        <div className='text-right'>
          <div
            className={`text-lg font-bold ${
              expired
                ? 'text-red-700'
                : isVotePhase && needsMoreVotes
                  ? 'text-yellow-700'
                  : 'text-green-700'
            }`}
          >
            {expired ? 'EXPIRED' : timeLeft}
          </div>
          {isVotePhase && (
            <div className='text-sm text-slate-600'>
              {inCount} of {quorum} votes needed
            </div>
          )}
        </div>
      </div>

      {expired && isVotePhase && needsMoreVotes && (
        <div className='mt-3 p-3 bg-red-100 rounded-lg'>
          <p className='text-sm text-red-800 font-medium'>
            ⚠️ Event failed: Deadline passed without reaching quorum ({inCount}/
            {quorum} votes)
          </p>
        </div>
      )}

      {!expired && isVotePhase && needsMoreVotes && (
        <div className='mt-3 p-3 bg-yellow-100 rounded-lg'>
          <p className='text-sm text-yellow-800'>
            ⏰ {quorum - inCount} more vote{quorum - inCount !== 1 ? 's' : ''}{' '}
            needed to proceed
          </p>
        </div>
      )}

      {!expired && isVotePhase && !needsMoreVotes && (
        <div className='mt-3 p-3 bg-green-100 rounded-lg'>
          <p className='text-sm text-green-800'>
            ✅ Quorum reached! Event can proceed to availability phase
          </p>
        </div>
      )}
    </div>
  );
}
