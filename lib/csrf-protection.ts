// lib/csrf-protection.ts
// CSRF protection utilities for forms and API routes
import { NextRequest } from 'next/server';
import { securityService } from './security';
import { sessionManager } from './session-manager';

export interface CSRFFormData {
  csrfToken: string;
  [key: string]: any;
}

/**
 * Generate CSRF token for forms
 */
export async function generateCSRFToken(req?: NextRequest): Promise<string> {
  let sessionId: string | undefined;
  
  if (req) {
    const sessionInfo = await sessionManager.getSessionInfo(req);
    sessionId = sessionInfo.userId;
  }
  
  return securityService.generateCSRFToken(sessionId);
}

/**
 * Validate CSRF token from request
 */
export async function validateCSRFToken(req: NextRequest): Promise<boolean> {
  const sessionInfo = await sessionManager.getSessionInfo(req);
  const sessionId = sessionInfo.userId;
  
  // Try to get token from different sources
  let token: string | undefined;
  
  // From form data
  if (req.headers.get('content-type')?.includes('application/json')) {
    try {
      const body = await req.clone().json();
      token = body.csrfToken;
    } catch {
      // Ignore JSON parsing errors
    }
  }
  
  // From headers
  if (!token) {
    token = req.headers.get('x-csrf-token') || undefined;
  }
  
  // From query parameters (less secure, but sometimes needed)
  if (!token) {
    token = req.nextUrl.searchParams.get('csrfToken') || undefined;
  }
  
  if (!token) {
    return false;
  }
  
  return securityService.validateCSRFToken(token, sessionId);
}

/**
 * CSRF protection middleware for API routes
 */
export function withCSRFProtection<T extends any[], R>(
  handler: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    const req = args[0] as NextRequest;
    
    // Skip CSRF protection for GET requests
    if (req.method === 'GET') {
      return handler(...args);
    }
    
    // Skip CSRF protection for health checks and metrics
    if (req.nextUrl.pathname.startsWith('/api/health') || 
        req.nextUrl.pathname.startsWith('/api/metrics')) {
      return handler(...args);
    }
    
    const isValid = await validateCSRFToken(req);
    if (!isValid) {
      throw new Error('CSRF token validation failed');
    }
    
    return handler(...args);
  };
}

/**
 * Get CSRF token for client-side forms
 */
export async function getCSRFToken(): Promise<string> {
  const response = await fetch('/api/csrf-token', {
    method: 'GET',
    credentials: 'include'
  });
  
  if (!response.ok) {
    throw new Error('Failed to get CSRF token');
  }
  
  const data = await response.json();
  return data.csrfToken;
}
