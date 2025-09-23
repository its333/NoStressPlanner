// app/api/performance/monitor/route.ts
// Performance monitoring endpoint

export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getCacheHealth } from '@/lib/intelligent-cache';
import { logger } from '@/lib/logger';

export async function GET(_req: NextRequest) {
  try {
    const cacheHealth = getCacheHealth();
    
    // Get memory usage
    const memoryUsage = process.memoryUsage();
    
    // Get uptime
    const uptime = process.uptime();
    
    const performanceReport = {
      timestamp: new Date().toISOString(),
      cache: cacheHealth,
      memory: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        external: Math.round(memoryUsage.external / 1024 / 1024), // MB
      },
      uptime: Math.round(uptime), // seconds
      nodeVersion: process.version,
      platform: process.platform,
    };
    
    logger.debug('Performance report generated', {
      cacheHitRate: Object.values(cacheHealth).reduce((acc, cache) => acc + cache.stats.hitRate, 0) / Object.keys(cacheHealth).length,
      memoryUsage: performanceReport.memory.heapUsed
    });
    
    return NextResponse.json(performanceReport);
  } catch (error) {
    logger.error('Performance monitoring failed', { error });
    return NextResponse.json(
      { error: 'Failed to generate performance report' },
      { status: 500 }
    );
  }
}
