// app/api/metrics/route.ts
// Metrics endpoint for monitoring
export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { monitoringService } from '@/lib/monitoring';
import { logger } from '@/lib/logger';
import { withApiKeyAuth } from '@/lib/auth-middleware';

export const GET = withApiKeyAuth(async (req: NextRequest) => {
  try {
    const metrics = monitoringService.getMetricsSummary();
    const performanceHistory = monitoringService.getPerformanceHistory();
    const uptime = monitoringService.getUptime();

    const response = {
      metrics,
      performance: {
        history: performanceHistory.slice(-10), // Last 10 records
        uptime: uptime,
        uptimeFormatted: formatUptime(uptime)
      },
      timestamp: new Date().toISOString()
    };

    logger.debug('Metrics requested', {
      metricsCount: Object.keys(metrics).length,
      ip: req.headers.get('x-forwarded-for') || 'unknown'
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error('Metrics endpoint failed', { error });
    
    return NextResponse.json({
      error: 'Failed to retrieve metrics',
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
});

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}
