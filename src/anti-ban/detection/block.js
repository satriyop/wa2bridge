/**
 * Block Detector
 *
 * Detects if contacts have blocked the bot by monitoring
 * delivery failures and profile accessibility.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Detects blocked contacts
 */
export class BlockDetector {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.socket = null;
    this.onBlock = options.onBlock || (() => {});

    // Track suspected blocks
    this.suspectedBlocks = new Map();
    this.confirmedBlocks = new Set();

    // Detection thresholds
    this.singleCheckTimeout = options.singleCheckTimeout || 24 * 60 * 60 * 1000; // 24 hours
    this.consecutiveFailures = options.consecutiveFailures || 3;

    this.loadState();
  }

  setSocket(socket) {
    this.socket = socket;
  }

  /**
   * Record that a message was sent (single check)
   */
  recordMessageSent(to, messageId) {
    const existing = this.suspectedBlocks.get(to) || {
      pendingMessages: [],
      failedDeliveries: 0,
      profileCheckFailed: false,
    };

    existing.pendingMessages.push({
      messageId,
      sentAt: Date.now(),
    });

    this.suspectedBlocks.set(to, existing);
    this.saveState();
  }

  /**
   * Record that a message was delivered (double check)
   */
  recordMessageDelivered(to, messageId) {
    const existing = this.suspectedBlocks.get(to);
    if (!existing) return;

    // Remove from pending
    existing.pendingMessages = existing.pendingMessages.filter(
      m => m.messageId !== messageId
    );

    // Reset failure count on successful delivery
    existing.failedDeliveries = 0;
    existing.profileCheckFailed = false;

    // Remove from confirmed blocks if previously blocked
    this.confirmedBlocks.delete(to);

    if (existing.pendingMessages.length === 0) {
      this.suspectedBlocks.delete(to);
    } else {
      this.suspectedBlocks.set(to, existing);
    }

    this.saveState();
  }

  /**
   * Check for stale single-check messages (potential blocks)
   */
  checkForBlocks() {
    const now = Date.now();
    const potentialBlocks = [];

    for (const [contact, data] of this.suspectedBlocks) {
      // Check for old undelivered messages
      const staleMessages = data.pendingMessages.filter(
        m => now - m.sentAt > this.singleCheckTimeout
      );

      if (staleMessages.length >= this.consecutiveFailures) {
        potentialBlocks.push({
          contact,
          staleCount: staleMessages.length,
          oldestMessage: Math.min(...staleMessages.map(m => m.sentAt)),
        });
      }
    }

    return potentialBlocks;
  }

  /**
   * Verify block by checking profile picture
   */
  async verifyBlock(jid) {
    if (!this.socket) return { blocked: false, reason: 'no_socket' };

    try {
      // Try to get profile picture
      await this.socket.profilePictureUrl(jid, 'image');
      return { blocked: false, reason: 'profile_accessible' };
    } catch (err) {
      // Profile not accessible - could be blocked or private
      const existing = this.suspectedBlocks.get(jid) || {};
      existing.profileCheckFailed = true;

      // If we also have undelivered messages, likely blocked
      if (existing.pendingMessages?.length >= this.consecutiveFailures) {
        this.confirmedBlocks.add(jid);
        this.onBlock({ contact: jid, confirmedAt: Date.now() });
        return { blocked: true, reason: 'profile_and_delivery_failed' };
      }

      return { blocked: false, reason: 'profile_private_only' };
    }
  }

  /**
   * Check if contact is confirmed blocked
   */
  isBlocked(contact) {
    return this.confirmedBlocks.has(contact);
  }

  getStats() {
    return {
      suspectedCount: this.suspectedBlocks.size,
      confirmedCount: this.confirmedBlocks.size,
      confirmedBlocks: [...this.confirmedBlocks],
      potentialBlocks: this.checkForBlocks(),
    };
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.block-detector-state.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        this.confirmedBlocks = new Set(data.confirmedBlocks || []);
        // Don't load suspected blocks - they're time-sensitive
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.block-detector-state.json');
    try {
      writeFileSync(stateFile, JSON.stringify({
        confirmedBlocks: [...this.confirmedBlocks],
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

export default BlockDetector;
