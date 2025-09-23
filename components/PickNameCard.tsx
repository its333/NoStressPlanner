'use client';
import { useEffect, useMemo, useState } from 'react';

import { debugLog } from '@/lib/debug';

interface NameOption {
  id: string;
  label: string;
  slug: string;
  takenBy: string | null;
  claimedByLoggedUser: boolean;
}

interface PickNameCardProps {
  token: string;
  attendeeNames: NameOption[];
  defaultTz: string;
  onJoined: () => void;
}

function getBrowserTimeZone(defaultTz: string) {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || defaultTz;
  } catch (err) {
    return defaultTz;
  }
}

export default function PickNameCard({
  token,
  attendeeNames,
  defaultTz,
  onJoined,
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

  useEffect(() => {
    if (!attendeeNames.find(name => name.slug === slug)) {
      setSlug(firstAvailable?.slug ?? '');
      setDisplayName(firstAvailable?.label ?? '');
    }
  }, [attendeeNames, firstAvailable, slug]);

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

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('Join failed:', data);
        throw new Error(data?.error ?? 'Failed to join');
      }
      debugLog('PickNameCard: join request succeeded', {
        status: res.status,
        ok: res.ok,
      });

      // Add a small delay to ensure cache invalidation has time to complete
      await new Promise(resolve => setTimeout(resolve, 500));

      onJoined();
      debugLog('PickNameCard: onJoined callback invoked');
    } catch (err) {
      console.error('Join error:', err);
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  const current = attendeeNames.find(name => name.slug === slug);
  const isTaken =
    current?.takenBy === 'taken' && current?.slug !== firstAvailable?.slug;
  const isClaimedByLoggedUser =
    current?.claimedByLoggedUser && current?.slug !== firstAvailable?.slug;

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
              const isTaken = name.takenBy === 'taken' && name.slug !== slug;
              const isClaimedByLoggedUser =
                name.claimedByLoggedUser && name.slug !== slug;
              return (
                <option key={name.id} value={name.slug} disabled={isTaken}>
                  {name.label}
                  {isClaimedByLoggedUser
                    ? ' (claimed)'
                    : isTaken
                      ? ' (taken)'
                      : ''}
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
