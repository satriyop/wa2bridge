/**
 * Phase 6: Enhanced Webhook Routes
 *
 * Endpoints for managing webhook subscriptions, viewing event history,
 * and testing webhook delivery.
 *
 * @module routes/webhooks
 */

import { Router } from 'express';
import { wrapHandler } from '../middleware/handler.js';
import { ValidationError } from '../errors.js';

/**
 * Create webhook management routes
 *
 * @param {Object} whatsappClient - WhatsApp client instance
 * @param {Function} authenticate - Authentication middleware
 * @returns {Router} Express router with webhook routes
 */
export function createWebhookRoutes(whatsappClient, authenticate) {
  const router = Router();

  // All webhook routes require authentication
  router.use(authenticate);

  // Get webhook status and subscriptions
  router.get('/', wrapHandler(() => {
    if (!whatsappClient.webhookEmitter) {
      return { enabled: false, message: 'Webhook emitter not initialized' };
    }
    return whatsappClient.webhookEmitter.getStats();
  }));

  // Get webhook event history
  router.get('/history', wrapHandler((req) => {
    const limit = parseInt(req.query.limit) || 20;
    if (!whatsappClient.webhookEmitter) {
      return { events: [] };
    }
    return { events: whatsappClient.webhookEmitter.getHistory(limit) };
  }));

  // Subscribe to webhook events
  router.post('/subscribe', wrapHandler((req) => {
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
  router.post('/unsubscribe', wrapHandler((req) => {
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
  router.post('/toggle', wrapHandler((req) => {
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
  router.get('/retries', wrapHandler(() => {
    if (!whatsappClient.webhookEmitter) {
      return { pending: [] };
    }
    return { pending: whatsappClient.webhookEmitter.getPendingRetries() };
  }));

  // Process pending webhook retries
  router.post('/retries', wrapHandler(async () => {
    if (!whatsappClient.webhookEmitter) {
      return { processed: 0 };
    }
    return await whatsappClient.webhookEmitter.processRetries();
  }));

  // Test webhook (send test event)
  router.post('/test', wrapHandler(async () => {
    if (!whatsappClient.webhookEmitter) {
      throw new ValidationError('Webhook emitter not initialized');
    }
    return await whatsappClient.webhookEmitter.emit('webhook.test', {
      message: 'Test webhook from wa2bridge',
      timestamp: Date.now(),
    });
  }));

  // Get available webhook event types
  router.get('/events', wrapHandler(() => {
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

  return router;
}
