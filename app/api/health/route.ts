// app/api/health/route.ts
// Health check endpoint for monitoring
export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { monitoringService } from '@/lib/monitoring';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    const healthCheck = await monitoringService.performHealthCheck();
    
    const statusCode = healthCheck.status === 'healthy' ? 200 : 
                      healthCheck.status === 'degraded' ? 200 : 503;

    const response = {
      ...healthCheck,
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString()
    };

    logger.info('Health check requested', { 
      status: healthCheck.status,
      statusCode,
      ip: req.headers.get('x-forwarded-for') || 'unknown'
    });

    return NextResponse.json(response, { status: statusCode });
  } catch (error) {
    logger.error('Health check failed', { error });
    
    return NextResponse.json({
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    }, { status: 503 });
  }
}
