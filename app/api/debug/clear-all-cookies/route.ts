// app/api/debug/clear-all-cookies/route.ts
// Debug endpoint to aggressively clear all cookies

export const runtime = 'nodejs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { debugLog } from '@/lib/debug';

export async function POST(_req: NextRequest) {
  try {
    const cookieStore = await cookies();

    // Get all cookies first for logging
    const allCookies = cookieStore.getAll();

    debugLog('Debug clear-all-cookies API: clearing cookies', {
      names: allCookies.map(c => c.name),
    });

    // AGGRESSIVE: Clear ALL cookies
    allCookies.forEach(cookie => {
      // Delete with default settings
      cookieStore.delete(cookie.name);

      // Also try deleting with explicit domain/path combinations
      cookieStore.set(cookie.name, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 0, // Expire immediately
        path: '/',
        domain:
          process.env.NODE_ENV === 'development' ? 'localhost' : undefined,
      });
    });

    // Specifically target attendee session cookies
    cookieStore.delete('attendee-session');
    cookieStore.delete('anonymous-session');
    cookieStore.delete('next-auth.session-token');
    cookieStore.delete('next-auth.csrf-token');
    cookieStore.delete('next-auth.callback-url');

    // Set empty values with immediate expiration
    cookieStore.set('attendee-session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
      domain: process.env.NODE_ENV === 'development' ? 'localhost' : undefined,
    });

    cookieStore.set('anonymous-session', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0,
      path: '/',
      domain: process.env.NODE_ENV === 'development' ? 'localhost' : undefined,
    });

    const result = {
      timestamp: new Date().toISOString(),
      clearedCookies: allCookies.map(c => c.name),
      message: 'All cookies cleared aggressively',
    };

    debugLog('Debug clear-all-cookies API: cookies cleared', result);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error clearing cookies:', error);
    return NextResponse.json(
      { error: 'Failed to clear cookies' },
      { status: 500 }
    );
  }
}
