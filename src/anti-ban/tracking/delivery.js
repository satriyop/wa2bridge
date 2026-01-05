/**
 * Delivery Tracker
 *
 * Tracks message delivery status to detect potential
 * blocks or connection issues.
 */

/**
 * Tracks message delivery status
 */
export class DeliveryTracker {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.messages = new Map(); // messageId -> status

    // Track stats
    this.stats = {
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      pending: 0,
    };

    // Timeouts for detecting issues
    this.deliveryTimeout = options.deliveryTimeout || 60000;   // 1 min to deliver
    this.staleTimeout = options.staleTimeout || 300000;        // 5 min before considered stale

    // Cleanup interval
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Record a sent message
   */
  recordSent(messageId, to) {
    this.messages.set(messageId, {
      id: messageId,
      to,
      status: 'sent',
      sentAt: Date.now(),
      deliveredAt: null,
      readAt: null,
    });
    this.stats.sent++;
    this.stats.pending++;
  }

  /**
   * Update message status
   */
  updateStatus(messageId, status) {
    const msg = this.messages.get(messageId);
    if (!msg) return;

    const prevStatus = msg.status;
    msg.status = status;

    if (status === 'delivered' && prevStatus !== 'delivered') {
      msg.deliveredAt = Date.now();
      this.stats.delivered++;
      this.stats.pending = Math.max(0, this.stats.pending - 1);
    } else if (status === 'read' && prevStatus !== 'read') {
      msg.readAt = Date.now();
      this.stats.read++;
    } else if (status === 'failed') {
      this.stats.failed++;
      this.stats.pending = Math.max(0, this.stats.pending - 1);
    }
  }

  /**
   * Check for delivery issues (potential blocks)
   */
  checkDeliveryHealth() {
    const now = Date.now();
    const issues = [];

    for (const [messageId, msg] of this.messages) {
      if (msg.status === 'sent') {
        const age = now - msg.sentAt;

        if (age > this.deliveryTimeout && age < this.staleTimeout) {
          issues.push({
            type: 'slow_delivery',
            messageId,
            to: msg.to,
            age,
          });
        } else if (age >= this.staleTimeout) {
          issues.push({
            type: 'possible_block',
            messageId,
            to: msg.to,
            age,
          });
        }
      }
    }

    return {
      healthy: issues.length === 0,
      issues,
      stats: this.getStats(),
    };
  }

  /**
   * Get delivery rate (delivered / sent)
   */
  getDeliveryRate() {
    if (this.stats.sent === 0) return 1;
    return this.stats.delivered / this.stats.sent;
  }

  /**
   * Get read rate (read / delivered)
   */
  getReadRate() {
    if (this.stats.delivered === 0) return 1;
    return this.stats.read / this.stats.delivered;
  }

  getStats() {
    return {
      ...this.stats,
      deliveryRate: (this.getDeliveryRate() * 100).toFixed(1) + '%',
      readRate: (this.getReadRate() * 100).toFixed(1) + '%',
    };
  }

  /**
   * Cleanup old messages
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [messageId, msg] of this.messages) {
      if (now - msg.sentAt > maxAge) {
        this.messages.delete(messageId);
      }
    }
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

export default DeliveryTracker;
