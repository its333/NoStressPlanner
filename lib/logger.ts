// lib/logger.ts
// Professional logging system for production applications

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, any>;
  userId?: string;
  requestId?: string;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  private isProduction = process.env.NODE_ENV === 'production';

  private formatLog(level: LogLevel, message: string, context?: Record<string, any>): LogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: context ? this.sanitizeContext(context) : undefined,
    };
  }

  private sanitizeContext(context: Record<string, any>): Record<string, any> {
    const sanitized: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(context)) {
      // Remove sensitive data
      if (key.toLowerCase().includes('password') || 
          key.toLowerCase().includes('secret') ||
          key.toLowerCase().includes('token')) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }
    
    return sanitized;
  }

  private output(entry: LogEntry): void {
    if (this.isDevelopment) {
      // Development: Pretty console output
      const emoji = {
        debug: '🐛',
        info: 'ℹ️',
        warn: '⚠️',
        error: '❌',
      }[entry.level];

      console.log(
        `${emoji} [${entry.level.toUpperCase()}] ${entry.message}`,
        entry.context ? entry.context : ''
      );
    } else if (this.isProduction) {
      // Production: Structured JSON logging
      console.log(JSON.stringify(entry));
      
      // In production, you would send to your logging service:
      // await this.sendToLoggingService(entry);
    }
  }

  debug(message: string, context?: Record<string, any>): void {
    if (this.isDevelopment) {
      this.output(this.formatLog('debug', message, context));
    }
  }

  info(message: string, context?: Record<string, any>): void {
    this.output(this.formatLog('info', message, context));
  }

  warn(message: string, context?: Record<string, any>): void {
    this.output(this.formatLog('warn', message, context));
  }

  error(message: string, context?: Record<string, any>): void {
    this.output(this.formatLog('error', message, context));
  }

  // Authentication-specific logging
  auth(message: string, context?: Record<string, any>): void {
    this.info(`[AUTH] ${message}`, context);
  }

  // API-specific logging
  api(message: string, context?: Record<string, any>): void {
    this.info(`[API] ${message}`, context);
  }

  // Database-specific logging
  db(message: string, context?: Record<string, any>): void {
    this.info(`[DB] ${message}`, context);
  }

  // Performance logging
  performance(message: string, context?: Record<string, any>): void {
    this.info(`[PERF] ${message}`, context);
  }
}

// Export singleton instance
export const logger = new Logger();

// Export types for use in other files
export type { LogLevel, LogEntry };
