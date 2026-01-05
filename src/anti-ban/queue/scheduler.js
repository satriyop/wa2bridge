/**
 * Message Scheduler
 *
 * Manages message queue with optimal timing for anti-ban compliance.
 * Handles batching and priority-based queuing.
 */

import { humanDelay } from '../core/timing.js';

export class MessageScheduler {
  constructor(options = {}) {
    this.queue = [];
    this.processing = false;
    this.sendFunction = options.sendFunction;
    this.logger = options.logger || console;

    // Scheduling options
    this.minDelay = options.minDelay || 30000;
    this.maxDelay = options.maxDelay || 120000;
    this.batchSize = options.batchSize || 3;
    this.batchPause = options.batchPause || 300000;

    this.messagesSentInBatch = 0;
    this.lastSendTime = 0;
  }

  /**
   * Add message to queue
   */
  enqueue(to, text, replyToMessageId = null, priority = 'normal') {
    const message = {
      id: Date.now() + Math.random().toString(36).substr(2, 9),
      to,
      text,
      replyToMessageId,
      priority,
      enqueuedAt: Date.now(),
    };

    if (priority === 'high') {
      this.queue.unshift(message);
    } else {
      this.queue.push(message);
    }

    this.logger.debug({ queueLength: this.queue.length, priority }, 'Message enqueued');

    if (!this.processing) {
      this.processQueue();
    }

    return message.id;
  }

  /**
   * Process queued messages with optimal timing
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) return;

    this.processing = true;

    while (this.queue.length > 0) {
      if (this.messagesSentInBatch >= this.batchSize) {
        const pauseTime = humanDelay(this.batchPause, 0.3);
        this.logger.info({ pauseTime, batchSize: this.batchSize }, 'Batch pause');
        await new Promise(resolve => setTimeout(resolve, pauseTime));
        this.messagesSentInBatch = 0;
      }

      const timeSinceLast = Date.now() - this.lastSendTime;
      const requiredDelay = humanDelay(this.minDelay, 0.4);

      if (timeSinceLast < requiredDelay) {
        const waitTime = requiredDelay - timeSinceLast;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const message = this.queue.shift();

      try {
        if (this.sendFunction) {
          await this.sendFunction(message.to, message.text, message.replyToMessageId);
        }
        this.lastSendTime = Date.now();
        this.messagesSentInBatch++;
        this.logger.debug({ to: message.to, queueRemaining: this.queue.length }, 'Queued message sent');
      } catch (err) {
        this.logger.error({ error: err.message, to: message.to }, 'Failed to send queued message');
        if (message.retries === undefined) message.retries = 0;
        if (message.retries < 2) {
          message.retries++;
          message.priority = 'low';
          this.queue.push(message);
        }
      }
    }

    this.processing = false;
  }

  /**
   * Get queue status
   */
  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      messagesSentInBatch: this.messagesSentInBatch,
      batchSize: this.batchSize,
    };
  }

  /**
   * Clear the queue
   */
  clear() {
    this.queue = [];
    this.messagesSentInBatch = 0;
  }
}

export default MessageScheduler;
