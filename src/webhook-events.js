/**
 * Enhanced Webhook Events System
 *
 * Provides granular webhook events similar to Evolution API:
 * - Message events (received, sent, delivery status)
 * - Presence events (online, offline, typing)
 * - Connection events (connected, disconnected, QR update)
 * - Contact events (profile update, block status)
 *
 * This improves Laravel integration by providing detailed event hooks
 * instead of just message forwarding.
 */

import { WebhookManager } from './anti-ban.js';

/**
 * Webhook event types
 * Each event has a specific payload structure
 */
export const WebhookEventType = {
  // Message Events
  MESSAGE_RECEIVED: 'message.received',
  MESSAGE_SENT: 'message.sent',
  MESSAGE_DELIVERED: 'message.delivered',
  MESSAGE_READ: 'message.read',
  MESSAGE_FAILED: 'message.failed',

  // Presence Events
  PRESENCE_ONLINE: 'presence.online',
  PRESENCE_OFFLINE: 'presence.offline',
  PRESENCE_TYPING: 'presence.typing',
  PRESENCE_RECORDING: 'presence.recording',

  // Connection Events
  CONNECTION_OPEN: 'connection.open',
  CONNECTION_CLOSE: 'connection.close',
  CONNECTION_QR_UPDATE: 'connection.qr_update',
  CONNECTION_LOGGED_OUT: 'connection.logged_out',

  // Contact Events
  CONTACT_PROFILE_UPDATE: 'contact.profile_update',
  CONTACT_BLOCKED: 'contact.blocked',
  CONTACT_UNBLOCKED: 'contact.unblocked',

  // Status Events
  STATUS_VIEW: 'status.view',
  STATUS_REACTION: 'status.reaction',

  // Anti-Ban Events (unique to wa2bridge)
  ANTIBAN_WARNING: 'antiban.warning',
  ANTIBAN_HIBERNATION: 'antiban.hibernation',
  ANTIBAN_RATE_LIMIT: 'antiban.rate_limit',
};

/**
 * Enhanced Webhook Emitter
 * Wraps WebhookManager with structured event types
 */
export class WebhookEventEmitter {
  constructor(options = {}) {
    this.webhookUrl = options.webhookUrl;
    this.apiSecret = options.apiSecret;
    this.enabled = options.enabled !== false;

    // Event subscriptions (which events to send)
    this.subscriptions = new Set(options.subscriptions || Object.values(WebhookEventType));

    // Webhook manager for reliable delivery
    this.manager = new WebhookManager({
      webhookUrl: this.webhookUrl,
      apiSecret: this.apiSecret,
      sessionsDir: options.sessionsDir,
    });

    // Event history for debugging
    this.eventHistory = [];
    this.maxHistorySize = 100;

    // Statistics
    this.stats = {
      totalEvents: 0,
      byType: {},
      lastEventAt: null,
      errors: 0,
    };
  }

  /**
   * Subscribe to specific event types
   */
  subscribe(eventTypes) {
    if (Array.isArray(eventTypes)) {
      eventTypes.forEach((t) => this.subscriptions.add(t));
    } else {
      this.subscriptions.add(eventTypes);
    }
  }

  /**
   * Unsubscribe from event types
   */
  unsubscribe(eventTypes) {
    if (Array.isArray(eventTypes)) {
      eventTypes.forEach((t) => this.subscriptions.delete(t));
    } else {
      this.subscriptions.delete(eventTypes);
    }
  }

  /**
   * Check if subscribed to event type
   */
  isSubscribed(eventType) {
    return this.subscriptions.has(eventType);
  }

  /**
   * Emit a webhook event
   */
  async emit(eventType, payload) {
    if (!this.enabled || !this.webhookUrl) {
      return { sent: false, reason: 'disabled' };
    }

    if (!this.isSubscribed(eventType)) {
      return { sent: false, reason: 'not_subscribed' };
    }

    const event = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data: payload,
    };

    // Record to history
    this.recordEvent(event);

