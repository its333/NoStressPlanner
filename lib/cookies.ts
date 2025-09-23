// lib/cookies.ts
// Enhanced cookie utilities for session management
import { cookies } from 'next/headers';

import { debugLog } from './debug';

export async function getSessionKey(
  eventId?: string
): Promise<string | undefined> {
  const cookieStore = await cookies();

  // Try multiple cookie names for session keys
  const sessionToken = cookieStore.get('next-auth.session-token')?.value;
  const attendeeSession = cookieStore.get('attendee-session')?.value;
  const anonymousSession = cookieStore.get('anonymous-session')?.value;

  debugLog('Cookie utilities: cookie retrieval', {
    hasNextAuthToken: !!sessionToken,
    hasAttendeeSession: !!attendeeSession,
    hasAnonymousSession: !!anonymousSession,
    nextAuthPreview: sessionToken
      ? `${sessionToken.substring(0, 20)}...`
      : null,
    attendeePreview: attendeeSession
      ? `${attendeeSession.substring(0, 20)}...`
      : null,
    anonymousPreview: anonymousSession
      ? `${anonymousSession.substring(0, 20)}...`
      : null,
    eventId: eventId ? `${eventId.substring(0, 8)}...` : 'none',
  });

  // NEVER use NextAuth tokens for attendee sessions
  // Only return attendee-specific session keys
  // Prioritize attendee-session over anonymous-session for consistency
  const result = attendeeSession || anonymousSession;

  // CRITICAL: If we have an eventId, only return session keys that match this event
  if (eventId && result) {
    const eventPrefix = eventId.substring(0, 8);
    if (result.includes(`_${eventPrefix}_`)) {
      debugLog('Cookie utilities: selected event-specific session key', {
        sessionKeyPreview: `${result.substring(0, 20)}...`,
      });
      return result;
    } else {
      debugLog('Cookie utilities: session key does not match event', {
        sessionKeyPreview: `${result.substring(0, 20)}...`,
        eventId,
      });
      return undefined;
    }
  }

  debugLog('Cookie utilities: selected attendee session key', {
    sessionKeyPreview: result ? `${result.substring(0, 20)}...` : 'none',
  });
  return result;
}

export async function setSessionKey(
  sessionKey: string,
  sessionType: 'user' | 'anonymous' = 'anonymous'
): Promise<void> {
  const cookieStore = await cookies();

  // CRITICAL: Clear ALL existing attendee session cookies first to prevent contamination
  cookieStore.delete('attendee-session');
  cookieStore.delete('anonymous-session');

  // Add a small delay to ensure cookies are cleared
  await new Promise(resolve => setTimeout(resolve, 50));

  // NEVER overwrite NextAuth's session token
  // Use separate cookie names for attendee sessions based on type
  if (sessionType === 'user') {
    cookieStore.set('attendee-session', sessionKey, {
      httpOnly: true, // Secure: prevent XSS attacks
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
      // Add domain restriction for development to prevent cross-browser contamination
      domain: process.env.NODE_ENV === 'development' ? 'localhost' : undefined,
    });
  } else {
    cookieStore.set('anonymous-session', sessionKey, {
      httpOnly: true, // Secure: prevent XSS attacks
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
      // Add domain restriction for development to prevent cross-browser contamination
      domain: process.env.NODE_ENV === 'development' ? 'localhost' : undefined,
    });
  }

  debugLog('Cookie utilities: set session key', {
    sessionType,
    sessionKeyPreview: `${sessionKey.substring(0, 20)}...`,
    cookieName:
      sessionType === 'user' ? 'attendee-session' : 'anonymous-session',
    domain: process.env.NODE_ENV === 'development' ? 'localhost' : 'default',
  });
}

export async function clearSessionKey(): Promise<void> {
  const cookieStore = await cookies();

  // Clear all session-related cookies
  cookieStore.delete('next-auth.session-token');
  cookieStore.delete('attendee-session');
  cookieStore.delete('anonymous-session');

  debugLog('Cookie utilities: cleared attendee and auth session cookies');
}

export async function clearAttendeeSessionCookies(): Promise<void> {
  const cookieStore = await cookies();

  // AGGRESSIVE: Clear attendee session cookies with multiple attempts
  // Clear with different domain/path combinations to ensure complete removal
  cookieStore.delete('attendee-session');
  cookieStore.delete('anonymous-session');

  // Also try clearing with explicit domain/path combinations
  cookieStore.set('attendee-session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0, // Expire immediately
    path: '/',
    domain: process.env.NODE_ENV === 'development' ? 'localhost' : undefined,
  });

  cookieStore.set('anonymous-session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0, // Expire immediately
    path: '/',
    domain: process.env.NODE_ENV === 'development' ? 'localhost' : undefined,
  });

  debugLog('Cookie utilities: aggressively cleared attendee session cookies');
}
