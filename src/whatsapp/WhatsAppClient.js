/**
 * WhatsApp Client - Public Facade
 *
 * This is the main public API for the WhatsApp client.
 * It delegates to internal modules while maintaining the same
 * interface as the original monolithic implementation.
 */

import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { AntiBanOrchestrator } from './AntiBanOrchestrator.js';
import { ConnectionManager } from './ConnectionManager.js';
import { MessageHandler } from './MessageHandler.js';
import { StatusAggregator } from './StatusAggregator.js';
import { config } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {Object} WhatsAppClientOptions
 * @property {number} [messageDelay=1500] - Base delay between messages (ms)
 * @property {number} [typingDelay=500] - Typing indicator duration (ms)
 * @property {string} [webhookUrl] - URL for incoming message webhooks
 * @property {string} [apiSecret] - API secret for webhook authentication
 * @property {number} [accountAgeWeeks=4] - WhatsApp account age in weeks
 * @property {number} [activeHoursStart=7] - Hour to start activity (0-23)
 * @property {number} [activeHoursEnd=23] - Hour to end activity (0-23)
 * @property {string} [logLevel='info'] - Pino log level
 * @property {boolean} [ipWhitelistEnabled=false] - Enable IP whitelist
 * @property {boolean} [autoResponderEnabled=false] - Enable auto-responder
 * @property {function} [onMessage] - Callback for incoming messages
 */

/**
 * WhatsApp client with comprehensive anti-ban protection.
 *
 * Features 6 phases of anti-ban protection:
 * - Phase 1: Human-like timing, rate limiting, fingerprint rotation
 * - Phase 2: Contact warmup, delivery tracking, weekend patterns
 * - Phase 3: Conversation memory, spam detection, geo matching
 * - Phase 4: Block detection, session backup, persistent queues
 * - Phase 5: Analytics, sentiment analysis, auto-responder
 * - Phase 6: Enhanced webhooks with retry logic
 *
 * @example
 * ```javascript
 * const client = new WhatsAppClient({
 *   webhookUrl: 'http://localhost/webhook',
 *   accountAgeWeeks: 8,
 * });
 * await client.connect();
 * await client.sendMessage('+6281234567890', 'Hello!');
 * ```
 */
export class WhatsAppClient {
  /**
   * @param {WhatsAppClientOptions} [options] - Client configuration
   */
  constructor(options = {}) {
    this.sessionsDir = join(__dirname, '..', '..', 'sessions');
    this.logger = pino({ level: options.logLevel || 'info' });

    // Store options for later use
    this._options = options;

    // Initialize orchestrator with all anti-ban components
    this.orchestrator = new AntiBanOrchestrator({
      sessionsDir: this.sessionsDir,
      webhookUrl: options.webhookUrl,
      apiSecret: options.apiSecret,
      accountAgeWeeks: options.accountAgeWeeks,
      activeHoursStart: options.activeHoursStart,
      activeHoursEnd: options.activeHoursEnd,
      ipWhitelistEnabled: options.ipWhitelistEnabled,
      autoResponderEnabled: options.autoResponderEnabled,
      logger: this.logger,
      // sendFunction will be set after MessageHandler is created
    });

    // Initialize connection manager
    this.connectionManager = new ConnectionManager({
      sessionsDir: this.sessionsDir,
      orchestrator: this.orchestrator,
      logger: this.logger,
      callbacks: {
        onQrCode: (qr) => this._handleQrCode(qr),
        onConnected: (phone, name) => this._handleConnected(phone, name),
        onDisconnected: (error) => this._handleDisconnected(error),
        onMessage: (message) => this.messageHandler.handleIncomingMessage(message),
        onMessageUpdate: (update) => this.messageHandler.handleMessageUpdate(update),
      },
    });

    // Initialize message handler
    this.messageHandler = new MessageHandler({
      connectionManager: this.connectionManager,
      orchestrator: this.orchestrator,
      logger: this.logger,
      baseMessageDelay: options.messageDelay,
      baseTypingDelay: options.typingDelay,
      onMessage: options.onMessage,
    });

    // Update orchestrator with send function (resolves circular dependency)
    this.orchestrator.setSendFunction(this._directSend.bind(this));

    // Log startup info
    this.orchestrator.logStartupInfo();
  }

  /**
   * Connect to WhatsApp Web.
   *
   * @returns {Promise<WhatsAppClient>} This instance for chaining
   */
  async connect() {
    await this.connectionManager.connect();
    return this;
  }

  /**
   * Send a message with anti-ban protection.
   *
   * @param {string} to - Phone number or JID
   * @param {string} text - Message text
   * @param {string} [replyToMessageId] - Message ID to reply to
   * @returns {Promise<Object>} Message result with ID
   */
  async sendMessage(to, text, replyToMessageId = null) {
    return this.messageHandler.sendMessage(to, text, replyToMessageId);
  }

