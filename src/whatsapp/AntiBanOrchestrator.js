/**
 * Anti-Ban Orchestrator
 *
 * Manages initialization and coordination of all 40 anti-ban components.
 * Centralizes component dependencies and lifecycle management.
 */

import {
  humanDelay,
  calculateTypingDuration,
  getBrowserFingerprint,
  checkMessageSafety,
  MessageRateLimiter,
  ReconnectionManager,
  ActivityTracker,
  // Phase 1 features
  PresenceManager,
  BanWarningSystem,
  MessageVariator,
  calculateReadDelay,
  simulateHumanReading,
  // Phase 2 features
  MessageScheduler,
  DeliveryTracker,
  ActivityRamper,
  WeekendPatterns,
  TypingSimulator,
  EmojiEnhancer,
  ContactWarmup,
  GroupBehavior,
  NetworkFingerprint,
  // Phase 3 features
  ReactionManager,
  ReplyProbability,
  MessageSplitter,
  StatusViewer,
  SpamReportDetector,
  GeoIPMatcher,
  ProfileViewer,
  ForwardHandler,
  ConversationMemory,
  // Phase 4 features
  BlockDetector,
  SessionManager,
  PersistentQueue,
  WebhookManager,
  HealthMonitor,
  LanguageDetector,
  // Phase 5 features
  MessageAnalytics,
  ContactScoring,
  SentimentDetector,
  IPWhitelist,
  AuditLogger,
  APIRateLimiter,
  AutoResponder,
  MessageTemplates,
  ScheduledMessages,
} from '../anti-ban/index.js';

import { WebhookEventEmitter } from '../webhook-events.js';
import { LifecycleManager } from '../lifecycle-manager.js';
import { config } from '../config.js';

/**
 * @typedef {Object} OrchestratorOptions
 * @property {string} sessionsDir - Path to sessions directory
 * @property {string} [webhookUrl] - URL for webhook events
 * @property {string} [apiSecret] - API secret for webhook auth
 * @property {number} [accountAgeWeeks] - Account age for rate limits
 * @property {number} [activeHoursStart] - Start of active hours (0-23)
 * @property {number} [activeHoursEnd] - End of active hours (0-23)
 * @property {boolean} [ipWhitelistEnabled] - Enable IP whitelist
 * @property {boolean} [autoResponderEnabled] - Enable auto-responder
 * @property {Object} [logger] - Pino logger instance
 * @property {Function} [sendFunction] - Function to send messages (for queues)
 */

/**
 * Orchestrates all anti-ban components.
 *
 * This class centralizes the creation, configuration, and lifecycle
 * management of 40+ anti-ban protection components.
 */
export class AntiBanOrchestrator {
  /**
   * @param {OrchestratorOptions} options
   */
  constructor(options) {
    this.options = options;
    this.sessionsDir = options.sessionsDir;
    this.logger = options.logger;

    // Initialize all components
    this._initializePhase1Components(options);
    this._initializePhase2Components(options);
    this._initializePhase3Components(options);
    this._initializePhase4Components(options);
    this._initializePhase5Components(options);

    // Initialize lifecycle tracking
    this.lifecycle = new LifecycleManager();
    this._setupLifecycleTracking();
  }

  /**
   * Phase 1: Core anti-ban components
   * Rate limiting, reconnection, presence, ban warning
   */
  _initializePhase1Components(options) {
    this.rateLimiter = new MessageRateLimiter({
      accountAgeWeeks: options.accountAgeWeeks || config.account.ageWeeks,
      sessionsDir: this.sessionsDir,
    });

    this.reconnectionManager = new ReconnectionManager({
      baseDelay: config.reconnection.baseDelayMs,
      maxDelay: config.reconnection.maxDelayMs,
      maxAttempts: config.reconnection.maxAttempts,
    });

    this.activityTracker = new ActivityTracker(this.sessionsDir);

    this.presenceManager = new PresenceManager({
      sessionsDir: this.sessionsDir,
      activeHoursStart: options.activeHoursStart ?? config.account.activeHoursStart,
      activeHoursEnd: options.activeHoursEnd ?? config.account.activeHoursEnd,
    });

    this.banWarning = new BanWarningSystem({
      sessionsDir: this.sessionsDir,
      onWarning: (warning) => {
        this.logger?.warn(warning, 'Ban warning detected');
      },
      onCritical: (warning) => {
        this.logger?.error(warning, 'CRITICAL: Ban risk detected!');
      },
    });

    this.messageVariator = new MessageVariator();
  }

