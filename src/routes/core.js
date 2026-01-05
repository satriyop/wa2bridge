/**
 * Core API Routes
 *
 * Essential endpoints for WhatsApp connection management,
 * message sending, rate limiting, and ban warning controls.
 *
 * @module routes/core
 */

import { Router } from 'express';
import { wrapHandler } from '../middleware/handler.js';
import { ValidationError } from '../errors.js';

/**
 * Create core API routes
 *
 * @param {Object} whatsappClient - WhatsApp client instance
 * @param {Function} authenticate - Authentication middleware
 * @returns {Router} Express router with core routes
 */
export function createCoreRoutes(whatsappClient, authenticate) {
  const router = Router();

  // ==========================================================================
  // CONNECTION & STATUS
  // ==========================================================================

  // Get WhatsApp status
  router.get('/status', authenticate, (req, res) => {
    const status = whatsappClient.getStatus();
    res.json(status);
  });

  // Get rate limit status
  router.get('/rate-limits', authenticate, (req, res) => {
    const status = whatsappClient.getStatus();
    res.json({
      rateLimits: status.rateLimits,
      activity: status.activity,
      reconnection: status.reconnection,
    });
  });

  // Reconnect (logout and reconnect)
  router.post('/reconnect', authenticate, wrapHandler(async () => {
    await whatsappClient.disconnect();

    // Use humanized delay for reconnection (2-4 seconds with jitter)
    const { humanDelay } = await import('../anti-ban/index.js');
    const reconnectDelay = humanDelay(3000, 0.4);

    setTimeout(() => whatsappClient.connect(), reconnectDelay);

    return { status: 'reconnecting', delayMs: reconnectDelay };
  }));

  // ==========================================================================
  // MESSAGING
  // ==========================================================================

  /**
   * Send a message
   * @route POST /api/send
   */
  router.post('/send', authenticate, wrapHandler(async (req) => {
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

  // ==========================================================================
  // ACCOUNT CONFIGURATION
  // ==========================================================================

  // Set account age (for adjusting rate limits)
  router.post('/account-age', authenticate, wrapHandler((req) => {
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

  // ==========================================================================
  // BAN WARNING MANAGEMENT
  // ==========================================================================

  // Get ban warning status
  router.get('/ban-warning', authenticate, (req, res) => {
    const status = whatsappClient.getStatus();
    res.json({
      banWarning: status.banWarning,
      presence: status.presence,
    });
  });

  // Exit hibernation mode (manual override)
  router.post('/exit-hibernation', authenticate, wrapHandler(() => {
    whatsappClient.exitHibernation();
    return {
      success: true,
      message: 'Hibernation mode disabled. Proceed with caution.',
      banWarning: whatsappClient.banWarning.getMetrics(),
    };
  }));

  // Reset ban warning metrics
  router.post('/reset-ban-warning', authenticate, wrapHandler(() => {
    whatsappClient.resetBanWarning();
    return {
      success: true,
      message: 'Ban warning metrics reset',
      banWarning: whatsappClient.banWarning.getMetrics(),
    };
  }));

  // ==========================================================================
  // PRESENCE MANAGEMENT
  // ==========================================================================

  // Manually set presence (online/offline)
  router.post('/presence', authenticate, wrapHandler(async (req) => {
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

  return router;
}
