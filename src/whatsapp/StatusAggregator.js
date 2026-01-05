/**
 * Status Aggregator
 *
 * Collects and formats status from all WhatsApp client components.
 * This is a read-only utility that aggregates status for API responses.
 */

/**
 * @typedef {Object} StatusComponents
 * @property {Object} rateLimiter - Message rate limiter
 * @property {Object} activityTracker - Activity tracking
 * @property {Object} reconnectionManager - Reconnection state
 * @property {Object} presenceManager - Presence management
 * @property {Object} banWarning - Ban warning system
 * @property {Object} deliveryTracker - Delivery tracking
 * @property {Object} activityRamper - Activity ramping
 * @property {Object} weekendPatterns - Weekend pattern adjustments
 * @property {Object} messageScheduler - Message queue
 * @property {Object} networkFingerprint - Network fingerprint
 * @property {Object} spamDetector - Spam detection
 * @property {Object} geoMatcher - Geo IP matching
 * @property {Object} statusViewer - Status viewing
 * @property {Object} profileViewer - Profile viewing
 * @property {Object} conversationMemory - Conversation memory
 * @property {Object} blockDetector - Block detection
 * @property {Object} sessionManager - Session management
 * @property {Object} persistentQueue - Persistent queue
 * @property {Object} webhookManager - Webhook management
 * @property {Object} healthMonitor - Health monitoring
 * @property {Object} analytics - Message analytics
 * @property {Object} contactScoring - Contact scoring
 * @property {Object} sentimentDetector - Sentiment detection
 * @property {Object} ipWhitelist - IP whitelist
 * @property {Object} auditLogger - Audit logging
 * @property {Object} apiRateLimiter - API rate limiting
 * @property {Object} autoResponder - Auto responder
 * @property {Object} messageTemplates - Message templates
 * @property {Object} scheduledMessages - Scheduled messages
 */

/**
 * Aggregates status from all WhatsApp client components.
 *
 * Designed as a stateless utility class that takes component references
 * and returns formatted status objects for API responses.
 */
export class StatusAggregator {
  /**
   * Build complete status response from all components.
   *
   * @param {Object} clientState - Core client state
   * @param {boolean} clientState.isConnected - Connection status
   * @param {string|null} clientState.phoneNumber - Connected phone number
   * @param {string|null} clientState.userName - Connected user name
   * @param {string|null} clientState.qrCode - Current QR code (if any)
   * @param {Object} clientState.stats - Message statistics
   * @param {StatusComponents} components - All anti-ban components
   * @returns {Object} Complete status response
   */
  static buildStatus(clientState, components) {
    const {
      isConnected,
      phoneNumber,
      userName,
      qrCode,
      stats,
    } = clientState;

    return {
      // Core connection info
      connected: isConnected,
      phone: phoneNumber,
      name: userName,
      qr: qrCode,

      // Basic stats
      stats: this.buildBasicStats(stats),

      // Phase 1: Core anti-ban status
      rateLimits: this.safeGetStats(components.rateLimiter, 'getStats'),
      activity: this.safeGetStats(components.activityTracker, 'getStats'),
      reconnection: this.safeGetStats(components.reconnectionManager, 'getState'),
      presence: this.safeGetStats(components.presenceManager, 'getStatus'),
      banWarning: this.safeGetStats(components.banWarning, 'getMetrics'),

      // Phase 2: Enhanced anti-ban status
      delivery: this.safeGetStats(components.deliveryTracker, 'getStats'),
      activityRamp: this.safeGetStats(components.activityRamper, 'getStatus'),
      weekendPatterns: this.safeGetStats(components.weekendPatterns, 'getStatus'),
      messageQueue: this.safeGetStats(components.messageScheduler, 'getStatus'),
      networkHealth: this.safeGetStats(components.networkFingerprint, 'checkNetworkHealth'),

      // Phase 3: Behavioral simulation status
      spamDetection: this.safeGetStats(components.spamDetector, 'getMetrics'),
      geoMatch: this.safeGetStats(components.geoMatcher, 'getStatus'),
      statusViewer: this.safeGetStats(components.statusViewer, 'getStatus'),
      profileViewer: this.safeGetStats(components.profileViewer, 'getStats'),
      activeConversations: this.safeGetLength(components.conversationMemory, 'getActiveConversations'),

      // Phase 4: Detection & Recovery status
      blockDetector: this.safeGetStats(components.blockDetector, 'getStats'),
      sessionBackup: this.safeGetStats(components.sessionManager, 'getBackupInfo'),
      persistentQueue: this.safeGetStats(components.persistentQueue, 'getStats'),
      webhookRetry: this.safeGetStats(components.webhookManager, 'getStats'),
      healthMonitor: this.safeGetStats(components.healthMonitor, 'getStatus'),

      // Phase 5: Analytics & Intelligence status
      analytics: this.safeGetStats(components.analytics, 'getSummary'),
      contactScoring: this.safeGetStats(components.contactScoring, 'getStats'),
      sentiment: this.safeGetStats(components.sentimentDetector, 'getStats'),
      ipWhitelist: this.safeGetStats(components.ipWhitelist, 'getStatus'),
      auditLogs: this.safeGetStats(components.auditLogger, 'getStats'),
      apiRateLimiter: this.safeGetStats(components.apiRateLimiter, 'getStats'),
      autoResponder: this.safeGetStats(components.autoResponder, 'getStats'),
      templates: this.safeGetStats(components.messageTemplates, 'getStats'),
      scheduledMessages: this.safeGetStats(components.scheduledMessages, 'getStats'),
    };
  }

