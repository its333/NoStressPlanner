// app/api/debug/cookies/route.ts
// Debug endpoint to inspect cookie state

export const runtime = 'nodejs';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

import { debugLog } from '@/lib/debug';

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();

    // Get all cookies
    const allCookies = cookieStore.getAll();

    // Get specific session cookies
    const sessionToken = cookieStore.get('next-auth.session-token')?.value;
    const attendeeSession = cookieStore.get('attendee-session')?.value;
    const anonymousSession = cookieStore.get('anonymous-session')?.value;

    const cookieInfo = {
      timestamp: new Date().toISOString(),
      userAgent: req.headers.get('user-agent'),
      ip:
        req.headers.get('x-forwarded-for') ||
        req.headers.get('x-real-ip') ||
        'unknown',
      allCookies: allCookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value ? `${cookie.value.substring(0, 20)}...` : null,
        hasValue: !!cookie.value,
      })),
      sessionCookies: {
        nextAuthToken: {
          hasValue: !!sessionToken,
          preview: sessionToken ? `${sessionToken.substring(0, 20)}...` : null,
        },
        attendeeSession: {
          hasValue: !!attendeeSession,
          preview: attendeeSession
            ? `${attendeeSession.substring(0, 20)}...`
            : null,
        },
        anonymousSession: {
          hasValue: !!anonymousSession,
          preview: anonymousSession
            ? `${anonymousSession.substring(0, 20)}...`
            : null,
        },
      },
      selectedSessionKey:
        attendeeSession || anonymousSession
          ? `${(attendeeSession || anonymousSession)!.substring(0, 20)}...`
          : null,
    };

    debugLog('Debug cookies API: cookie info', cookieInfo);

    return NextResponse.json(cookieInfo);
  } catch (error) {
    console.error('Error in cookie debug endpoint:', error);
    return NextResponse.json(
      { error: 'Failed to get cookie info' },
      { status: 500 }
    );
  }
}
