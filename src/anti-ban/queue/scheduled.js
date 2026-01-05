/**
 * Scheduled Messages
 *
 * Send messages at specific times.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export class ScheduledMessages {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.sendFunction = options.sendFunction;
    this.logger = options.logger || console;
    this.scheduled = [];
    this.checkInterval = null;

    this.loadState();
  }

  schedule(to, message, sendAt, options = {}) {
    const scheduled = {
      id: this.generateId(),
      to,
      message,
      sendAt: new Date(sendAt).getTime(),
      status: 'pending',
      replyTo: options.replyTo || null,
      repeat: options.repeat || null,
      createdAt: Date.now(),
    };

    if (scheduled.sendAt <= Date.now()) {
      throw new Error('Scheduled time must be in the future');
    }

    this.scheduled.push(scheduled);
    this.saveState();

    return scheduled;
  }

  cancel(id) {
    const index = this.scheduled.findIndex(s => s.id === id);
    if (index === -1) return false;

    if (this.scheduled[index].status === 'sent') {
      throw new Error('Cannot cancel already sent message');
    }

    this.scheduled[index].status = 'cancelled';
    this.saveState();
    return true;
  }

  start() {
    if (this.checkInterval) return;

    this.checkInterval = setInterval(() => this.processScheduled(), 30000);
    this.logger.info('Scheduled messages processor started');
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  async processScheduled() {
    const now = Date.now();
    const toSend = this.scheduled.filter(s =>
      s.status === 'pending' && s.sendAt <= now
    );

    for (const msg of toSend) {
      try {
        await this.sendFunction(msg.to, msg.message, msg.replyTo);
        msg.status = 'sent';
        msg.sentAt = Date.now();
        this.logger.info({ to: msg.to, id: msg.id }, 'Scheduled message sent');

        if (msg.repeat) {
          this.scheduleRepeat(msg);
        }
      } catch (error) {
        msg.status = 'failed';
        msg.error = error.message;
        this.logger.error({ to: msg.to, id: msg.id, error: error.message }, 'Scheduled message failed');
      }
    }

    if (toSend.length > 0) {
      this.saveState();
    }
  }

  scheduleRepeat(msg) {
    let nextSendAt;

    if (msg.repeat === 'daily') {
      nextSendAt = msg.sendAt + 24 * 60 * 60 * 1000;
    } else if (msg.repeat === 'weekly') {
      nextSendAt = msg.sendAt + 7 * 24 * 60 * 60 * 1000;
    }

    if (nextSendAt) {
      this.scheduled.push({
        ...msg,
        id: this.generateId(),
        sendAt: nextSendAt,
        status: 'pending',
        parentId: msg.id,
        createdAt: Date.now(),
      });
    }
  }

  getScheduled(filter = {}) {
    let results = [...this.scheduled];

    if (filter.status) {
      results = results.filter(s => s.status === filter.status);
    }

    if (filter.to) {
      results = results.filter(s => s.to === filter.to);
    }

    return results.sort((a, b) => a.sendAt - b.sendAt);
  }

  getUpcoming(limit = 10) {
    return this.getScheduled({ status: 'pending' }).slice(0, limit);
  }

  getStats() {
    const byStatus = { pending: 0, sent: 0, failed: 0, cancelled: 0 };
    for (const msg of this.scheduled) {
      byStatus[msg.status] = (byStatus[msg.status] || 0) + 1;
    }

    return {
      total: this.scheduled.length,
      byStatus,
      upcoming: this.getUpcoming(5),
      isRunning: !!this.checkInterval,
    };
  }

  generateId() {
    return 'sched_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.scheduled-messages.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        this.scheduled = data.scheduled || [];
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.scheduled-messages.json');
    try {
      writeFileSync(stateFile, JSON.stringify({
        scheduled: this.scheduled,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

export default ScheduledMessages;
