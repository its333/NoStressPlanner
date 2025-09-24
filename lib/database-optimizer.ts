// lib/database-optimizer.ts
// Professional database query optimization and analysis

import { logger } from './logger';
import { monitoringService } from './monitoring';
import { prisma } from './prisma';

export interface QueryMetrics {
  query: string;
  executionTime: number;
  timestamp: number;
  parameters?: any;
  error?: string;
}

export interface OptimizationSuggestion {
  type: 'index' | 'query' | 'relation' | 'cache';
  description: string;
  impact: 'low' | 'medium' | 'high';
  query?: string;
  suggestion: string;
}

class DatabaseOptimizer {
  private queryMetrics: QueryMetrics[] = [];
  private readonly MAX_METRICS = 1000;

  /**
   * Record query performance metrics
   */
  recordQueryMetrics(
    query: string,
    executionTime: number,
    parameters?: any,
    error?: string
  ): void {
    const metric: QueryMetrics = {
      query: this.sanitizeQuery(query),
      executionTime,
      timestamp: Date.now(),
      parameters,
      error,
    };

    this.queryMetrics.push(metric);

    // Keep only recent metrics
    if (this.queryMetrics.length > this.MAX_METRICS) {
      this.queryMetrics.splice(0, this.queryMetrics.length - this.MAX_METRICS);
    }

    // Record slow queries
    if (executionTime > 1000) {
      // > 1 second
      logger.warn('Slow query detected', {
        query: metric.query,
        executionTime,
        parameters,
      });
    }

    // Record to monitoring service
    monitoringService.recordMetric('db.query_time', executionTime, {
      query_type: this.getQueryType(query),
      slow_query: executionTime > 1000 ? 'true' : 'false',
    });
  }

