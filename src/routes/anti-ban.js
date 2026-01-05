/**
 * Phase 2 & 3: Anti-Ban Feature Routes
 *
 * Endpoints for delivery tracking, contact warmup, message queuing,
 * weekend patterns, activity ramping, and network health.
 * Also includes Phase 3 spam detection, geo matching, and conversation context.
 *
 * @module routes/anti-ban
 */

import { Router } from 'express';
import { wrapHandler } from '../middleware/handler.js';
import { ValidationError } from '../errors.js';

/**
 * Create anti-ban routes
 *
 * @param {Object} whatsappClient - WhatsApp client instance
 * @param {Function} authenticate - Authentication middleware
 * @returns {Router} Express router with anti-ban routes
 */
export function createAntiBanRoutes(whatsappClient, authenticate) {
  const router = Router();

  // All anti-ban routes require authentication
  router.use(authenticate);

  // ==========================================================================
  // PHASE 2: DELIVERY & WARMUP
  // ==========================================================================

  // Get delivery health status
  router.get('/delivery-health', wrapHandler(() => {
    return whatsappClient.deliveryTracker.checkDeliveryHealth();
  }));

  // Get contact warmup status
  router.get('/contact-warmup/:phone', wrapHandler((req) => {
    const { phone } = req.params;
    const status = whatsappClient.contactWarmup.getContactStatus(phone);
    const canMessage = whatsappClient.contactWarmup.canMessage(phone);
    return { ...status, ...canMessage };
  }));

  // ==========================================================================
  // MESSAGE QUEUE (in-memory)
  // ==========================================================================

  // Queue a message for optimal timing (alternative to /api/send)
  router.post('/queue', wrapHandler((req) => {
    const { to, message, reply_to, priority } = req.body;
    if (!to || !message) {
      throw new ValidationError('Missing "to" or "message"');
    }
    const messageId = whatsappClient.queueMessage(to, message, reply_to, priority || 'normal');
    const queueStatus = whatsappClient.messageScheduler.getStatus();
    return { success: true, queued: true, queuedMessageId: messageId, queueStatus };
  }));

  // Get message queue status
  router.get('/queue-status', wrapHandler(() => {
    return whatsappClient.messageScheduler.getStatus();
  }));

  // Clear message queue
  router.post('/queue-clear', wrapHandler(() => {
    whatsappClient.messageScheduler.clear();
    return {
      success: true,
      message: 'Message queue cleared',
      queueStatus: whatsappClient.messageScheduler.getStatus(),
    };
  }));

  // ==========================================================================
  // TIMING PATTERNS
  // ==========================================================================

  // Get weekend/holiday pattern status
  router.get('/weekend-patterns', wrapHandler(() => {
    return whatsappClient.weekendPatterns.getStatus();
  }));

  // Get activity ramp status (post-downtime)
  router.get('/activity-ramp', wrapHandler(() => {
    return whatsappClient.activityRamper.getStatus();
  }));

  // Get network fingerprint health
  router.get('/network-health', wrapHandler(() => {
    const health = whatsappClient.networkFingerprint.checkNetworkHealth();
    const recommendations = whatsappClient.networkFingerprint.getRecommendations();
    return { ...health, recommendations };
  }));

  // ==========================================================================
  // PHASE 3: SPAM DETECTION & CONVERSATIONS
  // ==========================================================================

  // Get spam detection status
  router.get('/spam-detection', wrapHandler(() => {
    return whatsappClient.spamDetector.getMetrics();
  }));

  // Get geo IP match status
  router.get('/geo-match', wrapHandler(async () => {
    const status = whatsappClient.geoMatcher.getStatus();
    const check = await whatsappClient.geoMatcher.checkIPCountry();
    return { ...status, check };
  }));

  // Get conversation context for a contact
  router.get('/conversation/:phone', wrapHandler((req) => {
    const { phone } = req.params;
    return whatsappClient.conversationMemory.getContext(phone);
  }));

  // Get all active conversations
  router.get('/conversations-active', wrapHandler(() => {
    const active = whatsappClient.conversationMemory.getActiveConversations();
    return { count: active.length, conversations: active };
  }));

  // Get status viewer status
  router.get('/status-viewer', wrapHandler(() => {
    return whatsappClient.statusViewer.getStatus();
  }));

  // Check reply probability for a message
  router.post('/reply-check', wrapHandler((req) => {
    const { text, from } = req.body;
    if (!text || !from) {
      throw new ValidationError('Missing "text" or "from"');
    }
    return whatsappClient.replyProbability.shouldReply({ text, from });
  }));

  return router;
}
