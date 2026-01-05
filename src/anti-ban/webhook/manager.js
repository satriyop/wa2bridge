/**
 * Webhook Manager
 *
 * Manages webhook delivery with retry logic.
 * Ensures messages are forwarded even during temporary failures.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export class WebhookManager {
  constructor(options = {}) {
    this.webhookUrl = options.webhookUrl;
    this.apiSecret = options.apiSecret;
    this.sessionsDir = options.sessionsDir;
    this.logger = options.logger || console;

    this.maxRetries = options.maxRetries || 5;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 60000;

    this.failedQueue = [];
    this.retryTimer = null;

    this.loadFailedQueue();
  }

  async send(payload) {
    if (!this.webhookUrl) {
      return { success: false, reason: 'no_webhook_url' };
    }

    let lastError = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiSecret}`,
          },
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          return { success: true, status: response.status };
        }

        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          return { success: false, status: response.status, reason: 'client_error' };
        }

        lastError = `HTTP ${response.status}`;
      } catch (err) {
        lastError = err.message;
      }

      if (attempt < this.maxRetries - 1) {
        const delay = Math.min(this.baseDelay * Math.pow(2, attempt), this.maxDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    this.addToFailedQueue(payload);

    return { success: false, reason: lastError, queued: true };
  }

  addToFailedQueue(payload) {
    this.failedQueue.push({
      payload,
      addedAt: Date.now(),
      attempts: 0,
    });

    this.saveFailedQueue();
    this.startRetryTimer();
  }

  startRetryTimer() {
    if (this.retryTimer) return;

    this.retryTimer = setInterval(() => {
      this.processFailedQueue();
    }, 60000);
  }

  stopRetryTimer() {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  async processFailedQueue() {
    if (this.failedQueue.length === 0) {
      this.stopRetryTimer();
      return;
    }

    const toProcess = [...this.failedQueue];
    this.failedQueue = [];

    for (const item of toProcess) {
      item.attempts++;

      try {
        const response = await fetch(this.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiSecret}`,
          },
          body: JSON.stringify(item.payload),
        });

        if (!response.ok && item.attempts < 10) {
          this.failedQueue.push(item);
        }
      } catch (err) {
        if (item.attempts < 10) {
          this.failedQueue.push(item);
        } else {
          this.logger.error({ payload: item.payload.messageId }, 'Webhook permanently failed');
        }
      }
    }

    this.saveFailedQueue();
  }

  getStatus() {
    return {
      webhookUrl: this.webhookUrl ? '***configured***' : null,
      failedQueueSize: this.failedQueue.length,
      retryActive: this.retryTimer !== null,
    };
  }

  getRetryQueue() {
    return this.failedQueue.map(item => ({
      addedAt: item.addedAt,
      attempts: item.attempts,
    }));
  }

  async processRetryQueue() {
    return this.processFailedQueue();
  }

  loadFailedQueue() {
    if (!this.sessionsDir) return;
    const queueFile = join(this.sessionsDir, '.webhook-failed-queue.json');
    try {
      if (existsSync(queueFile)) {
        const data = JSON.parse(readFileSync(queueFile, 'utf-8'));
        this.failedQueue = data.queue || [];
        if (this.failedQueue.length > 0) {
          this.startRetryTimer();
        }
      }
    } catch (err) {}
  }

  saveFailedQueue() {
    if (!this.sessionsDir) return;
    const queueFile = join(this.sessionsDir, '.webhook-failed-queue.json');
    try {
      writeFileSync(queueFile, JSON.stringify({
        queue: this.failedQueue,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

export default WebhookManager;
