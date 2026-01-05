/**
 * Phase 5B: Security Hardening Routes
 *
 * Endpoints for IP whitelist/blacklist management, audit logs,
 * and API rate limiter statistics.
 *
 * @module routes/security
 */

import { Router } from 'express';
import { wrapHandler } from '../middleware/handler.js';
import { ValidationError } from '../errors.js';

/**
 * Create security routes
 *
 * @param {Object} whatsappClient - WhatsApp client instance
 * @param {Function} authenticate - Authentication middleware
 * @returns {Router} Express router with security routes
 */
export function createSecurityRoutes(whatsappClient, authenticate) {
  const router = Router();

  // All security routes require authentication
  router.use(authenticate);

  // ==========================================================================
  // IP WHITELIST/BLACKLIST
  // ==========================================================================

  // Get IP whitelist status
  router.get('/ip-whitelist', wrapHandler(() => {
    return whatsappClient.ipWhitelist.getStatus();
  }));

  // Enable/disable IP whitelist
  router.post('/ip-whitelist/toggle', wrapHandler((req) => {
    const { enabled } = req.body;
    whatsappClient.ipWhitelist.setEnabled(enabled);
    return { success: true, status: whatsappClient.ipWhitelist.getStatus() };
  }));

  // Add IP to whitelist
  router.post('/ip-whitelist/add', wrapHandler((req) => {
    const { ip } = req.body;
    if (!ip) throw new ValidationError('Missing "ip"');
    whatsappClient.ipWhitelist.addToWhitelist(ip);
    return { success: true, status: whatsappClient.ipWhitelist.getStatus() };
  }));

  // Add IP to blacklist
  router.post('/ip-blacklist/add', wrapHandler((req) => {
    const { ip } = req.body;
    if (!ip) throw new ValidationError('Missing "ip"');
    whatsappClient.ipWhitelist.addToBlacklist(ip);
    return { success: true, status: whatsappClient.ipWhitelist.getStatus() };
  }));

  // ==========================================================================
  // AUDIT LOGS
  // ==========================================================================

  // Get audit logs
  router.get('/audit-logs', wrapHandler((req) => {
    const { type, limit, hours } = req.query;
    const filter = {};
    if (type) filter.type = type;
    if (limit) filter.limit = parseInt(limit);
    if (hours) filter.since = Date.now() - parseInt(hours) * 60 * 60 * 1000;
    return whatsappClient.auditLogger.getLogs(filter);
  }));

  // Get audit log stats
  router.get('/audit-stats', wrapHandler((req) => {
    const hours = parseInt(req.query.hours) || 24;
    return whatsappClient.auditLogger.getStats(hours);
  }));

  // Get security events
  router.get('/events', wrapHandler((req) => {
    const hours = parseInt(req.query.hours) || 24;
    return whatsappClient.auditLogger.getSecurityEvents(hours);
  }));

  // ==========================================================================
  // API RATE LIMITER
  // ==========================================================================

  // Get API rate limiter stats
  router.get('/rate-limiter', wrapHandler(() => {
    return whatsappClient.apiRateLimiter.getStats();
  }));

  return router;
}
