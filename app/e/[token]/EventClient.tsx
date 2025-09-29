'use client';

import { isAfter } from 'date-fns';
import { useSession } from 'next-auth/react';
import Pusher from 'pusher-js';
import { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';

import BlockCalendar from '@/components/BlockCalendar';
import DeadlineCard from '@/components/DeadlineCard';
import LoginPrompt from '@/components/LoginPrompt';
import PhaseBar from '@/components/PhaseBar';
import PickNameCard from '@/components/PickNameCard';
import ResultsCalendar from '@/components/ResultsCalendar';
import { formatInTimeZone, type TimeZoneFormatPreset } from '@/lib/timezone';

const DATE_ONLY_PRESETS: ReadonlySet<TimeZoneFormatPreset> = new Set([
  'mediumDate',
  'weekdayLong',
  'shortMonthDay',
]);

function normalizeDateForTimeZone(
  value: string | Date,
  timeZone: string
): Date | null {
  const iso = typeof value === 'string' ? value : value.toISOString();
  const datePart = iso.split('T')[0];
  if (!datePart || !/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return typeof value === 'string' ? new Date(iso) : value;
  }

  const [year, month, day] = datePart.split('-').map(Number);
  if ([year, month, day].some(part => Number.isNaN(part))) {
    return null;
  }

  const baseUtc = new Date(Date.UTC(year, month - 1, day));
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = formatter.formatToParts(baseUtc);
    const mapped: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== 'literal') {
        mapped[part.type] = part.value;
      }
    }

    if (!mapped.year || !mapped.month || !mapped.day) {
      return baseUtc;
    }

    const zonedUtc = Date.UTC(
      Number(mapped.year),
      Number(mapped.month) - 1,
      Number(mapped.day),
      mapped.hour ? Number(mapped.hour) : 0,
      mapped.minute ? Number(mapped.minute) : 0,
      mapped.second ? Number(mapped.second) : 0
    );

    const offset = zonedUtc - baseUtc.getTime();
    return new Date(baseUtc.getTime() - offset);
  } catch (error) {
    console.error('timezone-normalization-error', { value, timeZone, error });
    return baseUtc;
  }
}

import { debugLog } from '@/lib/debug';
import type { AttendeeNameStatus, JoinSuccessResponse } from '@/types/api';

const PUSHER_KEY = process.env.NEXT_PUBLIC_PUSHER_KEY;
const PUSHER_CLUSTER = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

interface ApiResponse {
  event: {
    id: string;
    title: string;
    description?: string;
    phase: 'VOTE' | 'PICK_DAYS' | 'RESULTS' | 'FAILED' | 'FINALIZED';
    startDate: string;
    endDate: string;
    voteDeadline?: string;
    finalDate?: string;
    requireLoginToAttend: boolean;
    showResultsToEveryone: boolean;
    quorum: number;
  };
  phaseSummary: {
    inCount: number;
    totalParticipants: number; // All people with any progress
    quorum: number;
    voteDeadline?: string;
    earliestAll?: string | null;
    earliestMost?: string | null;
    topDates: Array<{
      date: string;
      available: number;
      totalAttendees: number;
    }>;
  };
  attendeeNames: AttendeeNameStatus[];
  you?: {
    id: string;
    displayName: string;
    timeZone: string;
    attendeeName: { id: string; label: string; slug: string };
    anonymousBlocks: boolean;
  } | null;
  initialBlocks: string[];
  yourVote?: boolean | null;
  isHost: boolean;
  availability: Array<{ date: string; available: number }>;
  availabilityProgress: {
    totalEligible: number;
    completedAvailability: number;
    notSetYet: number;
    isComplete: boolean;
  };
  attendeeDetails: Array<{
    id: string;
    name: string;
    hasVotedIn: boolean;
    hasSetAvailability: boolean;
    isLoggedIn: boolean;
  }>;
  votes: Array<{
    attendeeNameId: string;
    in: boolean;
  }>;
}

