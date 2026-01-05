/**
 * Message Handler
 *
 * Handles all message sending and receiving with comprehensive
 * anti-ban protection including typing simulation, rate limiting,
 * and human-like behavior patterns.
 */

import { delay } from '@whiskeysockets/baileys';

import {
  humanDelay,
  calculateTypingDuration,
  checkMessageSafety,
  calculateReadDelay,
  simulateHumanReading,
} from '../anti-ban/index.js';

import { TimerRegistry } from '../utils/timer-registry.js';
import { normalizeJid } from '../whatsapp-utilities.js';
import { config } from '../config.js';

/**
 * @typedef {Object} MessageHandlerOptions
 * @property {Object} connectionManager - ConnectionManager instance
 * @property {Object} orchestrator - AntiBanOrchestrator instance
 * @property {Object} logger - Pino logger instance
 * @property {number} [baseMessageDelay] - Base delay between messages (ms)
 * @property {number} [baseTypingDelay] - Base typing delay (ms)
 * @property {Function} [onMessage] - Callback for processed incoming messages
 */

/**
 * Handles message sending and receiving with anti-ban protection.
 *
 * Features:
 * - Typing indicator simulation
 * - Rate limiting enforcement
 * - Human-like timing with randomization
 * - Message variation
 * - Long message splitting
 * - Read receipt simulation
 */
export class MessageHandler {
  /**
   * @param {MessageHandlerOptions} options
   */
  constructor(options) {
    this.connectionManager = options.connectionManager;
    this.orchestrator = options.orchestrator;
    this.logger = options.logger;
    this.onMessageCallback = options.onMessage || (() => {});

    // Configuration
    this.baseMessageDelay = options.baseMessageDelay || config.timing.messageDelayMs;
    this.baseTypingDelay = options.baseTypingDelay || config.timing.typingDelayMs;

    // Stats
    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      startedAt: null,
    };

    // Timer management
    this.timers = new TimerRegistry('MessageHandler');