  /**
   * Build basic stats object from client stats.
   *
   * @param {Object} stats - Raw stats from client
   * @returns {Object} Formatted stats
   */
  static buildBasicStats(stats) {
    return {
      messagesSent: stats?.messagesSent || 0,
      messagesReceived: stats?.messagesReceived || 0,
      uptime: stats?.startedAt
        ? Math.floor((Date.now() - stats.startedAt) / 1000)
        : 0,
    };
  }

  /**
   * Safely call a getter method on a component.
   *
   * @param {Object|null} component - Component instance
   * @param {string} methodName - Method to call
   * @returns {Object} Result or empty object if unavailable
   */
  static safeGetStats(component, methodName) {
    if (!component || typeof component[methodName] !== 'function') {
      return {};
    }
    try {
      return component[methodName]() || {};
    } catch {
      return {};
    }
  }

  /**
   * Safely get array length from a component method.
   *
   * @param {Object|null} component - Component instance
   * @param {string} methodName - Method that returns an array
   * @returns {number} Array length or 0 if unavailable
   */
  static safeGetLength(component, methodName) {
    if (!component || typeof component[methodName] !== 'function') {
      return 0;
    }
    try {
      const result = component[methodName]();
      return Array.isArray(result) ? result.length : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Build minimal status for health checks.
   *
   * @param {Object} clientState - Core client state
   * @returns {Object} Minimal status for health endpoint
   */
  static buildHealthStatus(clientState) {
    return {
      connected: clientState.isConnected,
      phone: clientState.phoneNumber,
      uptime: clientState.stats?.startedAt
        ? Math.floor((Date.now() - clientState.stats.startedAt) / 1000)
        : 0,
    };
  }

  /**
   * Build rate limit status for dedicated endpoint.
   *
   * @param {Object} rateLimiter - Rate limiter component
   * @param {Object} activityTracker - Activity tracker component
   * @returns {Object} Rate limit and activity status
   */
  static buildRateLimitStatus(rateLimiter, activityTracker) {
    return {
      rateLimits: this.safeGetStats(rateLimiter, 'getStats'),
      activity: this.safeGetStats(activityTracker, 'getStats'),
    };
  }
}

export default StatusAggregator;
