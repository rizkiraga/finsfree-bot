const logger = require('./logger');

/**
 * Simple sliding window error monitor.
 * Tracks errors in the last 1 hour.
 */
class ErrorMonitor {
  constructor(limit = 5, windowMs = 3600000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.errors = [];
    this.isBudgetExceeded = false;
    this.onLimitExceeded = null;
  }

  /**
   * Record a new error event.
   * @returns {boolean} - Returns true if the limit was JUST exceeded now.
   */
  recordError() {
    const now = Date.now();
    this.errors.push(now);

    // Clean up old errors outside the window
    this.errors = this.errors.filter(timestamp => now - timestamp < this.windowMs);

    logger.debug(`Error Budget: ${this.errors.length}/${this.limit} in the last hour.`);

    if (this.errors.length > this.limit && !this.isBudgetExceeded) {
      this.isBudgetExceeded = true;
      logger.warn('Error Budget Exceeded! Triggering safeguards.');
      if (this.onLimitExceeded) {
        this.onLimitExceeded(this.errors.length);
      }
      return true;
    }

    return false;
  }

  /**
   * Reset the budget status.
   */
  reset() {
    this.errors = [];
    this.isBudgetExceeded = false;
    logger.info('Error Budget Monitor has been reset.');
  }

  /**
   * Set callback for when limit is exceeded.
   */
  setCallback(fn) {
    this.onLimitExceeded = fn;
  }

  /**
   * Status of the monitor.
   */
  getStatus() {
    return {
      count: this.errors.length,
      limit: this.limit,
      isExceeded: this.isBudgetExceeded
    };
  }
}

// Export a singleton instance
module.exports = new ErrorMonitor();
