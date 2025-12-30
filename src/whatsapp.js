import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  delay,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Anti-ban utilities
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
} from './anti-ban.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

class WhatsAppClient {
  constructor(options = {}) {
    this.socket = null;
    this.qrCode = null;
    this.isConnected = false;
    this.phoneNumber = null;
    this.userName = null;

    // Base delays (will be randomized)
    this.baseMessageDelay = options.messageDelay || 1500;
    this.baseTypingDelay = options.typingDelay || 500;
    this.webhookUrl = options.webhookUrl;
    this.onMessage = options.onMessage || (() => {});

    this.sessionsDir = join(__dirname, '..', 'sessions');

    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      startedAt: null,
    };

    this.logger = pino({ level: options.logLevel || 'info' });

    // Anti-ban components
    this.rateLimiter = new MessageRateLimiter({
      accountAgeWeeks: options.accountAgeWeeks || 4, // Default to 4 weeks (warming)
      sessionsDir: this.sessionsDir,
    });

    this.reconnectionManager = new ReconnectionManager({
      baseDelay: 1000,
      maxDelay: 300000,  // 5 minutes max
      maxAttempts: 15,
    });

    this.activityTracker = new ActivityTracker(this.sessionsDir);

    // New anti-ban components
    this.presenceManager = new PresenceManager({
      sessionsDir: this.sessionsDir,
      activeHoursStart: options.activeHoursStart ?? 7,
      activeHoursEnd: options.activeHoursEnd ?? 23,
    });

    this.banWarning = new BanWarningSystem({
      sessionsDir: this.sessionsDir,
      onWarning: (warning) => {
        this.logger.warn(warning, 'Ban warning detected');
      },
      onCritical: (warning) => {
        this.logger.error(warning, 'CRITICAL: Ban risk detected!');
      },
    });

    this.messageVariator = new MessageVariator();

    // Phase 2: Additional anti-ban components
    this.deliveryTracker = new DeliveryTracker({
      sessionsDir: this.sessionsDir,
    });

    this.activityRamper = new ActivityRamper({
      sessionsDir: this.sessionsDir,
    });

    this.weekendPatterns = new WeekendPatterns({
      // Indonesian holidays can be added here
      holidays: [
        '01-01', // New Year
        '12-25', // Christmas
        '12-31', // New Year's Eve
        '08-17', // Indonesian Independence Day
      ],
    });

    this.typingSimulator = new TypingSimulator({
      correctionProbability: 0.15, // 15% chance of "typing correction"
    });

    this.emojiEnhancer = new EmojiEnhancer({
      probability: 0.2, // 20% of messages get emoji
    });

    this.contactWarmup = new ContactWarmup({
      sessionsDir: this.sessionsDir,
    });

    this.groupBehavior = new GroupBehavior({
      groupDelayMultiplier: 2.0,      // 2x slower in groups
      groupResponseProbability: 0.7,  // 70% response rate in groups
    });

    this.networkFingerprint = new NetworkFingerprint({
      sessionsDir: this.sessionsDir,
    });

    // Optional: Message scheduler for queued sending
    this.messageScheduler = new MessageScheduler({
      sendFunction: this._directSend.bind(this),
      logger: this.logger,
    });

    // Phase 3: Additional anti-ban components
    this.reactionManager = new ReactionManager({
      reactionProbability: 0.15, // 15% of messages get a reaction
    });

    this.replyProbability = new ReplyProbability({
      baseReplyRate: 0.9, // 90% reply rate (humans don't reply to everything)
      sessionsDir: this.sessionsDir,
    });

    this.messageSplitter = new MessageSplitter({
      maxLength: 500,       // Max 500 chars per message
      splitThreshold: 300,  // Start splitting at 300 chars
    });

    this.statusViewer = new StatusViewer({
      sessionsDir: this.sessionsDir,
      viewProbability: 0.6,
    });

    this.spamDetector = new SpamReportDetector({
      sessionsDir: this.sessionsDir,
      onSpamWarning: (warning) => {
        this.logger.error(warning, 'SPAM DETECTION WARNING');
      },
    });

