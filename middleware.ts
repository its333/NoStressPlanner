// middleware.ts
// Next.js middleware for security headers and request processing
import { NextRequest, NextResponse } from 'next/server';
import { securityService } from './lib/security';
import { logger } from './lib/logger';

export function middleware(request: NextRequest) {
  const startTime = Date.now();
  const clientIP = securityService.getClientIP(request);
  const userAgent = request.headers.get('user-agent') || '';
  
  // Log request
  logger.debug('Middleware processing request', {
    method: request.method,
    url: request.nextUrl.pathname,
    ip: clientIP,
    userAgent: userAgent.substring(0, 100)
  });

  // Check for suspicious requests
  if (securityService.isSuspiciousRequest(request)) {
    logger.warn('Blocking suspicious request', {
      ip: clientIP,
      userAgent: userAgent.substring(0, 100),
      url: request.nextUrl.pathname
    });
    
    return new NextResponse('Forbidden', { status: 403 });
  }

  // Rate limiting for API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const rateLimitKey = `${clientIP}:${request.nextUrl.pathname}`;
    
    if (!securityService.checkRateLimit(rateLimitKey, 100, 15 * 60 * 1000)) {
      logger.warn('Rate limit exceeded', {
        ip: clientIP,
        path: request.nextUrl.pathname
      });
      
      return new NextResponse('Too Many Requests', { 
        status: 429,
        headers: {
          'Retry-After': '900' // 15 minutes
        }
      });
    }
  }

  // Create response
  const response = NextResponse.next();

  // Add security headers
  const securityHeaders = securityService.getSecurityHeaders();
  Object.entries(securityHeaders).forEach(([key, value]) => {
    if (value) {
      response.headers.set(key, value);
    }
  });

  // Add custom headers
  response.headers.set('X-Request-ID', crypto.randomUUID());
  response.headers.set('X-Response-Time', `${Date.now() - startTime}ms`);

  // Log response
  logger.debug('Middleware completed', {
    method: request.method,
    url: request.nextUrl.pathname,
    ip: clientIP,
    responseTime: Date.now() - startTime
  });

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};
