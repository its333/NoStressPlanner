// app/api/events/[token]/route.ts
// Updated main API route for the new schema with enhanced caching

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';

import { debugLog } from '@/lib/debug';
import { handleNextApiError } from '@/lib/error-handling';
import { eventCache } from '@/lib/intelligent-cache';
import { monitorApiRoute } from '@/lib/performance-middleware';
import { prisma } from '@/lib/prisma';
import { emit } from '@/lib/realtime';
import { computeAvailability } from '@/lib/results';
import { sessionManager } from '@/lib/session-manager';
import { getSelectedPerson } from '@/lib/simple-cookies';
import { toUtcDate, eachDayInclusive } from '@/lib/time';
import { getEventDataUltraOptimized } from '@/lib/ultra-optimized-queries';

export const GET = monitorApiRoute(
  async (req: NextRequest, context: { params: Promise<{ token: string }> }) => {
    try {
      debugLog('Event API: GET /events/[token] invoked');
      const { token } = await context.params;
      debugLog('Event API: token resolved', { token });

      const cacheBust = req.nextUrl.searchParams.get('t');
      const forceRefresh = req.nextUrl.searchParams.get('force') === 'true';

      // INTELLIGENT CACHING: Use session-specific cache keys to prevent contamination
      // while still benefiting from caching for performance

      // Fetch session information and event data concurrently
      const sessionInfo = await sessionManager.getSessionInfo(req);
      const event = await getEventDataUltraOptimized(token);

      if (!event) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }

      const selectedPerson = await getSelectedPerson(event.id);

      // Create browser-specific cache key using request headers for better isolation
      const userAgent = req.headers.get('user-agent') || '';
      const ip =
        req.headers.get('x-forwarded-for') ||
        req.headers.get('x-real-ip') ||
        '';
      const browserFingerprint = `${userAgent.substring(0, 50)}_${ip}`.replace(
        /[^a-zA-Z0-9_]/g,
        '_'
      );

      // Create user-specific cache key to prevent cross-user contamination
      const userIdentifier =
        sessionInfo.userId || selectedPerson || `anon_${browserFingerprint}`;
      const eventCacheKey = `event_data:${token}:${userIdentifier}`;

      // Check intelligent cache first (unless cache bust requested)
      // Skip cache if cacheBust timestamp or force refresh is provided
      if (!cacheBust && !forceRefresh) {
        const cached = await eventCache.get(eventCacheKey);
        if (cached) {
          debugLog('Event API: returning cached data', {
            token: token.substring(0, 8) + '...',
            cacheKey: eventCacheKey,
          });
          return NextResponse.json(cached);
        }
      } else {
        debugLog('Event API: bypassing cache', {
          token: token.substring(0, 8) + '...',
          reason: cacheBust ? 'cacheBust timestamp' : 'force refresh',
        });
      }

      const now = new Date();

      // Data already fetched by optimized query - no additional DB calls needed!
      const attendeeSessions = event.attendeeSessions || [];

      const attendeeSessionByNameId = new Map<
        string,
        (typeof attendeeSessions)[number]
      >();
      attendeeSessions.forEach((session: any) => {
        if (session?.attendeeName?.id) {
          attendeeSessionByNameId.set(session.attendeeName.id, session);
        }
      });
      const votes = event.votes || [];
      const blocks = event.blocks || [];

      const inIds = new Set(
        votes.filter((v: any) => v.in).map((v: any) => v.attendeeNameId)
      );
      const inCount = inIds.size;

      // Debug vote counting
      debugLog('Event API: vote counting summary', {
        eventId: event.id,
        totalVotes: votes.length,
        votesWithInTrue: votes.filter((v: any) => v.in).length,
        uniqueAttendeeNames: inIds.size,
        attendeeNameIds: Array.from(inIds),
        quorum: event.quorum,
        phase: event.phase,
      });

      // Count all people who have any progress (votes OR blocks)
      const allPeopleWithProgress = new Set<string>();
      (event.votes || []).forEach((vote: any) =>
        allPeopleWithProgress.add(vote.attendeeNameId)
      );
      (event.blocks || []).forEach((block: any) =>
        allPeopleWithProgress.add(block.attendeeNameId)
      );
      const totalParticipants = allPeopleWithProgress.size;

      // Auto-fail if deadline passed and quorum not met
      if (
        event.phase === 'VOTE' &&
        now > event.voteDeadline &&
        inCount < event.quorum
      ) {
        const updated = await prisma.event.update({
          where: { id: event.id },
          data: { phase: 'FAILED' },
        });
        if (updated.phase !== event.phase) {
          await emit(event.id, 'phase.changed', { phase: updated.phase });
        }
        event.phase = updated.phase;
      }

      // Resolve the viewer session from the already-fetched attendee sessions
      // Simple person detection - no complex session management needed
      let you = null;

      if (sessionInfo.userId) {
        // Logged-in user: find their attendee session
        you =
          attendeeSessions.find(
            (session: any) => session.userId === sessionInfo.userId
          ) || null;
      } else if (selectedPerson) {
        // Anonymous user: find the person they selected
        const selectedAttendeeName = event.attendeeNames?.find(
          name => name.slug === selectedPerson
        );
        if (selectedAttendeeName) {
          you =
            attendeeSessions.find(
              (session: any) =>
                session.attendeeNameId === selectedAttendeeName.id
            ) || null;
        }
      }

      debugLog('Event API: person detection summary', {
        eventId: event.id,
        sessionInfo: {
          userId: sessionInfo.userId,
          hasSelectedPerson: !!selectedPerson,
          selectedPerson,
        },
        detectionMethod: sessionInfo.userId
          ? 'userId'
          : selectedPerson
            ? 'selectedPerson'
            : 'none',
        you: you
          ? {
              id: you.id,
              displayName: you.displayName,
              attendeeNameId: you.attendeeNameId,
            }
          : null,
      });

      // Use the new host detection system
      const hostDetection = await sessionManager.detectHost(
        event.host.id,
        event.host.name || '',
        sessionInfo.userId, // Use sessionInfo.userId instead of you?.user?.id
        you?.displayName,
        undefined
      );

      const finalIsHost = hostDetection.isHost;

      // Get blocks for the current person (attendeeName), not session
      const yourBlocks = you
        ? event.blocks
            .filter((block: any) => block.attendeeNameId === you.attendeeNameId)
            .map((block: any) => block.date)
        : [];

      // Get vote for the current person (attendeeName), not session
      const yourVote = you
        ? event.votes.find(
            (vote: any) => vote.attendeeNameId === you.attendeeNameId
          )
        : null;

      debugLog('Event API: vote detection summary', {
        hasYou: !!you,
        youAttendeeNameId: you?.attendeeNameId,
        youDisplayName: you?.displayName,
        youAttendeeNameLabel: you?.attendeeName?.label,
        totalVotes: event.votes.length,
        allVotes: event.votes.map((v: any) => ({
          attendeeNameId: v.attendeeNameId,
          in: v.in,
          matches: you ? v.attendeeNameId === you.attendeeNameId : false,
        })),
        yourVote: yourVote
          ? { in: yourVote.in, attendeeNameId: yourVote.attendeeNameId }
          : null,
      });

      // Use direct data for availability calculation
      const attendeesIn = Array.from(inIds) as string[];

      // Availability calculation using direct database queries

      const { availability, earliestAll, earliestMost, top3 } =
        computeAvailability(
          attendeesIn,
          blocks.map((b: any) => ({ ...b, attendeeNameId: b.attendeeNameId })),
          eachDayInclusive(event.startDate, event.endDate)
        );

      // Calculate availability progress for host visibility
      const availabilityProgress = {
        totalEligible: inCount, // People who voted "I'm in!"
        completedAvailability: 0, // Count of people who have explicitly saved their availability
        notSetYet: 0, // Count of people who voted "I'm in!" but haven't saved availability yet
        isComplete: false,
      };

      // Find who has explicitly saved their availability
      // We now use the hasSavedAvailability field which is set to true when someone calls the blocks API

      // Get attendees who have explicitly saved their availability
      // In PICK_DAYS phase, anyone who voted "I'm in!" and has interacted with the calendar has set availability
      // We can determine this by checking if they have any blocks OR if they have an active session
      const attendeesWhoHaveSavedAvailability = new Set<string>();
      
      // Add attendees who have blocks (they've explicitly blocked days)
      blocks.forEach((block: any) => {
        if (block.attendeeNameId) {
          attendeesWhoHaveSavedAvailability.add(block.attendeeNameId);
        }
      });
      
      // Add attendees who have active sessions (they've accessed the calendar)
      attendeeSessions.forEach((session: any) => {
        if (session.attendeeName?.id) {
          attendeesWhoHaveSavedAvailability.add(session.attendeeName.id);
        }
      });

      Array.from(inIds).forEach(attendeeNameId => {
        const nameId = attendeeNameId as string;
        // Consider someone as having completed availability if they have explicitly saved
        if (attendeesWhoHaveSavedAvailability.has(nameId)) {
          availabilityProgress.completedAvailability++;
        } else {
          availabilityProgress.notSetYet++;
        }
      });

      // Set completion status
      availabilityProgress.isComplete = availabilityProgress.completedAvailability === availabilityProgress.totalEligible;

      // Get attendee details for display (show ALL people who voted "I'm in!")
      const attendeeDetails = Array.from(inIds).map(attendeeNameId => {
        const attendeeName = event.attendeeNames.find(
          (name: any) => name.id === attendeeNameId
        );
        const session = attendeeSessionByNameId.get(attendeeNameId as string);

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
        const activeSession = attendeeSessionByNameId.get(name.id);
        const sessionUserId = activeSession?.userId || undefined;
        const viewerUserId = sessionInfo.userId || you?.user?.id;
        return {
          id: name.id,
          label: name.label,
          slug: name.slug,
          takenBy: activeSession
            ? activeSession.userId
              ? 'claimed'
              : 'taken'
            : null,
          claimedByLoggedUser: !!viewerUserId && sessionUserId === viewerUserId,
        };
      });

      // Get selected person for anonymous users (UX only)
      const preferredName = !sessionInfo.userId ? selectedPerson : null;

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
          finalDate: event.finalDate
            ? toUtcDate(event.finalDate).toISOString()
            : null,
          showResultsToEveryone: (event as any).showResultsToEveryone ?? false,
        },
        attendeeNames: nameAvailability,
        preferredName, // UX convenience for anonymous users
        phaseSummary: {
          inCount: inCount,
          totalParticipants: totalParticipants, // All people with any progress
          quorum: event.quorum,
          voteDeadline: event.voteDeadline.toISOString(),
          deadlineExpired: now > event.voteDeadline,
          deadlineStatus:
            now > event.voteDeadline
              ? inCount >= event.quorum
                ? 'expired_with_quorum'
                : 'expired_without_quorum'
              : inCount >= event.quorum
                ? 'active_with_quorum'
                : 'active_needs_quorum',
          earliestAll: earliestAll ? earliestAll.date.toISOString() : null,
          earliestMost: earliestMost ? earliestMost.date.toISOString() : null,
          topDates: top3.map(day => ({
            date: day.date.toISOString(),
            available: day.available,
            totalAttendees: totalParticipants, // Use total participants count
          })),
        },
        availability: availability.map(day => ({
          date: day.date.toISOString(),
          available: day.available,
        })),
        availabilityProgress: {
          totalEligible: availabilityProgress.totalEligible,
          completedAvailability: availabilityProgress.completedAvailability,
          notSetYet: availabilityProgress.notSetYet,
          isComplete: availabilityProgress.isComplete,
        },
        votes: votes.map((v: any) => ({
          attendeeNameId: v.attendeeNameId,
          in: v.in,
        })),
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
          user: session.user
            ? {
                id: session.user.id,
                name: session.user.name,
                email: session.user.email,
                image: session.user.image,
              }
            : null,
        })),
        you: you
          ? {
              id: you.id,
              displayName: you.attendeeName.label, // Use attendeeName.label for consistency
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
        initialBlocks: yourBlocks.map(
          (date: any) => toUtcDate(date).toISOString().split('T')[0]
        ),
        yourVote: yourVote ? yourVote.in : null,
      };

      // Cache the response with intelligent TTL
      await eventCache.set(eventCacheKey, responseData, 120000);

      return NextResponse.json(responseData);
    } catch (error) {
      const { status, body } = handleNextApiError(error as Error, req);
      return NextResponse.json(body, { status });
    }
  }
);
