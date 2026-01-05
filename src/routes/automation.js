/**
 * Phase 5C: Smart Automation Routes
 *
 * Endpoints for auto-responder rules, message templates,
 * and scheduled message management.
 *
 * @module routes/automation
 */

import { Router } from 'express';
import { wrapHandler } from '../middleware/handler.js';
import { ValidationError } from '../errors.js';

/**
 * Create automation routes
 *
 * @param {Object} whatsappClient - WhatsApp client instance
 * @param {Function} authenticate - Authentication middleware
 * @returns {Router} Express router with automation routes
 */
export function createAutomationRoutes(whatsappClient, authenticate) {
  const router = Router();

  // All automation routes require authentication
  router.use(authenticate);

  // ==========================================================================
  // AUTO-RESPONDER
  // ==========================================================================

  // Get auto-responder status
  router.get('/auto-responder', wrapHandler(() => {
    return {
      stats: whatsappClient.autoResponder.getStats(),
      rules: whatsappClient.autoResponder.getRules(),
    };
  }));

  // Enable/disable auto-responder
  router.post('/auto-responder/toggle', wrapHandler((req) => {
    const { enabled } = req.body;
    whatsappClient.autoResponder.setEnabled(enabled);
    return { success: true, enabled };
  }));

  // Add auto-responder rule
  router.post('/auto-responder/rules', wrapHandler((req) => {
    const rule = whatsappClient.autoResponder.addRule(req.body);
    return { success: true, rule };
  }));

  // Update auto-responder rule
  router.put('/auto-responder/rules/:id', wrapHandler((req) => {
    const { id } = req.params;
    const rule = whatsappClient.autoResponder.updateRule(id, req.body);
    return { success: true, rule };
  }));

  // Delete auto-responder rule
  router.delete('/auto-responder/rules/:id', wrapHandler((req) => {
    const { id } = req.params;
    const deleted = whatsappClient.autoResponder.deleteRule(id);
    return { success: deleted };
  }));

  // ==========================================================================
  // MESSAGE TEMPLATES
  // ==========================================================================

  // Get message templates
  router.get('/templates', wrapHandler((req) => {
    const { category } = req.query;
    return whatsappClient.messageTemplates.list(category);
  }));

  // Create message template
  router.post('/templates', wrapHandler((req) => {
    const { name, content, category, language } = req.body;
    if (!name || !content) {
      throw new ValidationError('Missing "name" or "content"');
    }
    const template = whatsappClient.messageTemplates.create(name, content, { category, language });
    return { success: true, template };
  }));

  // Render message template
  router.post('/templates/render', wrapHandler((req) => {
    const { name, variables } = req.body;
    if (!name) throw new ValidationError('Missing "name"');
    const rendered = whatsappClient.messageTemplates.render(name, variables || {});
    return { success: true, rendered };
  }));

  // Delete message template
  router.delete('/templates/:name', wrapHandler((req) => {
    const { name } = req.params;
    const deleted = whatsappClient.messageTemplates.delete(name);
    return { success: deleted };
  }));

  // ==========================================================================
  // SCHEDULED MESSAGES
  // ==========================================================================

  // Get scheduled messages stats (must be before /:id to avoid route collision)
  router.get('/scheduled/stats', wrapHandler(() => {
    return whatsappClient.scheduledMessages.getStats();
  }));

  // Get scheduled messages
  router.get('/scheduled', wrapHandler((req) => {
    const { status, to } = req.query;
    return whatsappClient.scheduledMessages.getScheduled({ status, to });
  }));

  // Schedule a message
  router.post('/scheduled', wrapHandler((req) => {
    const { to, message, sendAt, replyTo, repeat } = req.body;
    if (!to || !message || !sendAt) {
      throw new ValidationError('Missing "to", "message", or "sendAt"');
    }
    const scheduled = whatsappClient.scheduledMessages.schedule(to, message, sendAt, { replyTo, repeat });
    return { success: true, scheduled };
  }));

  // Cancel scheduled message
  router.delete('/scheduled/:id', wrapHandler((req) => {
    const { id } = req.params;
    const cancelled = whatsappClient.scheduledMessages.cancel(id);
    return { success: cancelled };
  }));

  return router;
}