  /**
   * Phase 2: Enhanced anti-ban components
   * Delivery tracking, activity ramping, weekend patterns, etc.
   */
  _initializePhase2Components(options) {
    this.deliveryTracker = new DeliveryTracker({
      sessionsDir: this.sessionsDir,
    });

    this.activityRamper = new ActivityRamper({
      sessionsDir: this.sessionsDir,
    });

    this.weekendPatterns = new WeekendPatterns({
      holidays: config.patterns.holidays,
    });

    this.typingSimulator = new TypingSimulator({
      correctionProbability: config.probabilities.correction,
    });

    this.emojiEnhancer = new EmojiEnhancer({
      probability: config.probabilities.emoji,
    });

    this.contactWarmup = new ContactWarmup({
      sessionsDir: this.sessionsDir,
    });

    this.groupBehavior = new GroupBehavior({
      groupDelayMultiplier: config.groups.delayMultiplier,
      groupResponseProbability: config.groups.responseRate,
    });

    this.networkFingerprint = new NetworkFingerprint({
      sessionsDir: this.sessionsDir,
    });

    // Message scheduler needs sendFunction - will be set later
    this.messageScheduler = new MessageScheduler({
      sendFunction: options.sendFunction || (() => Promise.reject(new Error('Send function not set'))),
      logger: this.logger,
    });
  }

  /**
   * Phase 3: Behavioral simulation components
   * Reactions, reply probability, message splitting, etc.
   */
  _initializePhase3Components(options) {
    this.reactionManager = new ReactionManager({
      reactionProbability: config.probabilities.reaction,
    });

    this.replyProbability = new ReplyProbability({
      baseReplyRate: config.probabilities.baseReply,
      sessionsDir: this.sessionsDir,
    });

    this.messageSplitter = new MessageSplitter({
      maxLength: config.messageSplit.maxLength,
      splitThreshold: config.messageSplit.splitThreshold,
    });

    this.statusViewer = new StatusViewer({
      sessionsDir: this.sessionsDir,
      viewProbability: config.probabilities.statusView,
    });

    this.spamDetector = new SpamReportDetector({
      sessionsDir: this.sessionsDir,
      onSpamWarning: (warning) => {
        this.logger?.error(warning, 'SPAM DETECTION WARNING');
      },
    });

    this.geoMatcher = new GeoIPMatcher({
      sessionsDir: this.sessionsDir,
    });

    this.profileViewer = new ProfileViewer({
      sessionsDir: this.sessionsDir,
      viewProbability: config.probabilities.profileView,
    });

    this.forwardHandler = new ForwardHandler({
      forwardReplyProbability: config.forwards.replyProbability,
    });

    this.conversationMemory = new ConversationMemory({
      sessionsDir: this.sessionsDir,
      maxMessages: config.conversationMemory.maxMessages,
    });
  }

