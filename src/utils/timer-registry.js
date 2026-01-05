/**
 * Timer Registry
 *
 * Centralized timer management to prevent memory leaks.
 * Tracks all setTimeout/setInterval calls and provides batch cleanup.
 */

/**
 * Registry for managing timers with automatic cleanup.
 *
 * @example
 * ```javascript
 * const timers = new TimerRegistry('MyComponent');
 * const id = timers.setInterval(() => console.log('tick'), 1000);
 * // Later, in destroy():
 * timers.clearAll(); // Cleans up all timers
 * ```
 */
export class TimerRegistry {
  /**
   * @param {string} [componentName='Unknown'] - Name for logging
   */
  constructor(componentName = 'Unknown') {
    this.componentName = componentName;
    this.timers = new Map();
    this.nextId = 1;
  }

  /**
   * Tracked setTimeout - auto-removed after execution
   * @param {Function} callback - Function to execute
   * @param {number} delay - Delay in milliseconds
   * @param {...*} args - Arguments to pass to callback
   * @returns {number} Timer ID (internal, not native)
   */
  setTimeout(callback, delay, ...args) {
    const id = this.nextId++;
    const nativeId = setTimeout(() => {
      this.timers.delete(id);
      callback(...args);
    }, delay);

    this.timers.set(id, {
      type: 'timeout',
      nativeId,
      created: Date.now(),
      delay,
    });

    return id;
  }

  /**
   * Tracked setInterval - must be manually cleared or use clearAll()
   * @param {Function} callback - Function to execute
   * @param {number} delay - Interval in milliseconds
   * @param {...*} args - Arguments to pass to callback
   * @returns {number} Timer ID (internal, not native)
   */
  setInterval(callback, delay, ...args) {
    const id = this.nextId++;
    const nativeId = setInterval(callback, delay, ...args);

    this.timers.set(id, {
      type: 'interval',
      nativeId,
      created: Date.now(),
      delay,
    });

    return id;
  }

  /**
   * Clear a specific timeout
   * @param {number} id - Timer ID from setTimeout()
   * @returns {boolean} True if timer was found and cleared
   */
  clearTimeout(id) {
    const timer = this.timers.get(id);
    if (timer && timer.type === 'timeout') {
      clearTimeout(timer.nativeId);
      this.timers.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Clear a specific interval
   * @param {number} id - Timer ID from setInterval()
   * @returns {boolean} True if timer was found and cleared
   */
  clearInterval(id) {
    const timer = this.timers.get(id);
    if (timer && timer.type === 'interval') {
      clearInterval(timer.nativeId);
      this.timers.delete(id);
      return true;
    }
    return false;
  }

  /**
   * Clear all tracked timers (call in destroy())
   * @returns {number} Count of timers cleared
   */
  clearAll() {
    let count = 0;
    for (const [id, timer] of this.timers.entries()) {
      if (timer.type === 'timeout') {
        clearTimeout(timer.nativeId);
      } else {
        clearInterval(timer.nativeId);
      }
      count++;
    }

    this.timers.clear();
    return count;
  }

  /**
   * Get active timer info (for debugging)
   * @returns {Array<{id: number, type: string, age: number, delay: number}>}
   */
  getActiveTimers() {
    const now = Date.now();
    return Array.from(this.timers.entries()).map(([id, timer]) => ({
      id,
      type: timer.type,
      age: now - timer.created,
      delay: timer.delay,
    }));
  }

  /**
   * Get count of active timers
   * @returns {number}
   */
  get size() {
    return this.timers.size;
  }

  /**
   * Check if any timers are active
   * @returns {boolean}
   */
  hasActiveTimers() {
    return this.timers.size > 0;
  }
}

export default TimerRegistry;
