// lib/cookie-manager.ts
// Unified cookie management system to prevent stale cookies

import { cookies } from 'next/headers';

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
    'next-auth.callback-url'
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
      ...this.NEXT_AUTH_COOKIES
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

  /**
   * Clear ALL session cookies with multiple strategies
   */
  static async clearAllSessionCookies(): Promise<void> {
    const cookieStore = await cookies();
    
    console.log('🍪 CookieManager: Clearing ALL session cookies');
    
    // Strategy 1: Delete with default settings
    const allCookies = [
      this.ATTENDEE_SESSION_COOKIE,
      this.ANONYMOUS_SESSION_COOKIE,
      ...this.NEXT_AUTH_COOKIES
    ];
    
    allCookies.forEach(cookieName => {
      cookieStore.delete(cookieName);
    });
    
    // Strategy 2: Set empty values with immediate expiration
    const cookieOptions: CookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/'
    };
    
    allCookies.forEach(cookieName => {
      cookieStore.set(cookieName, '', cookieOptions);
    });
    
    // Strategy 3: Clear with domain variations (development only)
    if (process.env.NODE_ENV === 'development') {
      const domainOptions = [
        { domain: 'localhost' },
        { domain: '.localhost' },
        { domain: undefined }
      ];
      
      domainOptions.forEach(domainOpt => {
        allCookies.forEach(cookieName => {
          cookieStore.set(cookieName, '', {
            ...cookieOptions,
            ...domainOpt
          });
        });
      });
    }
    
    console.log('🍪 CookieManager: All session cookies cleared');
  }

  /**
   * Clear only stale session cookies (not matching current event)
   */
  static async clearStaleSessionCookies(currentEventId: string): Promise<boolean> {
    const cookieStore = await cookies();
    let hasStaleCookies = false;
    
    console.log('🍪 CookieManager: Checking for stale session cookies for event:', currentEventId.substring(0, 8));
    
    const sessionCookies = [
      this.ATTENDEE_SESSION_COOKIE,
      this.ANONYMOUS_SESSION_COOKIE
    ];
    
    sessionCookies.forEach(cookieName => {
      const cookie = cookieStore.get(cookieName);
      if (cookie && cookie.value) {
        const isForCurrentEvent = this.isSessionKeyForEvent(cookie.value, currentEventId);
        if (!isForCurrentEvent) {
          console.log('🍪 CookieManager: Found stale cookie:', cookieName, cookie.value.substring(0, 20) + '...');
          hasStaleCookies = true;
          
          // Clear the stale cookie
          cookieStore.delete(cookieName);
          cookieStore.set(cookieName, '', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 0,
            path: '/'
          });
        }
      }
    });
    
    if (hasStaleCookies) {
      console.log('🍪 CookieManager: Cleared stale session cookies');
    }
    
    return hasStaleCookies;
  }

  /**
   * Set a new session key cookie
   */
  static async setSessionKey(sessionKey: string, sessionType: 'user' | 'anonymous'): Promise<void> {
    const cookieStore = await cookies();
    
    // First, clear any existing session cookies
    await this.clearAllSessionCookies();
    
    // Wait a moment to ensure cookies are cleared
    await new Promise(resolve => setTimeout(resolve, 100));
    
    const cookieName = sessionType === 'user' ? this.ATTENDEE_SESSION_COOKIE : this.ANONYMOUS_SESSION_COOKIE;
    
    const cookieOptions: CookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/'
      // Note: No domain setting to avoid cross-browser issues
    };
    
    cookieStore.set(cookieName, sessionKey, cookieOptions);
    
    console.log('🍪 CookieManager: Set new session key:', {
      sessionType,
      cookieName,
      sessionKeyPreview: sessionKey.substring(0, 20) + '...'
    });
  }

  /**
   * Get the current session key for an event
   */
  static async getSessionKey(eventId?: string): Promise<string | undefined> {
    const cookieStore = await cookies();
    
    // Try attendee-session first, then anonymous-session
    const attendeeSession = cookieStore.get(this.ATTENDEE_SESSION_COOKIE)?.value;
    const anonymousSession = cookieStore.get(this.ANONYMOUS_SESSION_COOKIE)?.value;
    
    const sessionKey = attendeeSession || anonymousSession;
    
    if (!sessionKey) {
      console.log('🍪 CookieManager: No session key found');
      return undefined;
    }
    
    // If eventId is provided, validate the session key is for this event
    if (eventId) {
      const isForEvent = this.isSessionKeyForEvent(sessionKey, eventId);
      if (!isForEvent) {
        console.log('🍪 CookieManager: Session key does not match event, ignoring:', sessionKey.substring(0, 20) + '...');
        return undefined;
      }
    }
    
    console.log('🍪 CookieManager: Found valid session key:', sessionKey.substring(0, 20) + '...');
    return sessionKey;
  }
}

// Export convenience functions
export const cookieManager = CookieManager;
