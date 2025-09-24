import { NextRequest, NextResponse } from 'next/server';

import { securityService } from '@/lib/security';
import { sessionManager } from '@/lib/session-manager';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    // Get the user's session ID for proper CSRF token generation
    const sessionInfo = await sessionManager.getSessionInfo(req);
    const sessionId = sessionInfo.userId || 'anonymous';
    
    console.log('CSRF token generation:', {
      sessionId: sessionId.substring(0, 8) + '...',
      userId: sessionInfo.userId?.substring(0, 8) + '...',
      isAuthenticated: !!sessionInfo.userId
    });
    
    const token = securityService.generateCSRFToken(sessionId);
    
    return NextResponse.json({ 
      csrfToken: token,
      success: true 
    });
  } catch (error) {
    console.error('Error generating CSRF token:', error);
    return NextResponse.json(
      { error: 'Failed to generate CSRF token' },
      { status: 500 }
    );
  }
}
