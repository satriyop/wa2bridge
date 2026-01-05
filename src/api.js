import express from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { setupSwagger } from './swagger.js';
import { wrapHandler, wrapCustomHandler } from './middleware/handler.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { ValidationError } from './errors.js';
import { LRUMap } from './utils/lru-map.js';

/**
 * @typedef {import('../types/index.js').SendMessageRequest} SendMessageRequest
 * @typedef {import('../types/index.js').SendMessageResponse} SendMessageResponse
 * @typedef {import('../types/index.js').StatusResponse} StatusResponse
 * @typedef {import('../types/index.js').QRResponse} QRResponse
 * @typedef {import('../types/index.js').QueueMessageRequest} QueueMessageRequest
 * @typedef {import('../types/index.js').MessagePriority} MessagePriority
 */

/**
 * @typedef {Object} ApiServerOptions
 * @property {string} [apiSecret] - Bearer token for API authentication
 */

/**
 * Creates the Express API server for wa2bridge
 *
 * @param {import('./whatsapp.js').default} whatsappClient - WhatsApp client instance
 * @param {ApiServerOptions} [options] - Server configuration options
 * @returns {import('express').Express} Configured Express app
 *
 * @example
 * ```javascript
 * const app = createApiServer(whatsappClient, { apiSecret: 'my-secret' });
 * app.listen(3000);
 * ```
 */
