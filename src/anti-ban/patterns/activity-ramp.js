/**
 * Activity Ramper
 *
 * After being offline for extended periods, gradually ramp up activity
 * to avoid sudden burst of messages which looks suspicious.
 */

import { PersistenceBase } from '../shared/persistence.js';

/**
 * Gradual activity ramp-up after downtime
 */
export class ActivityRamper extends PersistenceBase {
  constructor(options = {}) {
    super(options.sessionsDir, '.activity-ramp-state.json');

    this.lastActiveTime = Date.now();
    this.currentMultiplier = 1.0; // 1.0 = normal, 0.5 = half speed, etc.

    // Ramp settings
    this.downtimeThreshold = options.downtimeThreshold || 60 * 60 * 1000;  // 1 hour
    this.rampUpPeriod = options.rampUpPeriod || 30 * 60 * 1000;            // 30 min to full speed
    this.minMultiplier = options.minMultiplier || 0.25;                     // Start at 25% speed

    this.loadState();
  }

  /**
   * Record activity (call on each message sent/received)
   */
  recordActivity() {
    this.lastActiveTime = Date.now();
    this.saveState();
  }

  /**
   * Get current rate multiplier based on downtime
   */
  getRateMultiplier() {
    const downtime = Date.now() - this.lastActiveTime;

    // If no significant downtime, return full speed
    if (downtime < this.downtimeThreshold) {
      this.currentMultiplier = 1.0;
      return 1.0;
    }

    // Calculate how far into ramp-up we are
    const timeSinceRampStart = Date.now() - this.lastActiveTime - this.downtimeThreshold;

    if (timeSinceRampStart < 0) {
      // Just came back, start at minimum
      this.currentMultiplier = this.minMultiplier;
    } else {
      // Gradually increase
      const rampProgress = Math.min(timeSinceRampStart / this.rampUpPeriod, 1.0);
      this.currentMultiplier = this.minMultiplier + (1.0 - this.minMultiplier) * rampProgress;
    }

    return this.currentMultiplier;
  }

  /**
   * Adjust rate limit based on ramp multiplier
   */
  adjustLimit(baseLimit) {
    return Math.max(1, Math.floor(baseLimit * this.getRateMultiplier()));
  }

  /**
   * Check if we should add extra delay (during ramp-up)
   */
  getExtraDelay() {
    const multiplier = this.getRateMultiplier();
    if (multiplier >= 0.9) return 0; // Near full speed, no extra delay

    // Add extra delay inversely proportional to multiplier
    const baseExtraDelay = 30000; // 30 seconds base
    return Math.floor(baseExtraDelay * (1 - multiplier));
  }

  getStatus() {
    const downtime = Date.now() - this.lastActiveTime;
    return {
      lastActiveTime: this.lastActiveTime,
      downtimeMinutes: Math.floor(downtime / 60000),
      currentMultiplier: (this.currentMultiplier * 100).toFixed(0) + '%',
      isRampingUp: this.currentMultiplier < 1.0,
      extraDelay: this.getExtraDelay(),
    };
  }

  // PersistenceBase overrides
  getStateData() {
    return {
      lastActiveTime: this.lastActiveTime,
    };
  }

  restoreState(data) {
    this.lastActiveTime = data.lastActiveTime || Date.now();
  }
}

export default ActivityRamper;
