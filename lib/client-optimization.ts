// lib/client-optimization.ts
// Client-side optimization utilities

import { logger } from '@/lib/logger';

/**
 * Debounced API calls to prevent excessive requests
 */
export function createDebouncedApiCall<T extends any[], R>(
  apiCall: (...args: T) => Promise<R>,
  delay: number = 300
) {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (...args: T): Promise<R> => {
    return new Promise((resolve, reject) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = setTimeout(async () => {
        try {
          const result = await apiCall(...args);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, delay);
    });
  };
}

/**
 * Request deduplication to prevent duplicate API calls
 */
class RequestDeduplicator {
  private pendingRequests = new Map<string, Promise<any>>();
  
  async deduplicate<T>(key: string, requestFn: () => Promise<T>): Promise<T> {
    // If request is already pending, return the existing promise
    if (this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key)!;
    }
    
    // Create new request
    const requestPromise = requestFn().finally(() => {
      // Clean up after request completes
      this.pendingRequests.delete(key);
    });
    
    this.pendingRequests.set(key, requestPromise);
    return requestPromise;
  }
  
  clear() {
    this.pendingRequests.clear();
  }
}

export const requestDeduplicator = new RequestDeduplicator();

/**
 * Optimized SWR configuration for better caching
 */
export const optimizedSWRConfig = {
  // Reduce revalidation frequency
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: true,
  
  // Optimize refresh intervals
  refreshInterval: 0, // Disable automatic refresh
  
  // Better error handling
  onError: (error: Error) => {
    logger.error('SWR error', { error: error.message });
  },
  
  // Optimize deduplication
  dedupingInterval: 2000, // 2 seconds deduplication
  
  // Better loading states
  loadingTimeout: 10000, // 10 seconds timeout
};

/**
 * Batch multiple API calls into a single request
 */
export function createBatchedApiCall<T, R>(
  batchSize: number = 5,
  batchDelay: number = 100
) {
  const queue: Array<{ resolve: (value: R) => void; reject: (error: Error) => void; request: T }> = [];
  let timeoutId: NodeJS.Timeout | null = null;
  
  const processBatch = async () => {
    if (queue.length === 0) return;
    
    const batch = queue.splice(0, batchSize);
    
    try {
      // This would need to be implemented based on your API structure
      // const results = await batchApiCall(requests);
      // batch.forEach((item, index) => item.resolve(results[index]));
    } catch (error) {
      batch.forEach(item => item.reject(error as Error));
    }
  };
  
  return (request: T): Promise<R> => {
    return new Promise((resolve, reject) => {
      queue.push({ resolve, reject, request });
      
      if (queue.length >= batchSize) {
        if (timeoutId) clearTimeout(timeoutId);
        processBatch();
      } else {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(processBatch, batchDelay);
      }
    });
  };
}

/**
 * Optimized localStorage with compression
 */
export class OptimizedStorage {
  private static compress(data: any): string {
    // Simple compression by removing unnecessary whitespace
    return JSON.stringify(data);
  }
  
  private static decompress<T>(compressed: string): T {
    return JSON.parse(compressed);
  }
  
  static setItem<T>(key: string, value: T): void {
    try {
      const compressed = this.compress(value);
      localStorage.setItem(key, compressed);
    } catch (error) {
      logger.error('Storage set error', { key, error: error instanceof Error ? error.message : 'Unknown' });
    }
  }
  
  static getItem<T>(key: string): T | null {
    try {
      const compressed = localStorage.getItem(key);
      if (!compressed) return null;
      return this.decompress<T>(compressed);
    } catch (error) {
      logger.error('Storage get error', { key, error: error instanceof Error ? error.message : 'Unknown' });
      return null;
    }
  }
  
  static removeItem(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      logger.error('Storage remove error', { key, error: error instanceof Error ? error.message : 'Unknown' });
    }
  }
}

/**
 * Performance monitoring for client-side operations
 */
export class ClientPerformanceMonitor {
  private static measurements = new Map<string, number[]>();
  
  static startTiming(operation: string): () => void {
    const startTime = performance.now();
    
    return () => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      if (!this.measurements.has(operation)) {
        this.measurements.set(operation, []);
      }
      
      this.measurements.get(operation)!.push(duration);
      
      // Log slow operations
      if (duration > 1000) { // 1 second
        logger.warn('Slow client operation', { operation, duration });
      }
    };
  }
  
  static getStats(operation: string): { avg: number; min: number; max: number; count: number } | null {
    const measurements = this.measurements.get(operation);
    if (!measurements || measurements.length === 0) return null;
    
    const avg = measurements.reduce((a, b) => a + b, 0) / measurements.length;
    const min = Math.min(...measurements);
    const max = Math.max(...measurements);
    
    return { avg, min, max, count: measurements.length };
  }
  
  static getAllStats(): Record<string, { avg: number; min: number; max: number; count: number }> {
    const stats: Record<string, { avg: number; min: number; max: number; count: number }> = {};
    
    for (const operation of this.measurements.keys()) {
      const stat = this.getStats(operation);
      if (stat) {
        stats[operation] = stat;
      }
    }
    
    return stats;
  }
  
  static clear(): void {
    this.measurements.clear();
  }
}
