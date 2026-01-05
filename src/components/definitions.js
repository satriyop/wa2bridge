/**
 * Component Definitions
 *
 * Factory functions for all WhatsApp client components.
 * Organized by phase with explicit dependencies.
 */

import {
  MessageRateLimiter,
  ReconnectionManager,
  ActivityTracker,
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

/**
 * Register all components with the registry
 *
 * @param {import('../component-registry.js').ComponentRegistry} registry
 * @param {Object} context - Additional context (logger, sendFunction, etc.)
 */
export function registerAllComponents(registry, context = {}) {
  const { logger, sendFunction } = context;

  // =========================================================================
  // PHASE 1: Core Anti-Ban Components (no dependencies)
  // =========================================================================

  registry.register('rateLimiter', (opts) => new MessageRateLimiter({
    accountAgeWeeks: opts.accountAgeWeeks,
    sessionsDir: opts.sessionsDir,
  }));

  registry.register('reconnectionManager', (opts) => new ReconnectionManager({
    baseDelay: 1000,
    maxDelay: 300000,  // 5 minutes max
    maxAttempts: 15,
  }));

  registry.register('activityTracker', (opts) => new ActivityTracker(opts.sessionsDir));

  registry.register('presenceManager', (opts) => new PresenceManager({
    sessionsDir: opts.sessionsDir,
    activeHoursStart: opts.activeHoursStart,
    activeHoursEnd: opts.activeHoursEnd,
  }), { destroyMethod: 'stopPresenceCycle' });

  registry.register('banWarning', (opts) => new BanWarningSystem({
    sessionsDir: opts.sessionsDir,
    onWarning: (warning) => {
      logger?.warn(warning, 'Ban warning detected');
    },
    onCritical: (warning) => {
      logger?.error(warning, 'CRITICAL: Ban risk detected!');
    },
  }));

  registry.register('messageVariator', () => new MessageVariator());

  // =========================================================================
  // PHASE 2: Enhanced Anti-Ban Components
  // =========================================================================

  registry.register('deliveryTracker', (opts) => new DeliveryTracker({
    sessionsDir: opts.sessionsDir,
  }));

  registry.register('activityRamper', (opts) => new ActivityRamper({
    sessionsDir: opts.sessionsDir,
  }));

  registry.register('weekendPatterns', () => new WeekendPatterns({
    holidays: [
      '01-01', // New Year
      '12-25', // Christmas
      '12-31', // New Year's Eve
      '08-17', // Indonesian Independence Day
    ],
  }));

  registry.register('typingSimulator', () => new TypingSimulator({
    correctionProbability: 0.15,
  }));

  registry.register('emojiEnhancer', () => new EmojiEnhancer({
    probability: 0.2,
  }));

  registry.register('contactWarmup', (opts) => new ContactWarmup({
    sessionsDir: opts.sessionsDir,
  }));

  registry.register('groupBehavior', () => new GroupBehavior({
    groupDelayMultiplier: 2.0,
    groupResponseProbability: 0.7,
  }));

  registry.register('networkFingerprint', (opts) => new NetworkFingerprint({
    sessionsDir: opts.sessionsDir,
  }));

  // Message scheduler depends on rateLimiter for rate checking
  registry.register('messageScheduler', (opts, rateLimiter) => new MessageScheduler({
    sendFunction: sendFunction,
    logger: logger,
    rateLimiter: rateLimiter,
  }), { deps: ['rateLimiter'], destroyMethod: 'clear' });

  // =========================================================================
  // PHASE 3: Behavioral Simulation Components
  // =========================================================================

  registry.register('reactionManager', () => new ReactionManager({
    reactionProbability: 0.15,
  }));

  registry.register('replyProbability', (opts) => new ReplyProbability({
    baseReplyRate: 0.9,
    sessionsDir: opts.sessionsDir,
  }));

  registry.register('messageSplitter', () => new MessageSplitter({
    maxLength: 500,
    splitThreshold: 300,
  }));

  registry.register('statusViewer', (opts) => new StatusViewer({
    sessionsDir: opts.sessionsDir,
    viewProbability: 0.6,
  }), { destroyMethod: 'stopViewing' });

  registry.register('spamDetector', (opts) => new SpamReportDetector({
    sessionsDir: opts.sessionsDir,
    onSpamWarning: (warning) => {
      logger?.error(warning, 'SPAM DETECTION WARNING');
    },
  }));

  registry.register('geoMatcher', (opts) => new GeoIPMatcher({
    sessionsDir: opts.sessionsDir,
  }));

  registry.register('profileViewer', (opts) => new ProfileViewer({
    sessionsDir: opts.sessionsDir,
    viewProbability: 0.1,
  }));

  registry.register('forwardHandler', () => new ForwardHandler({
    forwardReplyProbability: 0.5,
  }));

  registry.register('conversationMemory', (opts) => new ConversationMemory({
    sessionsDir: opts.sessionsDir,
    maxMessages: 20,
  }));

  // =========================================================================
  // PHASE 4: Detection & Recovery Components
  // =========================================================================

  registry.register('blockDetector', (opts) => new BlockDetector({
    sessionsDir: opts.sessionsDir,
    onBlock: (info) => {
      logger?.warn(info, 'Contact blocked us');
    },
  }));

  registry.register('sessionManager', (opts) => new SessionManager({
    sessionsDir: opts.sessionsDir,
    maxBackups: 5,
  }), { destroyMethod: 'stopAutoBackup' });

  // Persistent queue depends on delivery tracker for status updates
  registry.register('persistentQueue', (opts) => new PersistentQueue({
    sessionsDir: opts.sessionsDir,
    sendFunction: sendFunction,
    logger: logger,
  }), { destroyMethod: 'saveQueue' });

  registry.register('webhookManager', (opts) => new WebhookManager({
    webhookUrl: opts.webhookUrl,
    apiSecret: opts.apiSecret,
    sessionsDir: opts.sessionsDir,
    logger: logger,
  }), { destroyMethod: 'saveFailedQueue' });

  // Webhook emitter (Phase 6 feature)
  registry.register('webhookEmitter', (opts) => new WebhookEventEmitter({
    webhookUrl: opts.webhookUrl,
    apiSecret: opts.apiSecret,
    sessionsDir: opts.sessionsDir,
    enabled: !!opts.webhookUrl,
  }));

  registry.register('healthMonitor', (opts) => new HealthMonitor({
    sessionsDir: opts.sessionsDir,
    logger: logger,
    onAlert: (alert) => {
      logger?.error(alert, 'HEALTH ALERT');
    },
  }), { destroyMethod: 'stop' });

  registry.register('languageDetector', (opts) => new LanguageDetector({
    sessionsDir: opts.sessionsDir,
  }));

  // =========================================================================
  // PHASE 5A: Analytics & Intelligence
  // =========================================================================

  registry.register('analytics', (opts) => new MessageAnalytics({
    sessionsDir: opts.sessionsDir,
  }));

  registry.register('contactScoring', (opts) => new ContactScoring({
    sessionsDir: opts.sessionsDir,
  }));

  registry.register('sentimentDetector', (opts) => new SentimentDetector({
    sessionsDir: opts.sessionsDir,
  }));

  // =========================================================================
  // PHASE 5B: Security Hardening
  // =========================================================================

  registry.register('ipWhitelist', (opts) => new IPWhitelist({
    sessionsDir: opts.sessionsDir,
    enabled: opts.ipWhitelistEnabled,
  }));

  registry.register('auditLogger', (opts) => new AuditLogger({
    sessionsDir: opts.sessionsDir,
  }));

  registry.register('apiRateLimiter', () => new APIRateLimiter({
    enabled: true,
  }));

  // =========================================================================
  // PHASE 5C: Smart Automation
  // =========================================================================

  registry.register('autoResponder', (opts) => new AutoResponder({
    sessionsDir: opts.sessionsDir,
    enabled: opts.autoResponderEnabled,
  }));

  registry.register('messageTemplates', (opts) => new MessageTemplates({
    sessionsDir: opts.sessionsDir,
  }));

  registry.register('scheduledMessages', (opts) => new ScheduledMessages({
    sessionsDir: opts.sessionsDir,
    sendFunction: sendFunction,
    logger: logger,
  }), { destroyMethod: 'stop' });
}

/**
 * Get component names grouped by phase
 * @returns {Object} Component names by phase
 */
export function getComponentPhases() {
  return {
    phase1: [
      'rateLimiter',
      'reconnectionManager',
      'activityTracker',
      'presenceManager',
      'banWarning',
      'messageVariator',
    ],
    phase2: [
      'deliveryTracker',
      'activityRamper',
      'weekendPatterns',
      'typingSimulator',
      'emojiEnhancer',
      'contactWarmup',
      'groupBehavior',
      'networkFingerprint',
      'messageScheduler',
    ],
    phase3: [
      'reactionManager',
      'replyProbability',
      'messageSplitter',
      'statusViewer',
      'spamDetector',
      'geoMatcher',
      'profileViewer',
      'forwardHandler',
      'conversationMemory',
    ],
    phase4: [
      'blockDetector',
      'sessionManager',
      'persistentQueue',
      'webhookManager',
      'webhookEmitter',
      'healthMonitor',
      'languageDetector',
    ],
    phase5: [
      'analytics',
      'contactScoring',
      'sentimentDetector',
      'ipWhitelist',
      'auditLogger',
      'apiRateLimiter',
      'autoResponder',
      'messageTemplates',
      'scheduledMessages',
    ],
  };
}

export default {
  registerAllComponents,
  getComponentPhases,
};
