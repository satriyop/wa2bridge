/**
 * Anti-Ban Module Index
 *
 * Re-exports all anti-ban utilities for backward compatibility.
 * This file provides the same API as the original anti-ban.js
 */

// ====================
// CORE UTILITIES
// ====================
export {
  humanDelay,
  calculateTypingDuration,
  calculateThinkingPause,
  calculateReadDelay,
  calculateThinkingDelay,
  simulateHumanReading,
} from './core/timing.js';

export { getBrowserFingerprint } from './core/fingerprint.js';
export { checkMessageSafety } from './core/safety.js';

// ====================
// RATE LIMITING
// ====================
export { MessageRateLimiter } from './rate-limiting/message-limiter.js';
export { ReconnectionManager } from './rate-limiting/reconnection.js';
export { ActivityTracker } from './rate-limiting/activity.js';

// ====================
// PRESENCE
// ====================
export { PresenceManager } from './presence/manager.js';
export { TypingSimulator } from './presence/typing.js';

// ====================
// DETECTION
// ====================
export { BanWarningSystem } from './detection/ban-warning.js';
export { BlockDetector } from './detection/block.js';
export { SpamReportDetector } from './detection/spam.js';
export { HealthMonitor } from './detection/health.js';

// ====================
// MESSAGE
// ====================
export { MessageVariator } from './message/variator.js';
export { MessageSplitter } from './message/splitter.js';
export { EmojiEnhancer } from './message/emoji.js';

// ====================
// PATTERNS
// ====================
export { GroupBehavior } from './patterns/group.js';
export { ForwardHandler } from './patterns/forward.js';
export { WeekendPatterns } from './patterns/weekend.js';
export { ActivityRamper } from './patterns/activity-ramp.js';
export { ReplyProbability } from './patterns/reply.js';

// ====================
// CONTACT
// ====================
export { ContactWarmup } from './contact/warmup.js';
export { ConversationMemory } from './contact/conversation.js';
export { ContactScoring } from './contact/scoring.js';

// ====================
// TRACKING
// ====================
export { DeliveryTracker } from './tracking/delivery.js';
export { ReactionManager } from './tracking/reactions.js';
export { StatusViewer } from './tracking/status.js';
export { ProfileViewer } from './tracking/profile.js';

// ====================
// SESSION
// ====================
export { SessionManager } from './session/manager.js';

// ====================
// QUEUE
// ====================
export { PersistentQueue } from './queue/persistent.js';
export { MessageScheduler } from './queue/scheduler.js';
export { ScheduledMessages } from './queue/scheduled.js';

// ====================
// WEBHOOK
// ====================
export { WebhookManager } from './webhook/manager.js';

// ====================
// NETWORK
// ====================
export { NetworkFingerprint } from './network/fingerprint.js';
export { GeoIPMatcher } from './network/geo.js';

// ====================
// ANALYTICS
// ====================
export { LanguageDetector } from './analytics/language.js';
export { MessageAnalytics } from './analytics/messages.js';
export { SentimentDetector } from './analytics/sentiment.js';

// ====================
// SECURITY
// ====================
export { IPWhitelist } from './security/ip-whitelist.js';
export { AuditLogger } from './security/audit.js';
export { APIRateLimiter } from './security/api-rate-limit.js';

// ====================
// AUTOMATION
// ====================
export { AutoResponder } from './automation/auto-responder.js';
export { MessageTemplates } from './automation/templates.js';

// ====================
// DEFAULT EXPORT (backward compatibility)
// ====================
import { humanDelay, calculateTypingDuration, calculateThinkingPause, calculateReadDelay, calculateThinkingDelay, simulateHumanReading } from './core/timing.js';
import { getBrowserFingerprint } from './core/fingerprint.js';
import { checkMessageSafety } from './core/safety.js';
import { MessageRateLimiter } from './rate-limiting/message-limiter.js';
import { ReconnectionManager } from './rate-limiting/reconnection.js';
import { ActivityTracker } from './rate-limiting/activity.js';
import { PresenceManager } from './presence/manager.js';
import { TypingSimulator } from './presence/typing.js';
import { BanWarningSystem } from './detection/ban-warning.js';
import { BlockDetector } from './detection/block.js';
import { SpamReportDetector } from './detection/spam.js';
import { HealthMonitor } from './detection/health.js';
import { MessageVariator } from './message/variator.js';
import { MessageSplitter } from './message/splitter.js';
import { EmojiEnhancer } from './message/emoji.js';
import { GroupBehavior } from './patterns/group.js';
import { ForwardHandler } from './patterns/forward.js';
import { WeekendPatterns } from './patterns/weekend.js';
import { ActivityRamper } from './patterns/activity-ramp.js';
import { ReplyProbability } from './patterns/reply.js';
import { ContactWarmup } from './contact/warmup.js';
import { ConversationMemory } from './contact/conversation.js';
import { ContactScoring } from './contact/scoring.js';
import { DeliveryTracker } from './tracking/delivery.js';
import { ReactionManager } from './tracking/reactions.js';
import { StatusViewer } from './tracking/status.js';
import { ProfileViewer } from './tracking/profile.js';
import { SessionManager } from './session/manager.js';
import { PersistentQueue } from './queue/persistent.js';
import { MessageScheduler } from './queue/scheduler.js';
import { ScheduledMessages } from './queue/scheduled.js';
import { WebhookManager } from './webhook/manager.js';
import { NetworkFingerprint } from './network/fingerprint.js';
import { GeoIPMatcher } from './network/geo.js';
import { LanguageDetector } from './analytics/language.js';
import { MessageAnalytics } from './analytics/messages.js';
import { SentimentDetector } from './analytics/sentiment.js';
import { IPWhitelist } from './security/ip-whitelist.js';
import { AuditLogger } from './security/audit.js';
import { APIRateLimiter } from './security/api-rate-limit.js';
import { AutoResponder } from './automation/auto-responder.js';
import { MessageTemplates } from './automation/templates.js';

export default {
  // Core utilities
  humanDelay,
  calculateTypingDuration,
  calculateThinkingPause,
  calculateReadDelay,
  calculateThinkingDelay,
  simulateHumanReading,
  getBrowserFingerprint,
  checkMessageSafety,

  // Rate limiting
  MessageRateLimiter,
  ReconnectionManager,
  ActivityTracker,

  // Presence
  PresenceManager,
  TypingSimulator,

  // Detection
  BanWarningSystem,
  BlockDetector,
  SpamReportDetector,
  HealthMonitor,

  // Message
  MessageVariator,
  MessageSplitter,
  EmojiEnhancer,

  // Patterns
  GroupBehavior,
  ForwardHandler,
  WeekendPatterns,
  ActivityRamper,
  ReplyProbability,

  // Contact
  ContactWarmup,
  ConversationMemory,
  ContactScoring,

  // Tracking
  DeliveryTracker,
  ReactionManager,
  StatusViewer,
  ProfileViewer,

  // Session
  SessionManager,

  // Queue
  PersistentQueue,
  MessageScheduler,
  ScheduledMessages,

  // Webhook
  WebhookManager,

  // Network
  NetworkFingerprint,
  GeoIPMatcher,

  // Analytics
  LanguageDetector,
  MessageAnalytics,
  SentimentDetector,

  // Security
  IPWhitelist,
  AuditLogger,
  APIRateLimiter,

  // Automation
  AutoResponder,
  MessageTemplates,
};