    // Send via WebhookManager
    try {
      await this.manager.send(event);

      this.stats.totalEvents++;
      this.stats.byType[eventType] = (this.stats.byType[eventType] || 0) + 1;
      this.stats.lastEventAt = Date.now();

      return { sent: true, eventId: event.timestamp };
    } catch (error) {
      this.stats.errors++;
      return { sent: false, reason: error.message };
    }
  }

  /**
   * Record event to history
   */
  recordEvent(event) {
    this.eventHistory.push({
      ...event,
      recordedAt: Date.now(),
    });

    // Trim history
    while (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  // ==========================================================================
  // MESSAGE EVENTS
  // ==========================================================================

  /**
   * Emit message received event
   */
  async messageReceived(message) {
    return this.emit(WebhookEventType.MESSAGE_RECEIVED, {
      from: message.from,
      message_id: message.messageId,
      message: message.message,
      timestamp: message.timestamp,
      type: message.type || 'text',
      // Anti-ban context
      should_reply: message.shouldReply,
      reply_probability: message.replyProbability,
      is_forward: message.isForward,
      forward_count: message.forwardCount,
      conversation_context: message.conversationContext,
    });
  }

  /**
   * Emit message sent event
   */
  async messageSent(message) {
    return this.emit(WebhookEventType.MESSAGE_SENT, {
      to: message.to,
      message_id: message.messageId,
      message: message.message,
      timestamp: Date.now(),
      type: message.type || 'text',
    });
  }

  /**
   * Emit delivery status update
   */
  async messageDelivered(messageId, to) {
    return this.emit(WebhookEventType.MESSAGE_DELIVERED, {
      message_id: messageId,
      to: to,
      status: 'delivered',
      timestamp: Date.now(),
    });
  }

  /**
   * Emit read receipt
   */
  async messageRead(messageId, to) {
    return this.emit(WebhookEventType.MESSAGE_READ, {
      message_id: messageId,
      to: to,
      status: 'read',
      timestamp: Date.now(),
    });
  }

  /**
   * Emit message failed
   */
  async messageFailed(messageId, to, error) {
    return this.emit(WebhookEventType.MESSAGE_FAILED, {
      message_id: messageId,
      to: to,
      error: error,
      timestamp: Date.now(),
    });
  }

  // ==========================================================================
  // PRESENCE EVENTS
  // ==========================================================================

  /**
   * Emit presence update
   */
  async presenceUpdate(phone, type) {
    const eventType = {
      available: WebhookEventType.PRESENCE_ONLINE,
      unavailable: WebhookEventType.PRESENCE_OFFLINE,
      composing: WebhookEventType.PRESENCE_TYPING,
      recording: WebhookEventType.PRESENCE_RECORDING,
    }[type] || WebhookEventType.PRESENCE_OFFLINE;

    return this.emit(eventType, {
      phone: phone,
      presence: type,
      timestamp: Date.now(),
    });
  }

  // ==========================================================================
  // CONNECTION EVENTS
  // ==========================================================================

  /**
   * Emit connection opened
   */
  async connectionOpen(phone, name) {
    return this.emit(WebhookEventType.CONNECTION_OPEN, {
      phone: phone,
      name: name,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit connection closed
   */
  async connectionClose(reason) {
    return this.emit(WebhookEventType.CONNECTION_CLOSE, {
      reason: reason,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit QR code update
   */
  async qrUpdate(qrCode) {
    return this.emit(WebhookEventType.CONNECTION_QR_UPDATE, {
      qr_code: qrCode,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit logged out
   */
  async loggedOut(reason) {
    return this.emit(WebhookEventType.CONNECTION_LOGGED_OUT, {
      reason: reason,
      timestamp: Date.now(),
    });
  }

  // ==========================================================================
  // CONTACT EVENTS
  // ==========================================================================

  /**
   * Emit profile update
   */
  async profileUpdate(phone, profile) {
    return this.emit(WebhookEventType.CONTACT_PROFILE_UPDATE, {
      phone: phone,
      name: profile.name,
      picture: profile.picture,
      status: profile.status,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit contact blocked
   */
  async contactBlocked(phone, isBlocked) {
    const eventType = isBlocked
      ? WebhookEventType.CONTACT_BLOCKED
      : WebhookEventType.CONTACT_UNBLOCKED;

    return this.emit(eventType, {
      phone: phone,
      blocked: isBlocked,
      timestamp: Date.now(),
    });
  }

  // ==========================================================================
  // ANTI-BAN EVENTS (UNIQUE TO WA2BRIDGE)
  // ==========================================================================

  /**
   * Emit anti-ban warning
   */
  async antibanWarning(riskLevel, details) {
    return this.emit(WebhookEventType.ANTIBAN_WARNING, {
      risk_level: riskLevel,
      details: details,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit hibernation event
   */
  async antibanHibernation(entering, durationMs) {
    return this.emit(WebhookEventType.ANTIBAN_HIBERNATION, {
      entering: entering,
      duration_ms: durationMs,
      timestamp: Date.now(),
    });
  }

  /**
   * Emit rate limit event
   */
  async antibanRateLimit(type, details) {
    return this.emit(WebhookEventType.ANTIBAN_RATE_LIMIT, {
      type: type, // 'hourly', 'daily', 'contact'
      details: details,
      timestamp: Date.now(),
    });
  }

  // ==========================================================================
  // STATISTICS & MANAGEMENT
  // ==========================================================================

  /**
   * Get webhook statistics
   */
  getStats() {
    return {
      ...this.stats,
      subscriptions: Array.from(this.subscriptions),
      historySize: this.eventHistory.length,
      enabled: this.enabled,
      webhookUrl: this.webhookUrl ? '***configured***' : null,
    };
  }

  /**
   * Get recent event history
   */
  getHistory(limit = 20) {
    return this.eventHistory.slice(-limit);
  }

  /**
   * Enable/disable webhooks
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Update webhook URL
   */
  setWebhookUrl(url) {
    this.webhookUrl = url;
    this.manager = new WebhookManager({
      webhookUrl: url,
      apiSecret: this.apiSecret,
    });
  }

  /**
   * Get pending retries from WebhookManager
   */
  getPendingRetries() {
    return this.manager.getRetryQueue();
  }

  /**
   * Process retry queue
   */
  async processRetries() {
    return this.manager.processRetryQueue();
  }
}

/**
 * Create webhook event emitter from environment
 */
export function createWebhookEmitter(options = {}) {
  return new WebhookEventEmitter({
    webhookUrl: options.webhookUrl || process.env.WEBHOOK_URL,
    apiSecret: options.apiSecret || process.env.API_SECRET,
    sessionsDir: options.sessionsDir,
    enabled: options.enabled !== false,
    subscriptions: options.subscriptions,
  });
}

export default {
  WebhookEventType,
  WebhookEventEmitter,
  createWebhookEmitter,
};