  /**
   * Direct send method for schedulers (bypasses queueing).
   * @private
   */
  async _directSend(to, text, replyToMessageId = null) {
    return this.sendMessage(to, text, replyToMessageId);
  }

  /**
   * Queue a message for optimal timing.
   *
   * @param {string} to - Phone number
   * @param {string} text - Message text
   * @param {string} [replyToMessageId] - Message ID to reply to
   * @param {string} [priority='normal'] - Priority level
   * @returns {Object} Queue entry
   */
  queueMessage(to, text, replyToMessageId = null, priority = 'normal') {
    return this.messageHandler.queueMessage(to, text, replyToMessageId, priority);
  }

  /**
   * Get comprehensive status.
   *
   * @returns {Object} Complete status object
   */
  getStatus() {
    const clientState = {
      isConnected: this.connectionManager.isConnected,
      phoneNumber: this.connectionManager.phoneNumber,
      userName: this.connectionManager.userName,
      qrCode: this.connectionManager.qrCode,
      stats: this.messageHandler.getStats(),
    };

    return StatusAggregator.buildStatus(clientState, this.orchestrator.getAllComponents());
  }

  /**
   * Set account age for rate limiting.
   *
   * @param {number} weeks - Account age in weeks
   */
  setAccountAge(weeks) {
    this.orchestrator.rateLimiter.setAccountAge(weeks);
    this.logger.info(
      { weeks, limits: this.orchestrator.rateLimiter.getLimits() },
      'Account age updated'
    );
  }

  /**
   * Disconnect from WhatsApp.
   */
  async disconnect() {
    this.logger.info('Disconnecting WhatsApp client...');

    // Clear message handler timers
    this.messageHandler.clearTimers();

    // Destroy orchestrator components
    await this.orchestrator.destroy(this.logger);

    // Disconnect connection manager
    await this.connectionManager.disconnect();

    this.logger.info('WhatsApp client disconnected');
  }

  /**
   * Exit hibernation mode (manual override for ban warning).
   */
  exitHibernation() {
    this.orchestrator.banWarning.exitHibernation();
    this.logger.info('Hibernation mode disabled - proceed with caution');
  }

  /**
   * Reset ban warning metrics.
   */
  resetBanWarning() {
    this.orchestrator.banWarning.resetMetrics();
    this.logger.info('Ban warning metrics reset');
  }

  // === QR CODE HANDLER ===

  /**
   * Handle QR code generation.
   * @private
   */
  _handleQrCode(qr) {
    console.log('\n Scan this QR code with WhatsApp:\n');
    qrcode.generate(qr, { small: true });
    console.log('\nOr use GET /api/qr to get the QR code string\n');

    // Emit webhook
    this.orchestrator.webhookEmitter.qrUpdate(qr);
  }

  /**
   * Handle connection established.
   * @private
   */
  _handleConnected(phone, name) {
    this.messageHandler.markConnected();
    this.orchestrator.webhookEmitter.connectionOpen(phone, name);
  }

  /**
   * Handle disconnection.
   * @private
   */
  _handleDisconnected(error) {
    this.orchestrator.webhookEmitter.connectionClose(error);
  }

  // === BACKWARD COMPATIBILITY GETTERS ===

  /** @returns {boolean} Connection status */
  get isConnected() {
    return this.connectionManager.isConnected;
  }

  /** @returns {number} Base message delay */
  get baseMessageDelay() {
    return this.messageHandler.baseMessageDelay;
  }

  /** @returns {number} Base typing delay */
  get baseTypingDelay() {
    return this.messageHandler.baseTypingDelay;
  }

  /** @returns {Object|null} Baileys socket */
  get socket() {
    return this.connectionManager.getSocket();
  }

  /** @returns {string|null} Current QR code */
  get qrCode() {
    return this.connectionManager.qrCode;
  }

  /** @returns {string|null} Connected phone number */
  get phoneNumber() {
    return this.connectionManager.phoneNumber;
  }

  /** @returns {string|null} Connected user name */
  get userName() {
    return this.connectionManager.userName;
  }

  /** @returns {Object} Message statistics */
  get stats() {
    return this.messageHandler.getStats();
  }

  // === COMPONENT GETTERS (Backward Compatibility) ===

  /** @returns {Object} Rate limiter component */
  get rateLimiter() {
    return this.orchestrator.rateLimiter;
  }

  /** @returns {Object} Reconnection manager */
  get reconnectionManager() {
    return this.orchestrator.reconnectionManager;
  }

  /** @returns {Object} Activity tracker */
  get activityTracker() {
    return this.orchestrator.activityTracker;
  }

