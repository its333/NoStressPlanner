// app/api/cache/health/route.ts
// Cache health monitoring endpoint

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { checkCacheHealth, monitorCachePerformance } from '@/lib/cache-health';
import { auth } from '@/lib/auth';

export async function GET(_req: NextRequest) {
  try {
    // Only allow authenticated users to access cache health
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Check if user is admin (you might want to implement proper admin check)
    const isAdmin = session.user.email?.includes('admin') || process.env.NODE_ENV === 'development';
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    const health = await checkCacheHealth();
    
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      health,
      environment: process.env.NODE_ENV
    });

  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to check cache health',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function POST(_req: NextRequest) {
  try {
    // Only allow authenticated users to trigger cache monitoring
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Check if user is admin
    const isAdmin = session.user.email?.includes('admin') || process.env.NODE_ENV === 'development';
    if (!isAdmin) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Trigger cache performance monitoring
    await monitorCachePerformance();
    
    return NextResponse.json({ 
      message: 'Cache performance monitoring triggered',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to trigger cache monitoring',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
