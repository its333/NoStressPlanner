// lib/session-validation.ts
// Comprehensive session validation utilities

import { auth } from './auth';
import { NextRequest } from 'next/server';

export interface SessionValidationResult {
  isValid: boolean;
  userId?: string;
  error?: string;
  details?: Record<string, any>;
}

/**
 * Validate session with comprehensive error handling
 */
export async function validateSession(_req?: NextRequest): Promise<SessionValidationResult> {
  try {
    const session = await auth();
    
    if (!session) {
      return {
        isValid: false,
        error: 'No session found',
        details: { hasSession: false }
      };
    }

    if (!session.user) {
      return {
        isValid: false,
        error: 'Session has no user data',
        details: { hasSession: true, hasUser: false }
      };
    }

    if (!session.user.id) {
      return {
        isValid: false,
        error: 'User has no ID',
        details: { hasSession: true, hasUser: true, hasUserId: false }
      };
    }

    // Check session expiration
    if (session.expires && new Date() > new Date(session.expires)) {
      return {
        isValid: false,
        error: 'Session expired',
        details: { 
          hasSession: true, 
          hasUser: true, 
          hasUserId: true,
          expired: true,
          expires: session.expires
        }
      };
    }

    return {
      isValid: true,
      userId: session.user.id,
      details: {
        hasSession: true,
        hasUser: true,
        hasUserId: true,
        userName: session.user.name,
        userEmail: session.user.email,
        expires: session.expires
      }
    };

  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown validation error',
      details: { 
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined
      }
    };
  }
}

/**
 * Validate session and throw error if invalid
 */
export async function requireValidSession(_req?: NextRequest): Promise<string> {
  const validation = await validateSession(_req);
  
  if (!validation.isValid) {
    throw new Error(`Session validation failed: ${validation.error}`);
  }
  
  return validation.userId!;
}

/**
 * Check if session is valid without throwing
 */
export async function isSessionValid(_req?: NextRequest): Promise<boolean> {
  const validation = await validateSession(_req);
  return validation.isValid;
}