    // Track last incoming message for read receipts
    this.lastIncomingMessage = null;
  }

  /**
   * Mark connection as started (call after connection.open)
   */
  markConnected() {
    this.stats.startedAt = new Date();
  }

  /**
   * Process an incoming message.
   *
   * @param {Object} message - Baileys message object
   */
  async handleIncomingMessage(message) {
    // Ignore messages from self
    if (message.key.fromMe) return;

    // Ignore non-text messages
    const text =
      message.message?.conversation ||
      message.message?.extendedTextMessage?.text;

    if (!text) return;

    this.stats.messagesReceived++;

    const from = message.key.remoteJid.replace('@s.whatsapp.net', '');
    const messageId = message.key.id;
    const jid = message.key.remoteJid;
    const o = this.orchestrator;

    // Track incoming message for response ratio
    o.activityTracker.recordReceived(`+${from}`);

    // Phase 3: Record in conversation memory
    o.conversationMemory.recordMessage(`+${from}`, { text }, 'received');

    // Phase 4: Detect and record contact's language
    o.languageDetector.recordContactLanguage(`+${from}`, text);

    // Phase 5A: Analytics tracking
    o.analytics.recordReceived(`+${from}`, text.length);

    // Phase 5A: Contact scoring
    o.contactScoring.recordInteraction(`+${from}`, 'received', {
      length: text.length,
    });

    // Phase 5A: Sentiment tracking
    o.sentimentDetector.recordContactSentiment(`+${from}`, text);

    // Phase 5C: Check auto-responder rules
    const autoResponse = o.autoResponder.checkMessage({
      text,
      from: `+${from}`,
    });
    if (autoResponse?.matched) {
      this.logger.info(
        { from, rule: autoResponse.rule.id },
        'Auto-responder triggered'
      );
      // Schedule auto-reply with human delay
      const autoDelay =
        config.timing.autoReplyMinMs +
        Math.random() * (config.timing.autoReplyMaxMs - config.timing.autoReplyMinMs);
      this.timers.setTimeout(() => {
        this.sendMessage(`+${from}`, autoResponse.response).catch((err) => {
          this.logger.error({ error: err.message }, 'Auto-response failed');
        });
      }, autoDelay);
    }

    // Phase 3: Check if forwarded message
    const forwardInfo = o.forwardHandler.shouldReplyToForward(message);
    if (forwardInfo.isForward) {
      this.logger.debug(
        { from, forwardCount: forwardInfo.forwardCount },
        'Forwarded message detected'
      );
    }

    // Phase 3: Maybe view sender's profile
    o.profileViewer.maybeViewProfile(jid).catch(() => {});

    // Phase 3: Maybe add a reaction
    o.reactionManager
      .maybeReact(message.key, text)
      .then((reacted) => {
        if (reacted) {
          this.logger.debug({ from }, 'Added reaction to message');
        }
      })
      .catch(() => {});

    // Store for read receipt simulation
    this.lastIncomingMessage = {
      text,
      from: `+${from}`,
      messageId,
      jid,
      timestamp: Date.now(),
      isForward: forwardInfo.isForward,
      forwardCount: forwardInfo.forwardCount || 0,
    };

    // Mark message as "read" after realistic delay
    const readDelay = calculateReadDelay(text);
    const socket = this.connectionManager.getSocket();
    this.timers.setTimeout(async () => {
      try {
        await socket.readMessages([message.key]);
        this.logger.debug({ from, readDelay }, 'Marked message as read');
      } catch {
        // Ignore read receipt errors
      }
    }, readDelay);

    this.logger.info(
      { from, messageId, isForward: forwardInfo.isForward },
      'Received message'
    );

    // Phase 3: Check reply probability
    const replyCheck = o.replyProbability.shouldReply({
      text,
      from: `+${from}`,
    });

    // For forwarded messages, check forward reply probability
    if (forwardInfo.isForward && !forwardInfo.shouldReply) {
      this.logger.info(
        { from, reason: 'forward_skip' },
        'Skipping reply to forwarded message'
      );
      return;
    }

    // Phase 6: Emit message received webhook
    o.webhookEmitter.messageReceived({
      from: `+${from}`,
      message: text,
      messageId,
      timestamp: message.messageTimestamp,
      shouldReply: replyCheck.shouldReply,
      replyProbability: replyCheck.probability,
      isForward: forwardInfo.isForward,
      forwardCount: forwardInfo.forwardCount || 0,
      conversationContext: o.conversationMemory.getContext(`+${from}`),
    });

    // Call the message handler callback
    await this.onMessageCallback({
      from: `+${from}`,
      message: text,
      messageId,
      timestamp: message.messageTimestamp,
      shouldReply: replyCheck.shouldReply,
      replyProbability: replyCheck.probability,
      isForward: forwardInfo.isForward,
      forwardCount: forwardInfo.forwardCount || 0,
      conversationContext: o.conversationMemory.getContext(`+${from}`),
    });
  }

  /**
   * Handle message status update events.
   *
   * @param {Object} update - Baileys message update
   */
  handleMessageUpdate(update) {
    const messageId = update.key?.id;
    const remoteJid = update.key?.remoteJid;
    if (!messageId) return;

    const phone = remoteJid
      ? remoteJid.replace('@s.whatsapp.net', '')
      : null;
    const o = this.orchestrator;
    const status = update.update?.status;

    if (status === 2) {
      // PENDING → SENT
      o.deliveryTracker.updateStatus(messageId, 'sent');
      if (phone) o.blockDetector.recordMessageSent(messageId, `+${phone}`);
    } else if (status === 3) {
      // DELIVERED
      o.deliveryTracker.updateStatus(messageId, 'delivered');
      if (phone) {
        o.blockDetector.recordMessageDelivered(messageId, `+${phone}`);
        o.webhookEmitter.messageDelivered(messageId, `+${phone}`);
      }
    } else if (status === 4 || status === 5) {
      // READ or PLAYED
      o.deliveryTracker.updateStatus(messageId, 'read');
      if (phone) o.webhookEmitter.messageRead(messageId, `+${phone}`);
    }
  }

  /**
   * Send a message with comprehensive anti-ban protection.
   *
   * @param {string} to - Phone number or JID
   * @param {string} text - Message text
   * @param {string} [replyToMessageId] - Message ID to reply to
   * @returns {Promise<Object>} Message result with ID
   */
  async sendMessage(to, text, replyToMessageId = null) {
    if (!this.connectionManager.isConnected) {
      throw new Error('WhatsApp not connected');
    }

    const socket = this.connectionManager.getSocket();
    const jid = normalizeJid(to);
    const o = this.orchestrator;
    const isGroup = o.groupBehavior.isGroup(jid);

    // === PRE-SEND CHECKS ===

    // Check ban warning
    const banCheck = o.banWarning.canSend();
    if (!banCheck.allowed) {
      o.banWarning.recordRateLimitHit();
      throw new Error(`Ban protection: ${banCheck.reason}`);
    }

    // Check contact warmup (DMs only)
    if (!isGroup) {
      const warmupCheck = o.contactWarmup.canMessage(to);
      if (!warmupCheck.allowed) {
        throw new Error(`Contact warmup: ${warmupCheck.reason}`);
      }
      if (warmupCheck.isNew) {
        this.logger.info({ to }, 'New contact detected, applying warmup limits');
      }
    }

    // Check rate limits
    const baseRateLimitCheck = await o.rateLimiter.canSend();
    if (!baseRateLimitCheck.allowed) {
      o.banWarning.recordRateLimitHit();
      throw new Error(`Rate limit: ${baseRateLimitCheck.reason}`);
    }

    // Check activity safety
    const activityCheck = o.activityTracker.isSafeToSend();
    if (!activityCheck.safe) {
      this.logger.warn({ reason: activityCheck.reason }, 'Activity check warning');
    }

    // Check message content safety
    const safetyCheck = checkMessageSafety(text);
    if (!safetyCheck.safe) {
      this.logger.warn({ warnings: safetyCheck.warnings }, 'Message content warnings');
    }

    // === MESSAGE ENHANCEMENT ===

    let processedText = o.messageVariator.vary(text, 0.3);

    // Maybe add emoji (DMs only)
    if (!isGroup) {
      processedText = o.emojiEnhancer.maybeAddEmoji(processedText);
    }

    if (processedText !== text) {
      this.logger.debug(
        {
          original: text.substring(0, 50),
          processed: processedText.substring(0, 50),
        },
        'Message processed'
      );
    }

    // Check for duplicate content
    if (o.messageVariator.isRecentDuplicate(text)) {
      this.logger.warn('Duplicate message detected - consider varying content');
    }

    // === MESSAGE SPLITTING ===
    if (o.messageSplitter.shouldSplit(processedText)) {
      return this._sendSplitMessage(to, processedText, replyToMessageId, jid, isGroup);
    }

    // === CALCULATE DELAYS ===

    const weekendDelayMultiplier = o.weekendPatterns.getDelayMultiplier();
    const rampMultiplier = o.activityRamper.getRateMultiplier();
    const extraRampDelay = o.activityRamper.getExtraDelay();

    if (weekendDelayMultiplier > 1 || rampMultiplier < 1) {
      this.logger.debug(
        {
          weekendMultiplier: weekendDelayMultiplier,
          rampMultiplier: rampMultiplier,
          extraRampDelay,
        },
        'Adjusted timing active'
      );
    }

    // === HUMAN-LIKE BEHAVIOR ===

    // Ensure we're "online"
    const presenceState = await o.presenceManager.temporaryOnline();

    // Simulate reading + thinking for replies
    if (this.lastIncomingMessage && this.lastIncomingMessage.from === to) {
      const incomingText = this.lastIncomingMessage.text;
      const timings = simulateHumanReading(incomingText, processedText);

      const timeSinceReceived = Date.now() - this.lastIncomingMessage.timestamp;
      const remainingReadTime = Math.max(0, timings.readDelay - timeSinceReceived);
      if (remainingReadTime > 0) {
        this.logger.debug({ remainingReadTime }, 'Simulating remaining read time');
        await delay(remainingReadTime);
      }

      let thinkDelay = timings.thinkDelay;
      thinkDelay = Math.floor(thinkDelay * weekendDelayMultiplier);
      thinkDelay = o.groupBehavior.adjustDelay(thinkDelay, jid);
      await delay(thinkDelay);
    }

    // Extra ramp delay after downtime
    if (extraRampDelay > 0) {
      this.logger.debug({ extraRampDelay }, 'Applying post-downtime ramp delay');
      await delay(extraRampDelay);
    }

    // Subscribe to presence
    await socket.presenceSubscribe(jid);
    await delay(humanDelay(100, 0.5));

    // Calculate typing duration
    let typingDuration = calculateTypingDuration(
      processedText,
      config.timing.minTypingMs,
      config.timing.maxTypingMs
    );
    typingDuration = Math.floor(typingDuration * weekendDelayMultiplier);
    typingDuration = o.groupBehavior.adjustTypingDuration(typingDuration, jid);

    // Execute typing sequence
    const typingSequence = o.typingSimulator.generateTypingSequence(typingDuration);
    this.logger.debug(
      { typingDuration, steps: typingSequence.length },
      'Simulating typing'
    );
    await o.typingSimulator.executeSequence(socket, jid, typingSequence);

    // Hesitation pause
    const hesitationDelay = humanDelay(300, 0.5) * weekendDelayMultiplier;
    await delay(hesitationDelay);

    // Pre-send delay
    let messageDelay = humanDelay(this.baseMessageDelay, 0.4);
    messageDelay = Math.floor(messageDelay * weekendDelayMultiplier);
    messageDelay = o.groupBehavior.adjustDelay(messageDelay, jid);
    await delay(messageDelay);

    // === SEND MESSAGE ===

    let result;
    try {
      if (replyToMessageId) {
        try {
          const options = {
            quoted: { key: { id: replyToMessageId, remoteJid: jid } },
          };
          result = await socket.sendMessage(jid, { text: processedText }, options);
        } catch {
          this.logger.warn(
            { replyToMessageId },
            'Quote failed, sending without reply'
          );
          result = await socket.sendMessage(jid, { text: processedText }, {});
        }
      } else {
        result = await socket.sendMessage(jid, { text: processedText }, {});
      }

      o.banWarning.recordDeliverySuccess();
      o.deliveryTracker.recordSent(result.key.id, to);
    } catch (sendError) {
      o.banWarning.recordDeliveryFailure(sendError.message);
      o.spamDetector.recordDeliveryFailure(to, sendError.message);
      throw sendError;
    }

    // === POST-SEND TRACKING ===

    o.conversationMemory.recordMessage(to, { text: processedText }, 'sent');
    o.analytics.recordSent(to, processedText.length);
    o.contactScoring.recordInteraction(to, 'sent');
    o.auditLogger.logMessage('sent', to, result.key.id, {
      length: processedText.length,
      isGroup,
    });

    // Clear typing
    await delay(humanDelay(200, 0.3));
    await socket.sendPresenceUpdate('paused', jid);

    // Restore presence
    await presenceState.restore();

    // Record for rate limiting
    o.rateLimiter.recordSend();
    o.activityTracker.recordSent(to);

    if (!isGroup) {
      o.contactWarmup.recordContact(to);
    }
    o.activityRamper.recordActivity();

    // Clear last incoming message after responding
    if (this.lastIncomingMessage && this.lastIncomingMessage.from === to) {
      this.lastIncomingMessage = null;
    }

    this.stats.messagesSent++;
    this.logger.info(
      {
        to,
        messageId: result.key.id,
        typingDuration,
        isGroup,
        varied: processedText !== text,
        weekend: o.weekendPatterns.isWeekend(),
        rateLimitStats: o.rateLimiter.getStats(),
        banWarningLevel: o.banWarning.currentLevel,
      },
      'Message sent'
    );

    // Emit webhook
    o.webhookEmitter.messageSent({
      to,
      messageId: result.key.id,
      message: processedText,
    });

    return result;
  }

  /**
   * Send a long message as multiple parts.
   * @private
   */
  async _sendSplitMessage(to, text, replyToMessageId, jid, isGroup) {
    const o = this.orchestrator;
    const parts = o.messageSplitter.split(text);
    const partsWithIndicators = o.messageSplitter.addContinuationIndicators(parts);

    this.logger.info({ to, parts: parts.length }, 'Splitting long message');

    const results = [];
    for (let i = 0; i < partsWithIndicators.length; i++) {
      const part = partsWithIndicators[i];
      const reply = i === 0 ? replyToMessageId : null;

      const result = await this.sendMessage(to, part, reply);
      results.push(result);

      if (i < partsWithIndicators.length - 1) {
        const partDelay = o.messageSplitter.getPartDelay();
        await new Promise((resolve) => setTimeout(resolve, partDelay));
      }
    }

    return results[results.length - 1];
  }

  /**
   * Queue a message for optimal timing.
   *
   * @param {string} to - Phone number
   * @param {string} text - Message text
   * @param {string} [replyToMessageId] - Message ID to reply to
   * @param {string} [priority] - Priority level
   * @returns {Object} Queue entry
   */
  queueMessage(to, text, replyToMessageId = null, priority = 'normal') {
    return this.orchestrator.messageScheduler.enqueue(
      to,
      text,
      replyToMessageId,
      priority
    );
  }

  /**
   * Get current stats.
   *
   * @returns {Object} Message stats
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Clear all timers (call on disconnect).
   */
  clearTimers() {
    this.timers.clearAll();
  }
}

export default MessageHandler;
