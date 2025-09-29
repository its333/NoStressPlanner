// lib/security.ts
// Professional security utilities and middleware

import crypto from 'crypto';

import { NextRequest } from 'next/server';

import { logger } from './logger';

export interface SecurityHeaders {
  'Content-Security-Policy': string;
  'X-Frame-Options': string;
  'X-Content-Type-Options': string;
  'Referrer-Policy': string;
  'Permissions-Policy': string;
  'Strict-Transport-Security': string;
  'X-XSS-Protection': string;
}

class SecurityService {
  private readonly CSRF_TOKEN_EXPIRY = 60 * 60 * 1000; // 1 hour

  /**
   * Generate security headers for responses
   */
  getSecurityHeaders(): SecurityHeaders {
    const isProduction = process.env.NODE_ENV === 'production';

    return {
      'Content-Security-Policy': this.getCSP(),
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Strict-Transport-Security': isProduction
        ? 'max-age=31536000; includeSubDomains'
        : '',
      'X-XSS-Protection': '1; mode=block',
    };
  }

  /**
   * Get Content Security Policy
   */
  private getCSP(): string {
    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

    const directives = [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.pusher.com`,
      `style-src 'self' 'unsafe-inline'`,
      `img-src 'self' data: https:`,
      `font-src 'self' data:`,
      `connect-src 'self' ${baseUrl} https://api.pusherapp.com wss://ws.pusherapp.com wss://ws-us2.pusherapp.com wss://ws-us2.pusher.com`,
      `frame-src 'none'`,
      `object-src 'none'`,
      `base-uri 'self'`,
      `form-action 'self'`,
      `frame-ancestors 'none'`,
    ];

    return directives.join('; ');
  }

  /**
   * Generate CSRF token (stateless approach for serverless)
   */
  generateCSRFToken(sessionId?: string): string {
    const timestamp = Date.now();
    const randomPart = crypto.randomBytes(16).toString('hex');

    // Create a stateless token that includes timestamp and session info
    const tokenData = {
      sessionId: sessionId || 'anonymous',
      timestamp,
      random: randomPart,
    };

    // Create HMAC signature for validation
    const secret = process.env.NEXTAUTH_SECRET || 'fallback-secret';
    const signature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(tokenData))
      .digest('hex');

    const token = Buffer.from(
      JSON.stringify({ ...tokenData, signature })
    ).toString('base64');

    logger.debug('CSRF token generated', {
      token: token.substring(0, 20) + '...',
      sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'anonymous',
      timestamp,
    });

    return token;
  }

  /**
   * Validate CSRF token (stateless approach for serverless)
   */
  validateCSRFToken(token: string, sessionId?: string): boolean {
    if (!token) {
      logger.warn('CSRF validation failed: no token provided');
      return false;
    }

    try {
      // Decode the token
      const tokenData = JSON.parse(Buffer.from(token, 'base64').toString());

      // Check if token is expired (1 hour)
      const now = Date.now();
      const tokenAge = now - tokenData.timestamp;
      if (tokenAge > this.CSRF_TOKEN_EXPIRY) {
        logger.warn('CSRF validation failed: token expired', {
          tokenAge,
          maxAge: this.CSRF_TOKEN_EXPIRY,
        });
        return false;
      }

      // Verify signature
      const secret = process.env.NEXTAUTH_SECRET || 'fallback-secret';
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(
          JSON.stringify({
            sessionId: tokenData.sessionId,
            timestamp: tokenData.timestamp,
            random: tokenData.random,
          })
        )
        .digest('hex');

      if (tokenData.signature !== expectedSignature) {
        logger.warn('CSRF validation failed: invalid signature');
        return false;
      }

      // Verify session ID matches (if provided)
      // Allow 'anonymous' tokens to work for authenticated users (more lenient)
      if (sessionId && tokenData.sessionId !== sessionId) {
        // If user is authenticated but token was generated for anonymous, allow it
        if (sessionId !== 'anonymous' && tokenData.sessionId === 'anonymous') {
          logger.debug(
            'CSRF validation: allowing anonymous token for authenticated user',
            {
              userId: sessionId.substring(0, 8) + '...',
            }
          );
        } else {
          logger.warn('CSRF validation failed: session ID mismatch', {
            expected: sessionId.substring(0, 8) + '...',
            actual: tokenData.sessionId.substring(0, 8) + '...',
          });
          return false;
        }
      }

      logger.debug('CSRF token validated successfully', {
        sessionId: tokenData.sessionId.substring(0, 8) + '...',
        tokenAge: tokenAge + 'ms',
      });

      return true;
    } catch (error) {
      logger.warn('CSRF validation failed: token parsing error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Rate limiting implementation
   */
  private rateLimitMap = new Map<
    string,
    { count: number; resetTime: number }
  >();

  checkRateLimit(
    identifier: string,
    limit: number = 100,
    windowMs: number = 15 * 60 * 1000
  ): boolean {
    const now = Date.now();
    const key = identifier;
    const current = this.rateLimitMap.get(key);

    if (!current || now > current.resetTime) {
      this.rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (current.count >= limit) {
      logger.warn('Rate limit exceeded', {
        identifier,
        count: current.count,
        limit,
      });
      return false;
    }

    current.count++;
    return true;
  }

  /**
   * Input sanitization
   */
  sanitizeInput(input: string): string {
    return input
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+=/gi, '') // Remove event handlers
      .trim();
  }

  /**
   * Validate email format
   */
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate URL format
   */
  validateUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get client IP address
   */
  getClientIP(req: NextRequest): string {
    const forwarded = req.headers.get('x-forwarded-for');
    const realIP = req.headers.get('x-real-ip');
    const cfConnectingIP = req.headers.get('cf-connecting-ip');

    if (cfConnectingIP) return cfConnectingIP;
    if (realIP) return realIP;
    if (forwarded) return forwarded.split(',')[0].trim();

    return 'unknown';
  }

  /**
   * Check if request is from a suspicious source
   */
  isSuspiciousRequest(req: NextRequest): boolean {
    const userAgent = req.headers.get('user-agent') || '';
    const ip = this.getClientIP(req);

    // Check for common bot patterns
    const botPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /curl/i,
      /wget/i,
    ];

    const isBot = botPatterns.some(pattern => pattern.test(userAgent));

    // Check for suspicious IP patterns (simplified)
    const suspiciousIPs = [
      '127.0.0.1', // Localhost (might be suspicious in production)
      '0.0.0.0',
    ];

    const isSuspiciousIP = suspiciousIPs.includes(ip);

    if (isBot || isSuspiciousIP) {
      logger.warn('Suspicious request detected', {
        ip,
        userAgent: userAgent.substring(0, 100),
        isBot,
        isSuspiciousIP,
      });
    }

    return isBot || isSuspiciousIP;
  }
}

export const securityService = new SecurityService();
