/**
 * Network Fingerprint
 *
 * Ensures consistent network fingerprint to avoid detection.
 * Tracks and validates IP/network patterns.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export class NetworkFingerprint {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.lastKnownIP = null;
    this.ipHistory = [];
    this.maxHistorySize = 100;

    this.ipChangeWarningThreshold = 3;
    this.suspiciousPatterns = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
    ];

    this.loadState();
  }

  /**
   * Record current IP
   */
  async recordIP() {
    try {
      const ip = await this.fetchExternalIP();
      if (!ip) return;

      const now = Date.now();

      if (this.lastKnownIP && this.lastKnownIP !== ip) {
        this.ipHistory.push({
          from: this.lastKnownIP,
          to: ip,
          timestamp: now,
        });

        if (this.ipHistory.length > this.maxHistorySize) {
          this.ipHistory = this.ipHistory.slice(-this.maxHistorySize);
        }
      }

      this.lastKnownIP = ip;
      this.saveState();

      return ip;
    } catch (err) {
      return null;
    }
  }

  /**
   * Fetch external IP (placeholder)
   */
  async fetchExternalIP() {
    return null;
  }

  /**
   * Check network health/consistency
   */
  checkNetworkHealth() {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const warnings = [];

    const recentChanges = this.ipHistory.filter(h => h.timestamp > oneDayAgo);
    if (recentChanges.length >= this.ipChangeWarningThreshold) {
      warnings.push(`IP changed ${recentChanges.length} times in 24h (suspicious)`);
    }

    if (this.lastKnownIP) {
      for (const pattern of this.suspiciousPatterns) {
        if (pattern.test(this.lastKnownIP)) {
          warnings.push(`Current IP (${this.lastKnownIP}) matches suspicious pattern`);
          break;
        }
      }
    }

    return {
      healthy: warnings.length === 0,
      warnings,
      lastKnownIP: this.lastKnownIP,
      recentIPChanges: recentChanges.length,
    };
  }

  /**
   * Get recommended actions
   */
  getRecommendations() {
    const health = this.checkNetworkHealth();
    const recommendations = [];

    if (!health.healthy) {
      recommendations.push('Consider using a stable IP address');
      recommendations.push('Avoid VPN hopping during active sessions');
      recommendations.push('Maintain same network for at least 24 hours');
    }

    return recommendations;
  }

  loadState() {
    if (!this.sessionsDir) return;

    const stateFile = join(this.sessionsDir, '.network-fingerprint.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        this.lastKnownIP = data.lastKnownIP;
        this.ipHistory = data.ipHistory || [];
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;

    const stateFile = join(this.sessionsDir, '.network-fingerprint.json');
    try {
      writeFileSync(stateFile, JSON.stringify({
        lastKnownIP: this.lastKnownIP,
        ipHistory: this.ipHistory,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

export default NetworkFingerprint;
