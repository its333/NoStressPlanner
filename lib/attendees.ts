// lib/attendees.ts
// Updated attendee management for the new schema

import { prisma } from '@/lib/prisma';

interface LookupParams {
  eventId: string;
  sessionKey?: string;
  userId?: string;
}

export async function findAttendeeSession({ eventId, sessionKey, userId }: LookupParams) {
  try {
    console.log('🔍 findAttendeeSession called:', {
      eventId: eventId ? `${eventId.substring(0, 20)}...` : null,
      hasSessionKey: !!sessionKey,
      sessionKeyPreview: sessionKey ? `${sessionKey.substring(0, 20)}...` : null,
      hasUserId: !!userId
    });
    
    // PRIORITY 1: ALWAYS prioritize sessionKey if available (prevents cross-browser conflicts)
    if (sessionKey) {
      console.log('🔍 Searching for session with exact key:', {
        eventId: eventId.substring(0, 20) + '...',
        sessionKey: sessionKey.substring(0, 30) + '...',
        fullSessionKey: sessionKey
      });
      
      // First, let's see all sessions for this event
      const allSessions = await prisma.attendeeSession.findMany({
        where: { eventId, isActive: true },
        select: { id: true, sessionKey: true, displayName: true }
      });
      console.log('🔍 All active sessions for this event:', allSessions.map(s => ({
        id: s.id,
        displayName: s.displayName,
        sessionKey: s.sessionKey.substring(0, 30) + '...',
        matches: s.sessionKey === sessionKey
      })));
      
      // Only look for attendee sessions with custom session keys (not NextAuth tokens)
      const sessionAttendee = await prisma.attendeeSession.findFirst({
        where: { 
          eventId, 
          sessionKey,
          isActive: true
        },
        include: { 
          attendeeName: true,
          user: true
        },
      });
      console.log('🔍 Session lookup result:', {
        found: !!sessionAttendee,
        sessionId: sessionAttendee?.id,
        displayName: sessionAttendee?.displayName,
        attendeeNameId: sessionAttendee?.attendeeNameId,
        sessionKeyType: sessionKey.startsWith('user_') ? 'user' : sessionKey.startsWith('anon_') ? 'anonymous' : 'unknown'
      });
      if (sessionAttendee) return sessionAttendee;
    }
    
    // PRIORITY 2: userId fallback for logged-in users (allows shared sessions across browsers)
    if (userId) {
      const userSession = await prisma.attendeeSession.findFirst({
        where: { 
          eventId, 
          userId,
          isActive: true
        },
        include: { 
          attendeeName: true,
          user: true
        },
      });
      console.log('🔍 User ID lookup result:', {
        found: !!userSession,
        sessionId: userSession?.id,
        displayName: userSession?.displayName,
        attendeeNameId: userSession?.attendeeNameId
      });
      if (userSession) return userSession;
    }

    // No session found
    console.log('🔍 No session found for this event');
    return null;
  } catch (error) {
    console.error('Error in findAttendeeSession:', error);
    return null;
  }
}

export async function getCurrentAttendeeSession(eventId: string, userId?: string, sessionKey?: string) {
  try {
    console.log('🔍 getCurrentAttendeeSession called:', {
      eventId,
      userId: userId ? `${userId.substring(0, 8)}...` : 'none',
      sessionKey: sessionKey ? `${sessionKey.substring(0, 20)}...` : 'none'
    });

    const session = await findAttendeeSession({ eventId, userId, sessionKey });
    
    console.log('🔍 getCurrentAttendeeSession result:', {
      found: !!session,
      sessionId: session?.id,
      displayName: session?.displayName,
      attendeeNameId: session?.attendeeNameId,
      isActive: session?.isActive
    });

    return session;
  } catch (error) {
    console.error('Error in getCurrentAttendeeSession:', error);
    return null;
  }
}

export async function createAttendeeSession({
  eventId,
  attendeeNameId,
  userId,
  sessionKey,
  displayName,
  timeZone,
  anonymousBlocks = true
}: {
  eventId: string;
  attendeeNameId: string;
  userId?: string;
  sessionKey: string;
  displayName: string;
  timeZone: string;
  anonymousBlocks?: boolean;
}) {
  // Make any existing active session for this user inactive
  if (userId) {
    await prisma.attendeeSession.updateMany({
      where: {
        eventId,
        userId,
        isActive: true
      },
      data: { isActive: false }
    });
  }

  // Create new active session
  return await prisma.attendeeSession.create({
    data: {
      eventId,
      attendeeNameId,
      userId,
      sessionKey,
      displayName,
      timeZone,
      anonymousBlocks,
      isActive: true
    },
    include: {
      attendeeName: true,
      user: true
    }
  });
}

export async function switchAttendeeSessionName({
  currentSessionId,
  newAttendeeNameId,
  displayName
}: {
  currentSessionId: string;
  newAttendeeNameId: string;
  displayName: string;
}) {
  return await prisma.attendeeSession.update({
    where: { id: currentSessionId },
    data: {
      attendeeNameId: newAttendeeNameId,
      displayName
    },
    include: {
      attendeeName: true,
      user: true
    }
  });
}

export async function deactivateAttendeeSession(sessionId: string) {
  return await prisma.attendeeSession.update({
    where: { id: sessionId },
    data: { isActive: false }
  });
}

// Helper function to generate event-specific session keys
export function generateSessionKey(userId?: string, eventId?: string): string {
  const crypto = require('crypto');
  
  // Generate cryptographically secure random components
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(16).toString('hex'); // 32 characters
  const browserId = crypto.randomBytes(8).toString('hex'); // 16 characters
  
  // Add a browser fingerprint to make each browser completely unique
  const browserFingerprint = crypto.randomBytes(4).toString('hex'); // 8 characters
  
  // CRITICAL: Include eventId to make session keys event-specific
  const eventPrefix = eventId ? eventId.substring(0, 8) : 'global';
  
  if (userId) {
    // For logged-in users: include userId but make it unique per browser and event
    return `user_${userId}_${eventPrefix}_${browserId}_${browserFingerprint}_${timestamp}_${randomBytes}`;
  } else {
    // For anonymous users: completely unique per browser and event
    return `anon_${eventPrefix}_${browserId}_${browserFingerprint}_${timestamp}_${randomBytes}`;
  }
}