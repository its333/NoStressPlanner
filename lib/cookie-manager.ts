// lib/cookie-manager.ts
// Unified cookie management system to prevent stale cookies

import { cookies } from 'next/headers';

import { debugLog } from './debug';

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  maxAge?: number;
  path?: string;
  domain?: string;
}

export class CookieManager {
  private static readonly ATTENDEE_SESSION_COOKIE = 'attendee-session';
  private static readonly ANONYMOUS_SESSION_COOKIE = 'anonymous-session';
  private static readonly NEXT_AUTH_COOKIES = [
    'next-auth.session-token',
    'next-auth.csrf-token',
    'next-auth.callback-url',
  ];

  /**
   * Get all session-related cookies
   */
  static async getAllSessionCookies(): Promise<Record<string, string>> {
    const cookieStore = await cookies();
    const sessionCookies: Record<string, string> = {};

    const allCookies = [
      this.ATTENDEE_SESSION_COOKIE,
      this.ANONYMOUS_SESSION_COOKIE,
      ...this.NEXT_AUTH_COOKIES,
    ];

    allCookies.forEach(cookieName => {
      const cookie = cookieStore.get(cookieName);
      if (cookie) {
        sessionCookies[cookieName] = cookie.value;
      }
    });

    return sessionCookies;
  }

  /**
   * Check if a session key matches the current event
   */
  static isSessionKeyForEvent(sessionKey: string, eventId: string): boolean {
    const eventPrefix = eventId.substring(0, 8);
    return sessionKey.includes(`_${eventPrefix}_`);
  }

  /**
   * Get the event ID from a session key
   */
  static getEventIdFromSessionKey(sessionKey: string): string | null {
    const match = sessionKey.match(/_([a-zA-Z0-9]{8})_/);
    return match ? match[1] : null;
  }

  private static getAttendeeCookieNames(): string[] {
    return [this.ATTENDEE_SESSION_COOKIE, this.ANONYMOUS_SESSION_COOKIE];
  }

  private static createDeletionOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
    };
  }

  private static async clearCookies(cookieNames: string[]): Promise<void> {
    if (cookieNames.length === 0) {
      return;
    }

    const cookieStore = await cookies();
    const baseOptions = this.createDeletionOptions();

    cookieNames.forEach(cookieName => {
      cookieStore.delete(cookieName);
      cookieStore.set(cookieName, '', baseOptions);
    });

    if (process.env.NODE_ENV === 'development') {
      const domainOptions = [
        { domain: 'localhost' },
        { domain: '.localhost' },
        { domain: undefined },
      ];
      domainOptions.forEach(domainOpt => {
        cookieNames.forEach(cookieName => {
          cookieStore.set(cookieName, '', {
            ...baseOptions,
            ...domainOpt,
          });
        });
      });
    }
  }

  /**
   * Clear attendee-related session cookies.
   */
  static async clearAttendeeSessionCookies(): Promise<void> {
    const namesToClear = this.getAttendeeCookieNames();
    await this.clearCookies(namesToClear);
    debugLog('CookieManager: cleared attendee session cookies');
  }

  /**
   * Clear all session cookies, including NextAuth tokens.
   * Intended for explicit debug flows.
   */
  static async clearAllSessionCookies(): Promise<void> {
    const namesToClear = [
      ...this.getAttendeeCookieNames(),
      ...this.NEXT_AUTH_COOKIES,
    ];
    await this.clearCookies(namesToClear);
    debugLog('CookieManager: cleared attendee and auth session cookies');
  }

  /**
   * Clear only stale session cookies (not matching current event)
   */
  static async clearStaleSessionCookies(
    currentEventId: string
  ): Promise<boolean> {
    const cookieStore = await cookies();
    let hasStaleCookies = false;

    debugLog('CookieManager: checking for stale session cookies', {
      eventId: currentEventId.substring(0, 8),
    });

    const sessionCookies = [
      this.ATTENDEE_SESSION_COOKIE,
      this.ANONYMOUS_SESSION_COOKIE,
    ];

    sessionCookies.forEach(cookieName => {
      const cookie = cookieStore.get(cookieName);
      if (cookie && cookie.value) {
        const isForCurrentEvent = this.isSessionKeyForEvent(
          cookie.value,
          currentEventId
        );
        if (!isForCurrentEvent) {
          debugLog('CookieManager: found stale cookie', {
            cookieName,
            sessionKeyPreview: `${cookie.value.substring(0, 20)}...`,
          });
          hasStaleCookies = true;

          // Clear the stale cookie
          cookieStore.delete(cookieName);
          cookieStore.set(cookieName, '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 0,
            path: '/',
          });
        }
      }
    });

    if (hasStaleCookies) {
      debugLog('CookieManager: cleared stale session cookies');
    }

    return hasStaleCookies;
  }

  /**
   * Set a new session key cookie
   */
  static async setSessionKey(
    sessionKey: string,
    sessionType: 'user' | 'anonymous'
  ): Promise<void> {
    const cookieStore = await cookies();

    // First, clear any existing attendee session cookies
    await this.clearAttendeeSessionCookies();

    // Wait a moment to ensure cookies are cleared
    await new Promise(resolve => setTimeout(resolve, 100));

    const cookieName =
      sessionType === 'user'
        ? this.ATTENDEE_SESSION_COOKIE
        : this.ANONYMOUS_SESSION_COOKIE;

    const cookieOptions: CookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
      // Note: No domain setting to avoid cross-browser issues
    };

    cookieStore.set(cookieName, sessionKey, cookieOptions);

    debugLog('CookieManager: set new session key', {
      sessionType,
      cookieName,
      sessionKeyPreview: `${sessionKey.substring(0, 20)}...`,
    });
  }

  /**
   * Get the current session key for an event
   */
  static async getSessionKey(eventId?: string): Promise<string | undefined> {
    const cookieStore = await cookies();

    // Try attendee-session first, then anonymous-session
    const attendeeSession = cookieStore.get(
      this.ATTENDEE_SESSION_COOKIE
    )?.value;
    const anonymousSession = cookieStore.get(
      this.ANONYMOUS_SESSION_COOKIE
    )?.value;

    const sessionKey = attendeeSession || anonymousSession;

    if (!sessionKey) {
      debugLog('CookieManager: no session key found');
      return undefined;
    }

    // If eventId is provided, validate the session key is for this event
    if (eventId) {
      const isForEvent = this.isSessionKeyForEvent(sessionKey, eventId);
      if (!isForEvent) {
        debugLog('CookieManager: session key does not match event', {
          sessionKeyPreview: `${sessionKey.substring(0, 20)}...`,
          eventId,
        });
        return undefined;
      }
    }

    debugLog('CookieManager: found valid session key', {
      sessionKeyPreview: `${sessionKey.substring(0, 20)}...`,
    });
    return sessionKey;
  }
}

// Export convenience functions
export const cookieManager = CookieManager;
