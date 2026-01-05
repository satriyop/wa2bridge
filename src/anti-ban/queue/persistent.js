/**
 * Persistent Queue
 *
 * Persists message queue across restarts.
 * Prevents message loss during crashes/restarts.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { humanDelay } from '../core/timing.js';

/**
 * Persistent message queue with retry logic
 */
export class PersistentQueue {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.queueFile = join(this.sessionsDir, '.message-queue.json');
    this.queue = [];
    this.processing = false;
    this.sendFunction = options.sendFunction;
    this.logger = options.logger || console;

    // Recovery settings
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 30000; // 30 seconds

    this.loadQueue();
  }

  /**
   * Add message to persistent queue
   */
  enqueue(to, text, replyTo = null, priority = 'normal') {
    const id = `pq_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const message = {
      id,
      to,
      text,
      replyTo,
      priority,
      createdAt: Date.now(),
      attempts: 0,
      lastAttempt: null,
      status: 'pending',
    };

    // Insert based on priority
    if (priority === 'high') {
      const insertIndex = this.queue.findIndex(m => m.priority !== 'high');
      if (insertIndex === -1) {
        this.queue.push(message);
      } else {
        this.queue.splice(insertIndex, 0, message);
      }
    } else {
      this.queue.push(message);
    }

    this.saveQueue();
    this.processQueue();

    return id;
  }

  /**
   * Process queued messages
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) return;
    if (!this.sendFunction) return;

    this.processing = true;

    while (this.queue.length > 0) {
      const message = this.queue[0];

      // Skip if recently attempted
      if (message.lastAttempt && Date.now() - message.lastAttempt < this.retryDelay) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }

      try {
        message.status = 'sending';
        message.attempts++;
        message.lastAttempt = Date.now();
        this.saveQueue();

        await this.sendFunction(message.to, message.text, message.replyTo);

        // Success - remove from queue
        this.queue.shift();
        this.saveQueue();

        // Delay between messages
        await new Promise(resolve => setTimeout(resolve, humanDelay(2000, 0.4)));
      } catch (err) {
        this.logger.error({ messageId: message.id, error: err.message }, 'Queue send failed');

        message.status = 'failed';
        message.lastError = err.message;

        if (message.attempts >= this.maxRetries) {
          // Move to dead letter queue
          message.status = 'dead';
          this.queue.shift();
          this.logger.warn({ messageId: message.id }, 'Message moved to dead letter (max retries)');
        }

        this.saveQueue();

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
    }

    this.processing = false;
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      pending: this.queue.filter(m => m.status === 'pending').length,
      sending: this.queue.filter(m => m.status === 'sending').length,
      failed: this.queue.filter(m => m.status === 'failed').length,
      dead: this.queue.filter(m => m.status === 'dead').length,
      total: this.queue.length,
      processing: this.processing,
      queue: this.queue.map(m => ({
        id: m.id,
        to: m.to,
        status: m.status,
        attempts: m.attempts,
        createdAt: m.createdAt,
      })),
    };
  }

  /**
   * Clear the queue
   */
  clear() {
    this.queue = [];
    this.saveQueue();
  }

  /**
   * Retry dead messages
   */
  retryDead() {
    for (const message of this.queue) {
      if (message.status === 'dead') {
        message.status = 'pending';
        message.attempts = 0;
      }
    }
    this.saveQueue();
    this.processQueue();
  }

  loadQueue() {
    try {
      if (existsSync(this.queueFile)) {
        const data = JSON.parse(readFileSync(this.queueFile, 'utf-8'));
        this.queue = data.queue || [];

        // Reset sending status on load (interrupted sends)
        for (const message of this.queue) {
          if (message.status === 'sending') {
            message.status = 'pending';
          }
        }
      }
    } catch (err) {}
  }

  saveQueue() {
    try {
      writeFileSync(this.queueFile, JSON.stringify({
        queue: this.queue,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

export default PersistentQueue;