    this.geoMatcher = new GeoIPMatcher({
      sessionsDir: this.sessionsDir,
    });

    this.profileViewer = new ProfileViewer({
      sessionsDir: this.sessionsDir,
      viewProbability: 0.1, // 10% chance to view profile
    });

    this.forwardHandler = new ForwardHandler({
      forwardReplyProbability: 0.5, // 50% reply to forwards
    });

    this.conversationMemory = new ConversationMemory({
      sessionsDir: this.sessionsDir,
      maxMessages: 20,
    });

    // Phase 4: Detection & Recovery components
    this.blockDetector = new BlockDetector({
      sessionsDir: this.sessionsDir,
      onBlock: (info) => {
        this.logger.warn(info, 'Contact blocked us');
      },
    });

    this.sessionManager = new SessionManager({
      sessionsDir: this.sessionsDir,
      maxBackups: 5,
    });

    this.persistentQueue = new PersistentQueue({
      sessionsDir: this.sessionsDir,
      sendFunction: this._directSend.bind(this),
      logger: this.logger,
    });

    this.webhookManager = new WebhookManager({
      webhookUrl: this.webhookUrl,
      apiSecret: options.apiSecret,
      sessionsDir: this.sessionsDir,
      logger: this.logger,
    });

    this.healthMonitor = new HealthMonitor({
      sessionsDir: this.sessionsDir,
      logger: this.logger,
      onAlert: (alert) => {
        this.logger.error(alert, 'HEALTH ALERT');
      },
    });

