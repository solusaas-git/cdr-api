/**
 * Database Health Monitor
 * 
 * Continuously monitors database health with periodic checks.
 * Works alongside the circuit breaker in queue.ts to provide:
 * - Proactive health detection
 * - Health status reporting
 * - Downtime tracking
 * - Automatic recovery detection
 */

import { pool } from './db';

interface HealthStatus {
  healthy: boolean;
  lastCheck: number;
  lastSuccess: number | null;
  lastFailure: number | null;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  uptimePercent: number;
  totalChecks: number;
  failedChecks: number;
}

class DatabaseHealthMonitor {
  private healthy: boolean = true;
  private lastCheck: number = Date.now();
  private lastSuccess: number | null = Date.now();
  private lastFailure: number | null = null;
  private consecutiveFailures: number = 0;
  private consecutiveSuccesses: number = 0;
  private totalChecks: number = 0;
  private failedChecks: number = 0;
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS: number;
  private readonly HEALTH_CHECK_TIMEOUT_MS: number;

  constructor(config?: {
    checkIntervalMs?: number;
    healthCheckTimeoutMs?: number;
  }) {
    this.CHECK_INTERVAL_MS = config?.checkIntervalMs || 2000; // 2 seconds
    this.HEALTH_CHECK_TIMEOUT_MS = config?.healthCheckTimeoutMs || 5000; // 5 seconds
  }

  /**
   * Start the health monitoring service
   */
  start(): void {
    if (this.checkInterval) {
      console.log('⚠️  Health monitor already running');
      return;
    }

    console.log(`🏥 Starting database health monitor (checking every ${this.CHECK_INTERVAL_MS}ms)`);
    
    // Run initial check
    this.checkHealth();
    
    // Schedule periodic checks
    this.checkInterval = setInterval(() => {
      this.checkHealth();
    }, this.CHECK_INTERVAL_MS);
  }

  /**
   * Stop the health monitoring service
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('🛑 Database health monitor stopped');
    }
  }

  /**
   * Perform a health check
   */
  private async checkHealth(): Promise<void> {
    this.lastCheck = Date.now();
    this.totalChecks++;

    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Health check timeout')), this.HEALTH_CHECK_TIMEOUT_MS)
      );

      // Race between query and timeout
      await Promise.race([
        pool.query('SELECT 1 as health_check'),
        timeoutPromise
      ]);

      // Success
      this.onHealthCheckSuccess();

    } catch (error) {
      // Failure
      this.onHealthCheckFailure(error);
    }
  }

  /**
   * Handle successful health check
   */
  private onHealthCheckSuccess(): void {
    const wasUnhealthy = !this.healthy;
    
    this.healthy = true;
    this.lastSuccess = Date.now();
    this.consecutiveSuccesses++;
    this.consecutiveFailures = 0;

    if (wasUnhealthy) {
      const downtime = this.lastFailure ? Date.now() - this.lastFailure : 0;
      console.log(`✅ Database recovered! (was down for ${Math.round(downtime / 1000)}s)`);
    }
  }

  /**
   * Handle failed health check
   */
  private onHealthCheckFailure(error: any): void {
    const wasHealthy = this.healthy;
    
    this.healthy = false;
    this.lastFailure = Date.now();
    this.consecutiveFailures++;
    this.consecutiveSuccesses = 0;
    this.failedChecks++;

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (wasHealthy) {
      console.error(`🔴 Database health check failed: ${errorMessage}`);
      console.error('❌ Database marked as unhealthy');
    } else if (this.consecutiveFailures % 10 === 0) {
      // Log every 10th consecutive failure to avoid spam
      console.error(`⚠️  Database still unhealthy (${this.consecutiveFailures} consecutive failures)`);
    }
  }

  /**
   * Check if database is currently healthy
   */
  isHealthy(): boolean {
    return this.healthy;
  }

  /**
   * Get time since last failure (in milliseconds)
   */
  timeSinceFailure(): number {
    return this.lastFailure ? Date.now() - this.lastFailure : 0;
  }

  /**
   * Get time since last success (in milliseconds)
   */
  timeSinceSuccess(): number {
    return this.lastSuccess ? Date.now() - this.lastSuccess : 0;
  }

  /**
   * Get time since database went down (0 if healthy)
   */
  timeSinceDown(): number {
    if (this.healthy) return 0;
    return this.lastFailure ? Date.now() - this.lastFailure : 0;
  }

  /**
   * Get comprehensive health status
   */
  getStatus(): HealthStatus {
    const uptimePercent = this.totalChecks > 0
      ? ((this.totalChecks - this.failedChecks) / this.totalChecks) * 100
      : 100;

    return {
      healthy: this.healthy,
      lastCheck: this.lastCheck,
      lastSuccess: this.lastSuccess,
      lastFailure: this.lastFailure,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      uptimePercent: Math.round(uptimePercent * 100) / 100,
      totalChecks: this.totalChecks,
      failedChecks: this.failedChecks,
    };
  }

  /**
   * Get human-readable status
   */
  getStatusSummary(): string {
    if (this.healthy) {
      return `✅ Healthy (${this.consecutiveSuccesses} consecutive successes)`;
    } else {
      const downtime = Math.round(this.timeSinceDown() / 1000);
      return `❌ Unhealthy for ${downtime}s (${this.consecutiveFailures} consecutive failures)`;
    }
  }

  /**
   * Reset statistics (useful for testing)
   */
  resetStats(): void {
    this.totalChecks = 0;
    this.failedChecks = 0;
    console.log('🔄 Health monitor statistics reset');
  }
}

// Export singleton instance
export const dbHealthMonitor = new DatabaseHealthMonitor({
  checkIntervalMs: parseInt(process.env.DB_HEALTH_CHECK_INTERVAL || '2000'),
  healthCheckTimeoutMs: parseInt(process.env.DB_HEALTH_CHECK_TIMEOUT || '5000'),
});

// Convenience exports
export const isDbHealthy = () => dbHealthMonitor.isHealthy();
export const timeSinceDbDown = () => dbHealthMonitor.timeSinceDown();
export const checkDbHealth = () => dbHealthMonitor.getStatus();