  /**
   * Phase 4: Detection & Recovery components
   * Block detection, session management, persistent queues, etc.
   */
  _initializePhase4Components(options) {
    this.blockDetector = new BlockDetector({
      sessionsDir: this.sessionsDir,
      onBlock: (info) => {
        this.logger?.warn(info, 'Contact blocked us');
      },
    });

    this.sessionManager = new SessionManager({
      sessionsDir: this.sessionsDir,
      maxBackups: config.session.maxBackups,
    });

    this.persistentQueue = new PersistentQueue({
      sessionsDir: this.sessionsDir,
      sendFunction: options.sendFunction || (() => Promise.reject(new Error('Send function not set'))),
      logger: this.logger,
    });

    this.webhookManager = new WebhookManager({
      webhookUrl: options.webhookUrl,
      apiSecret: options.apiSecret,
      sessionsDir: this.sessionsDir,
      logger: this.logger,
    });

    this.webhookEmitter = new WebhookEventEmitter({
      webhookUrl: options.webhookUrl,
      apiSecret: options.apiSecret,
      sessionsDir: this.sessionsDir,
      enabled: !!options.webhookUrl,
    });

    this.healthMonitor = new HealthMonitor({
      sessionsDir: this.sessionsDir,
      logger: this.logger,
      onAlert: (alert) => {
        this.logger?.error(alert, 'HEALTH ALERT');
      },
    });

    this.languageDetector = new LanguageDetector({
      sessionsDir: this.sessionsDir,
    });
  }

  /**
   * Phase 5: Analytics & Intelligence components
   * Analytics, contact scoring, sentiment, security, automation
   */
  _initializePhase5Components(options) {
    // Phase 5A: Analytics & Intelligence
    this.analytics = new MessageAnalytics({
      sessionsDir: this.sessionsDir,
    });

    this.contactScoring = new ContactScoring({
      sessionsDir: this.sessionsDir,
    });

    this.sentimentDetector = new SentimentDetector({
      sessionsDir: this.sessionsDir,
    });

    // Phase 5B: Security Hardening
    this.ipWhitelist = new IPWhitelist({
      sessionsDir: this.sessionsDir,
      enabled: options.ipWhitelistEnabled ?? false,
    });

    this.auditLogger = new AuditLogger({
      sessionsDir: this.sessionsDir,
    });

    this.apiRateLimiter = new APIRateLimiter({
      enabled: true,
    });

    // Phase 5C: Smart Automation
    this.autoResponder = new AutoResponder({
      sessionsDir: this.sessionsDir,
      enabled: options.autoResponderEnabled ?? false,
    });

    this.messageTemplates = new MessageTemplates({
      sessionsDir: this.sessionsDir,
    });

    this.scheduledMessages = new ScheduledMessages({
      sessionsDir: this.sessionsDir,
      sendFunction: options.sendFunction || (() => Promise.reject(new Error('Send function not set'))),
      logger: this.logger,
    });
  }

  /**
   * Set socket reference for socket-dependent components.
   * Called after connection is established.
   *
   * @param {Object} socket - Baileys socket instance
   */
  setSocket(socket) {
    this.presenceManager.setSocket(socket);
    this.reactionManager.setSocket(socket);
    this.statusViewer.setSocket(socket);
    this.profileViewer.setSocket(socket);
    this.blockDetector.setSocket(socket);
  }

  /**
   * Update the send function for queue-based components.
   * Called after WhatsAppClient._directSend is available.
   *
   * @param {Function} sendFunction - Async function(to, text, replyToMessageId)
   */
  setSendFunction(sendFunction) {
    // Update message scheduler
    this.messageScheduler = new MessageScheduler({
      sendFunction,
      logger: this.logger,
    });

    // Update persistent queue
    this.persistentQueue = new PersistentQueue({
      sessionsDir: this.sessionsDir,
      sendFunction,
      logger: this.logger,
    });

    // Update scheduled messages
    this.scheduledMessages = new ScheduledMessages({
      sessionsDir: this.sessionsDir,
      sendFunction,
      logger: this.logger,
    });

    // Re-setup lifecycle for the new instances
    this._setupLifecycleTracking();
  }

  /**
   * Start all background services after connection.
   */
  startServices() {
    this.presenceManager.startPresenceCycle();
    this.statusViewer.startViewing();
    this.sessionManager.startAutoBackup();
    this.healthMonitor.start();
    this.scheduledMessages.start();
  }

