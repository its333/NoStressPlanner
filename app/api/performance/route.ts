// app/api/performance/route.ts
// Performance metrics endpoint
export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { webVitalsService } from '@/lib/web-vitals';
import { networkRecoveryService } from '@/lib/network-recovery';
import { logger } from '@/lib/logger';
import { withApiKeyAuth } from '@/lib/auth-middleware';

export const GET = withApiKeyAuth(async (_req: NextRequest) => {
  try {
    const webVitals = webVitalsService.getWebVitalsMetrics();
    const performanceScore = webVitalsService.getPerformanceScore();
    const networkStatus = networkRecoveryService.getNetworkStatus();
    const offlineQueue = networkRecoveryService.getOfflineQueueStatus();

    const response = {
      webVitals,
      performanceScore,
      networkStatus,
      offlineQueue,
      timestamp: new Date().toISOString()
    };

    logger.debug('Performance metrics requested', {
      performanceScore,
      hasWebVitals: Object.keys(webVitals).length > 0,
      networkOnline: networkStatus.isOnline,
      offlineQueueSize: offlineQueue.size
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error('Performance metrics endpoint failed', { error });
    
    return NextResponse.json({
      error: 'Failed to retrieve performance metrics',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
});

export const POST = withApiKeyAuth(async (req: NextRequest) => {
  try {
    const data = await req.json();
    
    // Store client-side performance metrics
    logger.debug('Client performance metrics received', {
      metrics: data.metrics,
      page: data.page,
      userAgent: req.headers.get('user-agent')
    });

    // Here you would typically store the metrics in a database
    // or send them to an analytics service

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Failed to store performance metrics', { error });
    
    return NextResponse.json({
      error: 'Failed to store performance metrics'
    }, { status: 500 });
  }
});
