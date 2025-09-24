import { NextResponse } from 'next/server';

import { securityService } from '@/lib/security';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const token = securityService.generateCSRFToken();
    
    return NextResponse.json({ 
      token,
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