export function createApiServer(whatsappClient, options = {}) {
  const app = express();
  const apiSecret = options.apiSecret;

  app.use(express.json());

  // ==========================================================================
  // CORS Configuration
  // ==========================================================================
  app.use((req, res, next) => {
    // Allow requests from any origin (configure CORS_ORIGIN env var for production)
    const allowedOrigin = process.env.CORS_ORIGIN || '*';
    res.set('Access-Control-Allow-Origin', allowedOrigin);
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Request-ID');
    res.set('Access-Control-Expose-Headers', 'X-Request-ID');

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(204).send();
    }

    next();
  });

  // ==========================================================================
  // Request ID Tracing
  // ==========================================================================
  let requestCounter = 0;
  app.use((req, res, next) => {
    // Use provided ID or generate one
    const requestId = req.get('X-Request-ID') || `req_${Date.now()}_${++requestCounter}`;
    req.requestId = requestId;
    res.set('X-Request-ID', requestId);
    next();
  });

  // Request logging middleware (with request ID)
  app.use((req, res, next) => {
    const start = Date.now();
    const { method, path, ip, requestId } = req;

    res.on('finish', () => {
      const duration = Date.now() - start;
      const { statusCode } = res;
      // Skip health checks to reduce noise
      if (path === '/health' || path === '/health/ready') return;
      console.log(`[${requestId}] ${method} ${path} ${statusCode} ${duration}ms [${ip}]`);
    });

    next();
  });

  // ==========================================================================
  // IP-based Rate Limiting
  // ==========================================================================
  const ipRateLimits = new LRUMap(1000); // Max 1000 IPs tracked
  const IP_RATE_LIMIT = 100;        // requests per window
  const IP_RATE_WINDOW = 60 * 1000; // 1 minute window

  /**
   * Clean up expired rate limit entries
   */
  const cleanupRateLimits = () => {
    const now = Date.now();
    for (const [ip, data] of ipRateLimits.entries()) {
      if (now - data.windowStart > IP_RATE_WINDOW) {
        ipRateLimits.delete(ip);
      }
    }
  };

  // Cleanup every minute
  setInterval(cleanupRateLimits, 60000);

  // ==========================================================================
  // Server-Sent Events (SSE) for Real-Time Dashboard Updates
  // ==========================================================================
  const sseClients = new Set();

  /**
   * Broadcast event to all connected SSE clients
   * @param {string} event - Event name (status, rate-limits, ban-warning, etc.)
   * @param {Object} data - Event data
   */
  const broadcast = (event, data) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(message);
      } catch (e) {
        // Client disconnected, will be cleaned up
        sseClients.delete(client);
      }
    }
  };

  // Expose broadcast function on the app for external use
  app.broadcast = broadcast;

  /**
   * IP rate limiting middleware
   */
  const ipRateLimit = (req, res, next) => {
    // Skip rate limiting for health checks
    if (req.path === '/health' || req.path === '/health/ready') {
      return next();
    }

    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();

    let data = ipRateLimits.get(ip);

    if (!data || now - data.windowStart > IP_RATE_WINDOW) {
      // New window
      data = { count: 1, windowStart: now };
      ipRateLimits.set(ip, data);
      return next();
    }

    data.count++;

    if (data.count > IP_RATE_LIMIT) {
      const retryAfter = Math.ceil((IP_RATE_WINDOW - (now - data.windowStart)) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        retryAfter,
      });
    }

    next();
  };

  app.use(ipRateLimit);

  // Security: Warn if no API secret configured
  if (!apiSecret) {
    console.warn('⚠️  WARNING: No API_SECRET configured!');
    console.warn('⚠️  Protected endpoints are accessible without authentication.');
    console.warn('⚠️  Set API_SECRET environment variable for production use.');
  }

  /**
   * Timing-safe token comparison to prevent timing attacks.
   * @param {string} provided - Token from request
   * @param {string} expected - Expected secret token
   * @returns {boolean}
   */
  const safeCompare = (provided, expected) => {
    if (typeof provided !== 'string' || typeof expected !== 'string') {
      return false;
    }
    // Ensure same length comparison to prevent length-based timing leaks
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length) {
      // Compare against expected anyway to maintain constant time
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(expected));
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  };

  // Auth middleware
  const authenticate = (req, res, next) => {
    if (!apiSecret) {
      return next(); // No auth if no secret (dev mode warning shown at startup)
    }

    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Bearer token required' });
    }

    const token = auth.slice(7);
    if (!safeCompare(token, apiSecret)) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Invalid token' });
    }

    next();
  };

  // Liveness probe - is the process alive? (no auth required)
  app.get('/health', (req, res) => {
    const mem = process.memoryUsage();
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),  // MB
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024), // MB
        rss: Math.round(mem.rss / 1024 / 1024),             // MB
      },
    });
  });

  // Readiness probe - is it ready to handle requests? (no auth required)
  app.get('/health/ready', (req, res) => {
    const status = whatsappClient.getStatus();
    const banWarning = status.banWarning || {};
    const isHibernating = banWarning.hibernationMode === true;
    const isConnected = status.connected === true;

    // Ready if connected and not hibernating
    if (isConnected && !isHibernating) {
      return res.json({
        ready: true,
        connected: true,
        hibernating: false,
        timestamp: new Date().toISOString(),
      });
    }

    // Not ready - return 503 Service Unavailable
    res.status(503).json({
      ready: false,
      connected: isConnected,
      hibernating: isHibernating,
      reason: !isConnected ? 'WhatsApp not connected' : 'In hibernation mode',
      timestamp: new Date().toISOString(),
    });
  });

  // Get WhatsApp status
  app.get('/api/status', authenticate, (req, res) => {
    const status = whatsappClient.getStatus();
    res.json(status);
  });

  // Get QR code as JSON (no auth - for easy browser access during pairing)
  app.get('/api/qr', (req, res) => {
    const status = whatsappClient.getStatus();

    if (status.connected) {
      return res.json({ status: 'connected', qr: null, phone: status.phone });
    }

    if (status.qr) {
      return res.json({ status: 'waiting_scan', qr: status.qr });
    }

    res.json({ status: 'initializing', qr: null });
  });

  // QR code as HTML page (for easy scanning in browser)
  app.get('/qr', async (req, res) => {
    const status = whatsappClient.getStatus();

    if (status.connected) {
      return res.send(`
        <html>
          <head><title>WA2Bridge - Connected</title></head>
          <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1>✅ WhatsApp Connected</h1>
            <p>Phone: ${status.phone || 'Unknown'}</p>
            <p>Name: ${status.name || 'Unknown'}</p>
          </body>
        </html>
      `);
    }

    if (status.qr) {
      try {
        const qrDataUrl = await QRCode.toDataURL(status.qr, { width: 300, margin: 2 });
        return res.send(`
          <html>
            <head><title>WA2Bridge - Scan QR</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h1>📱 Scan with WhatsApp</h1>
              <p>Open WhatsApp → Settings → Linked Devices → Link a Device</p>
              <img src="${qrDataUrl}" alt="QR Code" style="margin: 20px auto; display: block;" />
              <p style="color: #666; margin-top: 20px;">QR refreshes automatically. Reload if expired.</p>
            </body>
          </html>
        `);
      } catch (err) {
        console.error('QR generation error:', err);
      }
    }

    res.send(`
      <html>
        <head><title>WA2Bridge - Loading</title><meta http-equiv="refresh" content="2"></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1>⏳ Initializing...</h1>
          <p>Please wait, generating QR code...</p>
        </body>
      </html>
    `);
  });

  /**
   * Send a message
   * @route POST /api/send
   * @param {SendMessageRequest} req.body - Message details
   * @returns {SendMessageResponse} Send result
   */
  app.post('/api/send', authenticate, wrapHandler(async (req) => {
    /** @type {SendMessageRequest} */
    const { to, message, reply_to } = req.body;

    if (!to || !message) {
      throw new ValidationError('Missing "to" or "message"');
    }

    // Validate phone number format
    // Accepts: +6281234567890, 6281234567890, 6281234567890@s.whatsapp.net
    const phoneRegex = /^\+?\d{10,15}(@s\.whatsapp\.net)?$/;
    const cleanPhone = to.replace(/[\s-]/g, ''); // Remove spaces and dashes
    if (!phoneRegex.test(cleanPhone)) {
      throw new ValidationError('Invalid phone number format. Use format: +6281234567890 or 6281234567890');
    }

    const result = await whatsappClient.sendMessage(to, message, reply_to);

    return {
      success: true,
      messageId: result.key.id,
      to,
    };
  }));

  // Reconnect (logout and reconnect)
  app.post('/api/reconnect', authenticate, wrapHandler(async () => {
    await whatsappClient.disconnect();

    // Use humanized delay for reconnection (2-4 seconds with jitter)
    const { humanDelay } = await import('./anti-ban/index.js');
    const reconnectDelay = humanDelay(3000, 0.4);

    setTimeout(() => whatsappClient.connect(), reconnectDelay);

    return { status: 'reconnecting', delayMs: reconnectDelay };
  }));

  // Get rate limit status
  app.get('/api/rate-limits', authenticate, (req, res) => {
    const status = whatsappClient.getStatus();
    res.json({
      rateLimits: status.rateLimits,
      activity: status.activity,
      reconnection: status.reconnection,
    });
  });

  // Set account age (for adjusting rate limits)
  app.post('/api/account-age', authenticate, wrapHandler((req) => {
    const { weeks } = req.body;
    if (typeof weeks !== 'number' || weeks < 1) {
      throw new ValidationError('weeks must be a positive number');
    }
    whatsappClient.setAccountAge(weeks);
    return {
      success: true,
      accountAgeWeeks: weeks,
      newLimits: whatsappClient.rateLimiter.getLimits(),
    };
  }));

  // Get ban warning status
  app.get('/api/ban-warning', authenticate, (req, res) => {
    const status = whatsappClient.getStatus();
    res.json({
      banWarning: status.banWarning,
      presence: status.presence,
    });
  });

  // Exit hibernation mode (manual override)
  app.post('/api/exit-hibernation', authenticate, wrapHandler(() => {
    whatsappClient.exitHibernation();
    return {
      success: true,
      message: 'Hibernation mode disabled. Proceed with caution.',
      banWarning: whatsappClient.banWarning.getMetrics(),
    };
  }));

  // Reset ban warning metrics
  app.post('/api/reset-ban-warning', authenticate, wrapHandler(() => {
    whatsappClient.resetBanWarning();
    return {
      success: true,
      message: 'Ban warning metrics reset',
      banWarning: whatsappClient.banWarning.getMetrics(),
    };
  }));

  // Manually set presence (online/offline)
  app.post('/api/presence', authenticate, wrapHandler(async (req) => {
    const { status } = req.body;
    if (!['online', 'offline'].includes(status)) {
      throw new ValidationError('status must be "online" or "offline"');
    }

    if (status === 'online') {
      await whatsappClient.presenceManager.goOnline();
    } else {
      await whatsappClient.presenceManager.goOffline();
    }

    return {
      success: true,
      presence: whatsappClient.presenceManager.getStatus(),
    };
  }));

  // ==========================================================================
  // PHASE 2: NEW ANTI-BAN ENDPOINTS
  // ==========================================================================

  // Get delivery health status
  app.get('/api/delivery-health', authenticate, wrapHandler(() => {
    return whatsappClient.deliveryTracker.checkDeliveryHealth();
  }));

  // Get contact warmup status
  app.get('/api/contact-warmup/:phone', authenticate, wrapHandler((req) => {
    const { phone } = req.params;
    const status = whatsappClient.contactWarmup.getContactStatus(phone);
    const canMessage = whatsappClient.contactWarmup.canMessage(phone);
    return { ...status, ...canMessage };
  }));

  // Queue a message for optimal timing (alternative to /api/send)
  app.post('/api/queue', authenticate, wrapHandler((req) => {
    const { to, message, reply_to, priority } = req.body;
    if (!to || !message) {
      throw new ValidationError('Missing "to" or "message"');
    }
    const messageId = whatsappClient.queueMessage(to, message, reply_to, priority || 'normal');
    const queueStatus = whatsappClient.messageScheduler.getStatus();
    return { success: true, queued: true, queuedMessageId: messageId, queueStatus };
  }));

  // Get weekend/holiday pattern status
  app.get('/api/weekend-patterns', authenticate, wrapHandler(() => {
    return whatsappClient.weekendPatterns.getStatus();
  }));

  // Get activity ramp status (post-downtime)
  app.get('/api/activity-ramp', authenticate, wrapHandler(() => {
    return whatsappClient.activityRamper.getStatus();
  }));

  // Get network fingerprint health
  app.get('/api/network-health', authenticate, wrapHandler(() => {
    const health = whatsappClient.networkFingerprint.checkNetworkHealth();
    const recommendations = whatsappClient.networkFingerprint.getRecommendations();
    return { ...health, recommendations };
  }));

  // Get message queue status
  app.get('/api/queue-status', authenticate, wrapHandler(() => {
    return whatsappClient.messageScheduler.getStatus();
  }));

  // Clear message queue
  app.post('/api/queue-clear', authenticate, wrapHandler(() => {
    whatsappClient.messageScheduler.clear();
    return {
      success: true,
      message: 'Message queue cleared',
      queueStatus: whatsappClient.messageScheduler.getStatus(),
    };
  }));

  // ==========================================================================
  // PHASE 3: ADDITIONAL ANTI-BAN ENDPOINTS
  // ==========================================================================

  // Get spam detection status
  app.get('/api/spam-detection', authenticate, wrapHandler(() => {
    return whatsappClient.spamDetector.getMetrics();
  }));

  // Get geo IP match status
  app.get('/api/geo-match', authenticate, wrapHandler(async () => {
    const status = whatsappClient.geoMatcher.getStatus();
    const check = await whatsappClient.geoMatcher.checkIPCountry();
    return { ...status, check };
  }));

  // Get conversation context for a contact
  app.get('/api/conversation/:phone', authenticate, wrapHandler((req) => {
    const { phone } = req.params;
    return whatsappClient.conversationMemory.getContext(phone);
  }));

  // Get all active conversations
  app.get('/api/conversations-active', authenticate, wrapHandler(() => {
    const active = whatsappClient.conversationMemory.getActiveConversations();
    return { count: active.length, conversations: active };
  }));

  // Get status viewer status
  app.get('/api/status-viewer', authenticate, wrapHandler(() => {
    return whatsappClient.statusViewer.getStatus();
  }));

  // Check reply probability for a message
  app.post('/api/reply-check', authenticate, wrapHandler((req) => {
    const { text, from } = req.body;
    if (!text || !from) {
      throw new ValidationError('Missing "text" or "from"');
    }
    return whatsappClient.replyProbability.shouldReply({ text, from });
  }));

  // ==========================================================================
  // PHASE 4: DETECTION & RECOVERY / OPERATIONAL ENDPOINTS
  // ==========================================================================

  // Get block detection status
  app.get('/api/block-detection', authenticate, wrapHandler(() => {
    return whatsappClient.blockDetector.getStats();
  }));

  // Check if a specific contact has blocked us
  app.get('/api/block-detection/:phone', authenticate, wrapHandler(async (req) => {
    const { phone } = req.params;
    const isBlocked = await whatsappClient.blockDetector.checkIfBlocked(phone);
    const status = whatsappClient.blockDetector.getContactStatus(phone);
    return { phone, isBlocked, ...status };
  }));

  // Get session backup info
  app.get('/api/session-backup', authenticate, wrapHandler(() => {
    return whatsappClient.sessionManager.getBackupInfo();
  }));

  // Trigger manual session backup
  app.post('/api/session-backup', authenticate, wrapHandler(async () => {
    const backupPath = await whatsappClient.sessionManager.backup();
    return {
      success: true,
      message: 'Session backed up',
      backupPath,
      backupInfo: whatsappClient.sessionManager.getBackupInfo(),
    };
  }));

  // Restore session from backup
  app.post('/api/session-restore', authenticate, wrapHandler(async (req) => {
    const { backupName } = req.body;
    const restored = await whatsappClient.sessionManager.restore(backupName);
    return {
      success: restored,
      message: restored ? 'Session restored - restart required' : 'Restore failed',
    };
  }));

  // Get persistent queue status
  app.get('/api/persistent-queue', authenticate, wrapHandler(() => {
    return whatsappClient.persistentQueue.getStats();
  }));

  // Queue a message to persistent queue (survives restart)
  app.post('/api/persistent-queue', authenticate, wrapHandler((req) => {
    const { to, message, reply_to, priority } = req.body;
    if (!to || !message) {
      throw new ValidationError('Missing "to" or "message"');
    }
    const messageId = whatsappClient.persistentQueue.enqueue(to, message, reply_to, priority || 'normal');
    return {
      success: true,
      queued: true,
      queuedMessageId: messageId,
      queueStats: whatsappClient.persistentQueue.getStats(),
    };
  }));

  // Process persistent queue manually
  app.post('/api/persistent-queue/process', authenticate, wrapHandler(async () => {
    await whatsappClient.persistentQueue.processQueue();
    return { success: true, queueStats: whatsappClient.persistentQueue.getStats() };
  }));

  // Get webhook retry queue status
  app.get('/api/webhook-retry', authenticate, wrapHandler(() => {
    return whatsappClient.webhookManager.getStats();
  }));

  // Retry all failed webhooks
  app.post('/api/webhook-retry', authenticate, wrapHandler(async () => {
    await whatsappClient.webhookManager.retryFailed();
    return { success: true, webhookStats: whatsappClient.webhookManager.getStats() };
  }));

  // Get health monitor status
  app.get('/api/health-monitor', authenticate, wrapHandler(() => {
    return whatsappClient.healthMonitor.getStatus();
  }));

  // Get full health report
  app.get('/api/health-report', authenticate, wrapHandler(() => {
    return whatsappClient.healthMonitor.generateReport();
  }));

  // Get detected language for a contact
  app.get('/api/language/:phone', authenticate, wrapHandler((req) => {
    const { phone } = req.params;
    const language = whatsappClient.languageDetector.getContactLanguage(phone);
    const confidence = whatsappClient.languageDetector.getLanguageConfidence(phone);
    return { phone, language, confidence };
  }));

  // Get all detected languages
  app.get('/api/languages', authenticate, wrapHandler(() => {
    return whatsappClient.languageDetector.getAllLanguages();
  }));

  // ==========================================================================
  // PHASE 5A: ANALYTICS & INTELLIGENCE ENDPOINTS
  // ==========================================================================

  // Get analytics summary
  app.get('/api/analytics', authenticate, wrapHandler(() => {
    return whatsappClient.analytics.getSummary();
  }));

  // Get peak messaging hours (MUST be before /:phone to avoid route collision)
  app.get('/api/analytics/peak-hours', authenticate, wrapHandler(() => {
    return whatsappClient.analytics.getPeakHours();
  }));

  // Get analytics for specific contact
  app.get('/api/analytics/:phone', authenticate, wrapHandler((req) => {
    const { phone } = req.params;
    const stats = whatsappClient.analytics.getContactStats(phone);
    return stats || { error: 'Contact not found' };
  }));

  // Get contact scoring stats
  app.get('/api/scoring', authenticate, wrapHandler(() => {
    return whatsappClient.contactScoring.getStats();
  }));

  // Get top contacts by score (MUST be before /:phone to avoid route collision)
  app.get('/api/scoring/top/:limit', authenticate, wrapHandler((req) => {
    const limit = parseInt(req.params.limit) || 10;
    return whatsappClient.contactScoring.getTopContacts(limit);
  }));

  // Get contacts needing attention (MUST be before /:phone to avoid route collision)
  app.get('/api/scoring/attention', authenticate, wrapHandler(() => {
    return whatsappClient.contactScoring.getContactsNeedingAttention();
  }));

  // Get score for specific contact
  app.get('/api/scoring/:phone', authenticate, wrapHandler((req) => {
    const { phone } = req.params;
    const score = whatsappClient.contactScoring.getScore(phone);
    const tier = whatsappClient.contactScoring.getTier(phone);
    return { phone, score, tier };
  }));

  // Analyze sentiment of text
  app.post('/api/sentiment/analyze', authenticate, wrapHandler((req) => {
    const { text } = req.body;
    if (!text) throw new ValidationError('Missing "text"');
    return whatsappClient.sentimentDetector.analyze(text);
  }));

  // Get sentiment for contact
  app.get('/api/sentiment/:phone', authenticate, wrapHandler((req) => {
    const { phone } = req.params;
    return whatsappClient.sentimentDetector.getContactSentiment(phone);
  }));

  // ==========================================================================
  // PHASE 5B: SECURITY HARDENING ENDPOINTS
  // ==========================================================================

  // Get IP whitelist status
  app.get('/api/security/ip-whitelist', authenticate, wrapHandler(() => {
    return whatsappClient.ipWhitelist.getStatus();
  }));

  // Enable/disable IP whitelist
  app.post('/api/security/ip-whitelist/toggle', authenticate, wrapHandler((req) => {
    const { enabled } = req.body;
    whatsappClient.ipWhitelist.setEnabled(enabled);
    return { success: true, status: whatsappClient.ipWhitelist.getStatus() };
  }));

  // Add IP to whitelist
  app.post('/api/security/ip-whitelist/add', authenticate, wrapHandler((req) => {
    const { ip } = req.body;
    if (!ip) throw new ValidationError('Missing "ip"');
    whatsappClient.ipWhitelist.addToWhitelist(ip);
    return { success: true, status: whatsappClient.ipWhitelist.getStatus() };
  }));

  // Add IP to blacklist
  app.post('/api/security/ip-blacklist/add', authenticate, wrapHandler((req) => {
    const { ip } = req.body;
    if (!ip) throw new ValidationError('Missing "ip"');
    whatsappClient.ipWhitelist.addToBlacklist(ip);
    return { success: true, status: whatsappClient.ipWhitelist.getStatus() };
  }));

  // Get audit logs
  app.get('/api/security/audit-logs', authenticate, wrapHandler((req) => {
    const { type, limit, hours } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (limit) filter.limit = parseInt(limit);
    if (hours) filter.since = Date.now() - parseInt(hours) * 60 * 60 * 1000;
    return whatsappClient.auditLogger.getLogs(filter);
  }));

  // Get audit log stats
  app.get('/api/security/audit-stats', authenticate, wrapHandler((req) => {
    const hours = parseInt(req.query.hours) || 24;
    return whatsappClient.auditLogger.getStats(hours);
  }));

  // Get security events
  app.get('/api/security/events', authenticate, wrapHandler((req) => {
    const hours = parseInt(req.query.hours) || 24;
    return whatsappClient.auditLogger.getSecurityEvents(hours);
  }));

  // Get API rate limiter stats
  app.get('/api/security/rate-limiter', authenticate, wrapHandler(() => {
    return whatsappClient.apiRateLimiter.getStats();
  }));

  // ==========================================================================
  // PHASE 5C: SMART AUTOMATION ENDPOINTS
  // ==========================================================================

  // Get auto-responder status
  app.get('/api/auto-responder', authenticate, wrapHandler(() => {
    return {
      stats: whatsappClient.autoResponder.getStats(),
      rules: whatsappClient.autoResponder.getRules(),
    };
  }));

  // Enable/disable auto-responder
  app.post('/api/auto-responder/toggle', authenticate, wrapHandler((req) => {
    const { enabled } = req.body;
    whatsappClient.autoResponder.setEnabled(enabled);
    return { success: true, enabled };
  }));

  // Add auto-responder rule
  app.post('/api/auto-responder/rules', authenticate, wrapHandler((req) => {
    const rule = whatsappClient.autoResponder.addRule(req.body);
    return { success: true, rule };
  }));

  // Update auto-responder rule
  app.put('/api/auto-responder/rules/:id', authenticate, wrapHandler((req) => {
    const { id } = req.params;
    const rule = whatsappClient.autoResponder.updateRule(id, req.body);
    return { success: true, rule };
  }));

  // Delete auto-responder rule
  app.delete('/api/auto-responder/rules/:id', authenticate, wrapHandler((req) => {
    const { id } = req.params;
    const deleted = whatsappClient.autoResponder.deleteRule(id);
    return { success: deleted };
  }));

  // Get message templates
  app.get('/api/templates', authenticate, wrapHandler((req) => {
    const { category } = req.query;
    return whatsappClient.messageTemplates.list(category);
  }));

  // Create message template
  app.post('/api/templates', authenticate, wrapHandler((req) => {
    const { name, content, category, language } = req.body;
    if (!name || !content) {
      throw new ValidationError('Missing "name" or "content"');
    }
    const template = whatsappClient.messageTemplates.create(name, content, { category, language });
    return { success: true, template };
  }));

  // Render message template
  app.post('/api/templates/render', authenticate, wrapHandler((req) => {
    const { name, variables } = req.body;
    if (!name) throw new ValidationError('Missing "name"');
    const rendered = whatsappClient.messageTemplates.render(name, variables || {});
    return { success: true, rendered };
  }));

  // Delete message template
  app.delete('/api/templates/:name', authenticate, wrapHandler((req) => {
    const { name } = req.params;
    const deleted = whatsappClient.messageTemplates.delete(name);
    return { success: deleted };
  }));

  // Get scheduled messages
  app.get('/api/scheduled', authenticate, wrapHandler((req) => {
    const { status, to } = req.query;
    return whatsappClient.scheduledMessages.getScheduled({ status, to });
  }));

  // Schedule a message
  app.post('/api/scheduled', authenticate, wrapHandler((req) => {
    const { to, message, sendAt, replyTo, repeat } = req.body;
    if (!to || !message || !sendAt) {
      throw new ValidationError('Missing "to", "message", or "sendAt"');
    }
    const scheduled = whatsappClient.scheduledMessages.schedule(to, message, sendAt, { replyTo, repeat });
    return { success: true, scheduled };
  }));

  // Cancel scheduled message
  app.delete('/api/scheduled/:id', authenticate, wrapHandler((req) => {
    const { id } = req.params;
    const cancelled = whatsappClient.scheduledMessages.cancel(id);
    return { success: cancelled };
  }));

  // Get scheduled messages stats
  app.get('/api/scheduled/stats', authenticate, wrapHandler(() => {
    return whatsappClient.scheduledMessages.getStats();
  }));

  // ==========================================================================
  // PHASE 6: ENHANCED WEBHOOK ENDPOINTS
  // ==========================================================================

  // Get webhook status and subscriptions
  app.get('/api/webhooks', authenticate, wrapHandler(() => {
    if (!whatsappClient.webhookEmitter) {
      return { enabled: false, message: 'Webhook emitter not initialized' };
    }
    return whatsappClient.webhookEmitter.getStats();
  }));

  // Get webhook event history
  app.get('/api/webhooks/history', authenticate, wrapHandler((req) => {
    const limit = parseInt(req.query.limit) || 20;
    if (!whatsappClient.webhookEmitter) {
      return { events: [] };
    }
    return { events: whatsappClient.webhookEmitter.getHistory(limit) };
  }));

  // Subscribe to webhook events
  app.post('/api/webhooks/subscribe', authenticate, wrapHandler((req) => {
    const { events } = req.body;
    if (!events || !Array.isArray(events)) {
      throw new ValidationError('Missing "events" array');
    }
    if (!whatsappClient.webhookEmitter) {
      throw new ValidationError('Webhook emitter not initialized');
    }
    whatsappClient.webhookEmitter.subscribe(events);
    return {
      success: true,
      subscriptions: Array.from(whatsappClient.webhookEmitter.subscriptions),
    };
  }));

  // Unsubscribe from webhook events
  app.post('/api/webhooks/unsubscribe', authenticate, wrapHandler((req) => {
    const { events } = req.body;
    if (!events || !Array.isArray(events)) {
      throw new ValidationError('Missing "events" array');
    }
    if (!whatsappClient.webhookEmitter) {
      throw new ValidationError('Webhook emitter not initialized');
    }
    whatsappClient.webhookEmitter.unsubscribe(events);
    return {
      success: true,
      subscriptions: Array.from(whatsappClient.webhookEmitter.subscriptions),
    };
  }));

  // Enable/disable webhooks
  app.post('/api/webhooks/toggle', authenticate, wrapHandler((req) => {
    const { enabled } = req.body;
    if (typeof enabled !== 'boolean') {
      throw new ValidationError('Missing "enabled" boolean');
    }
    if (!whatsappClient.webhookEmitter) {
      throw new ValidationError('Webhook emitter not initialized');
    }
    whatsappClient.webhookEmitter.setEnabled(enabled);
    return { success: true, enabled };
  }));

  // Get pending webhook retries
  app.get('/api/webhooks/retries', authenticate, wrapHandler(() => {
    if (!whatsappClient.webhookEmitter) {
      return { pending: [] };
    }
    return { pending: whatsappClient.webhookEmitter.getPendingRetries() };
  }));

  // Process pending webhook retries
  app.post('/api/webhooks/retries', authenticate, wrapHandler(async () => {
    if (!whatsappClient.webhookEmitter) {
      return { processed: 0 };
    }
    return await whatsappClient.webhookEmitter.processRetries();
  }));

  // Test webhook (send test event)
  app.post('/api/webhooks/test', authenticate, wrapHandler(async () => {
    if (!whatsappClient.webhookEmitter) {
      throw new ValidationError('Webhook emitter not initialized');
    }
    return await whatsappClient.webhookEmitter.emit('webhook.test', {
      message: 'Test webhook from wa2bridge',
      timestamp: Date.now(),
    });
  }));

  // Get available webhook event types
  app.get('/api/webhooks/events', authenticate, wrapHandler(() => {
    return {
      events: {
        message: [
          'message.received',
          'message.sent',
          'message.delivered',
          'message.read',
          'message.failed',
        ],
        presence: [
          'presence.online',
          'presence.offline',
          'presence.typing',
          'presence.recording',
        ],
        connection: [
          'connection.open',
          'connection.close',
          'connection.qr_update',
          'connection.logged_out',
        ],
        contact: [
          'contact.profile_update',
          'contact.blocked',
          'contact.unblocked',
        ],
        status: [
          'status.view',
          'status.reaction',
        ],
        antiban: [
          'antiban.warning',
          'antiban.hibernation',
          'antiban.rate_limit',
        ],
      },
    };
  }));

  // ==========================================================================
  // Server-Sent Events Endpoint
  // ==========================================================================

  /**
   * @swagger
   * /api/events:
   *   get:
   *     summary: Real-time event stream (SSE)
   *     description: |
   *       Server-Sent Events endpoint for real-time dashboard updates.
   *       Connect using EventSource API in the browser.
   *
   *       Events emitted:
   *       - `status` - Connection status changes
   *       - `rate-limits` - Rate limit updates
   *       - `ban-warning` - Ban risk changes
   *       - `message-sent` - Message sent notification
   *       - `message-received` - Incoming message notification
   *       - `webhook-event` - Webhook activity
   *     tags: [Real-Time]
   *     responses:
   *       200:
   *         description: SSE stream established
   *         content:
   *           text/event-stream:
   *             schema:
   *               type: string
   */
  app.get('/api/events', (req, res) => {
    // Set SSE headers
    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    });

    // Send initial connection event with current state
    const status = whatsappClient.getStatus();
    res.write(`event: connected\ndata: ${JSON.stringify({ message: 'SSE connection established' })}\n\n`);
    res.write(`event: status\ndata: ${JSON.stringify(status)}\n\n`);

    // Send rate limits if available
    if (whatsappClient.rateLimiter?.getStats) {
      const rateLimits = whatsappClient.rateLimiter.getStats();
      res.write(`event: rate-limits\ndata: ${JSON.stringify(rateLimits)}\n\n`);
    }

    // Send ban warning if available
    if (whatsappClient.banWarning?.getStatus) {
      const banWarning = whatsappClient.banWarning.getStatus();
      res.write(`event: ban-warning\ndata: ${JSON.stringify(banWarning)}\n\n`);
    }

    // Add client to broadcast set
    sseClients.add(res);
    console.log(`[SSE] Client connected (total: ${sseClients.size})`);

    // Keep-alive ping every 30 seconds
    const keepAlive = setInterval(() => {
      try {
        res.write(`: ping\n\n`);
      } catch (e) {
        clearInterval(keepAlive);
      }
    }, 30000);

    // Clean up on disconnect
    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
      console.log(`[SSE] Client disconnected (total: ${sseClients.size})`);
    });
  });

  // Setup Swagger documentation (before error handlers)
  setupSwagger(app);

  // 404 handler for undefined routes (after all routes, before error handler)
  app.use(notFoundHandler);

  // Global error handler - catches all errors from wrapHandler
  app.use(errorHandler);

  return app;
}
