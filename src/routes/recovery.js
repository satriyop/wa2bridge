/**
 * Phase 4: Detection & Recovery Routes
 *
 * Endpoints for block detection, session backup/restore,
 * persistent queue, webhook retry, health monitoring,
 * and language detection.
 *
 * @module routes/recovery
 */

import { Router } from 'express';
import { wrapHandler } from '../middleware/handler.js';
import { ValidationError } from '../errors.js';

/**
 * Create recovery routes
 *
 * @param {Object} whatsappClient - WhatsApp client instance
 * @param {Function} authenticate - Authentication middleware
 * @returns {Router} Express router with recovery routes
 */
export function createRecoveryRoutes(whatsappClient, authenticate) {
  const router = Router();

  // All recovery routes require authentication
  router.use(authenticate);

  // ==========================================================================
  // BLOCK DETECTION
  // ==========================================================================

  // Get block detection status
  router.get('/block-detection', wrapHandler(() => {
    return whatsappClient.blockDetector.getStats();
  }));

  // Check if a specific contact has blocked us
  router.get('/block-detection/:phone', wrapHandler(async (req) => {
    const { phone } = req.params;
    const isBlocked = await whatsappClient.blockDetector.checkIfBlocked(phone);
    const status = whatsappClient.blockDetector.getContactStatus(phone);
    return { phone, isBlocked, ...status };
  }));

  // ==========================================================================
  // SESSION BACKUP
  // ==========================================================================

  // Get session backup info
  router.get('/session-backup', wrapHandler(() => {
    return whatsappClient.sessionManager.getBackupInfo();
  }));

  // Trigger manual session backup
  router.post('/session-backup', wrapHandler(async () => {
    const backupPath = await whatsappClient.sessionManager.backup();
    return {
      success: true,
      message: 'Session backed up',
      backupPath,
      backupInfo: whatsappClient.sessionManager.getBackupInfo(),
    };
  }));

  // Restore session from backup
  router.post('/session-restore', wrapHandler(async (req) => {
    const { backupName } = req.body;
    const restored = await whatsappClient.sessionManager.restore(backupName);
    return {
      success: restored,
      message: restored ? 'Session restored - restart required' : 'Restore failed',
    };
  }));

  // ==========================================================================
  // PERSISTENT QUEUE
  // ==========================================================================

  // Get persistent queue status
  router.get('/persistent-queue', wrapHandler(() => {
    return whatsappClient.persistentQueue.getStats();
  }));

  // Queue a message to persistent queue (survives restart)
  router.post('/persistent-queue', wrapHandler((req) => {
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
  router.post('/persistent-queue/process', wrapHandler(async () => {
    await whatsappClient.persistentQueue.processQueue();
    return { success: true, queueStats: whatsappClient.persistentQueue.getStats() };
  }));

  // ==========================================================================
  // WEBHOOK RETRY (Legacy - Phase 4)
  // ==========================================================================

  // Get webhook retry queue status
  router.get('/webhook-retry', wrapHandler(() => {
    return whatsappClient.webhookManager.getStats();
  }));

  // Retry all failed webhooks
  router.post('/webhook-retry', wrapHandler(async () => {
    await whatsappClient.webhookManager.retryFailed();
    return { success: true, webhookStats: whatsappClient.webhookManager.getStats() };
  }));

  // ==========================================================================
  // HEALTH MONITORING
  // ==========================================================================

  // Get health monitor status
  router.get('/health-monitor', wrapHandler(() => {
    return whatsappClient.healthMonitor.getStatus();
  }));

  // Get full health report
  router.get('/health-report', wrapHandler(() => {
    return whatsappClient.healthMonitor.generateReport();
  }));

  // ==========================================================================
  // LANGUAGE DETECTION
  // ==========================================================================

  // Get detected language for a contact
  router.get('/language/:phone', wrapHandler((req) => {
    const { phone } = req.params;
    const language = whatsappClient.languageDetector.getContactLanguage(phone);
    const confidence = whatsappClient.languageDetector.getLanguageConfidence(phone);
    return { phone, language, confidence };
  }));

  // Get all detected languages
  router.get('/languages', wrapHandler(() => {
    return whatsappClient.languageDetector.getAllLanguages();
  }));

  return router;
}
