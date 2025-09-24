'use client';
import { useEffect, useMemo, useState } from 'react';

import { debugLog } from '@/lib/debug';
import type {
  AttendeeNameStatus,
  JoinResponse,
  JoinSuccessResponse,
} from '@/types/api';

interface PickNameCardProps {
  token: string;
  attendeeNames: AttendeeNameStatus[];
  defaultTz: string;
  onJoined: (result: JoinSuccessResponse) => Promise<void> | void;
  data?: any; // Event data to access preferredName
}

function getBrowserTimeZone(defaultTz: string) {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || defaultTz;
  } catch (err) {
    return defaultTz;
  }
}

function isJoinSuccess(
  response: JoinResponse
): response is JoinSuccessResponse {
  return (response as JoinSuccessResponse).ok === true;
}
export default function PickNameCard({
  token,
  attendeeNames,
  defaultTz,
  onJoined,
  data,
}: PickNameCardProps) {
  const firstAvailable = useMemo(
    () => attendeeNames.find(name => !name.takenBy) ?? attendeeNames[0],
    [attendeeNames]
  );
  const [slug, setSlug] = useState(firstAvailable?.slug ?? '');
  const [displayName, setDisplayName] = useState(firstAvailable?.label ?? '');
  const [timeZone, setTimeZone] = useState(getBrowserTimeZone(defaultTz));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Set default name from preferred name or first available
  useEffect(() => {
    if (!attendeeNames.find(name => name.slug === slug)) {
      const preferredSlug = data?.preferredName;
      const preferredName = preferredSlug ? attendeeNames.find(name => name.slug === preferredSlug) : null;
      
      if (preferredName && !preferredName.takenBy) {
        setSlug(preferredName.slug);
        setDisplayName(preferredName.label);
      } else if (firstAvailable) {
        setSlug(firstAvailable.slug);
        setDisplayName(firstAvailable.label);
      }
    }
  }, [attendeeNames, firstAvailable, slug, data?.preferredName]);

  async function join() {
    setLoading(true);
    setError(null);
    
    try {
      const selectedName = attendeeNames.find(name => name.slug === slug);
      if (!selectedName) {
        throw new Error('Selected name not found');
      }

      const joinData = {
        attendeeNameId: selectedName.id,
        nameSlug: slug,
        displayName,
        timeZone,
      };
      debugLog('PickNameCard: attempting to join', {
        joinData,
        selectedName,
        slug,
        displayName,
        timeZone,
      });

      const res = await fetch(`/api/events/${token}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(joinData),
      });

      const responseData = (await res.json().catch(() => ({}))) as JoinResponse;

      if (!res.ok || !isJoinSuccess(responseData)) {
        const message =
          'error' in responseData ? responseData.error : 'Failed to join';
        console.error('Join failed:', responseData);
        throw new Error(message);
      }

      debugLog('PickNameCard: join request succeeded', {
        status: res.status,
        attendeeId: responseData.attendeeId,
      });

      await onJoined(responseData);
      debugLog('PickNameCard: onJoined callback invoked');
    } catch (err) {
      console.error('Join error:', err);
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  const current = attendeeNames.find(name => name.slug === slug);
  const isTaken = !!current?.takenBy && !current?.claimedByLoggedUser;
  const isClaimedByLoggedUser = !!current?.claimedByLoggedUser;

  // Debug logging for button state
  debugLog('PickNameCard: button state', {
    current: current
      ? {
          slug: current.slug,
          takenBy: current.takenBy,
          claimedByLoggedUser: current.claimedByLoggedUser,
        }
      : null,
    isTaken,
    isClaimedByLoggedUser,
    loading,
    firstAvailable: firstAvailable ? { slug: firstAvailable.slug } : null,
    buttonDisabled: loading || isTaken,
  });

  return (
    <div className='card grid gap-6'>
      <div className='flex items-center gap-3'>
        <div className='w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center'>
          <span className='text-blue-600 text-lg'>👤</span>
        </div>
        <div>
          <h2 className='text-lg font-semibold text-slate-900'>Join Event</h2>
          <p className='text-sm text-slate-600'>
            Choose your name and join the event
          </p>
        </div>
      </div>

      <div className='grid gap-4'>
        <div className='grid gap-3'>
          <label
            className='text-sm font-medium text-slate-700'
            htmlFor='nameOption'
          >
            Pick your name
          </label>
          <select
            id='nameOption'
            name='nameOption'
            className='input'
            value={slug}
            onChange={event => {
              const next = attendeeNames.find(
                name => name.slug === event.target.value
              );
              setSlug(event.target.value);
              if (next) {
                setDisplayName(next.label);
              }
            }}
          >
            {attendeeNames.map(name => {
              const optionClaimedByYou = name.claimedByLoggedUser;
              const optionLocked = !!name.takenBy && !optionClaimedByYou;
              const statusLabel = optionClaimedByYou
                ? ' (claimed)'
                : name.takenBy
                  ? name.takenBy === 'claimed'
                    ? ' (claimed)'
                    : ' (taken)'
                  : '';

              return (
                <option key={name.id} value={name.slug} disabled={optionLocked}>
                  {name.label}
                  {name.slug === slug ? '' : statusLabel}
                </option>
              );
            })}
          </select>
        </div>

        <div className='grid gap-3'>
          <label
            className='text-sm font-medium text-slate-700'
            htmlFor='displayName'
          >
            Display name (what other attendees see)
          </label>
          <input
            id='displayName'
            name='displayName'
            className='input'
            value={displayName}
            onChange={event => setDisplayName(event.target.value)}
            required
            placeholder='Enter your display name'
          />
        </div>

        <div className='grid gap-3'>
          <label
            className='text-sm font-medium text-slate-700'
            htmlFor='timeZone'
          >
            Time zone
          </label>
          <select
            id='timeZone'
            className='input'
            value={timeZone}
            onChange={event => setTimeZone(event.target.value)}
          >
            {/* Show detected timezone first if it's not in our common list */}
            {![
              'America/New_York',
              'America/Chicago',
              'America/Denver',
              'America/Los_Angeles',
              'America/Anchorage',
              'Pacific/Honolulu',
              'UTC',
              'Europe/London',
              'Europe/Paris',
              'Europe/Berlin',
              'Europe/Rome',
              'Europe/Madrid',
              'Asia/Tokyo',
              'Asia/Shanghai',
              'Asia/Kolkata',
              'Australia/Sydney',
              'Australia/Melbourne',
            ].includes(timeZone) && (
              <option value={timeZone}>{timeZone} (Detected)</option>
            )}
            <option value='America/New_York'>Eastern Time (ET)</option>
            <option value='America/Chicago'>Central Time (CT)</option>
            <option value='America/Denver'>Mountain Time (MT)</option>
            <option value='America/Los_Angeles'>Pacific Time (PT)</option>
            <option value='America/Anchorage'>Alaska Time (AKT)</option>
            <option value='Pacific/Honolulu'>Hawaii Time (HT)</option>
            <option value='UTC'>UTC</option>
            <option value='Europe/London'>London (GMT/BST)</option>
            <option value='Europe/Paris'>Paris (CET/CEST)</option>
            <option value='Europe/Berlin'>Berlin (CET/CEST)</option>
            <option value='Europe/Rome'>Rome (CET/CEST)</option>
            <option value='Europe/Madrid'>Madrid (CET/CEST)</option>
            <option value='Asia/Tokyo'>Tokyo (JST)</option>
            <option value='Asia/Shanghai'>Shanghai (CST)</option>
            <option value='Asia/Kolkata'>India (IST)</option>
            <option value='Australia/Sydney'>Sydney (AEDT/AEST)</option>
            <option value='Australia/Melbourne'>Melbourne (AEDT/AEST)</option>
          </select>
        </div>

        {isClaimedByLoggedUser && (
          <div className='p-3 bg-yellow-50 border border-yellow-200 rounded-lg'>
            <div className='flex items-center gap-2'>
              <span className='text-yellow-600'>⚠️</span>
              <span className='text-sm text-yellow-700 font-medium'>
                That name is claimed by a registered user. Only logged-in users
                can claim names.
              </span>
            </div>
          </div>
        )}

        {isTaken && !isClaimedByLoggedUser && (
          <div className='p-3 bg-red-50 border border-red-200 rounded-lg'>
            <div className='flex items-center gap-2'>
              <span className='text-red-600'>⚠️</span>
              <span className='text-sm text-red-700 font-medium'>
                That name is currently taken. Please choose another name.
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className='p-3 bg-red-50 border border-red-200 rounded-lg'>
            <div className='flex items-center gap-2'>
              <span className='text-red-600'>❌</span>
              <span className='text-sm text-red-700 font-medium'>{error}</span>
            </div>
          </div>
        )}

        <button
          type='button'
          className='btn-primary flex items-center justify-center gap-2 py-3'
          onClick={join}
          disabled={loading || isTaken}
          data-testid='join-event-button'
        >
          {loading ? (
            <>
              <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' />
              Joining...
            </>
          ) : (
            <>
              <span>🚀</span>
              Join Event
            </>
          )}
        </button>
      </div>
    </div>
  );
}
