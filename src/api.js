import express from 'express';
import crypto from 'crypto';
import QRCode from 'qrcode';
import { setupSwagger } from './swagger.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { LRUMap } from './utils/lru-map.js';
import { config } from './config.js';

// Route modules
import {
  createWebhookRoutes,
  createAutomationRoutes,
  createSecurityRoutes,
  createAnalyticsRoutes,
  createScoringRoutes,
  createSentimentRoutes,
  createRecoveryRoutes,
  createAntiBanRoutes,
  createCoreRoutes,
} from './routes/index.js';

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
    res.set('Access-Control-Allow-Origin', config.server.corsOrigin);
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
  const { ip: ipConfig } = config.apiRateLimits;
  const ipRateLimits = new LRUMap(ipConfig.maxTracked);
  const IP_RATE_LIMIT = ipConfig.max;
  const IP_RATE_WINDOW = ipConfig.windowMs;

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
  setInterval(cleanupRateLimits, ipConfig.cleanupIntervalMs);

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

  // ==========================================================================
  // HEALTH ENDPOINTS (No Auth Required)
  // ==========================================================================

  // Liveness probe - is the process alive?
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

  // Readiness probe - is it ready to handle requests?
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

  // ==========================================================================
  // QR CODE ENDPOINTS (No Auth Required - For Pairing)
  // ==========================================================================

  // Get QR code as JSON
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

  // ==========================================================================
  // SERVER-SENT EVENTS ENDPOINT (No Auth Required)
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
    }, config.sse.keepAliveIntervalMs);

    // Clean up on disconnect
    req.on('close', () => {
      clearInterval(keepAlive);
      sseClients.delete(res);
      console.log(`[SSE] Client disconnected (total: ${sseClients.size})`);
    });
  });

  // ==========================================================================
  // MOUNT ROUTE MODULES
  // ==========================================================================

  // Core routes (status, send, reconnect, rate-limits, ban-warning, presence)
  app.use('/api', createCoreRoutes(whatsappClient, authenticate));

  // Anti-ban routes (delivery, warmup, queue, patterns, spam detection, conversations)
  app.use('/api', createAntiBanRoutes(whatsappClient, authenticate));

  // Recovery routes (block detection, session backup, persistent queue, health)
  app.use('/api', createRecoveryRoutes(whatsappClient, authenticate));

  // Analytics routes (analytics, peak hours, contact stats)
  app.use('/api/analytics', createAnalyticsRoutes(whatsappClient, authenticate));

  // Scoring routes (contact scoring, top contacts, attention)
  app.use('/api/scoring', createScoringRoutes(whatsappClient, authenticate));

  // Sentiment routes (analyze, contact sentiment)
  app.use('/api/sentiment', createSentimentRoutes(whatsappClient, authenticate));

  // Security routes (ip-whitelist, audit logs, rate limiter)
  app.use('/api/security', createSecurityRoutes(whatsappClient, authenticate));

  // Automation routes (auto-responder, templates, scheduled)
  app.use('/api', createAutomationRoutes(whatsappClient, authenticate));

  // Webhook routes (status, history, subscribe, test)
  app.use('/api/webhooks', createWebhookRoutes(whatsappClient, authenticate));

  // ==========================================================================
  // FINALIZE APP
  // ==========================================================================

  // Setup Swagger documentation (before error handlers)
  setupSwagger(app);

  // 404 handler for undefined routes (after all routes, before error handler)
  app.use(notFoundHandler);

  // Global error handler - catches all errors from wrapHandler
  app.use(errorHandler);

  return app;
}
