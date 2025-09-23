// lib/rate-limiter.ts
// Professional rate limiting system for API routes

import { NextRequest } from 'next/server';
import { rateLimit, RateLimitError } from './error-handling';

interface RateLimitConfig {
  limit: number;
  windowMs: number;
  message?: string;
}

// Default rate limit configurations
const RATE_LIMITS = {
  // General API routes
  general: { limit: 100, windowMs: 15 * 60 * 1000 }, // 100 requests per 15 minutes
  
  // Authentication routes
  auth: { limit: 10, windowMs: 15 * 60 * 1000 }, // 10 auth attempts per 15 minutes
  
  // Event creation
  eventCreation: { limit: 5, windowMs: 60 * 60 * 1000 }, // 5 events per hour
  
  // Voting/blocking
  voting: { limit: 50, windowMs: 60 * 1000 }, // 50 votes per minute
  
  // File uploads
  upload: { limit: 10, windowMs: 60 * 1000 }, // 10 uploads per minute
} as const;

export function getRateLimitConfig(route: keyof typeof RATE_LIMITS): RateLimitConfig {
  return RATE_LIMITS[route];
}

export function getClientIdentifier(req: NextRequest): string {
  // Try to get user ID from session first
  const userId = req.headers.get('x-user-id');
  if (userId) {
    return `user:${userId}`;
  }

  // Fall back to IP address
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
  return `ip:${ip}`;
}

export function checkRateLimit(
  req: NextRequest,
  config: RateLimitConfig,
  customIdentifier?: string
): void {
  const identifier = customIdentifier || getClientIdentifier(req);
  const isAllowed = rateLimit(identifier, config.limit, config.windowMs);

  if (!isAllowed) {
    throw new RateLimitError(
      config.message || `Rate limit exceeded. Maximum ${config.limit} requests per ${config.windowMs / 1000 / 60} minutes.`
    );
  }
}

// Middleware function for rate limiting
export function withRateLimit(
  config: RateLimitConfig,
  customIdentifier?: string
) {
  return function <T extends any[], R>(
    handler: (...args: T) => Promise<R>
  ) {
    return async (...args: T): Promise<R> => {
      // Extract NextRequest from args (assuming it's the first argument)
      const req = args[0] as NextRequest;
      
      if (req) {
        checkRateLimit(req, config, customIdentifier);
      }
      
      return handler(...args);
    };
  };
}

// Specific rate limiters for common use cases
export const rateLimiters = {
  general: withRateLimit(RATE_LIMITS.general),
  auth: withRateLimit(RATE_LIMITS.auth),
  eventCreation: withRateLimit(RATE_LIMITS.eventCreation),
  voting: withRateLimit(RATE_LIMITS.voting),
  upload: withRateLimit(RATE_LIMITS.upload),
};