  /**
   * Stop all background services before disconnect.
   */
  stopServices() {
    this.presenceManager.stopPresenceCycle();
    this.statusViewer.stopViewing();
    this.sessionManager.stopAutoBackup();
    this.healthMonitor.stop();
    this.scheduledMessages.stop();
  }

  /**
   * Record connection-related events.
   */
  recordConnectionDrop() {
    this.banWarning.recordConnectionDrop();
    this.healthMonitor.recordConnectionDrop();
  }

  /**
   * Get all components as an object (for StatusAggregator).
   *
   * @returns {Object} All component references
   */
  getAllComponents() {
    return {
      // Phase 1
      rateLimiter: this.rateLimiter,
      activityTracker: this.activityTracker,
      reconnectionManager: this.reconnectionManager,
      presenceManager: this.presenceManager,
      banWarning: this.banWarning,

      // Phase 2
      deliveryTracker: this.deliveryTracker,
      activityRamper: this.activityRamper,
      weekendPatterns: this.weekendPatterns,
      messageScheduler: this.messageScheduler,
      networkFingerprint: this.networkFingerprint,

      // Phase 3
      spamDetector: this.spamDetector,
      geoMatcher: this.geoMatcher,
      statusViewer: this.statusViewer,
      profileViewer: this.profileViewer,
      conversationMemory: this.conversationMemory,

      // Phase 4
      blockDetector: this.blockDetector,
      sessionManager: this.sessionManager,
      persistentQueue: this.persistentQueue,
      webhookManager: this.webhookManager,
      healthMonitor: this.healthMonitor,

      // Phase 5
      analytics: this.analytics,
      contactScoring: this.contactScoring,
      sentimentDetector: this.sentimentDetector,
      ipWhitelist: this.ipWhitelist,
      auditLogger: this.auditLogger,
      apiRateLimiter: this.apiRateLimiter,
      autoResponder: this.autoResponder,
      messageTemplates: this.messageTemplates,
      scheduledMessages: this.scheduledMessages,
    };
  }

  /**
   * Log startup information.
   */
  logStartupInfo() {
    const limits = this.rateLimiter.getLimits();
    this.logger?.info({ limits: limits.description }, 'Rate limits configured');
    this.logger?.info({
      activeHours: `${this.presenceManager.activeHoursStart}:00 - ${this.presenceManager.activeHoursEnd}:00`
    }, 'Presence management configured');

    this.logger?.info({
      weekend: this.weekendPatterns.getStatus(),
    }, 'Weekend patterns configured');

    this.logger?.info('Phase 2 anti-ban features loaded: DeliveryTracker, ActivityRamper, WeekendPatterns, TypingSimulator, EmojiEnhancer, ContactWarmup, GroupBehavior, NetworkFingerprint');
    this.logger?.info('Phase 3 anti-ban features loaded: ReactionManager, ReplyProbability, MessageSplitter, StatusViewer, SpamReportDetector, GeoIPMatcher, ProfileViewer, ForwardHandler, ConversationMemory');
    this.logger?.info('Phase 4 anti-ban features loaded: BlockDetector, SessionManager, PersistentQueue, WebhookManager, HealthMonitor, LanguageDetector');
    this.logger?.info('Phase 5 features loaded: Analytics, ContactScoring, SentimentDetector, IPWhitelist, AuditLogger, APIRateLimiter, AutoResponder, MessageTemplates, ScheduledMessages');
  }

