// lib/error-handling.ts
// Centralized error handling system for API routes

import { NextRequest } from 'next/server';
import { ZodError } from 'zod';

// Custom error classes for different error types
export class ValidationError extends Error {
  constructor(message: string, public details?: any) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(resource: string) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message: string = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends Error {
  constructor(message: string = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Error response interface
interface ErrorResponse {
  error: string;
  details?: any;
  timestamp: string;
  path?: string;
}

// Centralized error handler
export function handleNextApiError(error: Error, req?: NextRequest): { status: number; body: ErrorResponse } {
  const timestamp = new Date().toISOString();
  const path = req?.nextUrl.pathname;

  // Log error for monitoring (in production, use proper logging service)
  console.error(`[${timestamp}] API Error:`, {
    name: error.name,
    message: error.message,
    path,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
  });

  // Handle different error types
  if (error instanceof ValidationError) {
    return {
      status: 400,
      body: {
        error: 'Validation failed',
        details: error.details,
        timestamp,
        path,
      },
    };
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: 'Invalid input data',
        details: error.flatten(),
        timestamp,
        path,
      },
    };
  }

  if (error instanceof NotFoundError) {
    return {
      status: 404,
      body: {
        error: error.message,
        timestamp,
        path,
      },
    };
  }

  if (error instanceof UnauthorizedError) {
    return {
      status: 401,
      body: {
        error: error.message,
        timestamp,
        path,
      },
    };
  }

  if (error instanceof ConflictError) {
    return {
      status: 409,
      body: {
        error: error.message,
        timestamp,
        path,
      },
    };
  }

  if (error instanceof RateLimitError) {
    return {
      status: 429,
      body: {
        error: error.message,
        timestamp,
        path,
      },
    };
  }

  // Handle Prisma errors
  if (error.name === 'PrismaClientKnownRequestError') {
    const prismaError = error as any;
    
    switch (prismaError.code) {
      case 'P2002':
        return {
          status: 409,
          body: {
            error: 'Resource already exists',
            timestamp,
            path,
          },
        };
      case 'P2025':
        return {
          status: 404,
          body: {
            error: 'Resource not found',
            timestamp,
            path,
          },
        };
      default:
        return {
          status: 500,
          body: {
            error: 'Database error',
            timestamp,
            path,
          },
        };
    }
  }

  // Default server error - NEVER expose internal error details
  return {
    status: 500,
    body: {
      error: 'Internal server error',
      timestamp,
      path,
    },
  };
}

// Higher-order function for error handling
export function withErrorHandling<T extends any[], R>(
  handler: (...args: T) => Promise<R>
) {
  return async (...args: T): Promise<R> => {
    try {
      return await handler(...args);
    } catch (error) {
      const { status, body } = handleNextApiError(error as Error);
      throw new Error(JSON.stringify({ status, body }));
    }
  };
}

// Rate limiting utility
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function rateLimit(
  identifier: string,
  limit: number = 100,
  windowMs: number = 15 * 60 * 1000 // 15 minutes
): boolean {
  const now = Date.now();
  const key = identifier;
  const current = rateLimitMap.get(key);

  if (!current || now > current.resetTime) {
    rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (current.count >= limit) {
    return false;
  }

  current.count++;
  return true;
}

// Input sanitization
export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    return input.trim();
  }
  
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  
  if (input && typeof input === 'object') {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }
  
  return input;
}
