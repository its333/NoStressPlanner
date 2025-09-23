// app/api/debug/clear-session/route.ts
// Debug endpoint to clear attendee session cookies

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { clearAttendeeSessionCookies } from '@/lib/cookies';

export async function POST(_req: NextRequest) {
  try {
    await clearAttendeeSessionCookies();
    
    return NextResponse.json({ 
      success: true, 
      message: 'Attendee session cookies cleared' 
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to clear cookies' },
      { status: 500 }
    );
  }
}
