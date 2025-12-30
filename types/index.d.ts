/**
 * WA2Bridge TypeScript Definitions
 *
 * These types define the API contract between wa2bridge and client applications.
 * Import in TypeScript/JavaScript projects for type-safe API integration.
 *
 * @example
 * ```typescript
 * import type { SendMessageRequest, StatusResponse } from 'wa2bridge/types';
 * ```
 */

// =============================================================================
// CORE API TYPES
// =============================================================================

/** Request body for POST /api/send */
export interface SendMessageRequest {
  /** WhatsApp phone number (e.g., "+6281234567890" or "6281234567890@s.whatsapp.net") */
  to: string;
  /** Message text content */
  message: string;
  /** Optional message ID to reply to */
  reply_to?: string;
}

/** Response from POST /api/send */
export interface SendMessageResponse {
  success: boolean;
  messageId?: string;
  to?: string;
  error?: string;
}

/** Response from GET /api/status */
export interface StatusResponse {
  connected: boolean;
  phone: string | null;
  name: string | null;
  qr: string | null;
  uptime: number;
  stats?: {
    messagesSent: number;
    messagesReceived: number;
  };
  rateLimits?: RateLimitStatus;
  banWarning?: BanWarningStatus;
  activity?: ActivityStats;
}

/** Response from GET /api/qr */
export interface QRResponse {
  status: 'connected' | 'waiting_scan' | 'initializing';
  qr: string | null;
  phone?: string;
}

/** Response from GET /health */
export interface HealthResponse {
  status: 'ok';
  timestamp: string;
}

// =============================================================================
// RATE LIMITING TYPES
// =============================================================================

/** Rate limit tier configuration */
export interface RateLimitTier {
  hourly: number;
  daily: number;
  description: string;
}

/** Current rate limit status */
export interface RateLimitStatus {
  hourly: {
    used: number;
    limit: number;
    remaining: number;
  };
  daily: {
    used: number;
    limit: number;
    remaining: number;
  };
  accountAgeWeeks: number;
  tier: RateLimitTier;
}

/** Result of rate limit check */
export interface RateLimitCheckResult {
  allowed: boolean;
  reason?: string;
  waitMs?: number;
}

// =============================================================================
// BAN WARNING TYPES
// =============================================================================

/** Ban warning levels */
export type WarningLevel = 'normal' | 'elevated' | 'high' | 'critical';

/** Ban warning metrics */
export interface BanWarningMetrics {
  deliveryFailures: number;
  deliverySuccesses: number;
  rateLimitHits: number;
  connectionDrops: number;
  blockedByRecipients: number;
  lastReset: number;
}

/** Ban warning status */
export interface BanWarningStatus {
  currentLevel: WarningLevel;
  riskScore: number;
  hibernationMode: boolean;
  metrics: BanWarningMetrics;
  recommendation?: string;
}

// =============================================================================
// ACTIVITY & ANALYTICS TYPES
// =============================================================================

/** Activity tracking stats */
export interface ActivityStats {
  sent: number;
  received: number;
  responseRatio: string;
  uniqueRecipients: number;
  uniqueSenders: number;
}

/** Message analytics summary */
export interface AnalyticsSummary {
  totalMessagesSent: number;
  totalMessagesReceived: number;
  uniqueContacts: number;
  avgMessageLength: number;
  peakHours: number[];
}

/** Contact-specific analytics */
export interface ContactAnalytics {
  sent: number;
  received: number;
  avgLength: number;
  lastContact: number;
  responseTime: number | null;
}

// =============================================================================
// CONTACT MANAGEMENT TYPES
// =============================================================================

/** Contact warmup status */
export type WarmupStatus = 'new' | 'warming' | 'warmed';

/** Contact warmup info */
export interface ContactWarmupInfo {
  status: WarmupStatus;
  firstContact?: number;
  messageCount?: number;
  messagesThisPeriod?: number;
  warmupDaysRemaining: number;
}

/** Contact messaging permission */
export interface ContactPermission {
  allowed: boolean;
  isNew?: boolean;
  dailyLimit?: number;
  remaining?: number;
  reason?: string;
}

/** Contact scoring tier */
export type ContactTier = 'new' | 'cold' | 'warm' | 'hot' | 'vip';

/** Contact score info */
export interface ContactScoreInfo {
  score: number;
  tier: ContactTier;
  lastInteraction: number | null;
  engagementRate: number;
}

// =============================================================================
// DELIVERY TRACKING TYPES
// =============================================================================

/** Message delivery status */
export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'pending';

/** Delivery tracking stats */
export interface DeliveryStats {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  pending: number;
  deliveryRate: string;
  readRate: string;
}

/** Delivery health check result */
export interface DeliveryHealth {
  healthy: boolean;
  issues: DeliveryIssue[];
  stats: DeliveryStats;
}

/** Delivery issue */
export interface DeliveryIssue {
  type: 'slow_delivery' | 'possible_block';
  messageId: string;
  to: string;
  age: number;
}

// =============================================================================
// QUEUE TYPES
// =============================================================================

/** Message priority levels */
export type MessagePriority = 'high' | 'normal' | 'low';

/** Queue message request */
export interface QueueMessageRequest {
  to: string;
  message: string;
  reply_to?: string;
  priority?: MessagePriority;
}

/** Queue status */
export interface QueueStatus {
  queueLength: number;
  processing: boolean;
  messagesSentInBatch: number;
  batchSize: number;
}

/** Persistent queue stats */
export interface PersistentQueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  retrying: number;
}

// =============================================================================
// LANGUAGE & SENTIMENT TYPES
// =============================================================================

/** Detected language */
export type LanguageCode = 'id' | 'en' | null;

/** Language detection result */
export interface LanguageDetection {
  language: LanguageCode;
  name?: string;
  confidence: number;
}

