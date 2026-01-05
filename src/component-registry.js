/**
 * Component Registry
 *
 * Manages component lifecycle with dependency resolution,
 * ordered initialization, and proper cleanup on disconnect.
 */

/**
 * @typedef {Object} ComponentDefinition
 * @property {string} name - Unique component name
 * @property {Function} factory - Factory function (options, ...deps) => component
 * @property {string[]} [deps] - Names of dependencies (must be registered first)
 * @property {string} [destroyMethod] - Custom destroy method name (default: 'destroy')
 */

/**
 * Registry for managing WhatsApp client components with lifecycle management.
 *
 * Features:
 * - Validates required options on construction
 * - Resolves dependencies between components
 * - Initializes components in dependency order
 * - Destroys components in reverse order
 *
 * @example
 * ```javascript
 * const registry = new ComponentRegistry(options);
 * registry.register('rateLimiter', (opts) => new RateLimiter(opts));
 * registry.register('scheduler', (opts, rl) => new Scheduler({...opts, rateLimiter: rl}), ['rateLimiter']);
 * await registry.initialize();
 * // Later...
 * await registry.destroy();
 * ```
 */
export class ComponentRegistry {
  /**
   * @param {Object} options - WhatsApp client options
   */
  constructor(options = {}) {
    this.options = this.validateOptions(options);
    this.components = new Map();
    this.definitions = [];
    this.initialized = false;
  }

  /**
   * Validate and normalize options with defaults
   * @param {Object} options - Raw options
   * @returns {Object} Validated options with defaults
   */
  validateOptions(options) {
    const validated = {
      // Required paths
      sessionsDir: options.sessionsDir,

      // Message timing
      messageDelay: options.messageDelay ?? 1500,
      typingDelay: options.typingDelay ?? 500,

      // Account settings
      accountAgeWeeks: options.accountAgeWeeks ?? 4,

      // Active hours
      activeHoursStart: options.activeHoursStart ?? 7,
      activeHoursEnd: options.activeHoursEnd ?? 23,

      // Webhook configuration
      webhookUrl: options.webhookUrl,
      apiSecret: options.apiSecret,

      // Feature flags
      ipWhitelistEnabled: options.ipWhitelistEnabled ?? false,
      autoResponderEnabled: options.autoResponderEnabled ?? false,

      // Logging
      logLevel: options.logLevel ?? 'info',

      // Callbacks
      onMessage: options.onMessage,

      // Pass through any additional options
      ...options,
    };

    // Validate required fields
    if (!validated.sessionsDir) {
      throw new Error('ComponentRegistry: sessionsDir is required');
    }

    // Validate ranges
    if (validated.accountAgeWeeks < 1) {
      throw new Error('ComponentRegistry: accountAgeWeeks must be >= 1');
    }

    if (validated.activeHoursStart < 0 || validated.activeHoursStart > 23) {
      throw new Error('ComponentRegistry: activeHoursStart must be 0-23');
    }

    if (validated.activeHoursEnd < 0 || validated.activeHoursEnd > 23) {
      throw new Error('ComponentRegistry: activeHoursEnd must be 0-23');
    }

    return validated;
  }

  /**
   * Register a component with optional dependencies
   *
   * @param {string} name - Unique component name
   * @param {Function} factory - Factory function (options, ...deps) => component
   * @param {Object} [config] - Configuration
   * @param {string[]} [config.deps] - Dependency names
   * @param {string} [config.destroyMethod] - Custom destroy method name
   */
  register(name, factory, config = {}) {
    if (this.initialized) {
      throw new Error(`Cannot register component "${name}" after initialization`);
    }

    // Check for duplicate
    if (this.definitions.some(d => d.name === name)) {
      throw new Error(`Component "${name}" is already registered`);
    }

    this.definitions.push({
      name,
      factory,
      deps: config.deps || [],
      destroyMethod: config.destroyMethod || 'destroy',
    });
  }

  /**
   * Initialize all components in dependency order
   */
  async initialize() {
    if (this.initialized) {
      throw new Error('ComponentRegistry is already initialized');
    }

    // Resolve initialization order (topological sort)
    const order = this.resolveOrder();

    // Initialize in order
    for (const def of order) {
      const deps = def.deps.map(depName => {
        const dep = this.components.get(depName);
        if (!dep) {
          throw new Error(`Component "${def.name}" depends on "${depName}" which is not initialized`);
        }
        return dep;
      });

      const component = await def.factory(this.options, ...deps);
      this.components.set(def.name, component);
    }

    this.initialized = true;
  }

  /**
   * Resolve initialization order using topological sort
   * @returns {ComponentDefinition[]} Ordered definitions
   */
  resolveOrder() {
    const visited = new Set();
    const visiting = new Set();
    const order = [];

    const visit = (name) => {
      if (visited.has(name)) return;
      if (visiting.has(name)) {
        throw new Error(`Circular dependency detected involving "${name}"`);
      }

      const def = this.definitions.find(d => d.name === name);
      if (!def) {
        throw new Error(`Unknown component "${name}"`);
      }

      visiting.add(name);

      for (const depName of def.deps) {
        visit(depName);
      }

      visiting.delete(name);
      visited.add(name);
      order.push(def);
    };

    for (const def of this.definitions) {
      visit(def.name);
    }

    return order;
  }

  /**
   * Get a component by name
   * @param {string} name - Component name
   * @returns {*} Component instance
   */
  get(name) {
    const component = this.components.get(name);
    if (!component) {
      throw new Error(`Component "${name}" not found`);
    }
    return component;
  }

  /**
   * Check if a component exists
   * @param {string} name - Component name
   * @returns {boolean}
   */
  has(name) {
    return this.components.has(name);
  }

  /**
   * Destroy all components in reverse initialization order
   */
  async destroy() {
    if (!this.initialized) {
      return; // Nothing to destroy
    }

    // Get initialization order and reverse it
    const order = this.resolveOrder().reverse();

    for (const def of order) {
      const component = this.components.get(def.name);
      if (!component) continue;

      try {
        // Try the configured destroy method
        if (typeof component[def.destroyMethod] === 'function') {
          await component[def.destroyMethod]();
        }
        // Also try common cleanup method names as fallback
        else if (typeof component.stop === 'function') {
          await component.stop();
        }
        else if (typeof component.cleanup === 'function') {
          await component.cleanup();
        }
        else if (typeof component.close === 'function') {
          await component.close();
        }
      } catch (err) {
        // Log but don't throw - continue cleanup
        console.error(`Error destroying component "${def.name}":`, err.message);
      }
    }

    this.components.clear();
    this.initialized = false;
  }

  /**
   * Get all component names
   * @returns {string[]}
   */
  getComponentNames() {
    return Array.from(this.components.keys());
  }

  /**
   * Get component count
   * @returns {number}
   */
  get size() {
    return this.components.size;
  }
}

export default ComponentRegistry;
