/**
 * Message Rate Limiter
 *
 * Prevents ban from high-velocity messaging by enforcing
 * rate limits based on account age.
 */

import { DailyPersistenceBase } from '../shared/persistence.js';
import { humanDelay } from '../core/timing.js';
import { config } from '../../config.js';

/**
 * Rate limits based on account age:
 * - Week 1: 5/hour, 15/day (new account warming)
 * - Week 2-4: 15/hour, 40/day (gradual ramp)
 * - Month 2+: 30/hour, 150/day (mature account)
 */
export class MessageRateLimiter extends DailyPersistenceBase {
  constructor(options = {}) {
    super(options.sessionsDir, '.rate-limit-stats.json');

    this.hourlyCount = 0;
    this.dailyCount = 0;
    this.lastReset = {
      hour: Date.now(),
      day: Date.now(),
    };
    this.lastMessageTime = 0;
    this.accountAgeWeeks = options.accountAgeWeeks || 1;

    // Load persisted stats if available
    this.loadState();
  }

  /**
   * Get rate limits based on account age
   */
  getLimits(weeks = this.accountAgeWeeks) {
    const { rateLimits } = config;

    if (weeks <= 1) {
      // New account - very conservative
      return {
        hourly: rateLimits.week1.hourly,
        daily: rateLimits.week1.daily,
        minIntervalMs: rateLimits.week1.intervalMs,
        description: 'New account (Week 1)'
      };
    }
    if (weeks <= 4) {
      // Warming account
      return {
        hourly: rateLimits.week2to4.hourly,
        daily: rateLimits.week2to4.daily,
        minIntervalMs: rateLimits.week2to4.intervalMs,
        description: 'Warming account (Week 2-4)'
      };
    }
    // Mature account
    return {
      hourly: rateLimits.mature.hourly,
      daily: rateLimits.mature.daily,
      minIntervalMs: rateLimits.mature.intervalMs,
      description: 'Mature account (Month 2+)'
    };
  }

  /**
   * Check if we can send a message
   * @returns {Promise<{allowed: boolean, reason?: string, waitMs?: number}>}
   */
  async canSend() {
    const now = Date.now();
    const limits = this.getLimits();

    // Reset hourly counter
    if (now - this.lastReset.hour > config.rateLimits.hourlyResetMs) {
      this.hourlyCount = 0;
      this.lastReset.hour = now;
    }

    // Reset daily counter
    if (now - this.lastReset.day > config.rateLimits.dailyResetMs) {
      this.dailyCount = 0;
      this.lastReset.day = now;
    }

    // Check hourly limit
    if (this.hourlyCount >= limits.hourly) {
      const waitMs = config.rateLimits.hourlyResetMs - (now - this.lastReset.hour);
      return {
        allowed: false,
        reason: `Hourly limit reached (${limits.hourly}). Reset in ${Math.ceil(waitMs / 60000)} minutes.`,
        waitMs,
      };
    }

    // Check daily limit
    if (this.dailyCount >= limits.daily) {
      const waitMs = config.rateLimits.dailyResetMs - (now - this.lastReset.day);
      return {
        allowed: false,
        reason: `Daily limit reached (${limits.daily}). Reset in ${Math.ceil(waitMs / 3600000)} hours.`,
        waitMs,
      };
    }

    // Check minimum interval
    const elapsed = now - this.lastMessageTime;
    if (this.lastMessageTime > 0 && elapsed < limits.minIntervalMs) {
      const waitMs = limits.minIntervalMs - elapsed;
      return {
        allowed: false,
        reason: `Too fast. Wait ${Math.ceil(waitMs / 1000)} seconds.`,
        waitMs,
      };
    }

    return { allowed: true };
  }

  /**
   * Record a sent message
   */
  recordSend() {
    this.hourlyCount++;
    this.dailyCount++;
    this.lastMessageTime = Date.now();
    this.saveState();
  }

  /**
   * Get current stats
   */
  getStats() {
    const limits = this.getLimits();
    return {
      hourlyCount: this.hourlyCount,
      hourlyLimit: limits.hourly,
      dailyCount: this.dailyCount,
      dailyLimit: limits.daily,
      minIntervalMs: limits.minIntervalMs,
      accountAgeWeeks: this.accountAgeWeeks,
      limitDescription: limits.description,
      lastMessageTime: this.lastMessageTime,
      hourlyResetIn: Math.max(0, config.rateLimits.hourlyResetMs - (Date.now() - this.lastReset.hour)),
      dailyResetIn: Math.max(0, config.rateLimits.dailyResetMs - (Date.now() - this.lastReset.day)),
    };
  }

  /**
   * Set account age (call this when account age is known)
   */
  setAccountAge(weeks) {
    this.accountAgeWeeks = weeks;
    this.saveState();
  }

  /**
   * Alias for saveState (backward compatibility)
   */
  saveStats() {
    this.saveState();
  }

  // PersistenceBase overrides
  getStateData() {
    return {
      dailyCount: this.dailyCount,
      hourlyCount: this.hourlyCount,
      lastResetDay: this.lastReset.day,
      lastResetHour: this.lastReset.hour,
      accountAgeWeeks: this.accountAgeWeeks,
    };
  }

  restoreState(data) {
    // Only restore if data is from today (handled by DailyPersistenceBase)
    this.dailyCount = data.dailyCount || 0;
    this.lastReset.day = data.lastResetDay || Date.now();

    // Restore hourly if within the hour
    if (data.lastResetHour && Date.now() - data.lastResetHour < config.rateLimits.hourlyResetMs) {
      this.hourlyCount = data.hourlyCount || 0;
      this.lastReset.hour = data.lastResetHour;
    }

    // Restore account age
    if (data.accountAgeWeeks) {
      this.accountAgeWeeks = data.accountAgeWeeks;
    }
  }
}

export default MessageRateLimiter;
