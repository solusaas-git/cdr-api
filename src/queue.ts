/**
 * Request Queue with Circuit Breaker Pattern
 * 
 * Protects the CDR API from database overload during replica recovery
 * or WAL replay by queuing requests and implementing circuit breaker logic.
 * 
 * Features:
 * - In-memory FIFO queue
 * - Circuit breaker pattern (CLOSED -> OPEN -> HALF_OPEN)
 * - Automatic recovery detection
 * - Queue overflow protection
 * - Request timeout handling
 */

interface QueuedRequest {
  handler: () => Promise<any>;
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timestamp: number;
}

enum CircuitState {
  CLOSED = 'CLOSED',     // DB is healthy, process normally
  OPEN = 'OPEN',         // DB is down, queue all requests
  HALF_OPEN = 'HALF_OPEN' // Testing if DB recovered
}

class RequestQueue {
  private queue: QueuedRequest[] = [];
  private isProcessing = false;
  private circuitState: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;

  // Configuration
  private readonly MAX_QUEUE_SIZE: number;
  private readonly REQUEST_TIMEOUT: number;
  private readonly FAILURE_THRESHOLD: number;
  private readonly SUCCESS_THRESHOLD: number;
  private readonly CIRCUIT_RESET_TIMEOUT: number;
  private readonly MAX_REQUEST_AGE: number;

  constructor(config?: {
    maxQueueSize?: number;
    requestTimeout?: number;
    failureThreshold?: number;
    successThreshold?: number;
    circuitResetTimeout?: number;
    maxRequestAge?: number;
  }) {
    this.MAX_QUEUE_SIZE = config?.maxQueueSize || 200;
    this.REQUEST_TIMEOUT = config?.requestTimeout || 30000; // 30s
    this.FAILURE_THRESHOLD = config?.failureThreshold || 5;
    this.SUCCESS_THRESHOLD = config?.successThreshold || 3;
    this.CIRCUIT_RESET_TIMEOUT = config?.circuitResetTimeout || 60000; // 60s
    this.MAX_REQUEST_AGE = config?.maxRequestAge || 120000; // 2 minutes
  }