export default function EventPageClient({ token }: { token: string }) {
  const { data: session } = useSession();

  // Generate user-specific cache key to match server-side cache key
  // Use the standard API endpoint - the server handles user-specific caching internally
  const cacheKey = `/api/events/${token}`;

  const {
    data,
    mutate: originalMutate,
    isLoading,
    error,
  } = useSWR<ApiResponse>(cacheKey, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    refreshInterval: 0, // Disable automatic polling
    dedupingInterval: 5000, // Enable deduplication to prevent excessive requests
  });

  // Simple debounce function to prevent excessive API calls
  const debounce = (func: (...args: any[]) => void, delay: number) => {
    let timeoutId: NodeJS.Timeout;
    return (...args: any[]) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func(...args), delay);
    };
  };

  // Debounced mutate to prevent excessive API calls
  const mutate = useCallback(
    debounce((...args: any[]) => originalMutate(...args), 100),
    [originalMutate]
  );

  // Removed aggressive force refresh on mount to prevent rate limiting
  // The SWR configuration will handle fresh data fetching

  // Polling fallback for phase changes (in case Pusher fails)
  useEffect(() => {
    if (!data?.event?.id) return;

    const pollForPhaseChanges = async () => {
      // Only poll if we're in VOTE phase (waiting for quorum)
      if (data?.event?.phase === 'VOTE') {
        console.log('🔄 Polling for phase changes - checking for quorum');
        debugLog('EventClient: polling for phase changes');

        try {
          // Use fetch with cache bypass to get fresh data
          const timestamp = Date.now();
          const url = `/api/events/${token}?t=${timestamp}&force=true`;
          const response = await fetch(url);
          const freshData = await response.json();

          console.log('🔄 Polling data received:', {
            phase: freshData?.event?.phase,
            quorum: freshData?.event?.quorum,
            votesCount: freshData?.votes?.length || 0,
            inVotesCount:
              freshData?.votes?.filter((v: any) => v.in).length || 0,
          });

          // Update SWR cache with fresh data
          await mutate(freshData, { revalidate: false });
        } catch (error) {
          console.error('❌ Polling failed:', error);
          // Fallback to regular mutate
          mutate();
        }
      }
    };

    // Poll every 10 seconds when in VOTE phase (reduced from 3s to prevent rate limiting)
    const interval = setInterval(pollForPhaseChanges, 10000);

    return () => clearInterval(interval);
  }, [data?.event?.phase, data?.event?.id, mutate]);

  const [unavailableDates, setUnavailableDates] = useState<string[]>([]);
  const [availabilityError, setAvailabilityError] = useState<string | null>(
    null
  );
  const [voteError, setVoteError] = useState<string | null>(null);
  const [anonymous, setAnonymous] = useState(true);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [finalDraft, setFinalDraft] = useState<string | 'clear'>('clear');
  const [hostActionError, setHostActionError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>(
    'idle'
  );
  const [currentVote, setCurrentVote] = useState<boolean | null>(null);

  const handleJoinSuccess = useCallback(
    async (joinResult: JoinSuccessResponse) => {
      debugLog('EventClient: join success payload received', {
        attendeeId: joinResult.attendeeId,
        hasYou: !!joinResult.you,
      });

      if (joinResult.mode === 'already_joined') {
        await mutate();
        return;
      }

      setUnavailableDates(joinResult.initialBlocks ?? []);
      setCurrentVote(joinResult.yourVote ?? null);
      setAnonymous(joinResult.you?.anonymousBlocks ?? true);

      await mutate(
        (current: any) => {
          if (!current) {
            return current;
          }

          return {
            ...current,
            attendeeNames: joinResult.attendeeNames,
            you: joinResult.you,
            initialBlocks: joinResult.initialBlocks ?? [],
            yourVote: joinResult.yourVote ?? null,
          };
        },
        { revalidate: false }
      );

      void mutate();
    },
    [mutate]
  );
  const [votingStatus, setVotingStatus] = useState<
    'idle' | 'voting' | 'success' | 'error'
  >('idle');
  const [showResultsToEveryone, setShowResultsToEveryone] = useState(false);
  const [updatingToggle, setUpdatingToggle] = useState(false);
  const [deletingEvent, setDeletingEvent] = useState(false);
  const [finalDateStatus, setFinalDateStatus] = useState<
    'idle' | 'confirming' | 'setting' | 'success'
  >('idle');
  const [showFinalDateConfirm, setShowFinalDateConfirm] = useState(false);
  const [showNameSwitchModal, setShowNameSwitchModal] = useState(false);
  const [nameSwitchError, setNameSwitchError] = useState<string | null>(null);
  const [phaseChangeNotification, setPhaseChangeNotification] = useState<
    string | null
  >(null);
  const [previousPhase, setPreviousPhase] = useState<string | null>(null);

  const needsLogin = data?.event?.requireLoginToAttend && !session?.user?.id;
  const needsJoin = !data?.you && !needsLogin;

  // EventClient state management

  useEffect(() => {
    if (data?.initialBlocks) setUnavailableDates(data.initialBlocks);
    if (data?.yourVote !== undefined) setCurrentVote(data.yourVote);
    if (data?.event?.showResultsToEveryone !== undefined)
      setShowResultsToEveryone(data?.event?.showResultsToEveryone);

    // Debug: Log the current data to see what we're receiving
    if (data?.event) {
      console.log('🔍 EventClient: Current data received:', {
        phase: data?.event?.phase,
        quorum: data?.event?.quorum,
        votesCount: data.votes?.length || 0,
        inVotesCount: data.votes?.filter((v: any) => v.in).length || 0,
        timestamp: new Date().toISOString(),
      });
    }

    // Detect phase changes
    if (
      data?.event?.phase &&
      previousPhase &&
      previousPhase !== data.event.phase
    ) {
      if (previousPhase === 'VOTE' && data?.event?.phase === 'PICK_DAYS') {
        console.log('🎉 Phase changed from VOTE to PICK_DAYS!');
        setPhaseChangeNotification(
          '🎉 Quorum reached! Moving to PICK_DAYS phase!'
        );
        setTimeout(() => setPhaseChangeNotification(null), 5000);
      }
    }

    // Update previous phase
    if (data?.event?.phase) {
      setPreviousPhase(data?.event?.phase);
    }
  }, [data, previousPhase, isLoading, error]);

  // Real-time updates with fallback system
  useEffect(() => {
    if (!data?.event?.id) {
      return;
    }

    // Check Pusher availability
    const hasPusherConfig = !!(PUSHER_KEY && PUSHER_CLUSTER);

    let unsubscribe: (() => void) | null = null;

    if (hasPusherConfig) {
      // Use Pusher for real-time updates
      const client = new Pusher(PUSHER_KEY, {
        cluster: PUSHER_CLUSTER,
        forceTLS: true,
        enabledTransports: ['ws', 'wss'],
      });

      const channel = client.subscribe(`event-${data?.event?.id}`);

      // Specific handlers for different event types
      const eventHandlers = {
        'vote.updated': () => {
          mutate();
        },
        'blocks.updated': () => {
          mutate();
        },
        'phase.changed': (data: any) => {
          console.log('🔄 Phase changed event received:', data);
          mutate();

          // Show notifications for different phase transitions
          if (data?.phase === 'PICK_DAYS' && data?.reason === 'quorum_met') {
            setPhaseChangeNotification(
              '🎉 Quorum reached! Moving to PICK_DAYS phase'
            );
            setTimeout(() => setPhaseChangeNotification(null), 5000);
          } else if (data?.phase === 'RESULTS') {
            setPhaseChangeNotification('📊 Moving to Results phase');
            setTimeout(() => setPhaseChangeNotification(null), 5000);
          } else if (data?.phase === 'FINALIZED') {
            setPhaseChangeNotification('🎉 Event finalized!');
            setTimeout(() => setPhaseChangeNotification(null), 5000);
          } else if (data?.phase === 'FAILED') {
            setPhaseChangeNotification(
              '❌ Event failed - deadline passed without quorum'
            );
            setTimeout(() => setPhaseChangeNotification(null), 5000);
          }
        },
        'final.date.set': () => {
          mutate();
        },
        'attendee.nameChanged': () => {
          mutate();
        },
        'attendee.joined': () => {
          mutate();
        },
        'attendee.left': () => {
          mutate();
        },
        'showResults.changed': () => {
          mutate();
        },
      };

      const events = [
        'vote.updated',
        'blocks.updated',
        'phase.changed',
        'final.date.set',
        'attendee.nameChanged',
        'attendee.joined',
        'attendee.left',
        'showResults.changed',
      ];

      events.forEach(event => {
        const handler = eventHandlers[event as keyof typeof eventHandlers];
        channel.bind(event, handler);
      });

      unsubscribe = () => {
        events.forEach(event => {
          const handler = eventHandlers[event as keyof typeof eventHandlers];
          channel.unbind(event, handler);
        });
        client.unsubscribe(`event-${data?.event?.id}`);
        client.disconnect();
      };
    } else {
      // Use polling fallback
      let isActive = true;

      const poll = async () => {
        if (!isActive) return;

        try {
          const response = await fetch(
            `/api/events/${token}?refresh=${Date.now()}`
          );
          if (response.ok) {
            mutate();
          }
        } catch (error) {
          console.error('Polling error:', error);
        }

        if (isActive) {
          setTimeout(poll, 5000); // Poll every 5 seconds
        }
      };

      poll();

      unsubscribe = () => {
        isActive = false;
      };
    }

    return unsubscribe;
  }, [data?.event?.id, token, mutate, isLoading, error]);

  useEffect(() => {
    if (copyStatus === 'idle') return;
    const timeout = window.setTimeout(() => setCopyStatus('idle'), 1600);
    return () => window.clearTimeout(timeout);
  }, [copyStatus]);

  const handleCopyInvite = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/e/${token}`
      );
      setCopyStatus('copied');
    } catch {
      setCopyStatus('error');
    }
  }, [token]);

  const switchName = useCallback(
    async (newNameId: string) => {
      if (!data?.event?.id) return;

      try {
        setNameSwitchError(null);
        // Switch to the new name (preserving all progress)
        const response = await fetch(`/api/events/${token}/switch-name`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newNameId }),
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: 'Unknown error' }));
          const errorMessage = errorData.error || `HTTP ${response.status}`;
          setNameSwitchError(errorMessage);
          return; // Don't throw, just set error state
        }

        // Close modal and refresh data
        setShowNameSwitchModal(false);
        debugLog('EventClient: before mutate (name switch)', {
          unavailableDates,
          currentVote,
          currentAttendeeName: data?.you?.attendeeName?.label,
        });

        // Refresh data from server and wait for it to complete
        await mutate();

        debugLog('EventClient: mutate resolved after name switch');

        // Show success message if provided
        const responseData = await response.json();
        if (responseData.message) {
          debugLog('EventClient: name switch success message', {
            message: responseData.message,
          });
        }
      } catch (error) {
        console.error('Error switching name:', error);
        setNameSwitchError(
          error instanceof Error ? error.message : 'Failed to switch name'
        );
      }
    },
    [data?.event?.id, token, mutate]
  );

  const handleDeleteEvent = useCallback(async () => {
    if (
      !confirm(
        'Are you sure you want to delete this event? This action cannot be undone.'
      )
    ) {
      return;
    }

    setDeletingEvent(true);
    try {
      const res = await fetch(`/api/events/${token}/delete`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? 'Failed to delete event');
      }

      window.location.href = '/';
    } catch (err) {
      setHostActionError(
        err instanceof Error ? err.message : 'Failed to delete event'
      );
    } finally {
      setDeletingEvent(false);
    }
  }, [token]);

  const submitVote = useCallback(
    async (inValue: boolean) => {
      debugLog('EventClient: submitting vote', { inValue, currentVote, token });
      setVotingStatus('voting');
      setVoteError(null);

      const previousVote = currentVote;
      setCurrentVote(inValue);

      try {
        const res = await fetch(`/api/events/${token}/vote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ in: inValue }),
        });

        debugLog('EventClient: vote response received', {
          status: res.status,
          ok: res.ok,
        });

        if (!res.ok) {
          const detail = await res.json().catch(() => ({}));
          setCurrentVote(previousVote);
          setVotingStatus('error');
          console.error(
            'Vote failed:',
            detail?.error ?? 'Failed to submit vote'
          );
          setVoteError(detail?.error ?? 'Failed to submit vote');

          // If it's a phase error, force a complete cache bypass
          if (detail?.error?.includes('VOTE phase')) {
            console.log('🔄 Phase error detected, forcing cache bypass');
            await mutate(undefined, { revalidate: true });
          } else {
            // Revalidate to get the correct data from server
            await mutate();
          }
          setTimeout(() => setVotingStatus('idle'), 3000);
          return;
        }

        const responseData = await res.json();
        setVotingStatus('success');

        // Check if phase was advanced
        if (responseData.phaseAdvanced) {
          console.log('🎉 Phase advanced! Quorum reached!');
          setPhaseChangeNotification(
            '🎉 Quorum reached! Moving to next phase!'
          );
          setTimeout(() => setPhaseChangeNotification(null), 5000);

          // Force immediate fresh data fetch to show updated phase
          console.log('🔄 Forcing fresh data fetch after phase advancement');
          await mutate();
        }

        debugLog('EventClient: vote successful, revalidating', {
          phaseAdvanced: responseData.phaseAdvanced,
          inCount: responseData.inCount,
          quorum: responseData.quorum,
        });

        // Revalidate to get the actual data from server
        await mutate();
        setTimeout(() => setVotingStatus('idle'), 2000);
      } catch (error) {
        setCurrentVote(previousVote);
        setVotingStatus('error');
        console.error('Vote error:', error);
        setVoteError(
          error instanceof Error ? error.message : 'Failed to submit vote'
        );
        // Revalidate to get the correct data from server
        await mutate();
        setTimeout(() => setVotingStatus('idle'), 3000);
      }
    },
    [mutate, token, currentVote, data]
  );

  const saveAvailability = useCallback(async () => {
    if (!data?.event?.id) return;
    setSavingAvailability(true);
    setAvailabilityError(null);
    try {
      debugLog('EventClient: sending availability data', {
        dates: unavailableDates,
        anonymous,
      });

      const response = await fetch(`/api/events/${token}/blocks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        body: JSON.stringify({ dates: unavailableDates, anonymous }),
      });
      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ error: 'Unknown error' }));

        console.error('❌ Availability API error:', {
          status: response.status,
          statusText: response.statusText,
          errorData,
        });

        // Handle different error formats
        let errorMessage = 'Unknown error';
        if (errorData.error) {
          errorMessage =
            typeof errorData.error === 'string'
              ? errorData.error
              : JSON.stringify(errorData.error);
        } else if (errorData.fieldErrors) {
          // Handle Zod validation errors
          const fieldErrors = Object.entries(errorData.fieldErrors)
            .map(
              ([field, errors]) =>
                `${field}: ${Array.isArray(errors) ? errors.join(', ') : errors}`
            )
            .join('; ');
          errorMessage = `Validation errors: ${fieldErrors}`;
        } else if (errorData.formErrors && errorData.formErrors.length > 0) {
          errorMessage = `Form errors: ${errorData.formErrors.join(', ')}`;
        }

        throw new Error(errorMessage || `HTTP ${response.status}`);
      }
      // Revalidate to get the actual data from server
      // Small delay to ensure cache invalidation has completed
      setTimeout(async () => {
        await mutate();
      }, 100);
    } catch (error) {
      console.error('Availability submission failed:', error);
      setAvailabilityError(
        error instanceof Error ? error.message : 'Failed to save availability'
      );
      // Revalidate to get the correct data from server
      await mutate();
    } finally {
      setSavingAvailability(false);
    }
  }, [anonymous, unavailableDates, mutate, token, data]);

  const updatePhase = useCallback(
    async (
      phase: 'PICK_DAYS' | 'RESULTS' | 'FINALIZED' | 'FAILED' | 'VOTE'
    ) => {
      setHostActionError(null);

      // Get CSRF token
      let csrfToken: string;
      try {
        const csrfResponse = await fetch('/api/csrf-token', {
          method: 'GET',
          credentials: 'include',
        });
        if (!csrfResponse.ok) {
          throw new Error('Failed to get CSRF token');
        }
        const csrfData = await csrfResponse.json();
        csrfToken = csrfData.csrfToken;
      } catch (error) {
        console.error('CSRF token fetch failed:', error);
        setHostActionError(
          'Failed to get security token. Please refresh the page.'
        );
        return;
      }

      const res = await fetch(`/api/events/${token}/phase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ phase, csrfToken }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        // Handle validation errors properly
        const errorMessage =
          typeof detail?.error === 'string'
            ? detail.error
            : detail?.error?.message || 'Failed to update phase';
        setHostActionError(errorMessage);
        return;
      }
      mutate();
    },
    [mutate, token]
  );

  const updateFinalDate = useCallback(
    async (date: string | 'clear') => {
      if (!data?.event?.id) return;

      setFinalDateStatus('setting');
      setHostActionError(null);

      try {
        const response = await fetch(`/api/events/${token}/final`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ finalDate: date === 'clear' ? null : date }),
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: 'Unknown error' }));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        setFinalDateStatus('success');
        setShowFinalDateConfirm(false);
        setFinalDraft('clear');
        await mutate();

        // Reset success status after 3 seconds
        setTimeout(() => setFinalDateStatus('idle'), 3000);
      } catch (error) {
        setFinalDateStatus('idle');
        setHostActionError(
          error instanceof Error ? error.message : 'Failed to set final date'
        );
      }
    },
    [data?.event?.id, token, mutate]
  );

  const updateShowResultsToggle = useCallback(
    async (newValue: boolean) => {
      if (!data?.isHost) return;

      setUpdatingToggle(true);
      try {
        const response = await fetch(`/api/events/${token}/show-results`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ showResultsToEveryone: newValue }),
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: 'Unknown error' }));
          const errorMessage =
            typeof errorData.error === 'string'
              ? errorData.error
              : JSON.stringify(errorData.error);
          throw new Error(errorMessage || `HTTP ${response.status}`);
        }

        setShowResultsToEveryone(newValue);
        await mutate();
      } catch (error) {
        console.error('Failed to update toggle:', error);
        setHostActionError(
          error instanceof Error ? error.message : 'Failed to update toggle'
        );
      } finally {
        setUpdatingToggle(false);
      }
    },
    [data?.isHost, token, mutate]
  );

  const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const displayTimeZone = data?.you?.timeZone || browserTz || 'UTC';

  const formatForDisplay = useCallback(
    (
      value: string | Date | null | undefined,
      preset: TimeZoneFormatPreset = 'mediumDate'
    ) => {
      if (!value) {
        return '';
      }

      if (preset === 'dateTime') {
        return formatInTimeZone(value, displayTimeZone, preset);
      }

      const normalizedValue = DATE_ONLY_PRESETS.has(preset)
        ? (normalizeDateForTimeZone(value, displayTimeZone) ?? value)
        : value;

      return formatInTimeZone(normalizedValue, displayTimeZone, preset);
    },
    [displayTimeZone]
  );

  const voteDeadline = data?.phaseSummary?.voteDeadline
    ? new Date(data.phaseSummary.voteDeadline)
    : null;
  const voteClosed = voteDeadline ? isAfter(new Date(), voteDeadline) : false;
  const canVote =
    data?.event?.phase === 'VOTE' || data?.event?.phase === 'PICK_DAYS';
  const topDates = data?.phaseSummary?.topDates ?? [];

  // Force refresh if there's a phase mismatch (client shows VOTE but server says otherwise)
  useEffect(() => {
    if (data?.event?.phase === 'VOTE' && voteError?.includes('VOTE phase')) {
      console.log('🔄 Detected phase mismatch, forcing refresh');
      mutate(undefined, { revalidate: true });
    }
  }, [data?.event?.phase, voteError, mutate]);

  return (
    <main className='container-page grid gap-6'>
      {isLoading && <p className='text-sm text-slate-500'>Loading event...</p>}

      {data && <PhaseBar phase={data?.event?.phase} />}
      <p className='text-xs text-slate-500 text-right'>
        Times shown in {displayTimeZone}
      </p>

      {/* Phase Change Notification */}
      {phaseChangeNotification && (
        <div className='fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-pulse'>
          {phaseChangeNotification}
        </div>
      )}

      {/* Manual refresh button for testing */}
      <div className='flex justify-end'>
        {/* Manual refresh button removed - automatic updates should work */}
      </div>

      {/* FINALIZED Phase Celebration - MOVED TO TOP */}
      {!isLoading &&
        data &&
        data?.event?.phase === 'FINALIZED' &&
        data?.event?.finalDate && (
          <section className='card bg-gradient-to-br from-green-50 via-blue-50 to-purple-50 border-2 border-green-200 shadow-lg'>
            <div className='text-center py-8'>
              <div className='text-6xl mb-6'>🎉</div>
              <h2 className='text-3xl font-bold text-green-800 mb-4'>
                Event Finalized!
              </h2>
              <p className='text-lg text-green-700 mb-8 max-w-2xl mx-auto'>
                Congratulations! Your event has been successfully scheduled and
                all attendees have been notified.
              </p>

              <div className='bg-white rounded-2xl p-8 border-2 border-green-200 shadow-lg max-w-md mx-auto'>
                <div className='text-2xl font-bold text-slate-900 mb-2'>
                  {formatForDisplay(data?.event?.finalDate, 'weekdayLong')}
                </div>
                <div className='text-lg text-slate-600 mb-4'>
                  Final Event Date
                </div>
                <div className='flex items-center justify-center gap-2 text-sm text-green-600 font-medium'>
                  <span>✓</span>
                  <span>All attendees notified</span>
                </div>
              </div>

              <div className='mt-8 flex flex-col sm:flex-row gap-4 justify-center'>
                <button
                  className='btn-primary px-8 py-3 text-lg'
                  onClick={() => window.location.reload()}
                >
                  <span className='mr-2'>🔄</span>
                  Refresh Page
                </button>
                <button
                  className='btn-secondary px-8 py-3 text-lg'
                  onClick={() =>
                    navigator.clipboard.writeText(window.location.href)
                  }
                >
                  <span className='mr-2'>📋</span>
                  Copy Event Link
                </button>
              </div>
            </div>
          </section>
        )}

      {data && (
        <section className='card grid gap-3'>
          <div className='flex flex-wrap items-start justify-between gap-4'>
            <div className='flex flex-col gap-2'>
              <div className='flex flex-wrap items-center gap-3'>
                <h1 className='text-2xl font-semibold text-slate-900'>
                  {data?.event?.title}
                </h1>
              </div>
              {hostActionError && (
                <div className='bg-red-50 border border-red-200 rounded-lg p-3'>
                  <div className='flex items-center gap-2'>
                    <span className='text-red-600'>⚠️</span>
                    <span className='text-sm text-red-800'>
                      {hostActionError}
                    </span>
                    <button
                      onClick={() => setHostActionError(null)}
                      className='ml-auto text-red-600 hover:text-red-800'
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              {data.isHost && (
                <div
                  className='flex flex-wrap items-center gap-2'
                  aria-live='polite'
                >
                  <button className='btn-secondary' onClick={handleCopyInvite}>
                    Copy invite link
                  </button>
                  {copyStatus === 'copied' && (
                    <span className='text-xs text-green-600'>Link copied</span>
                  )}
                  {copyStatus === 'error' && (
                    <span className='text-xs text-red-600'>Copy failed</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {data?.event?.description && (
            <p className='prose-muted'>{data.event.description}</p>
          )}
          {data.you && !needsJoin && (
            <div className='flex items-center gap-2 text-sm text-slate-600'>
              <span>
                Joined as: <strong>{data?.you?.displayName}</strong> (
                {data?.you?.attendeeName?.label})
              </span>
              <button
                type='button'
                className='text-xs text-brand-600 hover:text-brand-700 underline'
                onClick={() => setShowNameSwitchModal(true)}
              >
                Switch name
              </button>
            </div>
          )}

          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div className='text-right text-xs text-slate-500'>
              <p>
                Quorum {data?.phaseSummary?.inCount} /{' '}
                {data?.phaseSummary?.quorum}
              </p>
              <p>
                Deadline{' '}
                {data?.phaseSummary?.voteDeadline
                  ? formatForDisplay(
                      data?.phaseSummary?.voteDeadline,
                      'dateTime'
                    )
                  : 'No deadline'}
              </p>
            </div>
          </div>
          {data?.event?.finalDate && (
            <div className='flex items-center gap-2'>
              <span className='text-2xl'>🎉</span>
              <div className='flex flex-col'>
                <span className='text-sm font-semibold text-green-700'>
                  Event Finalized!
                </span>
                <span className='text-xs text-green-600'>
                  Final date:{' '}
                  {formatForDisplay(data?.event?.finalDate, 'weekdayLong')}
                </span>
              </div>
            </div>
          )}
        </section>
      )}

      {needsLogin && (
        <LoginPrompt message='This event requires a Discord login before you can interact.' />
      )}

      {needsJoin && data && (
        <PickNameCard
          token={token}
          attendeeNames={data.attendeeNames ?? []}
          defaultTz={browserTz}
          onJoined={handleJoinSuccess}
          data={data}
        />
      )}

      {/* Vote change section - above picking frame */}
      {!isLoading &&
        data &&
        !needsJoin &&
        (data?.event?.phase === 'PICK_DAYS' ||
          data?.event?.phase === 'RESULTS') && (
          <section
            className={`card ${currentVote !== true && data?.event?.phase === 'PICK_DAYS' ? 'border-yellow-300 bg-yellow-50' : ''}`}
          >
            <div className='flex items-center justify-between gap-3'>
              <div className='flex items-center gap-2'>
                <span className='text-sm font-medium text-slate-700'>
                  Your vote:
                </span>
                <span
                  className={`text-sm px-2 py-1 rounded-full ${
                    currentVote === true
                      ? 'bg-green-100 text-green-800'
                      : currentVote === false
                        ? 'bg-slate-100 text-slate-800'
                        : 'bg-yellow-100 text-yellow-800'
                  }`}
                >
                  {currentVote === true
                    ? "I'm in!"
                    : currentVote === false
                      ? 'Not this time'
                      : 'Not voted'}
                </span>
                {votingStatus === 'voting' && (
                  <span className='text-xs text-blue-600'>Updating...</span>
                )}
                {votingStatus === 'success' && (
                  <span className='text-xs text-green-600'>✓ Updated</span>
                )}
                {currentVote !== true && data?.event?.phase === 'PICK_DAYS' && (
                  <span className='text-xs text-yellow-700 font-medium'>
                    ⚠️ Vote &quot;I&apos;m in!&quot; to block days
                  </span>
                )}
              </div>
              <div className='flex gap-2'>
                <button
                  className={`btn text-xs py-1 px-3 ${currentVote === false ? 'bg-slate-200 border-slate-400' : ''} ${votingStatus === 'voting' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => submitVote(false)}
                  disabled={!canVote || votingStatus === 'voting'}
                  aria-label='Vote not attending'
                  aria-pressed={currentVote === false}
                >
                  {votingStatus === 'voting' ? '...' : 'Not in'}
                </button>
                <button
                  className={`btn-primary text-xs py-1 px-3 ${currentVote === true ? 'bg-green-600 hover:bg-green-700' : ''} ${votingStatus === 'voting' ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => submitVote(true)}
                  disabled={!canVote || votingStatus === 'voting'}
                  aria-label='Vote attending'
                  aria-pressed={currentVote === true}
                >
                  {votingStatus === 'voting' ? '...' : "I'm in"}
                </button>
              </div>
            </div>
          </section>
        )}

      {/* Error display for vote errors */}
      {voteError && (
        <div className='bg-red-50 border border-red-200 rounded-lg p-3'>
          <div className='flex items-center gap-2'>
            <span className='text-red-600'>⚠️</span>
            <span className='text-sm text-red-800'>{voteError}</span>
            <button
              onClick={() => setVoteError(null)}
              className='ml-auto text-red-600 hover:text-red-800'
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Success message for votes */}
      {votingStatus === 'success' && (
        <div className='bg-green-50 border border-green-200 rounded-lg p-3'>
          <div className='flex items-center gap-2'>
            <span className='text-green-600'>✅</span>
            <span className='text-sm text-green-800'>
              Vote submitted successfully!
            </span>
          </div>
        </div>
      )}

      {!isLoading && data && !needsJoin && data.event.phase === 'VOTE' && (
        <section className='card grid gap-4'>
          <div className='flex items-center justify-between'>
            <h2 className='text-lg font-semibold text-slate-900'>
              Are you in?
            </h2>
            {currentVote !== null && (
              <span
                className={`text-sm px-2 py-1 rounded-full ${
                  currentVote === true
                    ? 'bg-green-100 text-green-800'
                    : 'bg-slate-100 text-slate-800'
                }`}
              >
                {currentVote === true ? "✓ I'm in!" : '✗ Not this time'}
              </span>
            )}
          </div>

          <div className='flex flex-col sm:flex-row gap-3'>
            <button
              className={`btn flex-1 py-3 ${currentVote === false ? 'bg-slate-200 border-2 border-slate-600 ring-2 ring-slate-200' : 'border-slate-300'} ${votingStatus === 'voting' ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => submitVote(false)}
              disabled={!canVote || votingStatus === 'voting'}
            >
              <span className='flex items-center justify-center gap-2'>
                <span className='text-xl'>😔</span>
                {votingStatus === 'voting' ? 'Updating...' : 'Not this time'}
              </span>
            </button>
            <button
              className={`btn-primary flex-1 py-3 ${currentVote === true ? 'bg-green-600 hover:bg-green-700 border-2 border-green-800 ring-2 ring-green-200' : 'border-green-500'} ${votingStatus === 'voting' ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => submitVote(true)}
              disabled={!canVote || votingStatus === 'voting'}
            >
              <span className='flex items-center justify-center gap-2'>
                <span className='text-xl'>🎉</span>
                {votingStatus === 'voting' ? 'Updating...' : "I'm in!"}
              </span>
            </button>
          </div>

          {votingStatus === 'success' && (
            <div className='bg-green-50 border border-green-200 rounded-lg p-3 text-center'>
              <span className='text-sm text-green-800'>
                ✓ Vote updated successfully!
              </span>
            </div>
          )}

          {voteClosed && (
            <p className='text-sm text-slate-500 text-center'>
              Voting is closed. The deadline was{' '}
              {formatForDisplay(voteDeadline, 'dateTime')}.
            </p>
          )}
        </section>
      )}

      {!isLoading &&
        data &&
        !needsJoin &&
        data?.event?.phase === 'PICK_DAYS' && (
          <section className='card grid gap-6'>
            <div className='flex flex-wrap items-center justify-between gap-4'>
              <div className='flex items-center gap-3'>
                <div className='w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center'>
                  <span className='text-orange-600 text-lg'>📅</span>
                </div>
                <div>
                  <h2 className='text-lg font-semibold text-slate-900'>
                    Set Your Availability
                  </h2>
                  <p className='text-sm text-slate-600'>
                    Mark the days you cannot attend
                  </p>
                </div>
              </div>
              <div className='flex items-center gap-3'>
                <label className='flex items-center gap-2 text-sm text-slate-600 cursor-pointer'>
                  <input
                    type='checkbox'
                    className='w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500'
                    checked={anonymous}
                    onChange={event => setAnonymous(event.target.checked)}
                    disabled={currentVote !== true}
                  />
                  <span>Keep availability anonymous</span>
                </label>
              </div>
            </div>

            {/* Check if user has voted IN */}
            {currentVote !== true ? (
              <div className='bg-yellow-50 border border-yellow-200 rounded-lg p-6'>
                <div className='text-center'>
                  <div className='w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4'>
                    <span className='text-yellow-600 text-2xl'>⚠️</span>
                  </div>
                  <h3 className='text-lg font-semibold text-yellow-800 mb-2'>
                    Vote Required to Set Availability
                  </h3>
                  <p className='text-yellow-700 mb-4'>
                    You need to vote &quot;I&apos;m in!&quot; above before you
                    can mark unavailable days.
                  </p>
                  <p className='text-sm text-yellow-600'>
                    Only attendees who are participating in the event can set
                    their availability.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className='bg-slate-50 rounded-lg p-4'>
                  <BlockCalendar
                    start={data.event.startDate}
                    end={data.event.endDate}
                    value={unavailableDates}
                    onChange={setUnavailableDates}
                  />
                </div>

                {availabilityError && (
                  <div className='p-3 bg-red-50 border border-red-200 rounded-lg'>
                    <div className='flex items-center gap-2'>
                      <span className='text-red-600'>⚠️</span>
                      <span className='text-sm text-red-700 font-medium'>
                        {availabilityError}
                      </span>
                    </div>
                  </div>
                )}

                <div className='flex justify-between items-center'>
                  <div className='text-sm text-slate-600'>
                    {unavailableDates.length > 0 ? (
                      <span className='text-orange-700 font-medium'>
                        {unavailableDates.length} day
                        {unavailableDates.length !== 1 ? 's' : ''} marked
                        unavailable
                      </span>
                    ) : (
                      <span className='text-green-700 font-medium'>
                        All days available
                      </span>
                    )}
                  </div>
                  <button
                    className='btn-primary flex items-center gap-2'
                    onClick={saveAvailability}
                    disabled={savingAvailability}
                  >
                    {savingAvailability ? (
                      <>
                        <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin' />
                        Saving...
                      </>
                    ) : (
                      <>
                        <span>💾</span>
                        Save Availability
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </section>
        )}

      {!isLoading &&
        data &&
        (data?.event?.phase === 'RESULTS' ||
          data?.event?.phase === 'FINALIZED' ||
          (data?.event?.phase === 'PICK_DAYS' &&
            (data?.isHost || showResultsToEveryone))) && (
          <section className='card grid gap-4'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <h2 className='text-lg font-semibold text-slate-900'>
                Results & Suggestions
              </h2>
              {data?.isHost && data?.event?.phase === 'PICK_DAYS' && (
                <div className='flex items-center gap-2'>
                  <span className='text-sm text-slate-600'>
                    Show to everyone:
                  </span>
                  <button
                    type='button'
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${
                      showResultsToEveryone ? 'bg-brand-600' : 'bg-slate-200'
                    } ${updatingToggle ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() =>
                      updateShowResultsToggle(!showResultsToEveryone)
                    }
                    disabled={updatingToggle}
                    aria-pressed={showResultsToEveryone}
                    aria-label={`${showResultsToEveryone ? 'Hide' : 'Show'} results to everyone`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        showResultsToEveryone
                          ? 'translate-x-6'
                          : 'translate-x-1'
                      }`}
                    />
                  </button>
                  <span className='text-xs text-slate-500'>
                    {showResultsToEveryone ? 'Everyone can see' : 'Host only'}
                  </span>
                </div>
              )}
            </div>

            <div className='grid gap-4'>
              <div className='grid gap-2'>
                <div className='rounded-lg bg-green-50 border border-green-200 p-4'>
                  <h3 className='font-semibold text-green-900 mb-2'>
                    🎯 Best Options
                  </h3>
                  <div className='grid gap-1 text-sm'>
                    <p className='text-green-800'>
                      {topDates.length > 0
                        ? `Earliest all-available: ${formatForDisplay(topDates[0].date, 'mediumDate')} (${topDates[0].available}/${topDates[0].totalAttendees})`
                        : 'No dates where everyone is available'}
                    </p>
                    {topDates.length > 1 && (
                      <p className='text-green-700'>
                        {`Earliest most-available: ${formatForDisplay(topDates[1].date, 'mediumDate')} (${topDates[1].available}/${topDates[1].totalAttendees})`}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <ResultsCalendar
                startDate={data.event.startDate}
                endDate={data.event.endDate}
                availability={data.availability || []}
                earliestAll={data?.phaseSummary?.earliestAll ?? null}
                earliestMost={data?.phaseSummary?.earliestMost ?? null}
                finalDate={data?.event?.finalDate || null}
                totalAttendees={data?.phaseSummary?.totalParticipants}
                onDateClick={
                  data.event.phase === 'RESULTS'
                    ? date => setFinalDraft(date)
                    : undefined
                }
                selectedDate={finalDraft !== 'clear' ? finalDraft : null}
                isInteractive={data.event.phase === 'RESULTS'}
              />
            </div>
          </section>
        )}

      {/* Deadline Card - Above Host Controls */}
      {data && data?.phaseSummary?.voteDeadline && (
        <DeadlineCard
          voteDeadline={data.phaseSummary.voteDeadline}
          phase={data?.event?.phase}
          quorum={data?.phaseSummary?.quorum}
          inCount={data?.phaseSummary?.inCount}
          deadlineExpired={(data.phaseSummary as any).deadlineExpired}
          deadlineStatus={(data.phaseSummary as any).deadlineStatus}
          timeZone={displayTimeZone}
        />
      )}

      {data?.isHost && (
        <section className='card grid gap-8'>
          <div className='flex items-center gap-4'>
            <div className='w-12 h-12 bg-gradient-to-br from-purple-100 to-indigo-100 rounded-full flex items-center justify-center'>
              <span className='text-purple-600 text-xl'>👑</span>
            </div>
            <div>
              <h2 className='text-xl font-bold text-slate-900'>
                Host Controls
              </h2>
              <p className='text-slate-600'>
                Manage your event&apos;s progress and settings
              </p>
            </div>
          </div>

          {/* Availability Progress Display */}
          {data?.event?.phase === 'PICK_DAYS' && (
            <div className='p-4 bg-white rounded-xl border border-purple-200'>
              <div className='flex items-center gap-3 mb-4'>
                <div className='w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center'>
                  <span className='text-blue-600 text-lg'>📅</span>
                </div>
                <h4 className='text-lg font-semibold text-slate-900'>
                  Availability Progress
                </h4>
              </div>

              <div className='space-y-3'>
                {/* Progress Summary */}
                <div className='flex items-center justify-between p-3 bg-slate-50 rounded-lg'>
                  <span className='text-sm font-medium text-slate-700'>
                    {data?.availabilityProgress?.completedAvailability} of{' '}
                    {data?.availabilityProgress?.totalEligible} participants
                    have set their availability
                  </span>
                  <div
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      data?.availabilityProgress?.isComplete
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    }`}
                  >
                    {data?.availabilityProgress?.isComplete
                      ? '✅ Complete'
                      : '⏳ In Progress'}
                  </div>
                </div>

                {/* Individual Participant Status */}
                <div className='space-y-2'>
                  {data.attendeeDetails
                    .filter(attendee => attendee.hasVotedIn)
                    .map(attendee => (
                      <div
                        key={attendee.id}
                        className='flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200'
                      >
                        <div className='flex items-center gap-3'>
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                              attendee.hasSetAvailability
                                ? 'bg-green-100 text-green-600'
                                : 'bg-yellow-100 text-yellow-600'
                            }`}
                          >
                            {attendee.hasSetAvailability ? '✅' : '⏳'}
                          </div>
                          <span className='font-medium text-slate-900'>
                            {attendee.name}
                          </span>
                          {attendee.isLoggedIn && (
                            <span className='text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-full'>
                              Logged In
                            </span>
                          )}
                        </div>
                        <span
                          className={`text-xs font-medium ${
                            attendee.hasSetAvailability
                              ? 'text-green-600'
                              : 'text-yellow-600'
                          }`}
                        >
                          {attendee.hasSetAvailability
                            ? 'Availability Set'
                            : 'Pending'}
                        </span>
                      </div>
                    ))}
                </div>

                {/* Action Hint */}
                {data?.availabilityProgress?.isComplete ? (
                  <div className='p-3 bg-green-50 border border-green-200 rounded-lg'>
                    <div className='flex items-center gap-2'>
                      <span className='text-green-600'>🎉</span>
                      <span className='text-sm font-medium text-green-800'>
                        All participants have set their availability! You can
                        now move to the Results phase.
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className='p-3 bg-blue-50 border border-blue-200 rounded-lg'>
                    <div className='flex items-center gap-2'>
                      <span className='text-blue-600'>ℹ️</span>
                      <span className='text-sm font-medium text-blue-800'>
                        You can move to Results at any time, even if not
                        everyone has set their availability yet.
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className='grid gap-6'>
            <div className='flex flex-wrap gap-4'>
              {data.event.phase === 'VOTE' && (
                <button
                  className='btn-primary flex items-center gap-2 px-6 py-3 text-base font-semibold'
                  onClick={() => updatePhase('PICK_DAYS')}
                >
                  <span className='text-lg'>📅</span>
                  Move to Availability Phase
                </button>
              )}
              {data?.event?.phase === 'PICK_DAYS' && (
                <button
                  className={`flex items-center gap-2 px-6 py-3 text-base font-semibold ${
                    data?.availabilityProgress?.isComplete
                      ? 'btn-primary bg-green-600 hover:bg-green-700'
                      : 'btn-primary bg-blue-600 hover:bg-blue-700'
                  }`}
                  onClick={() => updatePhase('RESULTS')}
                >
                  <span className='text-lg'>
                    {data?.availabilityProgress?.isComplete ? '🎉' : '📊'}
                  </span>
                  {data?.availabilityProgress?.isComplete
                    ? 'Ready for Results!'
                    : `Move to Results (${data?.availabilityProgress?.completedAvailability}/${data?.availabilityProgress?.totalEligible} completed)`}
                </button>
              )}
              {data?.event?.phase === 'RESULTS' && (
                <button
                  className='btn-primary flex items-center gap-2 px-6 py-3 text-base font-semibold'
                  onClick={() => updatePhase('FINALIZED')}
                >
                  <span className='text-lg'>🎉</span>
                  Finalize Event
                </button>
              )}
            </div>

            {data.event.phase === 'RESULTS' && (
              <div className='grid gap-6'>
                <div className='text-center'>
                  <div className='w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4'>
                    <span className='text-blue-600 text-2xl'>🎯</span>
                  </div>
                  <h3 className='text-2xl font-bold text-slate-900 mb-2'>
                    Pick Final Date
                  </h3>
                  <p className='text-slate-600 max-w-2xl mx-auto'>
                    Click on any date in the calendar above to select it as your
                    final event date. Consider availability and any external
                    factors when making your choice.
                  </p>
                  {finalDateStatus === 'success' && (
                    <div className='mt-4 p-3 bg-green-50 border border-green-200 rounded-lg'>
                      <span className='text-green-700 font-medium'>
                        ✓ Final date set successfully!
                      </span>
                    </div>
                  )}
                </div>

                <div className='bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200'>
                  <div className='text-center mb-4'>
                    <h4 className='text-lg font-semibold text-slate-900 mb-2'>
                      Selected Date
                    </h4>
                    <p className='text-sm text-slate-600'>
                      Click on a calendar date above to make your selection
                    </p>
                  </div>

                  <div className='text-center'>
                    <div className='inline-flex items-center gap-3 px-6 py-4 bg-white rounded-xl border-2 border-slate-200 shadow-sm'>
                      <div className='w-3 h-3 rounded-full bg-blue-500'></div>
                      <span className='text-sm font-medium text-slate-700'>
                        Selected:
                      </span>
                      {finalDraft && finalDraft !== 'clear' ? (
                        <span className='text-lg font-bold text-blue-600'>
                          {formatForDisplay(finalDraft, 'weekdayLong')}
                        </span>
                      ) : (
                        <span className='text-lg text-slate-400'>
                          No date selected
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className='flex flex-col sm:flex-row gap-3'>
                  <button
                    className='btn-primary flex-1 py-3 text-base font-semibold'
                    onClick={() => setShowFinalDateConfirm(true)}
                    disabled={
                      !finalDraft ||
                      finalDraft === 'clear' ||
                      finalDateStatus === 'setting'
                    }
                  >
                    {finalDateStatus === 'setting' ? (
                      <>
                        <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2' />
                        Setting Final Date...
                      </>
                    ) : (
                      <>
                        <span className='mr-2'>🎯</span>
                        Set Final Date
                      </>
                    )}
                  </button>

                  <button
                    className='btn-secondary py-3 px-4 text-base'
                    onClick={() => setFinalDraft('clear')}
                    disabled={finalDateStatus === 'setting'}
                  >
                    <span className='mr-2'>🗑️</span>
                    Clear Selection
                  </button>
                </div>

                {hostActionError && (
                  <div className='p-4 bg-red-50 border border-red-200 rounded-lg'>
                    <div className='flex items-center gap-3'>
                      <span className='text-red-600 text-xl'>❌</span>
                      <div>
                        <div className='text-red-700 font-medium'>
                          Error setting final date
                        </div>
                        <div className='text-sm text-red-600'>
                          {hostActionError}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className='pt-6 border-t border-slate-200'>
            <div className='flex items-center justify-between'>
              <div>
                <h3 className='text-lg font-semibold text-slate-900 mb-1'>
                  Danger Zone
                </h3>
                <p className='text-sm text-slate-600'>
                  Permanently delete this event and all its data
                </p>
              </div>
              <button
                className='btn bg-red-600 hover:bg-red-700 text-white px-4 py-2 font-semibold'
                onClick={handleDeleteEvent}
                disabled={deletingEvent}
              >
                {deletingEvent ? (
                  <>
                    <div className='w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2' />
                    Deleting...
                  </>
                ) : (
                  <>
                    <span className='mr-2'>🗑️</span>
                    Delete Event
                  </>
                )}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Final Date Confirmation Modal */}
      {showFinalDateConfirm && finalDraft !== 'clear' && (
        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'>
          <div className='bg-white rounded-2xl p-8 max-w-lg w-full shadow-2xl'>
            <div className='text-center'>
              <div className='w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6'>
                <span className='text-3xl'>🎯</span>
              </div>
              <h3 className='text-2xl font-bold text-slate-900 mb-4'>
                Confirm Final Date
              </h3>
              <p className='text-slate-600 mb-6 text-lg'>
                Are you ready to finalize your event with this date?
              </p>

              <div className='bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 mb-8 border border-blue-200'>
                <div className='text-2xl font-bold text-slate-900 mb-2'>
                  {formatForDisplay(finalDraft, 'weekdayLong')}
                </div>
                <div className='text-slate-600 mb-3'>
                  Your selected event date
                </div>
                <div className='flex items-center justify-center gap-2 text-sm text-blue-600 font-medium'>
                  <span>✓</span>
                  <span>All attendees will be notified immediately</span>
                </div>
              </div>

              <div className='flex flex-col sm:flex-row gap-4'>
                <button
                  className='btn-secondary flex-1 py-4 text-lg font-semibold'
                  onClick={() => setShowFinalDateConfirm(false)}
                  disabled={finalDateStatus === 'setting'}
                >
                  <span className='mr-2'>↩️</span>
                  Cancel
                </button>
                <button
                  className='btn-primary flex-1 py-4 text-lg font-semibold'
                  onClick={() => updateFinalDate(finalDraft)}
                  disabled={finalDateStatus === 'setting'}
                >
                  {finalDateStatus === 'setting' ? (
                    <>
                      <div className='w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-3' />
                      Finalizing...
                    </>
                  ) : (
                    <>
                      <span className='mr-2'>🚀</span>
                      Confirm & Finalize
                    </>
                  )}
                </button>
              </div>

              {hostActionError && (
                <div className='mt-6 p-4 bg-red-50 border border-red-200 rounded-lg'>
                  <div className='flex items-center gap-2'>
                    <span className='text-red-600'>❌</span>
                    <span className='text-sm text-red-700 font-medium'>
                      {hostActionError}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Name Switch Modal */}
      {showNameSwitchModal && (
        <div className='fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50'>
          <div className='bg-white rounded-2xl p-8 max-w-lg w-full shadow-2xl'>
            <div className='text-center'>
              <div className='w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6'>
                <span className='text-3xl'>👤</span>
              </div>
              <h3 className='text-2xl font-bold text-slate-900 mb-4'>
                Switch Name
              </h3>
              <p className='text-slate-600 mb-6 text-lg'>
                Choose a name to represent in this event. If the name is already
                taken, you&apos;ll take over that person&apos;s progress.
              </p>

              <div className='space-y-3 mb-8'>
                {data?.attendeeNames.map(name => (
                  <button
                    key={name.id}
                    className={`w-full p-4 rounded-xl border-2 text-left transition-colors ${
                      name.takenBy
                        ? name.claimedByLoggedUser
                          ? 'border-red-200 bg-red-50 text-slate-400 cursor-not-allowed'
                          : 'border-orange-200 bg-orange-50 text-slate-900 hover:border-orange-300 hover:bg-orange-100'
                        : 'border-slate-200 bg-white text-slate-900 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                    onClick={() =>
                      !name.claimedByLoggedUser && switchName(name.id)
                    }
                    disabled={!!name.claimedByLoggedUser}
                  >
                    <div className='flex items-center justify-between'>
                      <span className='font-medium'>{name.label}</span>
                      {name.takenBy ? (
                        name.claimedByLoggedUser ? (
                          <span className='text-sm text-red-600'>Claimed</span>
                        ) : (
                          <span className='text-sm text-orange-600'>
                            Take Over
                          </span>
                        )
                      ) : (
                        <span className='text-sm text-green-600'>
                          Available
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>

              <div className='flex gap-4'>
                <button
                  className='btn-secondary flex-1 py-4 text-lg font-semibold'
                  onClick={() => setShowNameSwitchModal(false)}
                >
                  <span className='mr-2'>↩️</span>
                  Cancel
                </button>
              </div>

              {nameSwitchError && (
                <div className='mt-6 p-4 bg-red-50 border border-red-200 rounded-lg'>
                  <div className='flex items-center gap-2'>
                    <span className='text-red-600'>❌</span>
                    <span className='text-sm text-red-700 font-medium'>
                      {nameSwitchError}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
