// app/api/events/[token]/route.ts
// Updated main API route for the new schema with enhanced caching

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { toUtcDate, eachDayInclusive } from '@/lib/time';
import { getCurrentAttendeeSession } from '@/lib/attendees';
import { cookieManager } from '@/lib/cookie-manager';
import { emit } from '@/lib/realtime';
import { computeAvailability } from '@/lib/results';
import { eventCache } from '@/lib/intelligent-cache';
import { handleNextApiError } from '@/lib/error-handling';
import { sessionManager } from '@/lib/session-manager';
import { monitorApiRoute } from '@/lib/performance-middleware';
import { getEventDataUltraOptimized } from '@/lib/ultra-optimized-queries';

export const GET = monitorApiRoute(async (req: NextRequest, context: { params: Promise<{ token: string }> }) => {
  try {
    console.log('🚨🚨🚨 MAIN ROUTE CALLED - Entry Point 🚨🚨🚨');
    const { token } = await context.params;
    console.log('🚨🚨🚨 MAIN ROUTE - Token:', token, '🚨🚨🚨');
    
    // For debugging: allow session key to be passed as query parameter
    const debugSessionKey = req.nextUrl.searchParams.get('sessionKey');
    const cacheBust = req.nextUrl.searchParams.get('t');

    // INTELLIGENT CACHING: Use session-specific cache keys to prevent contamination
    // while still benefiting from caching for performance
    
    // Get session info first for cache key generation
    const sessionInfo = await sessionManager.getSessionInfo(req);
    
    // Get event first to get the event ID for session key retrieval
    const eventData = await getEventDataUltraOptimized(token);
    const event = eventData;
    
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const currentSessionKey = debugSessionKey || await cookieManager.getSessionKey(event.id);
    
    // Create session-specific cache key
    const userAgent = req.headers.get('user-agent') || 'unknown';
    const browserFingerprint = userAgent.substring(0, 50).replace(/[^a-zA-Z0-9]/g, '');
    const browserSpecificCacheKey = `event_data:${token}:${browserFingerprint}:${currentSessionKey?.substring(0, 20) || 'no-session'}`;
    
    // Check intelligent cache first (unless cache bust requested)
    if (!cacheBust) {
      const cached = await eventCache.get(browserSpecificCacheKey);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    // Event already fetched above for session key retrieval

    const now = new Date();
    
    // Data already fetched by optimized query - no additional DB calls needed!
    const attendeeSessions = event.attendeeSessions || [];
    const votes = event.votes || [];
    const blocks = event.blocks || [];
    
    const inIds = new Set(votes.filter((v: any) => v.in).map((v: any) => v.attendeeNameId));
    const inCount = inIds.size;
    
    // Debug vote counting
    console.log('🔍 Vote Counting Debug:', {
      eventId: event.id,
      totalVotes: votes.length,
      votesWithInTrue: votes.filter((v: any) => v.in).length,
      uniqueAttendeeNames: inIds.size,
      attendeeNameIds: Array.from(inIds),
      quorum: event.quorum,
      phase: event.phase
    });
    
  // Count all people who have any progress (votes OR blocks)
  const allPeopleWithProgress = new Set<string>();
  (event.votes || []).forEach((vote: any) => allPeopleWithProgress.add(vote.attendeeNameId));
  (event.blocks || []).forEach((block: any) => allPeopleWithProgress.add(block.attendeeNameId));
  const totalParticipants = allPeopleWithProgress.size;

  // Auto-fail if deadline passed and quorum not met
  if (event.phase === 'VOTE' && now > event.voteDeadline && inCount < event.quorum) {
    const updated = await prisma.event.update({
      where: { id: event.id },
      data: { phase: 'FAILED' },
    });
    if (updated.phase !== event.phase) {
      await emit(event.id, 'phase.changed', { phase: updated.phase });
    }
    event.phase = updated.phase;
  }

  // Session info already retrieved above for cache key generation
  
  // Use the same session detection method as the vote API for consistency
  let you = await getCurrentAttendeeSession(
    event.id,
    sessionInfo.userId || undefined,
    currentSessionKey || undefined
  );
  
  // If no session found but we have a session key, wait a bit and try again
  // This handles the case where a vote was just submitted and the session is being created
  if (!you && currentSessionKey) {
    console.log('🔍 No session found, waiting 100ms and retrying...');
    await new Promise(resolve => setTimeout(resolve, 100));
    you = await getCurrentAttendeeSession(
      event.id,
      sessionInfo.userId || undefined,
      currentSessionKey || undefined
    );
  }
  
  console.log('🔍 Session Detection Debug:', {
    eventId: event.id,
    sessionInfo: {
      userId: sessionInfo.userId,
      hasSessionKey: !!currentSessionKey,
      sessionKeyPreview: currentSessionKey ? `${currentSessionKey.substring(0, 20)}...` : null,
      fallbackUsed: sessionInfo.fallbackUsed
    },
    you: you ? {
      id: you.id,
      displayName: you.displayName,
      attendeeNameId: you.attendeeNameId,
      isActive: you.isActive
    } : null
  });
  
  // Use the new host detection system
  const hostDetection = await sessionManager.detectHost(
    event.host.id,
    event.host.name || '',
    sessionInfo.userId, // Use sessionInfo.userId instead of you?.user?.id
    you?.displayName,
    currentSessionKey || undefined
  );
  
  const finalIsHost = hostDetection.isHost;

  // Get blocks for the current person (attendeeName), not session       
  const yourBlocks = you
    ? event.blocks.filter((block: any) => block.attendeeNameId === you.attendeeNameId).map((block: any) => block.date)
    : [];

  // Get vote for the current person (attendeeName), not session
  const yourVote = you
    ? event.votes.find((vote: any) => vote.attendeeNameId === you.attendeeNameId)
    : null;
    
  console.log('🔍 Vote Detection Debug:', {
    hasYou: !!you,
    youAttendeeNameId: you?.attendeeNameId,
    totalVotes: event.votes.length,
    allVotes: event.votes.map((v: any) => ({
      attendeeNameId: v.attendeeNameId,
      in: v.in,
      matches: you ? v.attendeeNameId === you.attendeeNameId : false
    })),
    yourVote: yourVote ? { in: yourVote.in, attendeeNameId: yourVote.attendeeNameId } : null
  });

    // Use direct data for availability calculation
    const attendeesIn = Array.from(inIds) as string[];
    
    // Availability calculation using direct database queries
    
    const { availability, earliestAll, earliestMost, top3 } = computeAvailability(
      attendeesIn,
      blocks.map((b: any) => ({ ...b, attendeeNameId: b.attendeeNameId })),
      eachDayInclusive(event.startDate, event.endDate)
    );

  // Calculate availability progress for host visibility
  const availabilityProgress = {
    totalEligible: inCount, // People who voted "I'm in!"
    completedAvailability: new Set<string>(), // People who have explicitly saved their availability
    notSetYet: new Set<string>(), // People who voted "I'm in!" but haven't saved availability yet
  };

  // Find who has explicitly saved their availability
  // We now use the hasSavedAvailability field which is set to true when someone calls the blocks API
  
  // Get attendees who have explicitly saved their availability (regardless of whether they have blocks)
  const attendeesWhoHaveSavedAvailability = new Set((attendeeSessions || [])
    .filter((session: any) => session.isActive && session.hasSavedAvailability)
    .map((session: any) => session.attendeeName?.id)
    .filter(Boolean));
  
  Array.from(inIds).forEach((attendeeNameId) => {
    const nameId = attendeeNameId as string;
    // Consider someone as having completed availability if they have explicitly saved
    if (attendeesWhoHaveSavedAvailability.has(nameId)) {
      availabilityProgress.completedAvailability.add(nameId);
    } else {
      availabilityProgress.notSetYet.add(nameId);
    }
  });

  // Get attendee details for display (show ALL people who voted "I'm in!")
  const attendeeDetails = Array.from(inIds).map((attendeeNameId) => {
    const attendeeName = event.attendeeNames.find((name: any) => name.id === attendeeNameId);
    const session = attendeeSessions.find((s: any) => s.attendeeName?.id === attendeeNameId && s.isActive);
    
    return {
      id: attendeeNameId,
      name: attendeeName?.label || 'Unknown',
      hasVotedIn: true, // They're in inIds, so they voted "I'm in!"
      hasSetAvailability: session?.hasSavedAvailability || false,
      isLoggedIn: Boolean(session?.userId),
    };
  });

  // Get name availability (based on active sessions)
  const nameAvailability = (event.attendeeNames || []).map((name: any) => {
    const activeSession = (attendeeSessions || []).find((session: any) =>        
      session.attendeeName?.id === name.id
    );
    return {
      id: name.id,
      label: name.label,
      slug: name.slug,
      takenBy: activeSession ? (activeSession.userId ? 'claimed' : 'taken') : null,
      claimedByLoggedUser: !!activeSession?.userId,
    };
  });

  const responseData = {
    event: {
      id: event.id,
      title: event.title,
      description: event.description,
      phase: event.phase,
      quorum: event.quorum,
      voteDeadline: event.voteDeadline.toISOString(),
      startDate: toUtcDate(event.startDate).toISOString(),
      endDate: toUtcDate(event.endDate).toISOString(),
      requireLoginToAttend: event.requireLoginToAttend,
      finalDate: event.finalDate ? toUtcDate(event.finalDate).toISOString() : null,
      showResultsToEveryone: (event as any).showResultsToEveryone ?? false,
    },
    attendeeNames: nameAvailability,
    phaseSummary: {
      inCount: inCount,
      totalParticipants: totalParticipants, // All people with any progress
      quorum: event.quorum,
      voteDeadline: event.voteDeadline.toISOString(),
      deadlineExpired: now > event.voteDeadline,
      deadlineStatus: now > event.voteDeadline 
        ? (inCount >= event.quorum ? 'expired_with_quorum' : 'expired_without_quorum')
        : (inCount >= event.quorum ? 'active_with_quorum' : 'active_needs_quorum'),
      earliestAll: earliestAll ? earliestAll.date.toISOString() : null,
      earliestMost: earliestMost ? earliestMost.date.toISOString() : null,
      topDates: top3.map((day) => ({ 
        date: day.date.toISOString(), 
        available: day.available,
        totalAttendees: totalParticipants // Use total participants count
      })),
    },
    availability: availability.map((day) => ({
      date: day.date.toISOString(),
      available: day.available,
    })),
    availabilityProgress: {
      totalEligible: availabilityProgress.totalEligible,
      completedAvailability: availabilityProgress.completedAvailability.size,
      notSetYet: availabilityProgress.notSetYet.size,
      isComplete: availabilityProgress.notSetYet.size === 0 && availabilityProgress.totalEligible > 0,
    },
    attendeeDetails: attendeeDetails,
    attendeeSessions: (attendeeSessions || []).map((session: any) => ({
      id: session.id,
      displayName: session.displayName,
      timeZone: session.timeZone,
      isActive: session.isActive,
      attendeeName: {
        id: session.attendeeName.id,
        label: session.attendeeName.label,
        slug: session.attendeeName.slug,
      },
      user: session.user ? {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      } : null,
    })),
    you: you
      ? {
          id: you.id,
          displayName: you.displayName,
          timeZone: you.timeZone,
          anonymousBlocks: you.anonymousBlocks,
          attendeeName: {
            id: you.attendeeName.id,
            label: you.attendeeName.label,
            slug: you.attendeeName.slug,
          },
        }
      : null,
    isHost: finalIsHost,
    initialBlocks: yourBlocks.map((date: any) => toUtcDate(date).toISOString()),
    yourVote: yourVote ? yourVote.in : null,
  };

  // Cache the response with intelligent TTL
  await eventCache.set(browserSpecificCacheKey, responseData, 120000);

  return NextResponse.json(responseData);

  } catch (error) {
    const { status, body } = handleNextApiError(error as Error, req);
    return NextResponse.json(body, { status });
  }
});