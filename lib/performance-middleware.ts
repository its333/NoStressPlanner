// lib/performance-middleware.ts
// Performance monitoring middleware for API routes

import { NextRequest } from 'next/server';

import { logger } from './logger';
import { monitoringService } from './monitoring';

export interface PerformanceContext {
  startTime: number;
  endpoint: string;
  method: string;
}

/**
 * Performance monitoring middleware
 */
export function withPerformanceMonitoring<T extends any[], R>(
  handler: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    const req = args[0] as NextRequest;
    const startTime = Date.now();

    const context: PerformanceContext = {
      startTime,
      endpoint: req.nextUrl.pathname,
      method: req.method,
    };

    try {
      const result = await handler(...args);

      // Record successful request
      const responseTime = Date.now() - startTime;
      monitoringService.recordApiPerformance(
        context.endpoint,
        context.method,
        responseTime,
        200
      );

      logger.debug('API request completed', {
        endpoint: context.endpoint,
        method: context.method,
        responseTime,
        statusCode: 200,
      });

      return result;
    } catch (error) {
      // Record failed request
      const responseTime = Date.now() - startTime;
      const statusCode = getStatusCodeFromError(error);

      monitoringService.recordApiPerformance(
        context.endpoint,
        context.method,
        responseTime,
        statusCode,
        error instanceof Error ? error.message : 'Unknown error'
      );

      logger.error('API request failed', {
        endpoint: context.endpoint,
        method: context.method,
        responseTime,
        statusCode,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  };
}

/**
 * Extract status code from error
 */
function getStatusCodeFromError(error: any): number {
  if (error?.status) return error.status;
  if (error?.statusCode) return error.statusCode;
  if (error?.code === 'P2002') return 409; // Prisma unique constraint
  if (error?.code === 'P2025') return 404; // Prisma not found
  return 500;
}

/**
 * Performance monitoring for specific API routes
 */
export function monitorApiRoute<T extends any[], R>(
  handler: (...args: T) => Promise<R>
) {
  return withPerformanceMonitoring(handler);
}
