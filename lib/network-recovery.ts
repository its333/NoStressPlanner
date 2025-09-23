// lib/network-recovery.ts
// Network error recovery and offline handling
import { logger } from './logger';
import { monitoringService } from './monitoring';

export interface NetworkStatus {
  isOnline: boolean;
  isSlowConnection: boolean;
  connectionType?: string;
  lastChecked: number;
}

export interface OfflineQueueItem {
  id: string;
  operation: () => Promise<any>;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

class NetworkRecoveryService {
  private networkStatus: NetworkStatus = {
    isOnline: navigator.onLine,
    isSlowConnection: false,
    lastChecked: Date.now()
  };

  private offlineQueue: OfflineQueueItem[] = [];
  private syncInterval: NodeJS.Timeout | null = null;
  private readonly MAX_QUEUE_SIZE = 100;
  private readonly SYNC_INTERVAL = 30000; // 30 seconds

  constructor() {
    if (typeof window !== 'undefined') {
      this.setupNetworkListeners();
      this.startSyncProcess();
    }
  }

  /**
   * Setup network status listeners
   */
  private setupNetworkListeners(): void {
    window.addEventListener('online', () => {
      this.networkStatus.isOnline = true;
      this.networkStatus.lastChecked = Date.now();
      
      logger.info('Network connection restored');
      this.processOfflineQueue();
    });

    window.addEventListener('offline', () => {
      this.networkStatus.isOnline = false;
      this.networkStatus.lastChecked = Date.now();
      
      logger.warn('Network connection lost');
      monitoringService.recordMetric('network.offline', 1);
    });

    // Monitor connection quality
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      
      if (connection) {
        this.networkStatus.connectionType = connection.effectiveType;
        this.networkStatus.isSlowConnection = connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
        
        connection.addEventListener('change', () => {
          this.networkStatus.connectionType = connection.effectiveType;
          this.networkStatus.isSlowConnection = connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
          this.networkStatus.lastChecked = Date.now();
          
          logger.debug('Network connection changed', {
            type: connection.effectiveType,
            isSlow: this.networkStatus.isSlowConnection
          });
        });
      }
    }
  }

  /**
   * Start the sync process for offline queue
   */
  private startSyncProcess(): void {
    this.syncInterval = setInterval(() => {
      if (this.networkStatus.isOnline && this.offlineQueue.length > 0) {
        this.processOfflineQueue();
      }
    }, this.SYNC_INTERVAL);
  }

  /**
   * Process offline queue when connection is restored
   */
  private async processOfflineQueue(): Promise<void> {
    if (this.offlineQueue.length === 0) return;

    logger.info('Processing offline queue', { 
      queueSize: this.offlineQueue.length 
    });

    const itemsToProcess = [...this.offlineQueue];
    this.offlineQueue = [];

    for (const item of itemsToProcess) {
      try {
        await this.executeWithRetry(item);
        logger.debug('Offline queue item processed successfully', { 
          id: item.id 
        });
      } catch (error) {
        logger.error('Failed to process offline queue item', {
          id: item.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        
        // Re-queue if not exceeded max retries
        if (item.retryCount < item.maxRetries) {
          item.retryCount++;
          this.offlineQueue.push(item);
        }
      }
    }
  }

  /**
   * Execute operation with retry logic
   */
  private async executeWithRetry(item: OfflineQueueItem): Promise<void> {
    const maxAttempts = 3;
    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await item.operation();
        return;
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < maxAttempts) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError!;
  }

  /**
   * Queue operation for offline execution
   */
  queueOperation(
    id: string,
    operation: () => Promise<any>,
    maxRetries: number = 3
  ): void {
    if (this.offlineQueue.length >= this.MAX_QUEUE_SIZE) {
      logger.warn('Offline queue is full, removing oldest item');
      this.offlineQueue.shift();
    }

    const item: OfflineQueueItem = {
      id,
      operation,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries
    };

    this.offlineQueue.push(item);
    
    logger.debug('Operation queued for offline execution', { 
      id,
      queueSize: this.offlineQueue.length 
    });

    // Try to execute immediately if online
    if (this.networkStatus.isOnline) {
      this.processOfflineQueue();
    }
  }

  /**
   * Execute operation with network awareness
   */
  async executeWithNetworkAwareness<T>(
    operation: () => Promise<T>,
    fallback?: () => Promise<T>,
    operationId?: string
  ): Promise<T> {
    if (this.networkStatus.isOnline) {
      try {
        return await operation();
      } catch (error) {
        // Check if it's a network error
        if (this.isNetworkError(error as Error)) {
          logger.warn('Network error detected, queuing operation', {
            operationId,
            error: (error as Error).message
          });
          
          if (operationId) {
            this.queueOperation(operationId, operation);
          }
          
          if (fallback) {
            return await fallback();
          }
        }
        
        throw error;
      }
    } else {
      logger.info('Offline mode, queuing operation', { operationId });
      
      if (operationId) {
        this.queueOperation(operationId, operation);
      }
      
      if (fallback) {
        return await fallback();
      }
      
      throw new Error('Operation queued for offline execution');
    }
  }

  /**
   * Check if error is network-related
   */
  private isNetworkError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('network') ||
           message.includes('fetch') ||
           message.includes('timeout') ||
           message.includes('connection') ||
           message.includes('offline');
  }

  /**
   * Get current network status
   */
  getNetworkStatus(): NetworkStatus {
    return { ...this.networkStatus };
  }

  /**
   * Get offline queue status
   */
  getOfflineQueueStatus(): {
    size: number;
    items: Array<{ id: string; timestamp: number; retryCount: number }>;
  } {
    return {
      size: this.offlineQueue.length,
      items: this.offlineQueue.map(item => ({
        id: item.id,
        timestamp: item.timestamp,
        retryCount: item.retryCount
      }))
    };
  }

  /**
   * Clear offline queue
   */
  clearOfflineQueue(): void {
    this.offlineQueue = [];
    logger.info('Offline queue cleared');
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }
}

export const networkRecoveryService = new NetworkRecoveryService();