  /**
   * Enqueue a request handler
   */
  async enqueue<T>(handler: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      // Check if queue is full
      if (this.queue.length >= this.MAX_QUEUE_SIZE) {
        console.error(`❌ Queue overloaded: ${this.queue.length}/${this.MAX_QUEUE_SIZE}`);
        return reject(new Error('Queue overloaded - too many pending requests'));
      }

      // Check if circuit is open and can try half-open
      if (this.circuitState === CircuitState.OPEN) {
        if (this.shouldAttemptReset()) {
          console.log('🔄 Circuit breaker: OPEN -> HALF_OPEN (attempting recovery)');
          this.circuitState = CircuitState.HALF_OPEN;
          this.successCount = 0;
        }
      }

      // Add to queue
      this.queue.push({
        handler,
        resolve,
        reject,
        timestamp: Date.now(),
      });

      console.log(`📥 Request queued (${this.queue.length} in queue, circuit: ${this.circuitState})`);

      // Start processing
      this.processQueue();
    });
  }

  /**
   * Process queued requests
   */
  private async processQueue(): Promise<void> {
    // Prevent concurrent processing
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      while (this.queue.length > 0) {
        // Clean up old requests
        this.cleanupOldRequests();

        // Get next request
        const request = this.queue.shift();
        if (!request) break;

        // Check if request is too old
        const requestAge = Date.now() - request.timestamp;
        if (requestAge > this.MAX_REQUEST_AGE) {
          console.warn(`⚠️  Request expired after ${requestAge}ms`);
          request.reject(new Error('Request timeout - queued too long'));
          continue;
        }

        // Process the request
        await this.processRequest(request);

        // If circuit is open, stop processing and wait
        if (this.circuitState === CircuitState.OPEN) {
          console.log(`⏸️  Circuit breaker OPEN - pausing queue processing (${this.queue.length} requests waiting)`);
          break;
        }
      }
    } finally {
      this.isProcessing = false;

      // If there are still items in queue and circuit is not open, continue processing
      if (this.queue.length > 0 && this.circuitState !== CircuitState.OPEN) {
        // Small delay to prevent tight loop
        setTimeout(() => this.processQueue(), 100);
      }
    }
  }

  /**
   * Process a single request with timeout
   */
  private async processRequest(request: QueuedRequest): Promise<void> {
    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Request handler timeout')), this.REQUEST_TIMEOUT)
      );

      // Race between handler and timeout
      const result = await Promise.race([
        request.handler(),
        timeoutPromise
      ]);

      // Success
      this.onSuccess();
      request.resolve(result);

    } catch (error) {
      // Failure
      this.onFailure(error);
      request.reject(error);
    }
  }

  /**
   * Handle successful request
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.circuitState === CircuitState.HALF_OPEN) {
      this.successCount++;
      console.log(`✅ Success in HALF_OPEN state (${this.successCount}/${this.SUCCESS_THRESHOLD})`);

      if (this.successCount >= this.SUCCESS_THRESHOLD) {
        console.log('🟢 Circuit breaker: HALF_OPEN -> CLOSED (recovered!)');
        this.circuitState = CircuitState.CLOSED;
        this.successCount = 0;
        this.lastFailureTime = null;
      }
    }
  }

  /**
   * Handle failed request
   */
  private onFailure(error: any): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`❌ Request failed (${this.failureCount}/${this.FAILURE_THRESHOLD}): ${errorMessage}`);

    // Check if we should open the circuit
    if (this.circuitState === CircuitState.CLOSED && this.failureCount >= this.FAILURE_THRESHOLD) {
      console.error('🔴 Circuit breaker: CLOSED -> OPEN (too many failures)');
      this.circuitState = CircuitState.OPEN;
      this.successCount = 0;
    } else if (this.circuitState === CircuitState.HALF_OPEN) {
      console.error('🔴 Circuit breaker: HALF_OPEN -> OPEN (recovery failed)');
      this.circuitState = CircuitState.OPEN;
      this.successCount = 0;
    }
  }

  /**
   * Check if we should attempt to reset the circuit
   */
  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false;
    const timeSinceLastFailure = Date.now() - this.lastFailureTime;
    return timeSinceLastFailure >= this.CIRCUIT_RESET_TIMEOUT;
  }

  /**
   * Clean up requests that are too old
   */
  private cleanupOldRequests(): void {
    const now = Date.now();
    let cleaned = 0;

    while (this.queue.length > 0) {
      const first = this.queue[0];
      const age = now - first.timestamp;

      if (age > this.MAX_REQUEST_AGE) {
        this.queue.shift();
        first.reject(new Error('Request expired - waited too long in queue'));
        cleaned++;
      } else {
        break; // Queue is FIFO, so if first is not old, rest aren't either
      }
    }

    if (cleaned > 0) {
      console.warn(`🧹 Cleaned up ${cleaned} expired requests`);
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      maxQueueSize: this.MAX_QUEUE_SIZE,
      circuitState: this.circuitState,
      failureCount: this.failureCount,
      successCount: this.successCount,
      isProcessing: this.isProcessing,
      utilizationPercent: Math.round((this.queue.length / this.MAX_QUEUE_SIZE) * 100),
    };
  }

  /**
   * Force reset the circuit breaker (for testing/admin purposes)
   */
  resetCircuit(): void {
    console.log('🔧 Manually resetting circuit breaker');
    this.circuitState = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.lastFailureTime = null;
  }
}

// Export singleton instance
export const requestQueue = new RequestQueue({
  maxQueueSize: parseInt(process.env.QUEUE_MAX_SIZE || '200'),
  requestTimeout: parseInt(process.env.QUEUE_REQUEST_TIMEOUT || '30000'),
  failureThreshold: parseInt(process.env.QUEUE_FAILURE_THRESHOLD || '5'),
  successThreshold: parseInt(process.env.QUEUE_SUCCESS_THRESHOLD || '3'),
  circuitResetTimeout: parseInt(process.env.QUEUE_CIRCUIT_RESET_TIMEOUT || '60000'),
  maxRequestAge: parseInt(process.env.QUEUE_MAX_REQUEST_AGE || '120000'),
});

/**
 * Convenience function to enqueue a request
 */
export async function enqueueRequest<T>(handler: () => Promise<T>): Promise<T> {
  return requestQueue.enqueue(handler);
}

