import express from 'express';
import QRCode from 'qrcode';
import { setupSwagger } from './swagger.js';

export function createApiServer(whatsappClient, options = {}) {
  const app = express();
  const apiSecret = options.apiSecret;

  app.use(express.json());

  // Auth middleware
  const authenticate = (req, res, next) => {
    if (!apiSecret) {
      return next(); // No auth if no secret configured
    }

    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = auth.slice(7);
    if (token !== apiSecret) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    next();
  };

  // Health check (no auth required)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
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

  // Send message
  app.post('/api/send', authenticate, async (req, res) => {
    try {
      const { to, message, reply_to } = req.body;

      if (!to || !message) {
        return res.status(400).json({ error: 'Missing "to" or "message"' });
      }

      const result = await whatsappClient.sendMessage(to, message, reply_to);

      res.json({
        success: true,
        messageId: result.key.id,
        to,
      });
    } catch (error) {
      console.error('Send error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // Reconnect (logout and reconnect)
  app.post('/api/reconnect', authenticate, async (req, res) => {
    try {
      await whatsappClient.disconnect();

      // Use humanized delay for reconnection (2-4 seconds with jitter)
      const { humanDelay } = await import('./anti-ban.js');
      const reconnectDelay = humanDelay(3000, 0.4);

      setTimeout(() => whatsappClient.connect(), reconnectDelay);

      res.json({ status: 'reconnecting', delayMs: reconnectDelay });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

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
  app.post('/api/account-age', authenticate, (req, res) => {
    try {
      const { weeks } = req.body;

      if (typeof weeks !== 'number' || weeks < 1) {
        return res.status(400).json({ error: 'weeks must be a positive number' });
      }

      whatsappClient.setAccountAge(weeks);

      res.json({
        success: true,
        accountAgeWeeks: weeks,
        newLimits: whatsappClient.rateLimiter.getLimits(),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get ban warning status
  app.get('/api/ban-warning', authenticate, (req, res) => {
    const status = whatsappClient.getStatus();
    res.json({
      banWarning: status.banWarning,
      presence: status.presence,
    });
  });

  // Exit hibernation mode (manual override)
  app.post('/api/exit-hibernation', authenticate, (req, res) => {
    try {
      whatsappClient.exitHibernation();
      res.json({
        success: true,
        message: 'Hibernation mode disabled. Proceed with caution.',
        banWarning: whatsappClient.banWarning.getMetrics(),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Reset ban warning metrics
  app.post('/api/reset-ban-warning', authenticate, (req, res) => {
    try {
      whatsappClient.resetBanWarning();
      res.json({
        success: true,
        message: 'Ban warning metrics reset',
        banWarning: whatsappClient.banWarning.getMetrics(),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Manually set presence (online/offline)
  app.post('/api/presence', authenticate, async (req, res) => {
    try {
      const { status } = req.body;

      if (!['online', 'offline'].includes(status)) {
        return res.status(400).json({ error: 'status must be "online" or "offline"' });
      }

      if (status === 'online') {
        await whatsappClient.presenceManager.goOnline();
      } else {
        await whatsappClient.presenceManager.goOffline();
      }

      res.json({
        success: true,
        presence: whatsappClient.presenceManager.getStatus(),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================================================
  // PHASE 2: NEW ANTI-BAN ENDPOINTS
  // ==========================================================================

  // Get delivery health status
  app.get('/api/delivery-health', authenticate, (req, res) => {
    try {
      const health = whatsappClient.deliveryTracker.checkDeliveryHealth();
      res.json(health);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get contact warmup status
  app.get('/api/contact-warmup/:phone', authenticate, (req, res) => {
    try {
      const { phone } = req.params;
      const status = whatsappClient.contactWarmup.getContactStatus(phone);
      const canMessage = whatsappClient.contactWarmup.canMessage(phone);
      res.json({ ...status, ...canMessage });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Queue a message for optimal timing (alternative to /api/send)
  app.post('/api/queue', authenticate, async (req, res) => {
    try {
      const { to, message, reply_to, priority } = req.body;

      if (!to || !message) {
        return res.status(400).json({ error: 'Missing "to" or "message"' });
      }

      const messageId = whatsappClient.queueMessage(to, message, reply_to, priority || 'normal');
      const queueStatus = whatsappClient.messageScheduler.getStatus();

      res.json({
        success: true,
        queued: true,
        queuedMessageId: messageId,
        queueStatus,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get weekend/holiday pattern status
  app.get('/api/weekend-patterns', authenticate, (req, res) => {
    try {
      res.json(whatsappClient.weekendPatterns.getStatus());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get activity ramp status (post-downtime)
  app.get('/api/activity-ramp', authenticate, (req, res) => {
    try {
      res.json(whatsappClient.activityRamper.getStatus());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get network fingerprint health
  app.get('/api/network-health', authenticate, (req, res) => {
    try {
      const health = whatsappClient.networkFingerprint.checkNetworkHealth();
      const recommendations = whatsappClient.networkFingerprint.getRecommendations();
      res.json({ ...health, recommendations });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get message queue status
  app.get('/api/queue-status', authenticate, (req, res) => {
    try {
      res.json(whatsappClient.messageScheduler.getStatus());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Clear message queue
  app.post('/api/queue-clear', authenticate, (req, res) => {
    try {
      whatsappClient.messageScheduler.clear();
      res.json({
        success: true,
        message: 'Message queue cleared',
        queueStatus: whatsappClient.messageScheduler.getStatus(),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================================================
  // PHASE 3: ADDITIONAL ANTI-BAN ENDPOINTS
  // ==========================================================================

  // Get spam detection status
  app.get('/api/spam-detection', authenticate, (req, res) => {
    try {
      res.json(whatsappClient.spamDetector.getMetrics());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get geo IP match status
  app.get('/api/geo-match', authenticate, async (req, res) => {
    try {
      const status = whatsappClient.geoMatcher.getStatus();
      const check = await whatsappClient.geoMatcher.checkIPCountry();
      res.json({ ...status, check });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get conversation context for a contact
  app.get('/api/conversation/:phone', authenticate, (req, res) => {
    try {
      const { phone } = req.params;
      const context = whatsappClient.conversationMemory.getContext(phone);
      res.json(context);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all active conversations
  app.get('/api/conversations-active', authenticate, (req, res) => {
    try {
      const active = whatsappClient.conversationMemory.getActiveConversations();
      res.json({ count: active.length, conversations: active });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get status viewer status
  app.get('/api/status-viewer', authenticate, (req, res) => {
    try {
      res.json(whatsappClient.statusViewer.getStatus());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Check reply probability for a message
  app.post('/api/reply-check', authenticate, (req, res) => {
    try {
      const { text, from } = req.body;
      if (!text || !from) {
        return res.status(400).json({ error: 'Missing "text" or "from"' });
      }
      const check = whatsappClient.replyProbability.shouldReply({ text, from });
      res.json(check);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================================================
  // PHASE 4: DETECTION & RECOVERY / OPERATIONAL ENDPOINTS
  // ==========================================================================

  // Get block detection status
  app.get('/api/block-detection', authenticate, (req, res) => {
    try {
      res.json(whatsappClient.blockDetector.getStats());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Check if a specific contact has blocked us
  app.get('/api/block-detection/:phone', authenticate, async (req, res) => {
    try {
      const { phone } = req.params;
      const isBlocked = await whatsappClient.blockDetector.checkIfBlocked(phone);
      const status = whatsappClient.blockDetector.getContactStatus(phone);
      res.json({ phone, isBlocked, ...status });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get session backup info
  app.get('/api/session-backup', authenticate, (req, res) => {
    try {
      res.json(whatsappClient.sessionManager.getBackupInfo());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Trigger manual session backup
  app.post('/api/session-backup', authenticate, async (req, res) => {
    try {
      const backupPath = await whatsappClient.sessionManager.backup();
      res.json({
        success: true,
        message: 'Session backed up',
        backupPath,
        backupInfo: whatsappClient.sessionManager.getBackupInfo(),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Restore session from backup
  app.post('/api/session-restore', authenticate, async (req, res) => {
    try {
      const { backupName } = req.body;
      const restored = await whatsappClient.sessionManager.restore(backupName);
      res.json({
        success: restored,
        message: restored ? 'Session restored - restart required' : 'Restore failed',
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get persistent queue status
  app.get('/api/persistent-queue', authenticate, (req, res) => {
    try {
      res.json(whatsappClient.persistentQueue.getStats());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Queue a message to persistent queue (survives restart)
  app.post('/api/persistent-queue', authenticate, (req, res) => {
    try {
      const { to, message, reply_to, priority } = req.body;

      if (!to || !message) {
        return res.status(400).json({ error: 'Missing "to" or "message"' });
      }

      const messageId = whatsappClient.persistentQueue.enqueue(to, message, reply_to, priority || 'normal');
      res.json({
        success: true,
        queued: true,
        queuedMessageId: messageId,
        queueStats: whatsappClient.persistentQueue.getStats(),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Process persistent queue manually
  app.post('/api/persistent-queue/process', authenticate, async (req, res) => {
    try {
      await whatsappClient.persistentQueue.processQueue();
      res.json({
        success: true,
        queueStats: whatsappClient.persistentQueue.getStats(),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get webhook retry queue status
  app.get('/api/webhook-retry', authenticate, (req, res) => {
    try {
      res.json(whatsappClient.webhookManager.getStats());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Retry all failed webhooks
  app.post('/api/webhook-retry', authenticate, async (req, res) => {
    try {
      await whatsappClient.webhookManager.retryFailed();
      res.json({
        success: true,
        webhookStats: whatsappClient.webhookManager.getStats(),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get health monitor status
  app.get('/api/health-monitor', authenticate, (req, res) => {
    try {
      res.json(whatsappClient.healthMonitor.getStatus());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get full health report
  app.get('/api/health-report', authenticate, (req, res) => {
    try {
      const report = whatsappClient.healthMonitor.generateReport();
      res.json(report);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get detected language for a contact
  app.get('/api/language/:phone', authenticate, (req, res) => {
    try {
      const { phone } = req.params;
      const language = whatsappClient.languageDetector.getContactLanguage(phone);
      const confidence = whatsappClient.languageDetector.getLanguageConfidence(phone);
      res.json({ phone, language, confidence });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get all detected languages
  app.get('/api/languages', authenticate, (req, res) => {
    try {
      res.json(whatsappClient.languageDetector.getAllLanguages());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================================================
  // PHASE 5A: ANALYTICS & INTELLIGENCE ENDPOINTS
  // ==========================================================================

  // Get analytics summary
  app.get('/api/analytics', authenticate, (req, res) => {
    try {
      res.json(whatsappClient.analytics.getSummary());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get analytics for specific contact
  app.get('/api/analytics/:phone', authenticate, (req, res) => {
    try {
      const { phone } = req.params;
      const stats = whatsappClient.analytics.getContactStats(phone);
      res.json(stats || { error: 'Contact not found' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get peak messaging hours
  app.get('/api/analytics/peak-hours', authenticate, (req, res) => {
    try {
      res.json(whatsappClient.analytics.getPeakHours());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get contact scoring stats
  app.get('/api/scoring', authenticate, (req, res) => {
    try {
      res.json(whatsappClient.contactScoring.getStats());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get score for specific contact
  app.get('/api/scoring/:phone', authenticate, (req, res) => {
    try {
      const { phone } = req.params;
      const score = whatsappClient.contactScoring.getScore(phone);
      const tier = whatsappClient.contactScoring.getTier(phone);
      res.json({ phone, score, tier });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get top contacts by score
  app.get('/api/scoring/top/:limit', authenticate, (req, res) => {
    try {
      const limit = parseInt(req.params.limit) || 10;
      res.json(whatsappClient.contactScoring.getTopContacts(limit));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get contacts needing attention
  app.get('/api/scoring/attention', authenticate, (req, res) => {
    try {
      res.json(whatsappClient.contactScoring.getContactsNeedingAttention());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Analyze sentiment of text
  app.post('/api/sentiment/analyze', authenticate, (req, res) => {
    try {
      const { text } = req.body;
      if (!text) return res.status(400).json({ error: 'Missing "text"' });
      res.json(whatsappClient.sentimentDetector.analyze(text));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get sentiment for contact
  app.get('/api/sentiment/:phone', authenticate, (req, res) => {
    try {
      const { phone } = req.params;
      res.json(whatsappClient.sentimentDetector.getContactSentiment(phone));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================================================
  // PHASE 5B: SECURITY HARDENING ENDPOINTS
  // ==========================================================================

  // Get IP whitelist status
  app.get('/api/security/ip-whitelist', authenticate, (req, res) => {
    try {
      res.json(whatsappClient.ipWhitelist.getStatus());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Enable/disable IP whitelist
  app.post('/api/security/ip-whitelist/toggle', authenticate, (req, res) => {
    try {
      const { enabled } = req.body;
      whatsappClient.ipWhitelist.setEnabled(enabled);
      res.json({ success: true, status: whatsappClient.ipWhitelist.getStatus() });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Add IP to whitelist
  app.post('/api/security/ip-whitelist/add', authenticate, (req, res) => {
    try {
      const { ip } = req.body;
      if (!ip) return res.status(400).json({ error: 'Missing "ip"' });
      whatsappClient.ipWhitelist.addToWhitelist(ip);
      res.json({ success: true, status: whatsappClient.ipWhitelist.getStatus() });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Add IP to blacklist
  app.post('/api/security/ip-blacklist/add', authenticate, (req, res) => {
    try {
      const { ip } = req.body;
      if (!ip) return res.status(400).json({ error: 'Missing "ip"' });
      whatsappClient.ipWhitelist.addToBlacklist(ip);
      res.json({ success: true, status: whatsappClient.ipWhitelist.getStatus() });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get audit logs
  app.get('/api/security/audit-logs', authenticate, (req, res) => {
    try {
      const { type, limit, hours } = req.query;
      const filter = {};
      if (type) filter.type = type;
      if (limit) filter.limit = parseInt(limit);
      if (hours) filter.since = Date.now() - parseInt(hours) * 60 * 60 * 1000;
      res.json(whatsappClient.auditLogger.getLogs(filter));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get audit log stats
  app.get('/api/security/audit-stats', authenticate, (req, res) => {
    try {
      const hours = parseInt(req.query.hours) || 24;
      res.json(whatsappClient.auditLogger.getStats(hours));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get security events
  app.get('/api/security/events', authenticate, (req, res) => {
    try {
      const hours = parseInt(req.query.hours) || 24;
      res.json(whatsappClient.auditLogger.getSecurityEvents(hours));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get API rate limiter stats
  app.get('/api/security/rate-limiter', authenticate, (req, res) => {
    try {
      res.json(whatsappClient.apiRateLimiter.getStats());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================================================
  // PHASE 5C: SMART AUTOMATION ENDPOINTS
  // ==========================================================================

  // Get auto-responder status
  app.get('/api/auto-responder', authenticate, (req, res) => {
    try {
      res.json({
        stats: whatsappClient.autoResponder.getStats(),
        rules: whatsappClient.autoResponder.getRules(),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Enable/disable auto-responder
  app.post('/api/auto-responder/toggle', authenticate, (req, res) => {
    try {
      const { enabled } = req.body;
      whatsappClient.autoResponder.setEnabled(enabled);
      res.json({ success: true, enabled });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Add auto-responder rule
  app.post('/api/auto-responder/rules', authenticate, (req, res) => {
    try {
      const rule = whatsappClient.autoResponder.addRule(req.body);
      res.json({ success: true, rule });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Update auto-responder rule
  app.put('/api/auto-responder/rules/:id', authenticate, (req, res) => {
    try {
      const { id } = req.params;
      const rule = whatsappClient.autoResponder.updateRule(id, req.body);
      res.json({ success: true, rule });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete auto-responder rule
  app.delete('/api/auto-responder/rules/:id', authenticate, (req, res) => {
    try {
      const { id } = req.params;
      const deleted = whatsappClient.autoResponder.deleteRule(id);
      res.json({ success: deleted });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get message templates
  app.get('/api/templates', authenticate, (req, res) => {
    try {
      const { category } = req.query;
      res.json(whatsappClient.messageTemplates.list(category));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create message template
  app.post('/api/templates', authenticate, (req, res) => {
    try {
      const { name, content, category, language } = req.body;
      if (!name || !content) {
        return res.status(400).json({ error: 'Missing "name" or "content"' });
      }
      const template = whatsappClient.messageTemplates.create(name, content, { category, language });
      res.json({ success: true, template });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Render message template
  app.post('/api/templates/render', authenticate, (req, res) => {
    try {
      const { name, variables } = req.body;
      if (!name) return res.status(400).json({ error: 'Missing "name"' });
      const rendered = whatsappClient.messageTemplates.render(name, variables || {});
      res.json({ success: true, rendered });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Delete message template
  app.delete('/api/templates/:name', authenticate, (req, res) => {
    try {
      const { name } = req.params;
      const deleted = whatsappClient.messageTemplates.delete(name);
      res.json({ success: deleted });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get scheduled messages
  app.get('/api/scheduled', authenticate, (req, res) => {
    try {
      const { status, to } = req.query;
      res.json(whatsappClient.scheduledMessages.getScheduled({ status, to }));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Schedule a message
  app.post('/api/scheduled', authenticate, (req, res) => {
    try {
      const { to, message, sendAt, replyTo, repeat } = req.body;
      if (!to || !message || !sendAt) {
        return res.status(400).json({ error: 'Missing "to", "message", or "sendAt"' });
      }
      const scheduled = whatsappClient.scheduledMessages.schedule(to, message, sendAt, { replyTo, repeat });
      res.json({ success: true, scheduled });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Cancel scheduled message
  app.delete('/api/scheduled/:id', authenticate, (req, res) => {
    try {
      const { id } = req.params;
      const cancelled = whatsappClient.scheduledMessages.cancel(id);
      res.json({ success: cancelled });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get scheduled messages stats
  app.get('/api/scheduled/stats', authenticate, (req, res) => {
    try {
      res.json(whatsappClient.scheduledMessages.getStats());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==========================================================================
  // PHASE 6: ENHANCED WEBHOOK ENDPOINTS
  // ==========================================================================

  // Get webhook status and subscriptions
  app.get('/api/webhooks', authenticate, (req, res) => {
    try {
      if (!whatsappClient.webhookEmitter) {
        return res.json({ enabled: false, message: 'Webhook emitter not initialized' });
      }
      res.json(whatsappClient.webhookEmitter.getStats());
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get webhook event history
  app.get('/api/webhooks/history', authenticate, (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 20;
      if (!whatsappClient.webhookEmitter) {
        return res.json({ events: [] });
      }
      res.json({ events: whatsappClient.webhookEmitter.getHistory(limit) });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Subscribe to webhook events
  app.post('/api/webhooks/subscribe', authenticate, (req, res) => {
    try {
      const { events } = req.body;
      if (!events || !Array.isArray(events)) {
        return res.status(400).json({ error: 'Missing "events" array' });
      }
      if (!whatsappClient.webhookEmitter) {
        return res.status(400).json({ error: 'Webhook emitter not initialized' });
      }
      whatsappClient.webhookEmitter.subscribe(events);
      res.json({
        success: true,
        subscriptions: Array.from(whatsappClient.webhookEmitter.subscriptions),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Unsubscribe from webhook events
  app.post('/api/webhooks/unsubscribe', authenticate, (req, res) => {
    try {
      const { events } = req.body;
      if (!events || !Array.isArray(events)) {
        return res.status(400).json({ error: 'Missing "events" array' });
      }
      if (!whatsappClient.webhookEmitter) {
        return res.status(400).json({ error: 'Webhook emitter not initialized' });
      }
      whatsappClient.webhookEmitter.unsubscribe(events);
      res.json({
        success: true,
        subscriptions: Array.from(whatsappClient.webhookEmitter.subscriptions),
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Enable/disable webhooks
  app.post('/api/webhooks/toggle', authenticate, (req, res) => {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'Missing "enabled" boolean' });
      }
      if (!whatsappClient.webhookEmitter) {
        return res.status(400).json({ error: 'Webhook emitter not initialized' });
      }
      whatsappClient.webhookEmitter.setEnabled(enabled);
      res.json({ success: true, enabled });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get pending webhook retries
  app.get('/api/webhooks/retries', authenticate, (req, res) => {
    try {
      if (!whatsappClient.webhookEmitter) {
        return res.json({ pending: [] });
      }
      res.json({ pending: whatsappClient.webhookEmitter.getPendingRetries() });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Process pending webhook retries
  app.post('/api/webhooks/retries', authenticate, async (req, res) => {
    try {
      if (!whatsappClient.webhookEmitter) {
        return res.json({ processed: 0 });
      }
      const result = await whatsappClient.webhookEmitter.processRetries();
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Test webhook (send test event)
  app.post('/api/webhooks/test', authenticate, async (req, res) => {
    try {
      if (!whatsappClient.webhookEmitter) {
        return res.status(400).json({ error: 'Webhook emitter not initialized' });
      }
      const result = await whatsappClient.webhookEmitter.emit('webhook.test', {
        message: 'Test webhook from wa2bridge',
        timestamp: Date.now(),
      });
      res.json(result);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get available webhook event types
  app.get('/api/webhooks/events', authenticate, (req, res) => {
    try {
      // Return available event types
      res.json({
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
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Setup Swagger documentation
  setupSwagger(app);

  return app;
}
