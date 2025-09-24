// lib/auth-middleware.ts
// Enhanced authorization middleware

import { NextRequest } from 'next/server';

import { logger } from './logger';
import { sessionManager } from './session-manager';

export interface AuthContext {
  userId?: string;
  isAuthenticated: boolean;
  sessionKey?: string;
  fallbackUsed: boolean;
}

export interface HostContext extends AuthContext {
  isHost: boolean;
  hostDetectionMethod: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Enhanced authorization middleware
 */
export function withAuth<T extends any[], R>(
  handler: (context: AuthContext, ...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    const req = args[0] as NextRequest;

    const sessionInfo = await sessionManager.getSessionInfo(req);

    if (!sessionInfo.isAuthenticated) {
      logger.warn('Unauthorized access attempt', {
        path: req.nextUrl.pathname,
        method: req.method,
        ip: req.headers.get('x-forwarded-for') || 'unknown',
      });

      throw new Error('Authentication required');
    }

    return handler(sessionInfo, ...args);
  };
}

/**
 * Host-only authorization middleware
 */
export function withHostAuth<T extends any[], R>(
  handler: (context: HostContext, ...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    const req = args[0] as NextRequest;

    const sessionInfo = await sessionManager.getSessionInfo(req);

    if (!sessionInfo.isAuthenticated) {
      logger.warn('Unauthorized host access attempt', {
        path: req.nextUrl.pathname,
        method: req.method,
        ip: req.headers.get('x-forwarded-for') || 'unknown',
      });

      throw new Error('Authentication required');
    }

    // Get event information to check host status
    const token = req.nextUrl.pathname.split('/')[3]; // Extract token from path
    if (!token) {
      throw new Error('Event token required');
    }

    // Get event details
    const { prisma } = await import('./prisma');
    const invite = await prisma.inviteToken.findUnique({
      where: { token },
      include: {
        event: {
          include: {
            host: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!invite?.event) {
      throw new Error('Event not found');
    }

    // Use host detection
    const hostDetection = await sessionManager.detectHost(
      invite.event.host.id,
      invite.event.host.name || '',
      sessionInfo.userId,
      undefined,
      sessionInfo.sessionKey
    );

    if (!hostDetection.isHost) {
      logger.warn('Non-host attempting host action', {
        path: req.nextUrl.pathname,
        method: req.method,
        userId: sessionInfo.userId,
        eventId: invite.event.id,
        hostId: invite.event.host.id,
        ip: req.headers.get('x-forwarded-for') || 'unknown',
      });

      throw new Error('Host authorization required');
    }

    const hostContext: HostContext = {
      ...sessionInfo,
      isHost: true,
      hostDetectionMethod: hostDetection.method,
      confidence: hostDetection.confidence,
    };

    logger.debug('Host authorization granted', {
      userId: sessionInfo.userId,
      eventId: invite.event.id,
      method: hostDetection.method,
      confidence: hostDetection.confidence,
    });

    return handler(hostContext, ...args);
  };
}

/**
 * Role-based authorization
 */
export function withRoleAuth<T extends any[], R>(
  requiredRoles: string[],
  handler: (
    context: AuthContext & { roles: string[] },
    ...args: T
  ) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    const req = args[0] as NextRequest;

    const sessionInfo = await sessionManager.getSessionInfo(req);

    if (!sessionInfo.isAuthenticated) {
      throw new Error('Authentication required');
    }

    // For now, we'll implement a simple role system
    // In a more complex system, you'd check roles from the database
    const userRoles = ['user']; // Default role

    if (sessionInfo.userId) {
      // Check if user has admin privileges (simplified)
      const { prisma } = await import('./prisma');
      const user = await prisma.user.findUnique({
        where: { id: sessionInfo.userId },
        select: { email: true },
      });

      // Simple admin check based on email domain
      if (user?.email?.endsWith('@admin.com')) {
        userRoles.push('admin');
      }
    }

    const hasRequiredRole = requiredRoles.some(role =>
      userRoles.includes(role)
    );

    if (!hasRequiredRole) {
      logger.warn('Insufficient role permissions', {
        userId: sessionInfo.userId,
        requiredRoles,
        userRoles,
        path: req.nextUrl.pathname,
      });

      throw new Error('Insufficient permissions');
    }

    return handler({ ...sessionInfo, roles: userRoles }, ...args);
  };
}

/**
 * API key authentication for monitoring endpoints
 */
export function withApiKeyAuth<T extends any[], R>(
  handler: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    const req = args[0] as NextRequest;

    const authHeader = req.headers.get('authorization');
    const expectedKey = process.env.METRICS_API_KEY;

    if (!expectedKey) {
      throw new Error('API key authentication not configured');
    }

    if (!authHeader || authHeader !== `Bearer ${expectedKey}`) {
      logger.warn('Invalid API key attempt', {
        ip: req.headers.get('x-forwarded-for') || 'unknown',
        userAgent: req.headers.get('user-agent') || 'unknown',
        path: req.nextUrl.pathname,
      });

      throw new Error('Invalid API key');
    }

    return handler(...args);
  };
}
