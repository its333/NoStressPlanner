// app/api/debug/browser-session/route.ts
// Debug endpoint to create browser-specific session identifiers

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: NextRequest) {
  try {
    const { browserId } = await req.json();
    
    if (!browserId) {
      return NextResponse.json({ error: 'browserId is required' }, { status: 400 });
    }
    
    const cookieStore = await cookies();
    
    // Set a browser-specific session identifier
    cookieStore.set('browser-session-id', browserId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
      domain: process.env.NODE_ENV === 'development' ? 'localhost' : undefined
    });
    
    const result = {
      timestamp: new Date().toISOString(),
      browserId,
      message: 'Browser session ID set successfully'
    };
    
    console.log('🔍 Browser session ID set:', result);
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Error setting browser session ID:', error);
    return NextResponse.json({ error: 'Failed to set browser session ID' }, { status: 500 });
  }
}

export async function GET(_req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const browserSessionId = cookieStore.get('browser-session-id')?.value;
    
    const result = {
      timestamp: new Date().toISOString(),
      browserSessionId: browserSessionId || null,
      message: browserSessionId ? 'Browser session ID found' : 'No browser session ID'
    };
    
    console.log('🔍 Browser session ID check:', result);
    
    return NextResponse.json(result);
    
  } catch (error) {
    console.error('Error getting browser session ID:', error);
    return NextResponse.json({ error: 'Failed to get browser session ID' }, { status: 500 });
  }
}
