// lib/connection-manager.ts
// WebSocket connection tracking and management

import { logger } from './logger';

interface ConnectionInfo {
  connectionId: string;
  eventId: string;
  userId?: string;
  userAgent?: string;
  ipAddress?: string;
  connectedAt: number;
  lastSeen: number;
  isActive: boolean;
}

interface EventStats {
  totalConnections: number;
  activeConnections: number;
  uniqueUsers: number;
  averageConnectionTime: number;
}

class ConnectionManager {
  private connections = new Map<string, ConnectionInfo>();
  private eventConnections = new Map<string, Set<string>>();
  private userConnections = new Map<string, Set<string>>();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start cleanup interval (every 5 minutes)
    this.startCleanupInterval();
  }

  addConnection(
    eventId: string, 
    connectionId: string, 
    info?: Partial<ConnectionInfo>
  ): void {
    const now = Date.now();
    
    const connectionInfo: ConnectionInfo = {
      connectionId,
      eventId,
      userId: info?.userId,
      userAgent: info?.userAgent,
      ipAddress: info?.ipAddress,
      connectedAt: now,
      lastSeen: now,
      isActive: true,
    };

    // Store connection
    this.connections.set(connectionId, connectionInfo);

    // Track by event
    if (!this.eventConnections.has(eventId)) {
      this.eventConnections.set(eventId, new Set());
    }
    this.eventConnections.get(eventId)!.add(connectionId);

    // Track by user
    if (connectionInfo.userId) {
      if (!this.userConnections.has(connectionInfo.userId)) {
        this.userConnections.set(connectionInfo.userId, new Set());
      }
      this.userConnections.get(connectionInfo.userId)!.add(connectionId);
    }

    logger.debug('Connection added', { 
      connectionId, 
      eventId, 
      userId: connectionInfo.userId 
    });
  }

  removeConnection(eventId: string, connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return;
    }

    // Remove from event tracking
    const eventConnections = this.eventConnections.get(eventId);
    if (eventConnections) {
      eventConnections.delete(connectionId);
      if (eventConnections.size === 0) {
        this.eventConnections.delete(eventId);
      }
    }

    // Remove from user tracking
    if (connection.userId) {
      const userConnections = this.userConnections.get(connection.userId);
      if (userConnections) {
        userConnections.delete(connectionId);
        if (userConnections.size === 0) {
          this.userConnections.delete(connection.userId);
        }
      }
    }

    // Remove connection
    this.connections.delete(connectionId);

    logger.debug('Connection removed', { 
      connectionId, 
      eventId, 
      userId: connection.userId 
    });
  }

  updateLastSeen(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      connection.lastSeen = Date.now();
      connection.isActive = true;
    }
  }

  getConnection(connectionId: string): ConnectionInfo | null {
    return this.connections.get(connectionId) || null;
  }

  getEventConnections(eventId: string): ConnectionInfo[] {
    const connectionIds = this.eventConnections.get(eventId);
    if (!connectionIds) {
      return [];
    }

    return Array.from(connectionIds)
      .map(id => this.connections.get(id))
      .filter((conn): conn is ConnectionInfo => conn !== undefined);
  }

  getUserConnections(userId: string): ConnectionInfo[] {
    const connectionIds = this.userConnections.get(userId);
    if (!connectionIds) {
      return [];
    }

    return Array.from(connectionIds)
      .map(id => this.connections.get(id))
      .filter((conn): conn is ConnectionInfo => conn !== undefined);
  }

  getEventStats(eventId: string): EventStats {
    const connections = this.getEventConnections(eventId);
    const activeConnections = connections.filter(conn => conn.isActive);
    const uniqueUsers = new Set(connections.map(conn => conn.userId).filter(Boolean)).size;
    
    const totalConnectionTime = connections.reduce((sum, conn) => {
      return sum + (Date.now() - conn.connectedAt);
    }, 0);

    const averageConnectionTime = connections.length > 0 
      ? totalConnectionTime / connections.length 
      : 0;

    return {
      totalConnections: connections.length,
      activeConnections: activeConnections.length,
      uniqueUsers,
      averageConnectionTime,
    };
  }

  getAllStats(): {
    totalConnections: number;
    activeConnections: number;
    totalEvents: number;
    totalUsers: number;
  } {
    const allConnections = Array.from(this.connections.values());
    const activeConnections = allConnections.filter(conn => conn.isActive);
    const uniqueUsers = new Set(allConnections.map(conn => conn.userId).filter(Boolean)).size;

    return {
      totalConnections: allConnections.length,
      activeConnections: activeConnections.length,
      totalEvents: this.eventConnections.size,
      totalUsers: uniqueUsers,
    };
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveConnections();
    }, 5 * 60 * 1000); // 5 minutes
  }

  private cleanupInactiveConnections(): void {
    const now = Date.now();
    const INACTIVE_THRESHOLD = 30 * 60 * 1000; // 30 minutes
    const staleConnections: string[] = [];

    for (const [connectionId, connection] of this.connections.entries()) {
      if (now - connection.lastSeen > INACTIVE_THRESHOLD) {
        staleConnections.push(connectionId);
      }
    }

    // Remove stale connections
    for (const connectionId of staleConnections) {
      const connection = this.connections.get(connectionId);
      if (connection) {
        this.removeConnection(connection.eventId, connectionId);
        logger.debug('Cleaned up stale connection', { connectionId });
      }
    }

    if (staleConnections.length > 0) {
      logger.info('Cleaned up stale connections', { 
        count: staleConnections.length 
      });
    }
  }

  // Health check
  isHealthy(): boolean {
    const stats = this.getAllStats();
    return stats.totalConnections < 10000 && stats.activeConnections < 5000;
  }

  // Cleanup on shutdown
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.connections.clear();
    this.eventConnections.clear();
    this.userConnections.clear();

    logger.info('Connection manager destroyed');
  }
}

// Singleton instance
export const connectionManager = new ConnectionManager();
export type { ConnectionInfo, EventStats };
