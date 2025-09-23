// app/api/events/[token]/switch-name/route.ts
// Updated switch-name API for the new schema

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { getCurrentAttendeeSession, switchAttendeeSessionName } from '@/lib/attendees';
import { getSessionKey, setSessionKey } from '@/lib/cookies';
import { emit } from '@/lib/realtime';
import { z } from 'zod';

const switchNameSchema = z.object({
  newNameId: z.string(),
});

export async function POST(req: NextRequest, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    const body = await req.json();
    const { newNameId } = switchNameSchema.parse(body);

    // Get event with all necessary data
    const invite = await prisma.inviteToken.findUnique({
      where: { token },
      include: { 
        event: { 
          include: { 
            attendeeNames: true,
            attendeeSessions: {
              where: { isActive: true },
              include: { attendeeName: true }
            }
          } 
        } 
      },
    });
    
    if (!invite?.event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const event = invite.event;
    const session = await auth();
    const currentSessionKey = await getSessionKey(event.id);
    
    // Find current session
    const currentSession = await getCurrentAttendeeSession(
      event.id,
      session?.user?.id,
      currentSessionKey || undefined
    );

    if (!currentSession) {
      return NextResponse.json({ error: 'Not currently joined to this event' }, { status: 404 });
    }

    // Validate new name exists
    const newName = event.attendeeNames.find(name => name.id === newNameId);
    if (!newName) {
      return NextResponse.json({ error: 'Name not found' }, { status: 404 });
    }

    // Check if trying to switch to same name
    if (currentSession.attendeeNameId === newNameId) {
      return NextResponse.json({ 
        error: `You are already using the name "${newName.label}". Please choose a different name to switch to.` 
      }, { status: 400 });
    }

    // Check if the name is already taken by an active session
    const existingActiveSession = event.attendeeSessions.find(
      session => session.attendeeNameId === newNameId && session.isActive
    );
    
    if (existingActiveSession) {
      // Check if it's the same user trying to switch to their own name
      if (session?.user?.id && existingActiveSession.userId === session.user.id) {
        // Switch to their existing session
        await prisma.attendeeSession.update({
          where: { id: currentSession.id },
          data: { isActive: false }
        });

        const reactivatedSession = await prisma.attendeeSession.update({
          where: { id: existingActiveSession.id },
          data: { 
            isActive: true,
            displayName: newName.label
          },
          include: {
            attendeeName: true,
            user: true
          }
        });

        await setSessionKey(reactivatedSession.sessionKey, session?.user?.id ? 'user' : 'anonymous');

        await emit(event.id, 'attendee.nameChanged', { 
          attendeeId: reactivatedSession.id,
          oldNameId: currentSession.attendeeNameId,
          newNameId: newNameId
        });

        return NextResponse.json({ 
          ok: true, 
          attendeeId: reactivatedSession.id,
          newName: newName.label,
          message: `You've switched to "${newName.label}" and inherited their progress.`
        });
      } else {
        return NextResponse.json({ 
          error: `The name "${newName.label}" is currently taken. Please choose another name.` 
        }, { status: 409 });
      }
    }

    // Name is available - switch current session to new name
    const updatedSession = await switchAttendeeSessionName({
      currentSessionId: currentSession.id,
      newAttendeeNameId: newNameId,
      displayName: newName.label
    });

    await emit(event.id, 'attendee.nameChanged', { 
      attendeeId: updatedSession.id,
      oldNameId: currentSession.attendeeNameId,
      newNameId: newNameId
    });

    return NextResponse.json({ 
      ok: true, 
      attendeeId: updatedSession.id,
      newName: newName.label,
      message: `You've switched to "${newName.label}". This person has no previous progress.`
    });

  } catch (error) {
    console.error('Error switching name:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request data' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Failed to switch name' }, { status: 500 });
  }
}