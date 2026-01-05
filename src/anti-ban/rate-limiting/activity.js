/**
 * Activity Tracker
 *
 * Tracks message activity to maintain healthy response ratio.
 * WhatsApp flags accounts with <50% response rate as spam.
 */

import { DailyPersistenceBase } from '../shared/persistence.js';

/**
 * Tracks sent/received message ratios
 */
export class ActivityTracker extends DailyPersistenceBase {
  constructor(sessionsDir) {
    super(sessionsDir, '.activity-stats.json');

    this.sent = 0;
    this.received = 0;
    this.uniqueRecipients = new Set();
    this.uniqueSenders = new Set();

    this.loadState();
  }

  recordSent(to) {
    this.sent++;
    this.uniqueRecipients.add(to);
    this.saveState();
  }

  recordReceived(from) {
    this.received++;
    this.uniqueSenders.add(from);
    this.saveState();
  }

  /**
   * Get response ratio - should be >50% for safety
   */
  getResponseRatio() {
    if (this.sent === 0) return 1;
    return this.received / this.sent;
  }

  /**
   * Check if it's safe to send more messages
   */
  isSafeToSend() {
    // If we've sent more than 10 messages and response ratio is low, warn
    if (this.sent > 10 && this.getResponseRatio() < 0.3) {
      return {
        safe: false,
        reason: `Low response ratio (${Math.round(this.getResponseRatio() * 100)}%). Wait for more responses.`,
      };
    }
    return { safe: true };
  }

  getStats() {
    return {
      sent: this.sent,
      received: this.received,
      responseRatio: Math.round(this.getResponseRatio() * 100) + '%',
      uniqueRecipients: this.uniqueRecipients.size,
      uniqueSenders: this.uniqueSenders.size,
    };
  }

  // PersistenceBase overrides
  getStateData() {
    return {
      sent: this.sent,
      received: this.received,
      uniqueRecipients: [...this.uniqueRecipients],
      uniqueSenders: [...this.uniqueSenders],
    };
  }

  restoreState(data) {
    this.sent = data.sent || 0;
    this.received = data.received || 0;
    this.uniqueRecipients = new Set(data.uniqueRecipients || []);
    this.uniqueSenders = new Set(data.uniqueSenders || []);
  }
}

export default ActivityTracker;
