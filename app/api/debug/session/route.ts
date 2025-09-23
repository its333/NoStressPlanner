export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    const cookies = req.headers.get('cookie');
    const userAgent = req.headers.get('user-agent');
    const referer = req.headers.get('referer');
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');
    
    // Parse cookies for detailed analysis
    const cookieAnalysis = cookies ? cookies.split(';').map(c => {
      const [name, ...valueParts] = c.trim().split('=');
      const value = valueParts.join('=');
      return {
        name: name.trim(),
        value: value,
        isNextAuth: name.includes('next-auth') || name.includes('authjs'),
        isSessionToken: name.includes('session-token'),
        isCSRF: name.includes('csrf'),
        isCallback: name.includes('callback')
      };
    }) : [];
    
    const nextAuthCookies = cookieAnalysis.filter(c => c.isNextAuth);
    const sessionCookies = cookieAnalysis.filter(c => c.isSessionToken);
    
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      session: session ? {
        user: {
          id: session.user?.id,
          name: session.user?.name,
          email: session.user?.email,
          image: session.user?.image
        },
        expires: session.expires
      } : null,
      requestInfo: {
        cookies: cookies,
        userAgent: userAgent,
        referer: referer,
        origin: origin,
        host: host,
        url: req.url,
        method: req.method
      },
      cookieAnalysis: {
        total: cookieAnalysis.length,
        nextAuth: nextAuthCookies.length,
        sessionTokens: sessionCookies.length,
        allCookies: cookieAnalysis,
        nextAuthCookies: nextAuthCookies,
        sessionCookies: sessionCookies
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
        hasDiscordClientId: !!process.env.DISCORD_CLIENT_ID,
        hasDiscordClientSecret: !!process.env.DISCORD_CLIENT_SECRET,
        nextAuthUrl: process.env.NEXTAUTH_URL
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}