  /** @returns {Object} Presence manager */
  get presenceManager() {
    return this.orchestrator.presenceManager;
  }

  /** @returns {Object} Ban warning system */
  get banWarning() {
    return this.orchestrator.banWarning;
  }

  /** @returns {Object} Message variator */
  get messageVariator() {
    return this.orchestrator.messageVariator;
  }

  /** @returns {Object} Delivery tracker */
  get deliveryTracker() {
    return this.orchestrator.deliveryTracker;
  }

  /** @returns {Object} Activity ramper */
  get activityRamper() {
    return this.orchestrator.activityRamper;
  }

  /** @returns {Object} Weekend patterns */
  get weekendPatterns() {
    return this.orchestrator.weekendPatterns;
  }

  /** @returns {Object} Typing simulator */
  get typingSimulator() {
    return this.orchestrator.typingSimulator;
  }

  /** @returns {Object} Emoji enhancer */
  get emojiEnhancer() {
    return this.orchestrator.emojiEnhancer;
  }

  /** @returns {Object} Contact warmup */
  get contactWarmup() {
    return this.orchestrator.contactWarmup;
  }

  /** @returns {Object} Group behavior */
  get groupBehavior() {
    return this.orchestrator.groupBehavior;
  }

  /** @returns {Object} Network fingerprint */
  get networkFingerprint() {
    return this.orchestrator.networkFingerprint;
  }

  /** @returns {Object} Message scheduler */
  get messageScheduler() {
    return this.orchestrator.messageScheduler;
  }

  /** @returns {Object} Reaction manager */
  get reactionManager() {
    return this.orchestrator.reactionManager;
  }

  /** @returns {Object} Reply probability */
  get replyProbability() {
    return this.orchestrator.replyProbability;
  }

  /** @returns {Object} Message splitter */
  get messageSplitter() {
    return this.orchestrator.messageSplitter;
  }

  /** @returns {Object} Status viewer */
  get statusViewer() {
    return this.orchestrator.statusViewer;
  }

  /** @returns {Object} Spam detector */
  get spamDetector() {
    return this.orchestrator.spamDetector;
  }

  /** @returns {Object} Geo matcher */
  get geoMatcher() {
    return this.orchestrator.geoMatcher;
  }

  /** @returns {Object} Profile viewer */
  get profileViewer() {
    return this.orchestrator.profileViewer;
  }

  /** @returns {Object} Forward handler */
  get forwardHandler() {
    return this.orchestrator.forwardHandler;
  }

  /** @returns {Object} Conversation memory */
  get conversationMemory() {
    return this.orchestrator.conversationMemory;
  }

  /** @returns {Object} Block detector */
  get blockDetector() {
    return this.orchestrator.blockDetector;
  }

  /** @returns {Object} Session manager */
  get sessionManager() {
    return this.orchestrator.sessionManager;
  }

  /** @returns {Object} Persistent queue */
  get persistentQueue() {
    return this.orchestrator.persistentQueue;
  }

  /** @returns {Object} Webhook manager */
  get webhookManager() {
    return this.orchestrator.webhookManager;
  }

  /** @returns {Object} Webhook emitter */
  get webhookEmitter() {
    return this.orchestrator.webhookEmitter;
  }

  /** @returns {Object} Health monitor */
  get healthMonitor() {
    return this.orchestrator.healthMonitor;
  }

  /** @returns {Object} Language detector */
  get languageDetector() {
    return this.orchestrator.languageDetector;
  }

  /** @returns {Object} Analytics */
  get analytics() {
    return this.orchestrator.analytics;
  }

  /** @returns {Object} Contact scoring */
  get contactScoring() {
    return this.orchestrator.contactScoring;
  }

  /** @returns {Object} Sentiment detector */
  get sentimentDetector() {
    return this.orchestrator.sentimentDetector;
  }

  /** @returns {Object} IP whitelist */
  get ipWhitelist() {
    return this.orchestrator.ipWhitelist;
  }

  /** @returns {Object} Audit logger */
  get auditLogger() {
    return this.orchestrator.auditLogger;
  }

  /** @returns {Object} API rate limiter */
  get apiRateLimiter() {
    return this.orchestrator.apiRateLimiter;
  }

  /** @returns {Object} Auto responder */
  get autoResponder() {
    return this.orchestrator.autoResponder;
  }

  /** @returns {Object} Message templates */
  get messageTemplates() {
    return this.orchestrator.messageTemplates;
  }

  /** @returns {Object} Scheduled messages */
  get scheduledMessages() {
    return this.orchestrator.scheduledMessages;
  }

  /** @returns {Object} Lifecycle manager */
  get lifecycle() {
    return this.orchestrator.lifecycle;
  }
}

export default WhatsAppClient;