  /**
   * Analyze query performance and suggest optimizations
   */
  analyzeQueryPerformance(): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];
    const slowQueries = this.queryMetrics.filter(m => m.executionTime > 500);
    const frequentQueries = this.getFrequentQueries();

    // Analyze slow queries
    for (const query of slowQueries) {
      const suggestionsForQuery = this.analyzeSlowQuery(query);
      suggestions.push(...suggestionsForQuery);
    }

    // Analyze frequent queries
    for (const [query, count] of frequentQueries) {
      if (count > 10) {
        // Query executed more than 10 times
        const suggestionsForQuery = this.analyzeFrequentQuery(query, count);
        suggestions.push(...suggestionsForQuery);
      }
    }

    // General database suggestions
    suggestions.push(...this.getGeneralSuggestions());

    return suggestions;
  }

  /**
   * Analyze slow query and suggest optimizations
   */
  private analyzeSlowQuery(query: QueryMetrics): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];
    const queryText = query.query.toLowerCase();

    // Check for missing indexes
    if (queryText.includes('where') && queryText.includes('=')) {
      suggestions.push({
        type: 'index',
        description: 'Consider adding an index for WHERE clause conditions',
        impact: 'high',
        query: query.query,
        suggestion: 'Add appropriate indexes for frequently queried columns',
      });
    }

    // Check for N+1 queries
    if (queryText.includes('select') && queryText.includes('where id in')) {
      suggestions.push({
        type: 'query',
        description: 'Potential N+1 query pattern detected',
        impact: 'high',
        query: query.query,
        suggestion:
          'Use include or findMany with proper relations to reduce queries',
      });
    }

    // Check for missing relations
    if (queryText.includes('join') && query.executionTime > 2000) {
      suggestions.push({
        type: 'relation',
        description: 'Complex JOIN query detected',
        impact: 'medium',
        query: query.query,
        suggestion: 'Consider denormalizing data or using Prisma relations',
      });
    }

    return suggestions;
  }

  /**
   * Analyze frequent queries
   */
  private analyzeFrequentQuery(
    query: string,
    count: number
  ): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    if (count > 50) {
      suggestions.push({
        type: 'cache',
        description: `Query executed ${count} times`,
        impact: 'high',
        query,
        suggestion: 'Consider implementing caching for this query',
      });
    }

    return suggestions;
  }

  /**
   * Get general database optimization suggestions
   */
  private getGeneralSuggestions(): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];

    // Check for connection pool optimization
    suggestions.push({
      type: 'query',
      description: 'Database connection optimization',
      impact: 'medium',
      suggestion:
        'Consider optimizing connection pool settings for better performance',
    });

    // Check for query batching
    suggestions.push({
      type: 'query',
      description: 'Query batching optimization',
      impact: 'medium',
      suggestion: 'Use Prisma transactions for multiple related operations',
    });

    return suggestions;
  }

  /**
   * Get frequent queries
   */
  private getFrequentQueries(): Map<string, number> {
    const queryCounts = new Map<string, number>();

    for (const metric of this.queryMetrics) {
      const count = queryCounts.get(metric.query) || 0;
      queryCounts.set(metric.query, count + 1);
    }

    return queryCounts;
  }

  /**
   * Sanitize query for logging
   */
  private sanitizeQuery(query: string): string {
    return query.replace(/\s+/g, ' ').replace(/\$\d+/g, '$?').trim();
  }

  /**
   * Get query type
   */
  private getQueryType(query: string): string {
    const queryLower = query.toLowerCase().trim();
    if (queryLower.startsWith('select')) return 'SELECT';
    if (queryLower.startsWith('insert')) return 'INSERT';
    if (queryLower.startsWith('update')) return 'UPDATE';
    if (queryLower.startsWith('delete')) return 'DELETE';
    return 'OTHER';
  }

  /**
   * Get query performance summary
   */
  getQueryPerformanceSummary(): Record<string, any> {
    const totalQueries = this.queryMetrics.length;
    const slowQueries = this.queryMetrics.filter(
      m => m.executionTime > 500
    ).length;
    const errorQueries = this.queryMetrics.filter(m => m.error).length;

    const avgExecutionTime =
      totalQueries > 0
        ? this.queryMetrics.reduce((sum, m) => sum + m.executionTime, 0) /
          totalQueries
        : 0;

    const maxExecutionTime =
      totalQueries > 0
        ? Math.max(...this.queryMetrics.map(m => m.executionTime))
        : 0;

    return {
      totalQueries,
      slowQueries,
      errorQueries,
      avgExecutionTime: Math.round(avgExecutionTime),
      maxExecutionTime,
      slowQueryPercentage:
        totalQueries > 0 ? Math.round((slowQueries / totalQueries) * 100) : 0,
    };
  }

  /**
   * Clear metrics (useful for testing)
   */
  clearMetrics(): void {
    this.queryMetrics = [];
  }
}

export const databaseOptimizer = new DatabaseOptimizer();

/**
 * Enhanced Prisma client with query monitoring
 */
export const optimizedPrisma = new Proxy(prisma, {
  get(target, prop) {
    const original = target[prop as keyof typeof target];

    if (typeof original === 'object' && original !== null) {
      return new Proxy(original, {
        get(modelTarget, modelProp) {
          const modelMethod =
            modelTarget[modelProp as keyof typeof modelTarget];

          if (typeof modelMethod === 'function') {
            return async (...args: any[]) => {
              const startTime = Date.now();
              const queryName = `${String(prop)}.${String(modelProp)}`;

              try {
                const result = await (
                  modelMethod as (...args: any[]) => Promise<any>
                ).apply(modelTarget, args);
                const executionTime = Date.now() - startTime;

                databaseOptimizer.recordQueryMetrics(
                  queryName,
                  executionTime,
                  args
                );

                return result;
              } catch (error) {
                const executionTime = Date.now() - startTime;

                databaseOptimizer.recordQueryMetrics(
                  queryName,
                  executionTime,
                  args,
                  error instanceof Error ? error.message : 'Unknown error'
                );

                throw error;
              }
            };
          }

          return modelMethod;
        },
      });
    }

    return original;
  },
});
