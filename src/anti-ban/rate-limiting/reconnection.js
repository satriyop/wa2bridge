/**
 * Reconnection Manager
 *
 * Implements exponential backoff with jitter for reconnection.
 * Predictable reconnection patterns are a bot fingerprint.
 */

/**
 * Manages reconnection with exponential backoff and jitter
 */
export class ReconnectionManager {
  constructor(options = {}) {
    this.attempts = 0;
    this.baseDelay = options.baseDelay || 1000;      // Start at 1 second
    this.maxDelay = options.maxDelay || 300000;       // Max 5 minutes
    this.maxAttempts = options.maxAttempts || 10;     // Max attempts before giving up
    this.jitterMin = options.jitterMin || 0.3;        // 30% minimum jitter
    this.jitterMax = options.jitterMax || 0.5;        // 50% maximum jitter
  }

  /**
   * Get next reconnection delay with exponential backoff and jitter
   * @returns {{delay: number, attempt: number, shouldGiveUp: boolean}}
   */
  getNextDelay() {
    if (this.attempts >= this.maxAttempts) {
      return {
        delay: 0,
        attempt: this.attempts,
        shouldGiveUp: true,
      };
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s...
    const exponentialDelay = Math.min(
      this.baseDelay * Math.pow(2, this.attempts),
      this.maxDelay
    );

    // Add random jitter (30-50% of base delay)
    const jitterPercent = this.jitterMin + Math.random() * (this.jitterMax - this.jitterMin);
    const jitter = exponentialDelay * jitterPercent;

    // Final delay with jitter (can be positive or negative jitter)
    const finalDelay = Math.floor(exponentialDelay + (Math.random() > 0.5 ? jitter : -jitter * 0.5));

    this.attempts++;

    return {
      delay: Math.max(finalDelay, this.baseDelay), // Never less than base
      attempt: this.attempts,
      shouldGiveUp: false,
    };
  }

  /**
   * Reset attempt counter (call on successful connection)
   */
  reset() {
    this.attempts = 0;
  }

  /**
   * Get current state
   */
  getState() {
    return {
      attempts: this.attempts,
      maxAttempts: this.maxAttempts,
      willGiveUp: this.attempts >= this.maxAttempts,
    };
  }
}

export default ReconnectionManager;
