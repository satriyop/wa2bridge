/**
 * Phase 5A: Analytics & Intelligence Routes
 *
 * Endpoints for message analytics, contact scoring,
 * and sentiment analysis.
 *
 * @module routes/analytics
 */

import { Router } from 'express';
import { wrapHandler } from '../middleware/handler.js';
import { ValidationError } from '../errors.js';

/**
 * Create analytics routes
 *
 * @param {Object} whatsappClient - WhatsApp client instance
 * @param {Function} authenticate - Authentication middleware
 * @returns {Router} Express router with analytics routes
 */
export function createAnalyticsRoutes(whatsappClient, authenticate) {
  const router = Router();

  // All analytics routes require authentication
  router.use(authenticate);

  // ==========================================================================
  // MESSAGE ANALYTICS
  // ==========================================================================

  // Get analytics summary
  router.get('/', wrapHandler(() => {
    return whatsappClient.analytics.getSummary();
  }));

  // Get peak messaging hours (MUST be before /:phone to avoid route collision)
  router.get('/peak-hours', wrapHandler(() => {
    return whatsappClient.analytics.getPeakHours();
  }));

  // Get analytics for specific contact
  router.get('/:phone', wrapHandler((req) => {
    const { phone } = req.params;
    const stats = whatsappClient.analytics.getContactStats(phone);
    return stats || { error: 'Contact not found' };
  }));

  return router;
}

/**
 * Create contact scoring routes
 *
 * @param {Object} whatsappClient - WhatsApp client instance
 * @param {Function} authenticate - Authentication middleware
 * @returns {Router} Express router with scoring routes
 */
export function createScoringRoutes(whatsappClient, authenticate) {
  const router = Router();

  // All scoring routes require authentication
  router.use(authenticate);

  // Get contact scoring stats
  router.get('/', wrapHandler(() => {
    return whatsappClient.contactScoring.getStats();
  }));

  // Get top contacts by score (MUST be before /:phone to avoid route collision)
  router.get('/top/:limit', wrapHandler((req) => {
    const limit = parseInt(req.params.limit) || 10;
    return whatsappClient.contactScoring.getTopContacts(limit);
  }));

  // Get contacts needing attention (MUST be before /:phone to avoid route collision)
  router.get('/attention', wrapHandler(() => {
    return whatsappClient.contactScoring.getContactsNeedingAttention();
  }));

  // Get score for specific contact
  router.get('/:phone', wrapHandler((req) => {
    const { phone } = req.params;
    const score = whatsappClient.contactScoring.getScore(phone);
    const tier = whatsappClient.contactScoring.getTier(phone);
    return { phone, score, tier };
  }));

  return router;
}

/**
 * Create sentiment analysis routes
 *
 * @param {Object} whatsappClient - WhatsApp client instance
 * @param {Function} authenticate - Authentication middleware
 * @returns {Router} Express router with sentiment routes
 */
export function createSentimentRoutes(whatsappClient, authenticate) {
  const router = Router();

  // All sentiment routes require authentication
  router.use(authenticate);

  // Analyze sentiment of text
  router.post('/analyze', wrapHandler((req) => {
    const { text } = req.body;
    if (!text) throw new ValidationError('Missing "text"');
    return whatsappClient.sentimentDetector.analyze(text);
  }));

  // Get sentiment for contact
  router.get('/:phone', wrapHandler((req) => {
    const { phone } = req.params;
    return whatsappClient.sentimentDetector.getContactSentiment(phone);
  }));

  return router;
}