/** Sentiment type */
export type Sentiment = 'positive' | 'negative' | 'neutral';

/** Sentiment analysis result */
export interface SentimentAnalysis {
  sentiment: Sentiment;
  score: number;
  confidence: number;
}

// =============================================================================
// AUTO-RESPONDER TYPES
// =============================================================================

/** Auto-responder trigger types */
export type TriggerType = 'contains' | 'exact' | 'regex' | 'startsWith' | 'endsWith';

/** Auto-responder trigger */
export interface AutoResponderTrigger {
  type: TriggerType;
  value: string;
}

/** Auto-responder rule */
export interface AutoResponderRule {
  id?: string;
  trigger: AutoResponderTrigger;
  response: string;
  priority?: number;
  enabled?: boolean;
  cooldownMs?: number;
}

/** Auto-responder match result */
export interface AutoResponderMatch {
  matched: boolean;
  rule?: AutoResponderRule;
  response?: string;
}

// =============================================================================
// TEMPLATE TYPES
// =============================================================================

/** Message template */
export interface MessageTemplate {
  name: string;
  content: string;
  category?: string;
  language?: string;
  variables?: string[];
  createdAt: number;
  updatedAt: number;
}

/** Template render request */
export interface TemplateRenderRequest {
  name: string;
  variables?: Record<string, string>;
}

// =============================================================================
// SCHEDULED MESSAGE TYPES
// =============================================================================

/** Scheduled message repeat options */
export type RepeatType = 'once' | 'daily' | 'weekly' | 'monthly';

/** Scheduled message status */
export type ScheduledStatus = 'pending' | 'sent' | 'cancelled' | 'failed';

/** Scheduled message */
export interface ScheduledMessage {
  id: string;
  to: string;
  message: string;
  sendAt: number;
  repeat?: RepeatType;
  replyTo?: string;
  status: ScheduledStatus;
  createdAt: number;
  sentAt?: number;
  error?: string;
}

/** Scheduled messages stats */
export interface ScheduledStats {
  byStatus: Record<ScheduledStatus, number>;
  byRepeat: Record<RepeatType, number>;
  nextScheduled: ScheduledMessage | null;
}

// =============================================================================
// WEBHOOK TYPES
// =============================================================================

/** Webhook event categories */
export type WebhookEventCategory =
  | 'message'
  | 'presence'
  | 'connection'
  | 'contact'
  | 'status'
  | 'antiban';

/** Webhook event types */
export type WebhookEventType =
  | 'message.received'
  | 'message.sent'
  | 'message.delivered'
  | 'message.read'
  | 'message.failed'
  | 'presence.online'
  | 'presence.offline'
  | 'presence.typing'
  | 'presence.recording'
  | 'connection.open'
  | 'connection.close'
  | 'connection.qr_update'
  | 'connection.logged_out'
  | 'contact.profile_update'
  | 'contact.blocked'
  | 'contact.unblocked'
  | 'status.view'
  | 'status.reaction'
  | 'antiban.warning'
  | 'antiban.hibernation'
  | 'antiban.rate_limit'
  | 'webhook.test';

/** Webhook payload base */
export interface WebhookPayload {
  event: WebhookEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

/** Message received webhook data */
export interface MessageReceivedData {
  from: string;
  text: string;
  messageId: string;
  isGroup: boolean;
  groupId?: string;
  quotedMessage?: {
    id: string;
    text: string;
  };
}

/** Message sent webhook data */
export interface MessageSentData {
  to: string;
  text: string;
  messageId: string;
}

/** Webhook stats */
export interface WebhookStats {
  enabled: boolean;
  url: string | null;
  subscriptions: WebhookEventType[];
  successCount: number;
  failCount: number;
  lastSuccess: number | null;
  lastFailure: number | null;
}

// =============================================================================
// SECURITY TYPES
// =============================================================================

/** IP whitelist status */
export interface IPWhitelistStatus {
  enabled: boolean;
  whitelist: string[];
  blacklist: string[];
}

/** Audit log entry */
export interface AuditLogEntry {
  id: string;
  type: string;
  action: string;
  ip?: string;
  timestamp: number;
  details?: Record<string, unknown>;
}

/** Security event */
export interface SecurityEvent {
  type: 'auth_failure' | 'rate_limit' | 'blocked_ip' | 'suspicious_activity';
  timestamp: number;
  ip?: string;
  details: string;
}

// =============================================================================
// RECONNECTION TYPES
// =============================================================================

/** Reconnection manager state */
export interface ReconnectionState {
  attempts: number;
  maxAttempts: number;
  currentDelay: number;
  lastAttempt: number | null;
  willGiveUp: boolean;
}

/** Reconnection delay result */
export interface ReconnectionDelayResult {
  delay: number;
  attempt: number;
  shouldGiveUp?: boolean;
  giveUp?: boolean;
}

// =============================================================================
// SESSION TYPES
// =============================================================================

/** Session backup info */
export interface SessionBackupInfo {
  lastBackupTime: number | null;
  autoBackupActive: boolean;
  backupCount: number;
  maxBackups: number;
  latestBackup: string | null;
}

// =============================================================================
// CONVERSATION MEMORY TYPES
// =============================================================================

/** Conversation context */
export interface ConversationContext {
  isNew: boolean;
  messageCount: number;
  lastActivity: number | null;
  lastMessage?: {
    text: string;
    direction: 'sent' | 'received';
    timestamp: number;
  };
  topics: string[];
  sentiment: Sentiment;
  timeSinceLastMessage?: number;
}

// =============================================================================
// ERROR TYPES
// =============================================================================

/** API error response */
export interface APIError {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

/** Validation error */
export interface ValidationError extends APIError {
  field: string;
  message: string;
}