    this.languageDetector = new LanguageDetector({
      sessionsDir: this.sessionsDir,
    });

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
      sendFunction: this._directSend.bind(this),
      logger: this.logger,
    });

    // Track incoming message for read receipts
    this.lastIncomingMessage = null;

    // Warn on startup about account age setting
    const limits = this.rateLimiter.getLimits();
    this.logger.info({ limits: limits.description }, 'Rate limits configured');
    this.logger.info({
      activeHours: `${this.presenceManager.activeHoursStart}:00 - ${this.presenceManager.activeHoursEnd}:00`
    }, 'Presence management configured');

    // Phase 2 logging
    this.logger.info({
      weekend: this.weekendPatterns.getStatus(),
    }, 'Weekend patterns configured');
    this.logger.info('Phase 2 anti-ban features loaded: DeliveryTracker, ActivityRamper, WeekendPatterns, TypingSimulator, EmojiEnhancer, ContactWarmup, GroupBehavior, NetworkFingerprint');

    // Phase 3 logging
    this.logger.info('Phase 3 anti-ban features loaded: ReactionManager, ReplyProbability, MessageSplitter, StatusViewer, SpamReportDetector, GeoIPMatcher, ProfileViewer, ForwardHandler, ConversationMemory');

    // Phase 4 logging
    this.logger.info('Phase 4 anti-ban features loaded: BlockDetector, SessionManager, PersistentQueue, WebhookManager, HealthMonitor, LanguageDetector');

    // Phase 5 logging
    this.logger.info('Phase 5 features loaded: Analytics, ContactScoring, SentimentDetector, IPWhitelist, AuditLogger, APIRateLimiter, AutoResponder, MessageTemplates, ScheduledMessages');
  }

  async connect() {
    const { state, saveCreds } = await useMultiFileAuthState(this.sessionsDir);

    // Fetch latest WA Web version for compatibility
    let version;
    try {
      const versionInfo = await fetchLatestBaileysVersion();
      version = versionInfo.version;
      this.logger.info({ version }, 'Using WhatsApp Web version');
    } catch (err) {
      this.logger.warn('Could not fetch latest version, using default');
    }

    // Get rotating browser fingerprint (changes every 24-48 hours)
    const browserFingerprint = getBrowserFingerprint(this.sessionsDir);
    this.logger.info({ browser: browserFingerprint }, 'Using browser fingerprint');

    this.socket = makeWASocket({
      auth: state,
      logger: pino({ level: 'warn' }),
      browser: browserFingerprint,  // Rotating fingerprint instead of hardcoded
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      markOnlineOnConnect: false,
      ...(version && { version }),
    });

    // Handle connection updates
    this.socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrCode = qr;
        this.logger.info('QR Code generated - scan with WhatsApp');
        console.log('\n Scan this QR code with WhatsApp:\n');
        qrcode.generate(qr, { small: true });
        console.log('\nOr use GET /api/qr to get the QR code string\n');
      }

      if (connection === 'close') {
        this.isConnected = false;
        this.qrCode = null;

        // Stop presence cycling
        this.presenceManager.stopPresenceCycle();

        // Record connection drop for ban warning
        this.banWarning.recordConnectionDrop();

        // Phase 4: Record for health monitoring
        this.healthMonitor.recordConnectionDrop();

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errorMessage = lastDisconnect?.error?.message || 'Unknown error';

        this.logger.info({ statusCode, errorMessage }, 'Connection closed');

        // Handle different disconnect reasons with proper backoff
        if (statusCode === DisconnectReason.loggedOut) {
          this.logger.warn('Logged out from WhatsApp - session may be invalid');
          // Don't auto-reconnect on logout - user needs to re-scan
          this.reconnectionManager.reset();
          return;
        }

        // Check if we should give up reconnecting
        const { delay: reconnectDelay, attempt, shouldGiveUp } = this.reconnectionManager.getNextDelay();

        if (shouldGiveUp) {
          this.logger.error({ attempts: attempt }, 'Max reconnection attempts reached. Manual intervention required.');
          return;
        }

        this.logger.info({
          attempt,
          delayMs: reconnectDelay,
          reason: this.getDisconnectReasonName(statusCode)
        }, 'Scheduling reconnection with backoff');

        setTimeout(() => this.connect(), reconnectDelay);
      }

      if (connection === 'open') {
        this.isConnected = true;
        this.qrCode = null;
        this.stats.startedAt = new Date();

        // Reset reconnection counter on successful connection
        this.reconnectionManager.reset();

        // Initialize presence manager with socket and start cycling
        this.presenceManager.setSocket(this.socket);
        this.presenceManager.startPresenceCycle();

        // Phase 3: Initialize socket-dependent components
        this.reactionManager.setSocket(this.socket);
        this.statusViewer.setSocket(this.socket);
        this.profileViewer.setSocket(this.socket);
        this.statusViewer.startViewing();

        // Phase 4: Initialize socket-dependent components and start services
        this.blockDetector.setSocket(this.socket);
        this.sessionManager.startAutoBackup();
        this.healthMonitor.start();

        // Phase 5: Start scheduled messages processor
        this.scheduledMessages.start();

        // Phase 5: Log system event
        this.auditLogger.logSystem('whatsapp_connected', {
          phone: this.phoneNumber,
        });

        // Get profile info
        const user = this.socket.user;
        if (user) {
          this.phoneNumber = user.id.split(':')[0];
          this.userName = user.name || 'Unknown';
        }

        this.logger.info(`Connected as ${this.phoneNumber} (${this.userName})`);
        this.logger.info('Presence cycling started');
      }
    });

    // Handle credentials update
    this.socket.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    this.socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const message of messages) {
        await this.handleIncomingMessage(message);
      }
    });

    // Phase 2: Track message delivery status
    this.socket.ev.on('messages.update', (updates) => {
      for (const update of updates) {
        const messageId = update.key?.id;
        const remoteJid = update.key?.remoteJid;
        if (!messageId) continue;

        // Extract phone number from JID
        const phone = remoteJid ? remoteJid.replace('@s.whatsapp.net', '') : null;

        // Map Baileys status to our status
        const status = update.update?.status;
        if (status === 2) {
          // PENDING → SENT (single check)
          this.deliveryTracker.updateStatus(messageId, 'sent');
          // Phase 4: Record for block detection
          if (phone) this.blockDetector.recordMessageSent(messageId, `+${phone}`);
        } else if (status === 3) {
          // DELIVERED (double check)
          this.deliveryTracker.updateStatus(messageId, 'delivered');
          // Phase 4: Record delivery for block detection
          if (phone) this.blockDetector.recordMessageDelivered(messageId, `+${phone}`);
        } else if (status === 4) {
          // READ (blue double check)
          this.deliveryTracker.updateStatus(messageId, 'read');
        } else if (status === 5) {
          // PLAYED (for voice messages)
          this.deliveryTracker.updateStatus(messageId, 'read');
        }
      }
    });

    // Phase 2: Periodically check network fingerprint
    this.networkCheckInterval = setInterval(() => {
      this.networkFingerprint.recordIP().catch(() => {});
    }, 5 * 60 * 1000); // Every 5 minutes

    return this;
  }

  /**
   * Get human-readable disconnect reason
   */
  getDisconnectReasonName(statusCode) {
    const reasons = {
      [DisconnectReason.badSession]: 'Bad Session',
      [DisconnectReason.connectionClosed]: 'Connection Closed',
      [DisconnectReason.connectionLost]: 'Connection Lost',
      [DisconnectReason.connectionReplaced]: 'Connection Replaced',
      [DisconnectReason.loggedOut]: 'Logged Out',
      [DisconnectReason.restartRequired]: 'Restart Required',
      [DisconnectReason.timedOut]: 'Timed Out',
    };
    return reasons[statusCode] || `Unknown (${statusCode})`;
  }

  async handleIncomingMessage(message) {
    // Ignore messages from self
    if (message.key.fromMe) return;

    // Ignore non-text messages for now
    const text = message.message?.conversation ||
                 message.message?.extendedTextMessage?.text;

    if (!text) return;

    this.stats.messagesReceived++;

    const from = message.key.remoteJid.replace('@s.whatsapp.net', '');
    const messageId = message.key.id;
    const jid = message.key.remoteJid;

    // Track incoming message for response ratio
    this.activityTracker.recordReceived(`+${from}`);

    // Phase 3: Record in conversation memory
    this.conversationMemory.recordMessage(`+${from}`, { text }, 'received');

    // Phase 4: Detect and record contact's language
    this.languageDetector.recordContactLanguage(`+${from}`, text);

    // Phase 5A: Analytics tracking
    this.analytics.recordReceived(`+${from}`, text.length);

    // Phase 5A: Contact scoring
    this.contactScoring.recordInteraction(`+${from}`, 'received', { length: text.length });

    // Phase 5A: Sentiment tracking
    const sentiment = this.sentimentDetector.recordContactSentiment(`+${from}`, text);

    // Phase 5C: Check auto-responder rules
    const autoResponse = this.autoResponder.checkMessage({ text, from: `+${from}` });
    if (autoResponse?.matched) {
      this.logger.info({ from, rule: autoResponse.rule.id }, 'Auto-responder triggered');
      // Schedule auto-reply with human delay
      setTimeout(() => {
        this.sendMessage(`+${from}`, autoResponse.response).catch(err => {
          this.logger.error({ error: err.message }, 'Auto-response failed');
        });
      }, 2000 + Math.random() * 3000); // 2-5 second delay
    }

    // Phase 3: Check if forwarded message (different handling)
    const forwardInfo = this.forwardHandler.shouldReplyToForward(message);
    if (forwardInfo.isForward) {
      this.logger.debug({ from, forwardCount: forwardInfo.forwardCount }, 'Forwarded message detected');
    }

    // Phase 3: Maybe view sender's profile
    this.profileViewer.maybeViewProfile(jid).catch(() => {});

    // Phase 3: Maybe add a reaction to the message
    this.reactionManager.maybeReact(message.key, text).then(reacted => {
      if (reacted) {
        this.logger.debug({ from }, 'Added reaction to message');
      }
    }).catch(() => {});

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
    setTimeout(async () => {
      try {
        await this.socket.readMessages([message.key]);
        this.logger.debug({ from, readDelay }, 'Marked message as read');
      } catch (err) {
        // Ignore read receipt errors
      }
    }, readDelay);

    this.logger.info({ from, messageId, isForward: forwardInfo.isForward }, 'Received message');

    // Phase 3: Check reply probability (humans don't reply to everything)
    const replyCheck = this.replyProbability.shouldReply({ text, from: `+${from}` });

    // For forwarded messages, also check forward reply probability
    if (forwardInfo.isForward && !forwardInfo.shouldReply) {
      this.logger.info({ from, reason: 'forward_skip' }, 'Skipping reply to forwarded message');
      return; // Don't forward to webhook for skipped forwards
    }

    // Call the message handler with enhanced context
    await this.onMessage({
      from: `+${from}`,
      message: text,
      messageId,
      timestamp: message.messageTimestamp,
      // Phase 3 context
      shouldReply: replyCheck.shouldReply,
      replyProbability: replyCheck.probability,
      isForward: forwardInfo.isForward,
      forwardCount: forwardInfo.forwardCount || 0,
      conversationContext: this.conversationMemory.getContext(`+${from}`),
    });
  }

  /**
   * Send message with human-like behavior
   * Implements: typing indicators, randomized delays, rate limiting,
   * presence management, message variation, ban warning checks,
   * contact warmup, weekend patterns, group behavior, emoji enhancement,
   * message splitting, conversation memory, spam detection
   */
  async sendMessage(to, text, replyToMessageId = null) {
    if (!this.isConnected) {
      throw new Error('WhatsApp not connected');
    }

    // Normalize phone number/JID first
    const jid = this.normalizeJid(to);
    const isGroup = this.groupBehavior.isGroup(jid);

    // === PHASE 1 & 2: PRE-SEND CHECKS ===

    // Check ban warning system first
    const banCheck = this.banWarning.canSend();
    if (!banCheck.allowed) {
      this.banWarning.recordRateLimitHit();
      throw new Error(`Ban protection: ${banCheck.reason}`);
    }

    // Phase 2: Check contact warmup limits
    if (!isGroup) {
      const warmupCheck = this.contactWarmup.canMessage(to);
      if (!warmupCheck.allowed) {
        throw new Error(`Contact warmup: ${warmupCheck.reason}`);
      }
      if (warmupCheck.isNew) {
        this.logger.info({ to }, 'New contact detected, applying warmup limits');
      }
    }

    // Check rate limits (adjusted for weekend/ramping)
    const baseRateLimitCheck = await this.rateLimiter.canSend();
    if (!baseRateLimitCheck.allowed) {
      this.banWarning.recordRateLimitHit();
      throw new Error(`Rate limit: ${baseRateLimitCheck.reason}`);
    }

    // Check activity/response ratio safety
    const activityCheck = this.activityTracker.isSafeToSend();
    if (!activityCheck.safe) {
      this.logger.warn({ reason: activityCheck.reason }, 'Activity check warning');
    }

    // Check message content safety
    const safetyCheck = checkMessageSafety(text);
    if (!safetyCheck.safe) {
      this.logger.warn({ warnings: safetyCheck.warnings }, 'Message content warnings');
    }

    // === PHASE 2: MESSAGE ENHANCEMENT ===

    // Apply message variation to avoid content-based detection
    let processedText = this.messageVariator.vary(text, 0.3);

    // Phase 2: Maybe add emoji (only for DMs, not groups)
    if (!isGroup) {
      processedText = this.emojiEnhancer.maybeAddEmoji(processedText);
    }

    if (processedText !== text) {
      this.logger.debug({ original: text.substring(0, 50), processed: processedText.substring(0, 50) }, 'Message processed');
    }

    // Check for duplicate content warning
    if (this.messageVariator.isRecentDuplicate(text)) {
      this.logger.warn('Duplicate message detected - consider varying content');
    }

    // === PHASE 3: MESSAGE SPLITTING ===
    // If message is too long, split and send multiple messages
    if (this.messageSplitter.shouldSplit(processedText)) {
      return this._sendSplitMessage(to, processedText, replyToMessageId, jid, isGroup);
    }

    // === PHASE 2: CALCULATE ADJUSTED DELAYS ===

    // Get multipliers from weekend patterns and activity ramper
    const weekendDelayMultiplier = this.weekendPatterns.getDelayMultiplier();
    const rampMultiplier = this.activityRamper.getRateMultiplier();
    const extraRampDelay = this.activityRamper.getExtraDelay();

    // Log if we're in special mode
    if (weekendDelayMultiplier > 1 || rampMultiplier < 1) {
      this.logger.debug({
        weekendMultiplier: weekendDelayMultiplier,
        rampMultiplier: rampMultiplier,
        extraRampDelay,
      }, 'Adjusted timing active');
    }

    // === HUMAN-LIKE BEHAVIOR SIMULATION ===

    // 0. Ensure we're "online" for sending (temporarily if needed)
    const presenceState = await this.presenceManager.temporaryOnline();

    // 1. If this is a reply to a recent message, simulate reading + thinking first
    if (this.lastIncomingMessage && this.lastIncomingMessage.from === to) {
      const incomingText = this.lastIncomingMessage.text;
      const timings = simulateHumanReading(incomingText, processedText);

      // Wait for "reading" time (if we haven't already waited)
      const timeSinceReceived = Date.now() - this.lastIncomingMessage.timestamp;
      const remainingReadTime = Math.max(0, timings.readDelay - timeSinceReceived);
      if (remainingReadTime > 0) {
        this.logger.debug({ remainingReadTime }, 'Simulating remaining read time');
        await delay(remainingReadTime);
      }

      // Add thinking delay (adjusted for weekend/group)
      let thinkDelay = timings.thinkDelay;
      thinkDelay = Math.floor(thinkDelay * weekendDelayMultiplier);
      thinkDelay = this.groupBehavior.adjustDelay(thinkDelay, jid);
      await delay(thinkDelay);
    }

    // Phase 2: Apply extra ramp delay after downtime
    if (extraRampDelay > 0) {
      this.logger.debug({ extraRampDelay }, 'Applying post-downtime ramp delay');
      await delay(extraRampDelay);
    }

    // 2. Subscribe to presence (with randomized delay)
    await this.socket.presenceSubscribe(jid);
    await delay(humanDelay(100, 0.5));

    // 3. Calculate typing duration (adjusted for weekend/group)
    let typingDuration = calculateTypingDuration(processedText, 1000, 6000);
    typingDuration = Math.floor(typingDuration * weekendDelayMultiplier);
    typingDuration = this.groupBehavior.adjustTypingDuration(typingDuration, jid);

    // Phase 2: Use typing simulator for realistic typing with possible corrections
    const typingSequence = this.typingSimulator.generateTypingSequence(typingDuration);
    this.logger.debug({ typingDuration, steps: typingSequence.length }, 'Simulating typing');

    await this.typingSimulator.executeSequence(this.socket, jid, typingSequence);

    // 4. Brief pause before sending (human hesitation - "reviewing before send")
    const hesitationDelay = humanDelay(300, 0.5) * weekendDelayMultiplier;
    await delay(hesitationDelay);

    // 5. Human-like delay before actual send (randomized, adjusted)
    let messageDelay = humanDelay(this.baseMessageDelay, 0.4);
    messageDelay = Math.floor(messageDelay * weekendDelayMultiplier);
    messageDelay = this.groupBehavior.adjustDelay(messageDelay, jid);
    await delay(messageDelay);

    // 6. Send message
    let result;
    try {
      if (replyToMessageId) {
        try {
          const options = { quoted: { key: { id: replyToMessageId, remoteJid: jid } } };
          result = await this.socket.sendMessage(jid, { text: processedText }, options);
        } catch (quoteError) {
          this.logger.warn({ replyToMessageId, error: quoteError.message }, 'Quote failed, sending without reply');
          result = await this.socket.sendMessage(jid, { text: processedText }, {});
        }
      } else {
        result = await this.socket.sendMessage(jid, { text: processedText }, {});
      }

      // Record successful delivery
      this.banWarning.recordDeliverySuccess();

      // Phase 2: Track in delivery tracker
      this.deliveryTracker.recordSent(result.key.id, to);
    } catch (sendError) {
      // Record delivery failure for ban warning
      this.banWarning.recordDeliveryFailure(sendError.message);

      // Phase 3: Record for spam detection
      this.spamDetector.recordDeliveryFailure(to, sendError.message);

      throw sendError;
    }

    // Phase 3: Record in conversation memory
    this.conversationMemory.recordMessage(to, { text: processedText }, 'sent');

    // Phase 5A: Analytics tracking
    this.analytics.recordSent(to, processedText.length);

    // Phase 5A: Contact scoring
    this.contactScoring.recordInteraction(to, 'sent');

    // Phase 5B: Audit logging
    this.auditLogger.logMessage('sent', to, result.key.id, {
      length: processedText.length,
      isGroup,
    });

    // 7. Clear typing indicator (with slight delay - natural behavior)
    await delay(humanDelay(200, 0.3));
    await this.socket.sendPresenceUpdate('paused', jid);

    // 8. Restore presence state (go back offline if we were offline)
    await presenceState.restore();

    // Record send for rate limiting and activity tracking
    this.rateLimiter.recordSend();
    this.activityTracker.recordSent(to);

    // Phase 2: Record contact interaction and activity for ramping
    if (!isGroup) {
      this.contactWarmup.recordContact(to);
    }
    this.activityRamper.recordActivity();

    // Clear last incoming message after responding
    if (this.lastIncomingMessage && this.lastIncomingMessage.from === to) {
      this.lastIncomingMessage = null;
    }

    this.stats.messagesSent++;
    this.logger.info({
      to,
      messageId: result.key.id,
      typingDuration,
      isGroup,
      varied: processedText !== text,
      weekend: this.weekendPatterns.isWeekend(),
      rateLimitStats: this.rateLimiter.getStats(),
      banWarningLevel: this.banWarning.currentLevel,
    }, 'Message sent');

    return result;
  }

  /**
   * Direct send method for MessageScheduler (bypasses queueing)
   * @private
   */
  async _directSend(to, text, replyToMessageId = null) {
    return this.sendMessage(to, text, replyToMessageId);
  }

  /**
   * Queue a message for optimal timing (alternative to sendMessage)
   * Use this for batch/broadcast messages
   */
  queueMessage(to, text, replyToMessageId = null, priority = 'normal') {
    return this.messageScheduler.enqueue(to, text, replyToMessageId, priority);
  }

  /**
   * Send a long message as multiple parts (Phase 3)
   * @private
   */
  async _sendSplitMessage(to, text, replyToMessageId, jid, isGroup) {
    const parts = this.messageSplitter.split(text);
    const partsWithIndicators = this.messageSplitter.addContinuationIndicators(parts);

    this.logger.info({ to, parts: parts.length }, 'Splitting long message');

    const results = [];
    for (let i = 0; i < partsWithIndicators.length; i++) {
      const part = partsWithIndicators[i];

      // Only quote the first message
      const reply = i === 0 ? replyToMessageId : null;

      // Send part using normal sendMessage (recursive but text is now short)
      const result = await this.sendMessage(to, part, reply);
      results.push(result);

      // Delay between parts
      if (i < partsWithIndicators.length - 1) {
        const partDelay = this.messageSplitter.getPartDelay();
        await new Promise(resolve => setTimeout(resolve, partDelay));
      }
    }

    // Return the last result (for message ID)
    return results[results.length - 1];
  }

  normalizeJid(phone) {
    // Remove all non-numeric characters
    let normalized = phone.replace(/\D/g, '');

    // Handle Indonesian numbers
    if (normalized.startsWith('0')) {
      normalized = '62' + normalized.slice(1);
    }

    // Remove leading + if present
    if (normalized.startsWith('+')) {
      normalized = normalized.slice(1);
    }

    return `${normalized}@s.whatsapp.net`;
  }

  getStatus() {
    return {
      connected: this.isConnected,
      phone: this.phoneNumber,
      name: this.userName,
      qr: this.qrCode,
      stats: {
        messagesSent: this.stats.messagesSent,
        messagesReceived: this.stats.messagesReceived,
        uptime: this.stats.startedAt
          ? Math.floor((Date.now() - this.stats.startedAt) / 1000)
          : 0,
      },
      rateLimits: this.rateLimiter.getStats(),
      activity: this.activityTracker.getStats(),
      reconnection: this.reconnectionManager.getState(),
      // Phase 1 features
      presence: this.presenceManager.getStatus(),
      banWarning: this.banWarning.getMetrics(),
      // Phase 2 features
      delivery: this.deliveryTracker.getStats(),
      activityRamp: this.activityRamper.getStatus(),
      weekendPatterns: this.weekendPatterns.getStatus(),
      messageQueue: this.messageScheduler.getStatus(),
      networkHealth: this.networkFingerprint.checkNetworkHealth(),
      // Phase 3 features
      spamDetection: this.spamDetector.getMetrics(),
      geoMatch: this.geoMatcher.getStatus(),
      statusViewer: this.statusViewer.getStatus(),
      profileViewer: this.profileViewer.getStats(),
      activeConversations: this.conversationMemory.getActiveConversations().length,
      // Phase 4 features
      blockDetector: this.blockDetector.getStats(),
      sessionBackup: this.sessionManager.getBackupInfo(),
      persistentQueue: this.persistentQueue.getStats(),
      webhookRetry: this.webhookManager.getStats(),
      healthMonitor: this.healthMonitor.getStatus(),
      // Phase 5 features
      analytics: this.analytics.getSummary(),
      contactScoring: this.contactScoring.getStats(),
      sentiment: this.sentimentDetector.getStats(),
      ipWhitelist: this.ipWhitelist.getStatus(),
      auditLogs: this.auditLogger.getStats(),
      apiRateLimiter: this.apiRateLimiter.getStats(),
      autoResponder: this.autoResponder.getStats(),
      templates: this.messageTemplates.getStats(),
      scheduledMessages: this.scheduledMessages.getStats(),
    };
  }

  /**
   * Set account age for rate limiting
   * Call this to adjust limits based on how old the WhatsApp account is
   *
   * @param {number} weeks - Account age in weeks
   */
  setAccountAge(weeks) {
    this.rateLimiter.setAccountAge(weeks);
    this.logger.info({ weeks, limits: this.rateLimiter.getLimits() }, 'Account age updated');
  }

  async disconnect() {
    // Stop presence cycling
    this.presenceManager.stopPresenceCycle();

    // Phase 2: Stop network check interval
    if (this.networkCheckInterval) {
      clearInterval(this.networkCheckInterval);
      this.networkCheckInterval = null;
    }

    // Phase 2: Cleanup delivery tracker
    this.deliveryTracker.destroy();

    // Phase 2: Clear message queue
    this.messageScheduler.clear();

    // Phase 3: Stop status viewing
    this.statusViewer.stopViewing();

    // Phase 4: Stop services and save state
    this.healthMonitor.stop();
    this.sessionManager.stopAutoBackup();
    this.persistentQueue.saveQueue(); // Save pending messages
    this.webhookManager.saveFailedQueue(); // Save failed webhooks

    // Phase 5: Stop services and cleanup
    this.scheduledMessages.stop();
    this.apiRateLimiter.destroy();

    // Phase 5: Log system event
    this.auditLogger.logSystem('whatsapp_disconnected', {
      phone: this.phoneNumber,
    });

    if (this.socket) {
      await this.socket.logout();
      this.isConnected = false;
    }
  }

  /**
   * Exit hibernation mode (manual override for ban warning)
   */
  exitHibernation() {
    this.banWarning.exitHibernation();
    this.logger.info('Hibernation mode disabled - proceed with caution');
  }

  /**
   * Reset ban warning metrics (use after recovery period)
   */
  resetBanWarning() {
    this.banWarning.resetMetrics();
    this.logger.info('Ban warning metrics reset');
  }
}

export default WhatsAppClient;
