// app/api/csrf-token/route.ts
// CSRF token endpoint
export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { generateCSRFToken } from '@/lib/csrf-protection';

export async function GET(req: NextRequest) {
  try {
    const token = await generateCSRFToken(req);
    
    return NextResponse.json({ 
      csrfToken: token,
      timestamp: Date.now()
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to generate CSRF token' },
      { status: 500 }
    );
  }
}
