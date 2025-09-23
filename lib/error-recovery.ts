// lib/error-recovery.ts
// Professional error recovery and retry mechanisms
import { logger } from './logger';
import { monitoringService } from './monitoring';

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryCondition?: (error: Error) => boolean;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
}

export interface RecoveryAction {
  type: 'retry' | 'fallback' | 'circuit-breaker' | 'graceful-degradation';
  description: string;
  action: () => Promise<any>;
}

class ErrorRecoveryService {
  private circuitBreakers = new Map<string, {
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    lastFailureTime: number;
    nextAttemptTime: number;
  }>();

  /**
   * Retry mechanism with exponential backoff
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig = {
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2
    }
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      try {
        const result = await operation();
        
        if (attempt > 1) {
          logger.info('Operation succeeded after retry', {
            attempt,
            maxAttempts: config.maxAttempts
          });
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Check if we should retry
        if (config.retryCondition && !config.retryCondition(lastError)) {
          throw lastError;
        }
        
        // Don't retry on the last attempt
        if (attempt === config.maxAttempts) {
          break;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1),
          config.maxDelay
        );
        
        logger.warn('Operation failed, retrying', {
          attempt,
          maxAttempts: config.maxAttempts,
          delay,
          error: lastError.message
        });
        
        await this.sleep(delay);
      }
    }
    
    logger.error('Operation failed after all retries', {
      maxAttempts: config.maxAttempts,
      error: lastError!.message
    });
    
    throw lastError!;
  }

  /**
   * Circuit breaker pattern implementation
   */
  async withCircuitBreaker<T>(
    operation: () => Promise<T>,
    key: string,
    config: CircuitBreakerConfig = {
      failureThreshold: 5,
      recoveryTimeout: 60000,
      monitoringPeriod: 300000
    }
  ): Promise<T> {
    const breaker = this.circuitBreakers.get(key) || {
      state: 'closed',
      failureCount: 0,
      lastFailureTime: 0,
      nextAttemptTime: 0
    };

    // Check if circuit breaker is open
    if (breaker.state === 'open') {
      if (Date.now() < breaker.nextAttemptTime) {
        throw new Error(`Circuit breaker is open for ${key}. Next attempt at ${new Date(breaker.nextAttemptTime).toISOString()}`);
      } else {
        // Move to half-open state
        breaker.state = 'half-open';
        logger.info('Circuit breaker moved to half-open state', { key });
      }
    }

    try {
      const result = await operation();
      
      // Reset circuit breaker on success
      if (breaker.state === 'half-open') {
        breaker.state = 'closed';
        breaker.failureCount = 0;
        logger.info('Circuit breaker reset to closed state', { key });
      }
      
      return result;
    } catch (error) {
      breaker.failureCount++;
      breaker.lastFailureTime = Date.now();
      
      // Check if we should open the circuit breaker
      if (breaker.failureCount >= config.failureThreshold) {
        breaker.state = 'open';
        breaker.nextAttemptTime = Date.now() + config.recoveryTimeout;
        
        logger.error('Circuit breaker opened', {
          key,
          failureCount: breaker.failureCount,
          threshold: config.failureThreshold,
          nextAttemptTime: new Date(breaker.nextAttemptTime).toISOString()
        });
        
        monitoringService.recordMetric('circuit_breaker.opened', 1, { key });
      }
      
      this.circuitBreakers.set(key, breaker);
      throw error;
    }
  }

  /**
   * Graceful degradation wrapper
   */
  async withGracefulDegradation<T>(
    primaryOperation: () => Promise<T>,
    fallbackOperation: () => Promise<T>,
    context: string
  ): Promise<T> {
    try {
      return await primaryOperation();
    } catch (error) {
      logger.warn('Primary operation failed, using fallback', {
        context,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      try {
        const fallbackResult = await fallbackOperation();
        
        logger.info('Fallback operation succeeded', { context });
        monitoringService.recordMetric('fallback.success', 1, { context });
        
        return fallbackResult;
      } catch (fallbackError) {
        logger.error('Both primary and fallback operations failed', {
          context,
          primaryError: error instanceof Error ? error.message : 'Unknown error',
          fallbackError: fallbackError instanceof Error ? fallbackError.message : 'Unknown error'
        });
        
        monitoringService.recordMetric('fallback.failure', 1, { context });
        throw fallbackError;
      }
    }
  }

  /**
   * Database connection recovery
   */
  async recoverDatabaseConnection(): Promise<boolean> {
    try {
      const { prisma } = await import('./prisma');
      await prisma.$queryRaw`SELECT 1`;
      
      logger.info('Database connection recovered');
      return true;
    } catch (error) {
      logger.error('Database connection recovery failed', { error });
      return false;
    }
  }

  /**
   * Redis connection recovery
   */
  async recoverRedisConnection(): Promise<boolean> {
    try {
      const { redisManager } = await import('./redis');
      await redisManager.ping();
      
      logger.info('Redis connection recovered');
      return true;
    } catch (error) {
      logger.error('Redis connection recovery failed', { error });
      return false;
    }
  }

  /**
   * Session recovery for JWT errors
   */
  async recoverSession(): Promise<boolean> {
    try {
      // Clear corrupted session cache
      const { sessionManager } = await import('./session-manager');
      sessionManager.clearCache();
      
      logger.info('Session cache cleared for recovery');
      return true;
    } catch (error) {
      logger.error('Session recovery failed', { error });
      return false;
    }
  }

  /**
   * Automatic recovery for common errors
   */
  async performAutomaticRecovery(error: Error): Promise<boolean> {
    const errorMessage = error.message.toLowerCase();
    
    // Database connection errors
    if (errorMessage.includes('database') || errorMessage.includes('connection')) {
      return await this.recoverDatabaseConnection();
    }
    
    // Redis connection errors
    if (errorMessage.includes('redis') || errorMessage.includes('cache')) {
      return await this.recoverRedisConnection();
    }
    
    // JWT session errors
    if (errorMessage.includes('jwt') || errorMessage.includes('session')) {
      return await this.recoverSession();
    }
    
    return false;
  }

  /**
   * Get circuit breaker status
   */
  getCircuitBreakerStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    
    for (const [key, breaker] of this.circuitBreakers.entries()) {
      status[key] = {
        state: breaker.state,
        failureCount: breaker.failureCount,
        lastFailureTime: breaker.lastFailureTime,
        nextAttemptTime: breaker.nextAttemptTime,
        isOpen: breaker.state === 'open',
        canAttempt: Date.now() >= breaker.nextAttemptTime
      };
    }
    
    return status;
  }

  /**
   * Reset circuit breaker
   */
  resetCircuitBreaker(key: string): void {
    this.circuitBreakers.delete(key);
    logger.info('Circuit breaker reset', { key });
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const errorRecoveryService = new ErrorRecoveryService();

/**
 * Higher-order function for automatic error recovery
 */
export function withAutomaticRecovery<T extends any[], R>(
  handler: (...args: T) => Promise<R>,
  context: string
) {
  return async (...args: T): Promise<R> => {
    try {
      return await handler(...args);
    } catch (error) {
      logger.error('Handler failed, attempting automatic recovery', {
        context,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      const recovered = await errorRecoveryService.performAutomaticRecovery(error as Error);
      
      if (recovered) {
        logger.info('Automatic recovery successful, retrying operation', { context });
        return await handler(...args);
      }
      
      throw error;
    }
  };
}