  /**
   * Setup lifecycle tracking for all components.
   * @private
   */
  _setupLifecycleTracking() {
    this.lifecycle = new LifecycleManager();

    // Phase 1: Core components
    this.lifecycle.track('rateLimiter', this.rateLimiter, 'saveStats');
    this.lifecycle.track('reconnectionManager', this.reconnectionManager);
    this.lifecycle.track('activityTracker', this.activityTracker, 'saveStats');
    this.lifecycle.track('presenceManager', this.presenceManager, 'stopPresenceCycle');
    this.lifecycle.track('banWarning', this.banWarning, 'saveState');
    this.lifecycle.track('messageVariator', this.messageVariator);

    // Phase 2: Enhanced anti-ban
    this.lifecycle.track('deliveryTracker', this.deliveryTracker, 'destroy');
    this.lifecycle.track('activityRamper', this.activityRamper, 'saveState');
    this.lifecycle.track('weekendPatterns', this.weekendPatterns);
    this.lifecycle.track('typingSimulator', this.typingSimulator);
    this.lifecycle.track('emojiEnhancer', this.emojiEnhancer);
    this.lifecycle.track('contactWarmup', this.contactWarmup, 'saveState');
    this.lifecycle.track('groupBehavior', this.groupBehavior);
    this.lifecycle.track('networkFingerprint', this.networkFingerprint, 'saveState');
    this.lifecycle.track('messageScheduler', this.messageScheduler, 'clear');

    // Phase 3: Behavioral simulation
    this.lifecycle.track('reactionManager', this.reactionManager);
    this.lifecycle.track('replyProbability', this.replyProbability, 'saveState');
    this.lifecycle.track('messageSplitter', this.messageSplitter);
    this.lifecycle.track('statusViewer', this.statusViewer, 'stopViewing');
    this.lifecycle.track('spamDetector', this.spamDetector, 'saveState');
    this.lifecycle.track('geoMatcher', this.geoMatcher, 'saveState');
    this.lifecycle.track('profileViewer', this.profileViewer, 'saveState');
    this.lifecycle.track('forwardHandler', this.forwardHandler);
    this.lifecycle.track('conversationMemory', this.conversationMemory, 'saveState');

    // Phase 4: Detection & Recovery
    this.lifecycle.track('blockDetector', this.blockDetector, 'saveState');
    this.lifecycle.track('sessionManager', this.sessionManager, 'stopAutoBackup');
    this.lifecycle.track('persistentQueue', this.persistentQueue, 'saveQueue');
    this.lifecycle.track('webhookManager', this.webhookManager, 'saveFailedQueue');
    this.lifecycle.track('webhookEmitter', this.webhookEmitter, 'destroy');
    this.lifecycle.track('healthMonitor', this.healthMonitor, 'stop');
    this.lifecycle.track('languageDetector', this.languageDetector, 'saveState');

    // Phase 5A: Analytics & Intelligence
    this.lifecycle.track('analytics', this.analytics, 'saveState');
    this.lifecycle.track('contactScoring', this.contactScoring, 'saveState');
    this.lifecycle.track('sentimentDetector', this.sentimentDetector, 'saveState');

    // Phase 5B: Security Hardening
    this.lifecycle.track('ipWhitelist', this.ipWhitelist, 'saveState');
    this.lifecycle.track('auditLogger', this.auditLogger, 'flush');
    this.lifecycle.track('apiRateLimiter', this.apiRateLimiter, 'destroy');

    // Phase 5C: Smart Automation
    this.lifecycle.track('autoResponder', this.autoResponder, 'saveState');
    this.lifecycle.track('messageTemplates', this.messageTemplates, 'saveState');
    this.lifecycle.track('scheduledMessages', this.scheduledMessages, 'stop');

    this.logger?.debug({ components: this.lifecycle.size }, 'Lifecycle tracking initialized');
  }

  /**
   * Destroy all components via lifecycle manager.
   *
   * @param {Object} [logger] - Optional logger for cleanup logging
   */
  async destroy(logger) {
    await this.lifecycle.destroyAll(logger || this.logger);
  }

  /**
   * Get lifecycle manager size (number of tracked components).
   *
   * @returns {number} Number of tracked components
   */
  get lifecycleSize() {
    return this.lifecycle.size;
  }
}

// Re-export utilities that MessageHandler needs
export {
  humanDelay,
  calculateTypingDuration,
  getBrowserFingerprint,
  checkMessageSafety,
  calculateReadDelay,
  simulateHumanReading,
};

export default AntiBanOrchestrator;
