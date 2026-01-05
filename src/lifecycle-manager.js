/**
 * Lifecycle Manager
 *
 * Tracks components and their cleanup methods for proper shutdown.
 * Works alongside existing component structure without requiring refactoring.
 */

/**
 * @typedef {Object} ComponentEntry
 * @property {string} name - Component name for logging
 * @property {Object} component - The component instance
 * @property {string} destroyMethod - Method to call for cleanup
 */

/**
 * Manages component lifecycle for clean shutdown.
 *
 * @example
 * ```javascript
 * const lifecycle = new LifecycleManager();
 * lifecycle.track('rateLimiter', this.rateLimiter, 'saveStats');
 * lifecycle.track('presenceManager', this.presenceManager, 'stopPresenceCycle');
 * // On shutdown:
 * await lifecycle.destroyAll();
 * ```
 */
export class LifecycleManager {
  constructor() {
    /** @type {ComponentEntry[]} */
    this.components = [];
  }

  /**
   * Track a component for lifecycle management
   *
   * @param {string} name - Component name (for logging)
   * @param {Object} component - Component instance
   * @param {string} [destroyMethod='destroy'] - Method to call for cleanup
   */
  track(name, component, destroyMethod = 'destroy') {
    if (!component) {
      return; // Skip null/undefined components
    }

    this.components.push({
      name,
      component,
      destroyMethod,
    });
  }

  /**
   * Destroy all tracked components in reverse order
   * @param {Object} [logger] - Optional logger for output
   */
  async destroyAll(logger) {
    // Destroy in reverse order (LIFO - last in, first out)
    const reversed = [...this.components].reverse();

    for (const entry of reversed) {
      const { name, component, destroyMethod } = entry;

      try {
        // Try the configured destroy method
        if (typeof component[destroyMethod] === 'function') {
          await component[destroyMethod]();
          logger?.debug({ component: name, method: destroyMethod }, 'Component destroyed');
        }
        // Fallback to common cleanup methods
        else if (typeof component.stop === 'function') {
          await component.stop();
          logger?.debug({ component: name, method: 'stop' }, 'Component stopped');
        }
        else if (typeof component.cleanup === 'function') {
          await component.cleanup();
          logger?.debug({ component: name, method: 'cleanup' }, 'Component cleaned up');
        }
        else if (typeof component.close === 'function') {
          await component.close();
          logger?.debug({ component: name, method: 'close' }, 'Component closed');
        }
        // No cleanup method found - that's OK, some components are stateless
      } catch (err) {
        // Log but continue - don't let one failure stop cleanup
        logger?.warn({ component: name, error: err.message }, 'Error during component cleanup');
      }
    }

    this.components = [];
  }

  /**
   * Get count of tracked components
   * @returns {number}
   */
  get size() {
    return this.components.length;
  }

  /**
   * Get list of tracked component names
   * @returns {string[]}
   */
  getTrackedNames() {
    return this.components.map(c => c.name);
  }
}

export default LifecycleManager;
