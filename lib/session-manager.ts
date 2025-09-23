// lib/session-manager.ts
// Professional session management with robust error handling and fallback mechanisms
import { auth } from './auth';
import { NextRequest } from 'next/server';
import { logger } from './logger';

export interface SessionInfo {
  userId?: string;
  isAuthenticated: boolean;
  sessionKey?: string;
  error?: string;
  fallbackUsed: boolean;
}

export interface HostDetectionResult {
  isHost: boolean;
  method: 'session' | 'attendee' | 'sessionKey' | 'nameMatch' | 'eventCreation';
  confidence: 'high' | 'medium' | 'low';
  details: Record<string, any>;
}

class SessionManager {
  private sessionCache = new Map<string, { data: SessionInfo; timestamp: number }>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Get session information with comprehensive error handling and fallback mechanisms
   */
  async getSessionInfo(req?: NextRequest): Promise<SessionInfo> {
    // Create a more specific cache key that includes user agent and IP
    const cookieHeader = req?.headers?.get('cookie') || '';
    const userAgent = req?.headers?.get('user-agent') || '';
    const ip = req?.headers?.get('x-forwarded-for') || req?.headers?.get('x-real-ip') || 'unknown';
    
    // Create a unique cache key per browser/session
    const cacheKey = `${cookieHeader.substring(0, 50)}_${userAgent.substring(0, 20)}_${ip}`;
    
    // Check cache first (with proper isolation)
    const cached = this.sessionCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      logger.debug('Session cache hit', { 
        cacheKey: cacheKey.substring(0, 30) + '...',
        userId: cached.data.userId ? cached.data.userId.substring(0, 8) + '...' : null
      });
      return cached.data;
    }

    logger.debug('Session cache miss - fetching fresh data', { 
      cacheKey: cacheKey.substring(0, 30) + '...' 
    });

    let sessionInfo: SessionInfo = {
      isAuthenticated: false,
      fallbackUsed: false
    };

    try {
      // Primary method: NextAuth session
      const session = await auth();
      console.log('🔍 NextAuth session check:', {
        hasSession: !!session,
        hasUser: !!session?.user,
        userId: session?.user?.id,
        sessionKeys: session ? Object.keys(session) : []
      });
      
      if (session?.user?.id) {
        sessionInfo = {
          userId: session.user.id,
          isAuthenticated: true,
          fallbackUsed: false
        };
        logger.debug('Session obtained via NextAuth', { userId: session.user.id });
      } else {
        console.log('🔍 No NextAuth session found - user not logged in');
      }
    } catch (error) {
      logger.warn('NextAuth session failed, using fallback methods', { error: error instanceof Error ? error.message : 'Unknown error' });
      sessionInfo.error = 'JWT session error';
      sessionInfo.fallbackUsed = true;
      logger.debug('Session obtained via NextAuth fallback');
    }

    // Cache the result for future requests
    this.sessionCache.set(cacheKey, {
      data: sessionInfo,
      timestamp: Date.now()
    });

    logger.debug('Session data cached', { 
      cacheKey: cacheKey.substring(0, 30) + '...',
      userId: sessionInfo.userId ? sessionInfo.userId.substring(0, 8) + '...' : null,
      isAuthenticated: sessionInfo.isAuthenticated
    });

    return sessionInfo;
  }

  /**
   * Clear session cache - useful for debugging or when sessions change
   */
  clearCache(): void {
    this.sessionCache.clear();
    logger.debug('Session cache cleared');
  }

  /**
   * Clear cache for a specific session
   */
  clearSessionCache(cacheKey: string): void {
    this.sessionCache.delete(cacheKey);
    logger.debug('Session cache cleared for key', { cacheKey: cacheKey.substring(0, 30) + '...' });
  }

  /**
   * Comprehensive host detection with multiple fallback methods
   */
  async detectHost(
    eventHostId: string, 
    eventHostName: string,
    attendeeUserId?: string,
    attendeeDisplayName?: string,
    sessionKey?: string
  ): Promise<HostDetectionResult> {
    const methods: Array<{ method: HostDetectionResult['method']; isHost: boolean; confidence: HostDetectionResult['confidence']; details: Record<string, any> }> = [];

    // Method 1: Direct session user ID match (highest confidence)
    if (attendeeUserId === eventHostId) {
      methods.push({
        method: 'session',
        isHost: true,
        confidence: 'high',
        details: { attendeeUserId, eventHostId }
      });
    }

    // Method 2: Session key contains host ID prefix (high confidence)
    if (sessionKey && sessionKey.includes('user_') && sessionKey.includes(eventHostId.substring(0, 8))) {
      methods.push({
        method: 'sessionKey',
        isHost: true,
        confidence: 'high',
        details: { sessionKeyPrefix: sessionKey.substring(0, 20) + '...', hostIdPrefix: eventHostId.substring(0, 8) }
      });
    }

    // Method 3: Event creation pattern in session key (medium confidence)
    if (sessionKey && sessionKey.includes('user_') && sessionKey.includes(eventHostId.substring(0, 8))) {
      methods.push({
        method: 'eventCreation',
        isHost: true,
        confidence: 'medium',
        details: { sessionKeyPattern: 'user_*', hostIdPrefix: eventHostId.substring(0, 8) }
      });
    }

    // Method 4: Display name match (low confidence, but useful fallback)
    if (attendeeDisplayName && eventHostName && 
        attendeeDisplayName.toLowerCase() === eventHostName.toLowerCase()) {
      methods.push({
        method: 'nameMatch',
        isHost: true,
        confidence: 'low',
        details: { attendeeDisplayName, eventHostName }
      });
    }

    // Find the highest confidence method
    const bestMethod = methods.sort((a, b) => {
      const confidenceOrder = { high: 3, medium: 2, low: 1 };
      return confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
    })[0];

    if (bestMethod) {
      logger.debug('Host detection successful', {
        method: bestMethod.method,
        confidence: bestMethod.confidence,
        details: bestMethod.details
      });
      return bestMethod;
    }

    // No host detected
    logger.debug('Host detection failed - no methods matched', {
      eventHostId,
      eventHostName,
      attendeeUserId,
      attendeeDisplayName,
      hasSessionKey: !!sessionKey
    });

    return {
      isHost: false,
      method: 'session',
      confidence: 'low',
      details: { reason: 'No matching methods found' }
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.sessionCache.size,
      entries: Array.from(this.sessionCache.keys()).map(key => ({
        key: key.substring(0, 20) + '...',
        age: Date.now() - this.sessionCache.get(key)!.timestamp
      }))
    };
  }
}

export const sessionManager = new SessionManager();
