// app/api/events/[token]/switch-name/route.ts
// Simplified switch-name API using person-centric approach

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { invalidateEventOperationCache } from '@/lib/cache-invalidation';
import { debugLog } from '@/lib/debug';
import { prisma } from '@/lib/prisma';
import { rateLimiters } from '@/lib/rate-limiter';
import { emit } from '@/lib/realtime';
import { getSelectedPerson, setSelectedPerson } from '@/lib/simple-cookies';

const switchNameSchema = z.object({
  newNameId: z.string(),
});

export const POST = rateLimiters.general(
  async (req: NextRequest, context: { params: Promise<{ token: string }> }) => {
    try {
      const { token } = await context.params;
      const body = await req.json();
      debugLog('Switch-name API: request received', body);

      const parsed = switchNameSchema.safeParse(body);
      if (!parsed.success) {
        debugLog('Switch-name API: validation failed', parsed.error.flatten());
        return NextResponse.json(
          { error: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const { newNameId } = parsed.data;

      // Get event with all necessary data
      const invite = await prisma.inviteToken.findUnique({
        where: { token },
        include: {
          event: {
            include: {
              attendeeNames: true,
              attendeeSessions: {
                where: { isActive: true },
                include: { attendeeName: true },
              },
            },
          },
        },
      });

      if (!invite?.event) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
      }

      const event = invite.event;
      const session = await auth();
      const userId = session?.user?.id;

      // Find the new attendee name
      const newAttendeeName = event.attendeeNames.find(
        name => name.id === newNameId
      );
      if (!newAttendeeName) {
        return NextResponse.json(
          { error: 'Invalid attendee name' },
          { status: 400 }
        );
      }

      // Check if the new name is already taken by a logged-in user
      const activeSessions = event.attendeeSessions || [];
      const conflictingSession = activeSessions.find(
        session => session.attendeeNameId === newNameId
      );

      if (conflictingSession && conflictingSession.userId) {
        return NextResponse.json(
          {
            error: `The name "${newAttendeeName.label}" is claimed by a logged-in user. Please choose another name.`,
          },
          { status: 409 }
        );
      }

      // Find current session
      let currentSession = null;

      if (userId) {
        // Logged-in user: find their session
        currentSession = activeSessions.find(s => s.userId === userId);
      } else {
        // Anonymous user: find session by selected person
        const selectedPerson = await getSelectedPerson(event.id, req);
        if (selectedPerson) {
          const selectedAttendeeName = event.attendeeNames.find(
            name => name.slug === selectedPerson
          );
          if (selectedAttendeeName) {
            currentSession = activeSessions.find(
              s => s.attendeeNameId === selectedAttendeeName.id
            );
          }
        }
      }

      if (!currentSession) {
        return NextResponse.json(
          { error: 'You must join the event before switching names' },
          { status: 400 }
        );
      }

      debugLog('Switch-name API: current session found', {
        sessionId: currentSession.id,
        currentAttendeeNameId: currentSession.attendeeNameId,
        newAttendeeNameId: newNameId,
        userId,
      });

      // If switching to the same name, no need to do anything
      if (currentSession.attendeeNameId === newNameId) {
        return NextResponse.json({
          success: true,
          message: `You're already using "${newAttendeeName.label}".`,
          attendeeNames: event.attendeeNames.map(name => ({
            id: name.id,
            label: name.label,
            slug: name.slug,
            takenBy: activeSessions.find(s => s.attendeeNameId === name.id)
              ?.userId
              ? 'claimed'
              : null,
          })),
        });
      }

      // Update the session to use the new name
      const updatedSession = await prisma.attendeeSession.update({
        where: { id: currentSession.id },
        data: {
          attendeeNameId: newNameId,
          updatedAt: new Date(),
        },
      });

      debugLog('Switch-name API: session updated successfully', {
        sessionId: updatedSession.id,
        newAttendeeNameId: newNameId,
      });

      // For anonymous users, update their selected person
      if (!userId) {
        await setSelectedPerson(event.id, newAttendeeName.slug);
      }

      // Emit name change event
      try {
        await emit(event.id, 'attendee.nameChanged', {
          attendeeId: updatedSession.id,
          newName: newAttendeeName.label,
        });
      } catch (emitError) {
        debugLog(
          'Switch-name API: failed to emit attendee.nameChanged event',
          emitError
        );
      }

      // Invalidate cache
      try {
        await invalidateEventOperationCache(token, 'switch-name');
      } catch (cacheError) {
        debugLog('Switch-name API: failed to invalidate cache', cacheError);
      }

      debugLog('Switch-name API: name switch completed successfully', {
        sessionId: updatedSession.id,
        oldName: currentSession.attendeeName.label,
        newName: newAttendeeName.label,
        oldAttendeeNameId: currentSession.attendeeNameId,
        newAttendeeNameId: newNameId,
        userId: userId,
        isAnonymous: !userId,
      });

      return NextResponse.json({
        success: true,
        message: `You've switched to "${newAttendeeName.label}".`,
        attendeeNames: event.attendeeNames.map(name => ({
          id: name.id,
          label: name.label,
          slug: name.slug,
          takenBy: activeSessions.find(s => s.attendeeNameId === name.id)
            ?.userId
            ? 'claimed'
            : null,
        })),
      });
    } catch (error) {
      debugLog('Switch-name API: error occurred', error);
      return NextResponse.json(
        { error: 'Failed to switch name' },
        { status: 500 }
      );
    }
  }
);
