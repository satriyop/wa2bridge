/**
 * Anti-Ban Utilities for WhatsApp Bridge
 *
 * This module provides utilities to avoid WhatsApp bans by implementing:
 * - Randomized delays (human-like timing)
 * - Browser fingerprint rotation
 * - Rate limiting
 * - Exponential backoff with jitter for reconnection
 *
 * CRITICAL: These utilities are MANDATORY for any WhatsApp automation.
 * WhatsApp uses ML-based behavioral analysis to detect bots.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

// =============================================================================
// HUMAN-LIKE DELAY UTILITIES
// =============================================================================

/**
 * Generate a randomized delay with variance to avoid detection
 * WhatsApp ML detects fixed timing patterns - this adds ±variance% jitter
 *
 * @param {number} baseMs - Base delay in milliseconds
 * @param {number} variancePercent - Variance as decimal (0.3 = ±30%)
 * @returns {number} Randomized delay in milliseconds
 */
export function humanDelay(baseMs, variancePercent = 0.3) {
  const variance = baseMs * variancePercent;
  const min = Math.floor(baseMs - variance);
  const max = Math.ceil(baseMs + variance);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Calculate typing duration based on message length
 * Simulates human typing speed (~50ms per character with variance)
 *
 * @param {string} text - Message text
 * @param {number} minDuration - Minimum typing duration
 * @param {number} maxDuration - Maximum typing duration
 * @returns {number} Typing duration in milliseconds
 */
export function calculateTypingDuration(text, minDuration = 1000, maxDuration = 6000) {
  // Average typing speed: ~40-60ms per character with variance
  const msPerChar = humanDelay(50, 0.4);
  const baseDuration = text.length * msPerChar;

  // Clamp between min and max
  return Math.min(Math.max(baseDuration, minDuration), maxDuration);
}

/**
 * Generate a "thinking" pause before responding
 * Humans don't respond instantly - they read and think first
 *
 * @param {string} incomingMessage - The message being responded to
 * @returns {number} Thinking pause in milliseconds
 */
export function calculateThinkingPause(incomingMessage) {
  // Base thinking time: 500-2000ms depending on message complexity
  const baseThinking = Math.min(incomingMessage.length * 20, 2000);
  return humanDelay(Math.max(baseThinking, 500), 0.5);
}

// =============================================================================
// BROWSER FINGERPRINT ROTATION
// =============================================================================

// Legacy fingerprint - used for first run to maintain session continuity
// This matches the previously hardcoded value to avoid re-authentication
const LEGACY_FINGERPRINT = ['Ubuntu', 'Chrome', '124.0.6367.91'];

// Current browser versions (update periodically)
const BROWSER_FINGERPRINTS = [
  ['Windows', 'Chrome', '131.0.6778.139'],
  ['Windows', 'Chrome', '130.0.6723.117'],
  ['Windows', 'Edge', '131.0.2903.86'],
  ['macOS', 'Chrome', '131.0.6778.139'],
  ['macOS', 'Safari', '18.2'],
  ['Linux', 'Chrome', '131.0.6778.139'],
  ['Linux', 'Firefox', '133.0'],
];

// Rotation interval: 24-48 hours (randomized)
const MIN_ROTATION_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const MAX_ROTATION_INTERVAL = 48 * 60 * 60 * 1000; // 48 hours

/**
 * Get or rotate browser fingerprint
 * Stores fingerprint in session directory, rotates every 24-48 hours
 *
 * IMPORTANT: First run uses legacy fingerprint to maintain existing session.
 * Subsequent rotations will use modern fingerprints.
 *
 * @param {string} sessionsDir - Path to sessions directory
 * @returns {string[]} Browser fingerprint array [OS, Browser, Version]
 */
export function getBrowserFingerprint(sessionsDir) {
  const fingerprintFile = join(sessionsDir, '.browser-fingerprint.json');

  try {
    if (existsSync(fingerprintFile)) {
      const stored = JSON.parse(readFileSync(fingerprintFile, 'utf-8'));
      const rotationInterval = stored.rotationInterval || MIN_ROTATION_INTERVAL;

      // Check if rotation is needed
      if (Date.now() - stored.timestamp < rotationInterval) {
        return stored.browser;
      }

      // Time to rotate - use modern fingerprints
      const newBrowser = BROWSER_FINGERPRINTS[
        Math.floor(Math.random() * BROWSER_FINGERPRINTS.length)
      ];

      const newRotationInterval = MIN_ROTATION_INTERVAL +
        Math.random() * (MAX_ROTATION_INTERVAL - MIN_ROTATION_INTERVAL);

      const data = {
        browser: newBrowser,
        timestamp: Date.now(),
        rotationInterval: newRotationInterval,
        rotationCount: (stored.rotationCount || 0) + 1,
      };

      writeFileSync(fingerprintFile, JSON.stringify(data, null, 2));
      console.log(`[Anti-Ban] Browser fingerprint rotated to: ${newBrowser.join('/')}`);
      return newBrowser;
    }
  } catch (err) {
    // File doesn't exist or is corrupted, use legacy for first run
  }

  // FIRST RUN: Use legacy fingerprint to maintain existing session
  // This prevents WhatsApp from seeing a sudden device change
  const data = {
    browser: LEGACY_FINGERPRINT,
    timestamp: Date.now(),
    rotationInterval: MIN_ROTATION_INTERVAL + Math.random() * (MAX_ROTATION_INTERVAL - MIN_ROTATION_INTERVAL),
    rotationCount: 0,
    note: 'Initial fingerprint matches legacy hardcoded value for session continuity',
  };

  try {
    writeFileSync(fingerprintFile, JSON.stringify(data, null, 2));
    console.log('[Anti-Ban] Using legacy fingerprint for session continuity. Will rotate in 24-48h.');
  } catch (err) {
    console.warn('Could not save browser fingerprint:', err.message);
  }

  return LEGACY_FINGERPRINT;
}

// =============================================================================
// RATE LIMITER
// =============================================================================

/**
 * Message rate limiter to avoid ban from high-velocity messaging
 *
 * Limits based on account age:
 * - Week 1: 5/hour, 15/day (new account warming)
 * - Week 2-4: 15/hour, 40/day (gradual ramp)
 * - Month 2+: 30/hour, 150/day (mature account)
 */
export class MessageRateLimiter {
  constructor(options = {}) {
    this.hourlyCount = 0;
    this.dailyCount = 0;
    this.lastReset = {
      hour: Date.now(),
      day: Date.now(),
    };
    this.lastMessageTime = 0;
    this.accountAgeWeeks = options.accountAgeWeeks || 1;
    this.sessionsDir = options.sessionsDir;

    // Load persisted stats if available
    this.loadStats();
  }

  /**
   * Get rate limits based on account age
   */
  getLimits(weeks = this.accountAgeWeeks) {
    if (weeks <= 1) {
      // New account - very conservative
      return {
        hourly: 5,
        daily: 15,
        minIntervalMs: 180000,  // 3 minutes minimum
        description: 'New account (Week 1)'
      };
    }
    if (weeks <= 4) {
      // Warming account
      return {
        hourly: 15,
        daily: 40,
        minIntervalMs: 90000,   // 90 seconds minimum
        description: 'Warming account (Week 2-4)'
      };
    }
    // Mature account
    return {
      hourly: 30,
      daily: 150,
      minIntervalMs: 30000,    // 30 seconds minimum
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
    if (now - this.lastReset.hour > 3600000) {
      this.hourlyCount = 0;
      this.lastReset.hour = now;
    }

    // Reset daily counter
    if (now - this.lastReset.day > 86400000) {
      this.dailyCount = 0;
      this.lastReset.day = now;
    }

    // Check hourly limit
    if (this.hourlyCount >= limits.hourly) {
      const waitMs = 3600000 - (now - this.lastReset.hour);
      return {
        allowed: false,
        reason: `Hourly limit reached (${limits.hourly}). Reset in ${Math.ceil(waitMs / 60000)} minutes.`,
        waitMs,
      };
    }

    // Check daily limit
    if (this.dailyCount >= limits.daily) {
      const waitMs = 86400000 - (now - this.lastReset.day);
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
    this.saveStats();
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
      hourlyResetIn: Math.max(0, 3600000 - (Date.now() - this.lastReset.hour)),
      dailyResetIn: Math.max(0, 86400000 - (Date.now() - this.lastReset.day)),
    };
  }

  /**
   * Set account age (call this when account age is known)
   */
  setAccountAge(weeks) {
    this.accountAgeWeeks = weeks;
    this.saveStats();
  }

  /**
   * Load persisted stats from file
   */
  loadStats() {
    if (!this.sessionsDir) return;

    const statsFile = join(this.sessionsDir, '.rate-limit-stats.json');
    try {
      if (existsSync(statsFile)) {
        const data = JSON.parse(readFileSync(statsFile, 'utf-8'));

        // Only restore if data is from today
        const today = new Date().toDateString();
        if (data.date === today) {
          this.dailyCount = data.dailyCount || 0;
          this.lastReset.day = data.lastResetDay || Date.now();
        }

        // Restore hourly if within the hour
        if (data.lastResetHour && Date.now() - data.lastResetHour < 3600000) {
          this.hourlyCount = data.hourlyCount || 0;
          this.lastReset.hour = data.lastResetHour;
        }

        // Restore account age
        if (data.accountAgeWeeks) {
          this.accountAgeWeeks = data.accountAgeWeeks;
        }
      }
    } catch (err) {
      // Ignore errors, start fresh
    }
  }

  /**
   * Save stats to file for persistence across restarts
   */
  saveStats() {
    if (!this.sessionsDir) return;

    const statsFile = join(this.sessionsDir, '.rate-limit-stats.json');
    try {
      const data = {
        date: new Date().toDateString(),
        dailyCount: this.dailyCount,
        hourlyCount: this.hourlyCount,
        lastResetDay: this.lastReset.day,
        lastResetHour: this.lastReset.hour,
        accountAgeWeeks: this.accountAgeWeeks,
        lastSaved: Date.now(),
      };
      writeFileSync(statsFile, JSON.stringify(data, null, 2));
    } catch (err) {
      // Ignore save errors
    }
  }
}

// =============================================================================
// RECONNECTION MANAGER
// =============================================================================

/**
 * Reconnection manager with exponential backoff and jitter
 *
 * Predictable reconnection patterns are a bot fingerprint.
 * This implements exponential backoff (1s, 2s, 4s, 8s...) with 30-50% random jitter.
 */
export class ReconnectionManager {
  constructor(options = {}) {
    this.attempts = 0;
    this.baseDelay = options.baseDelay || 1000;      // Start at 1 second
    this.maxDelay = options.maxDelay || 300000;       // Max 5 minutes
    this.maxAttempts = options.maxAttempts || 10;     // Max attempts before giving up
    this.jitterMin = options.jitterMin || 0.3;        // 30% minimum jitter
    this.jitterMax = options.jitterMax || 0.5;        // 50% maximum jitter
  }

  /**
   * Get next reconnection delay with exponential backoff and jitter
   * @returns {{delay: number, attempt: number, shouldGiveUp: boolean}}
   */
  getNextDelay() {
    if (this.attempts >= this.maxAttempts) {
      return {
        delay: 0,
        attempt: this.attempts,
        shouldGiveUp: true,
      };
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s...
    const exponentialDelay = Math.min(
      this.baseDelay * Math.pow(2, this.attempts),
      this.maxDelay
    );

    // Add random jitter (30-50% of base delay)
    const jitterPercent = this.jitterMin + Math.random() * (this.jitterMax - this.jitterMin);
    const jitter = exponentialDelay * jitterPercent;

    // Final delay with jitter (can be positive or negative jitter)
    const finalDelay = Math.floor(exponentialDelay + (Math.random() > 0.5 ? jitter : -jitter * 0.5));

    this.attempts++;

    return {
      delay: Math.max(finalDelay, this.baseDelay), // Never less than base
      attempt: this.attempts,
      shouldGiveUp: false,
    };
  }

  /**
   * Reset attempt counter (call on successful connection)
   */
  reset() {
    this.attempts = 0;
  }

  /**
   * Get current state
   */
  getState() {
    return {
      attempts: this.attempts,
      maxAttempts: this.maxAttempts,
      willGiveUp: this.attempts >= this.maxAttempts,
    };
  }
}

// =============================================================================
// MESSAGE CONTENT SAFETY
// =============================================================================

/**
 * Check if message content might trigger spam detection
 *
 * @param {string} text - Message text to check
 * @returns {{safe: boolean, warnings: string[]}}
 */
export function checkMessageSafety(text) {
  const warnings = [];

  // Check for spam trigger words
  const spamTriggers = [
    /\bfree\b/i, /\bwin\b/i, /\blimited.?time\b/i, /\burgent\b/i,
    /\bclick\s+here\b/i, /\bact\s+now\b/i, /\boffer\b/i, /\bpromo\b/i,
  ];

  for (const trigger of spamTriggers) {
    if (trigger.test(text)) {
      warnings.push(`Contains potential spam trigger: "${text.match(trigger)[0]}"`);
    }
  }

  // Check for excessive URLs
  const urlCount = (text.match(/https?:\/\//gi) || []).length;
  if (urlCount > 2) {
    warnings.push(`Contains ${urlCount} URLs (might trigger spam filter)`);
  }

  // Check for excessive caps
  const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  if (capsRatio > 0.5 && text.length > 20) {
    warnings.push('Excessive caps usage (might seem like spam)');
  }

  // Check for repetitive content
  const words = text.toLowerCase().split(/\s+/);
  const uniqueWords = new Set(words);
  if (words.length > 10 && uniqueWords.size / words.length < 0.5) {
    warnings.push('Repetitive content detected');
  }

  return {
    safe: warnings.length === 0,
    warnings,
  };
}

// =============================================================================
// ACTIVITY TRACKING (for response rate monitoring)
// =============================================================================

/**
 * Track message activity to maintain healthy response ratio
 * WhatsApp flags accounts with <50% response rate as spam
 */
export class ActivityTracker {
  constructor(sessionsDir) {
    this.sessionsDir = sessionsDir;
    this.sent = 0;
    this.received = 0;
    this.uniqueRecipients = new Set();
    this.uniqueSenders = new Set();
    this.loadStats();
  }

  recordSent(to) {
    this.sent++;
    this.uniqueRecipients.add(to);
    this.saveStats();
  }

  recordReceived(from) {
    this.received++;
    this.uniqueSenders.add(from);
    this.saveStats();
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

  loadStats() {
    if (!this.sessionsDir) return;

    const statsFile = join(this.sessionsDir, '.activity-stats.json');
    try {
      if (existsSync(statsFile)) {
        const data = JSON.parse(readFileSync(statsFile, 'utf-8'));
        // Only load today's stats
        if (data.date === new Date().toDateString()) {
          this.sent = data.sent || 0;
          this.received = data.received || 0;
          this.uniqueRecipients = new Set(data.uniqueRecipients || []);
          this.uniqueSenders = new Set(data.uniqueSenders || []);
        }
      }
    } catch (err) {
      // Ignore
    }
  }

  saveStats() {
    if (!this.sessionsDir) return;

    const statsFile = join(this.sessionsDir, '.activity-stats.json');
    try {
      writeFileSync(statsFile, JSON.stringify({
        date: new Date().toDateString(),
        sent: this.sent,
        received: this.received,
        uniqueRecipients: [...this.uniqueRecipients],
        uniqueSenders: [...this.uniqueSenders],
      }, null, 2));
    } catch (err) {
      // Ignore
    }
  }
}

// =============================================================================
// ONLINE PRESENCE PATTERNS
// =============================================================================

/**
 * Manages online/offline presence to simulate human behavior
 *
 * Humans don't stay online 24/7. This simulates:
 * - Active hours (configurable, default 7AM - 11PM)
 * - Random offline periods during active hours
 * - Complete offline during sleep hours
 * - Gradual "wake up" and "wind down" patterns
 */
export class PresenceManager {
  constructor(options = {}) {
    this.socket = null;
    this.isOnline = false;
    this.lastPresenceChange = Date.now();

    // Active hours (24-hour format)
    this.activeHoursStart = options.activeHoursStart ?? 7;  // 7 AM
    this.activeHoursEnd = options.activeHoursEnd ?? 23;     // 11 PM

    // Presence timing (in milliseconds)
    this.minOnlineDuration = options.minOnlineDuration || 5 * 60 * 1000;     // 5 min minimum online
    this.maxOnlineDuration = options.maxOnlineDuration || 45 * 60 * 1000;    // 45 min max online
    this.minOfflineDuration = options.minOfflineDuration || 2 * 60 * 1000;   // 2 min minimum offline
    this.maxOfflineDuration = options.maxOfflineDuration || 15 * 60 * 1000;  // 15 min max offline

    // Schedule tracking
    this.nextPresenceChange = null;
    this.presenceInterval = null;
    this.sessionsDir = options.sessionsDir;

    this.loadState();
  }

  /**
   * Initialize with socket connection
   */
  setSocket(socket) {
    this.socket = socket;
  }

  /**
   * Check if current time is within active hours
   */
  isWithinActiveHours() {
    const hour = new Date().getHours();
    if (this.activeHoursStart < this.activeHoursEnd) {
      return hour >= this.activeHoursStart && hour < this.activeHoursEnd;
    }
    // Handle overnight active hours (e.g., 22 to 6)
    return hour >= this.activeHoursStart || hour < this.activeHoursEnd;
  }

  /**
   * Get a human-like duration for online/offline periods
   */
  getRandomDuration(min, max) {
    return Math.floor(min + Math.random() * (max - min));
  }

  /**
   * Go online with presence update
   */
  async goOnline() {
    if (!this.socket || this.isOnline) return;

    try {
      await this.socket.sendPresenceUpdate('available');
      this.isOnline = true;
      this.lastPresenceChange = Date.now();
      console.log('[Presence] Now ONLINE');
      this.saveState();
    } catch (err) {
      console.warn('[Presence] Failed to go online:', err.message);
    }
  }

  /**
   * Go offline with presence update
   */
  async goOffline() {
    if (!this.socket || !this.isOnline) return;

    try {
      await this.socket.sendPresenceUpdate('unavailable');
      this.isOnline = false;
      this.lastPresenceChange = Date.now();
      console.log('[Presence] Now OFFLINE');
      this.saveState();
    } catch (err) {
      console.warn('[Presence] Failed to go offline:', err.message);
    }
  }

  /**
   * Start automatic presence cycling
   */
  startPresenceCycle() {
    if (this.presenceInterval) {
      clearTimeout(this.presenceInterval);
    }

    const cycle = async () => {
      const withinActiveHours = this.isWithinActiveHours();

      if (!withinActiveHours) {
        // Outside active hours - stay offline
        if (this.isOnline) {
          await this.goOffline();
        }
        // Check again in 30 minutes
        this.presenceInterval = setTimeout(cycle, 30 * 60 * 1000);
        return;
      }

      // Within active hours - cycle between online/offline
      if (this.isOnline) {
        // Currently online, schedule going offline
        const onlineDuration = this.getRandomDuration(
          this.minOnlineDuration,
          this.maxOnlineDuration
        );

        this.presenceInterval = setTimeout(async () => {
          await this.goOffline();
          cycle();
        }, onlineDuration);

      } else {
        // Currently offline, schedule going online
        const offlineDuration = this.getRandomDuration(
          this.minOfflineDuration,
          this.maxOfflineDuration
        );

        this.presenceInterval = setTimeout(async () => {
          await this.goOnline();
          cycle();
        }, offlineDuration);
      }
    };

    // Start the cycle
    cycle();
  }

  /**
   * Stop presence cycling
   */
  stopPresenceCycle() {
    if (this.presenceInterval) {
      clearTimeout(this.presenceInterval);
      this.presenceInterval = null;
    }
  }

  /**
   * Temporarily go online for sending a message (auto-returns to cycle)
   */
  async temporaryOnline() {
    const wasOffline = !this.isOnline;

    if (wasOffline) {
      await this.goOnline();
    }

    return {
      wasOffline,
      restore: async () => {
        if (wasOffline) {
          // Stay online for a bit after sending, then go offline
          const stayOnline = humanDelay(30000, 0.5); // 30 seconds ± 50%
          setTimeout(() => this.goOffline(), stayOnline);
        }
      }
    };
  }

  getStatus() {
    return {
      isOnline: this.isOnline,
      withinActiveHours: this.isWithinActiveHours(),
      activeHours: `${this.activeHoursStart}:00 - ${this.activeHoursEnd}:00`,
      lastChange: this.lastPresenceChange,
      timeSinceChange: Date.now() - this.lastPresenceChange,
    };
  }

  loadState() {
    if (!this.sessionsDir) return;

    const stateFile = join(this.sessionsDir, '.presence-state.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        this.isOnline = data.isOnline || false;
        this.lastPresenceChange = data.lastPresenceChange || Date.now();
      }
    } catch (err) {
      // Ignore
    }
  }

  saveState() {
    if (!this.sessionsDir) return;

    const stateFile = join(this.sessionsDir, '.presence-state.json');
    try {
      writeFileSync(stateFile, JSON.stringify({
        isOnline: this.isOnline,
        lastPresenceChange: this.lastPresenceChange,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {
      // Ignore
    }
  }
}

// =============================================================================
// BAN EARLY WARNING SYSTEM
// =============================================================================

/**
 * Monitors for early warning signs of potential ban
 *
 * Warning signs tracked:
 * - Delivery failures (messages not delivered)
 * - Rate limit hits
 * - Connection instability
 * - Low response ratios
 * - Sudden blocks from recipients
 */
export class BanWarningSystem {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.onWarning = options.onWarning || ((warning) => console.warn('[BAN WARNING]', warning));
    this.onCritical = options.onCritical || ((warning) => console.error('[BAN CRITICAL]', warning));

    // Tracking metrics
    this.metrics = {
      deliveryFailures: 0,
      deliverySuccesses: 0,
      rateLimitHits: 0,
      connectionDrops: 0,
      blockedByRecipients: 0,
      lastReset: Date.now(),
    };

    // Thresholds for warnings
    this.thresholds = {
      deliveryFailureRate: 0.2,       // 20% failure rate triggers warning
      rateLimitHitsPerHour: 3,        // 3 rate limit hits per hour
      connectionDropsPerHour: 5,      // 5 connection drops per hour
      blockedThreshold: 2,            // 2 blocks in a day
    };

    // Warning levels
    this.WARNING_LEVELS = {
      NORMAL: 'normal',
      ELEVATED: 'elevated',
      HIGH: 'high',
      CRITICAL: 'critical',
    };

    this.currentLevel = this.WARNING_LEVELS.NORMAL;
    this.hibernationMode = false;

    this.loadMetrics();
  }

  /**
   * Record a successful message delivery
   */
  recordDeliverySuccess() {
    this.metrics.deliverySuccesses++;
    this.saveMetrics();
    this.evaluateRisk();
  }

  /**
   * Record a failed message delivery
   */
  recordDeliveryFailure(reason) {
    this.metrics.deliveryFailures++;
    this.saveMetrics();

    console.warn(`[Ban Warning] Delivery failure: ${reason}`);
    this.evaluateRisk();
  }

  /**
   * Record a rate limit hit
   */
  recordRateLimitHit() {
    this.metrics.rateLimitHits++;
    this.saveMetrics();

    console.warn('[Ban Warning] Rate limit hit');
    this.evaluateRisk();
  }

  /**
   * Record a connection drop
   */
  recordConnectionDrop() {
    this.metrics.connectionDrops++;
    this.saveMetrics();
    this.evaluateRisk();
  }

  /**
   * Record being blocked by a recipient
   */
  recordBlocked() {
    this.metrics.blockedByRecipients++;
    this.saveMetrics();

    console.warn('[Ban Warning] Blocked by recipient');
    this.evaluateRisk();
  }

  /**
   * Get current delivery failure rate
   */
  getDeliveryFailureRate() {
    const total = this.metrics.deliverySuccesses + this.metrics.deliveryFailures;
    if (total === 0) return 0;
    return this.metrics.deliveryFailures / total;
  }

  /**
   * Evaluate current risk level based on metrics
   */
  evaluateRisk() {
    const hoursSinceReset = (Date.now() - this.metrics.lastReset) / 3600000;
    const failureRate = this.getDeliveryFailureRate();
    const rateLimitRate = this.metrics.rateLimitHits / Math.max(hoursSinceReset, 1);
    const connectionDropRate = this.metrics.connectionDrops / Math.max(hoursSinceReset, 1);

    let riskScore = 0;
    const warnings = [];

    // Check delivery failure rate
    if (failureRate > this.thresholds.deliveryFailureRate) {
      riskScore += 2;
      warnings.push(`High delivery failure rate: ${(failureRate * 100).toFixed(1)}%`);
    }

    // Check rate limit hits
    if (rateLimitRate > this.thresholds.rateLimitHitsPerHour) {
      riskScore += 2;
      warnings.push(`Frequent rate limits: ${this.metrics.rateLimitHits} hits`);
    }

    // Check connection drops
    if (connectionDropRate > this.thresholds.connectionDropsPerHour) {
      riskScore += 1;
      warnings.push(`Connection unstable: ${this.metrics.connectionDrops} drops`);
    }

    // Check blocks
    if (this.metrics.blockedByRecipients >= this.thresholds.blockedThreshold) {
      riskScore += 3;
      warnings.push(`Multiple blocks: ${this.metrics.blockedByRecipients} users blocked you`);
    }

    // Determine warning level
    let newLevel = this.WARNING_LEVELS.NORMAL;
    if (riskScore >= 5) {
      newLevel = this.WARNING_LEVELS.CRITICAL;
    } else if (riskScore >= 3) {
      newLevel = this.WARNING_LEVELS.HIGH;
    } else if (riskScore >= 1) {
      newLevel = this.WARNING_LEVELS.ELEVATED;
    }

    // Trigger callbacks if level changed
    if (newLevel !== this.currentLevel) {
      this.currentLevel = newLevel;

      if (newLevel === this.WARNING_LEVELS.CRITICAL) {
        this.onCritical({
          level: newLevel,
          warnings,
          recommendation: 'STOP ALL AUTOMATION. Enter hibernation mode immediately.',
          metrics: this.getMetrics(),
        });
        this.hibernationMode = true;
      } else if (newLevel === this.WARNING_LEVELS.HIGH) {
        this.onWarning({
          level: newLevel,
          warnings,
          recommendation: 'Reduce message frequency significantly. Only respond to incoming messages.',
          metrics: this.getMetrics(),
        });
      } else if (newLevel === this.WARNING_LEVELS.ELEVATED) {
        this.onWarning({
          level: newLevel,
          warnings,
          recommendation: 'Monitor closely. Consider reducing activity.',
          metrics: this.getMetrics(),
        });
      }
    }

    return { level: this.currentLevel, riskScore, warnings };
  }

  /**
   * Check if safe to send (respects hibernation mode)
   */
  canSend() {
    if (this.hibernationMode) {
      return {
        allowed: false,
        reason: 'Hibernation mode active due to ban risk. Only respond to incoming messages.',
      };
    }

    if (this.currentLevel === this.WARNING_LEVELS.CRITICAL) {
      return {
        allowed: false,
        reason: 'Critical ban risk detected. Sending blocked.',
      };
    }

    return { allowed: true };
  }

  /**
   * Exit hibernation mode (manual override)
   */
  exitHibernation() {
    this.hibernationMode = false;
    console.log('[Ban Warning] Hibernation mode disabled');
  }

  /**
   * Reset metrics (call daily or after recovery period)
   */
  resetMetrics() {
    this.metrics = {
      deliveryFailures: 0,
      deliverySuccesses: 0,
      rateLimitHits: 0,
      connectionDrops: 0,
      blockedByRecipients: 0,
      lastReset: Date.now(),
    };
    this.currentLevel = this.WARNING_LEVELS.NORMAL;
    this.saveMetrics();
  }

  getMetrics() {
    return {
      ...this.metrics,
      deliveryFailureRate: (this.getDeliveryFailureRate() * 100).toFixed(1) + '%',
      currentLevel: this.currentLevel,
      hibernationMode: this.hibernationMode,
      hoursSinceReset: ((Date.now() - this.metrics.lastReset) / 3600000).toFixed(1),
    };
  }

  loadMetrics() {
    if (!this.sessionsDir) return;

    const metricsFile = join(this.sessionsDir, '.ban-warning-metrics.json');
    try {
      if (existsSync(metricsFile)) {
        const data = JSON.parse(readFileSync(metricsFile, 'utf-8'));

        // Only load if from today
        const today = new Date().toDateString();
        if (data.date === today) {
          this.metrics = data.metrics || this.metrics;
          this.currentLevel = data.currentLevel || this.WARNING_LEVELS.NORMAL;
          this.hibernationMode = data.hibernationMode || false;
        }
      }
    } catch (err) {
      // Ignore
    }
  }

  saveMetrics() {
    if (!this.sessionsDir) return;

    const metricsFile = join(this.sessionsDir, '.ban-warning-metrics.json');
    try {
      writeFileSync(metricsFile, JSON.stringify({
        date: new Date().toDateString(),
        metrics: this.metrics,
        currentLevel: this.currentLevel,
        hibernationMode: this.hibernationMode,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {
      // Ignore
    }
  }
}

// =============================================================================
// MESSAGE VARIATION
// =============================================================================

/**
 * Adds natural variation to messages to avoid content-based detection
 *
 * WhatsApp can detect when the same message is sent to multiple recipients.
 * This adds subtle variations while preserving meaning.
 */
export class MessageVariator {
  constructor() {
    // Track recently sent messages to avoid exact duplicates
    this.recentMessages = [];
    this.maxRecentMessages = 50;

    // Variation strategies
    this.punctuationVariants = {
      '.': ['.', '..', '...', '!'],
      '!': ['!', '!!', '!.', '.'],
      '?': ['?', '??', '?!', '..?'],
    };

    this.greetingVariants = {
      'hi': ['hi', 'hey', 'hello', 'halo', 'hai'],
      'hello': ['hello', 'hi', 'hey', 'halo'],
      'thanks': ['thanks', 'thank you', 'thx', 'makasih', 'terima kasih'],
      'ok': ['ok', 'okay', 'oke', 'siap', 'baik'],
      'yes': ['yes', 'ya', 'yup', 'iya', 'yep'],
      'no': ['no', 'tidak', 'nope', 'nggak', 'ga'],
    };

    // Indonesian casual variations
    this.indonesianVariants = {
      'apa': ['apa', 'apakah'],
      'tidak': ['tidak', 'nggak', 'ga', 'enggak'],
      'sudah': ['sudah', 'udah', 'sdh'],
      'belum': ['belum', 'blm'],
      'dengan': ['dengan', 'dgn', 'sama'],
      'yang': ['yang', 'yg'],
      'untuk': ['untuk', 'utk', 'buat'],
      'saya': ['saya', 'aku', 'gue'],
      'kamu': ['kamu', 'anda', 'lo'],
    };
  }

  /**
   * Apply variations to a message
   * @param {string} text - Original message
   * @param {number} variationLevel - 0-1, how much to vary (0.3 = 30% variation)
   * @returns {string} Varied message
   */
  vary(text, variationLevel = 0.3) {
    if (!text || text.length < 3) return text;

    let varied = text;

    // Only apply variations sometimes (based on variationLevel)
    if (Math.random() > variationLevel) {
      return this.addMinorVariation(varied);
    }

    // Apply greeting variations
    varied = this.varyGreetings(varied);

    // Apply Indonesian casual variations (if Indonesian text detected)
    if (this.isIndonesian(varied)) {
      varied = this.varyIndonesian(varied);
    }

    // Apply punctuation variations
    varied = this.varyPunctuation(varied);

    // Add or remove trailing spaces/newlines
    varied = this.varyWhitespace(varied);

    // Track this message
    this.trackMessage(text);

    return varied;
  }

  /**
   * Add minor variations (safe, minimal changes)
   */
  addMinorVariation(text) {
    const variations = [
      // Add/remove trailing period
      () => text.endsWith('.') ? text.slice(0, -1) : text + '.',
      // Add trailing space
      () => text + ' ',
      // Capitalize/lowercase first letter
      () => text.charAt(0) === text.charAt(0).toUpperCase()
        ? text.charAt(0).toLowerCase() + text.slice(1)
        : text.charAt(0).toUpperCase() + text.slice(1),
      // No change
      () => text,
    ];

    return variations[Math.floor(Math.random() * variations.length)]();
  }

  /**
   * Vary greetings and common words
   */
  varyGreetings(text) {
    let result = text;

    for (const [word, variants] of Object.entries(this.greetingVariants)) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      if (regex.test(result) && Math.random() > 0.5) {
        const variant = variants[Math.floor(Math.random() * variants.length)];
        result = result.replace(regex, variant);
        break; // Only replace one word per message
      }
    }

    return result;
  }

  /**
   * Check if text appears to be Indonesian
   */
  isIndonesian(text) {
    const indonesianIndicators = ['apa', 'yang', 'dan', 'dengan', 'untuk', 'ini', 'itu', 'dari'];
    const lowerText = text.toLowerCase();
    return indonesianIndicators.some(word => lowerText.includes(word));
  }

  /**
   * Apply Indonesian casual variations
   */
  varyIndonesian(text) {
    let result = text;

    for (const [word, variants] of Object.entries(this.indonesianVariants)) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      if (regex.test(result) && Math.random() > 0.6) {
        const variant = variants[Math.floor(Math.random() * variants.length)];
        result = result.replace(regex, variant);
        break; // Only replace one word per message
      }
    }

    return result;
  }

  /**
   * Vary punctuation
   */
  varyPunctuation(text) {
    if (Math.random() > 0.3) return text;

    const lastChar = text.slice(-1);
    if (this.punctuationVariants[lastChar]) {
      const variants = this.punctuationVariants[lastChar];
      const newPunct = variants[Math.floor(Math.random() * variants.length)];
      return text.slice(0, -1) + newPunct;
    }

    return text;
  }

  /**
   * Add minor whitespace variations
   */
  varyWhitespace(text) {
    if (Math.random() > 0.2) return text;

    const variations = [
      () => text.trim(),
      () => text.trim() + ' ',
      () => text.trim() + '\n',
      () => ' ' + text.trim(),
    ];

    return variations[Math.floor(Math.random() * variations.length)]();
  }

  /**
   * Track sent message to avoid duplicates
   */
  trackMessage(text) {
    this.recentMessages.push({
      text: text.toLowerCase().trim(),
      timestamp: Date.now(),
    });

    // Keep only recent messages
    if (this.recentMessages.length > this.maxRecentMessages) {
      this.recentMessages.shift();
    }
  }

  /**
   * Check if message was recently sent (potential duplicate)
   */
  isRecentDuplicate(text) {
    const normalizedText = text.toLowerCase().trim();
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    return this.recentMessages.some(
      msg => msg.text === normalizedText && msg.timestamp > fiveMinutesAgo
    );
  }

  /**
   * Get similarity score between two messages (0-1)
   */
  getSimilarity(text1, text2) {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }
}

// =============================================================================
// READ RECEIPT + READ DELAY
// =============================================================================

/**
 * Calculate realistic read delay based on message length
 * Humans need time to read before they can respond
 *
 * @param {string} incomingMessage - The message to "read"
 * @returns {number} Read delay in milliseconds
 */
export function calculateReadDelay(incomingMessage) {
  if (!incomingMessage) return humanDelay(1000, 0.5);

  // Average reading speed: ~200-250 words per minute
  // That's about 3-4 words per second, or ~250-350ms per word
  const words = incomingMessage.split(/\s+/).length;
  const msPerWord = humanDelay(300, 0.3); // ~300ms per word with variance

  // Base reading time
  let readTime = words * msPerWord;

  // Minimum 1 second, maximum 8 seconds
  readTime = Math.min(Math.max(readTime, 1000), 8000);

  // Add "comprehension" time for complex messages
  if (incomingMessage.includes('?')) {
    readTime += humanDelay(500, 0.5); // Questions need thinking
  }

  if (incomingMessage.length > 200) {
    readTime += humanDelay(1000, 0.5); // Long messages need more time
  }

  return Math.floor(readTime);
}

/**
 * Calculate thinking delay after reading, before typing
 * This simulates the human "processing" time
 *
 * @param {string} incomingMessage - The message being responded to
 * @param {string} response - The planned response
 * @returns {number} Thinking delay in milliseconds
 */
export function calculateThinkingDelay(incomingMessage, response) {
  // Base thinking time
  let thinkTime = humanDelay(1500, 0.5);

  // More thinking for longer responses (we're "composing" in our head)
  if (response && response.length > 100) {
    thinkTime += humanDelay(1000, 0.5);
  }

  // More thinking for complex incoming questions
  if (incomingMessage && incomingMessage.includes('?')) {
    thinkTime += humanDelay(800, 0.5);
  }

  // Cap at 5 seconds
  return Math.min(thinkTime, 5000);
}

/**
 * Full human-like read simulation
 * Returns all delays needed for realistic interaction
 *
 * @param {string} incomingMessage - Message received
 * @param {string} response - Response to send
 * @returns {{readDelay: number, thinkDelay: number, typingDuration: number, totalDelay: number}}
 */
export function simulateHumanReading(incomingMessage, response) {
  const readDelay = calculateReadDelay(incomingMessage);
  const thinkDelay = calculateThinkingDelay(incomingMessage, response);
  const typingDuration = calculateTypingDuration(response || '', 1000, 6000);

  return {
    readDelay,
    thinkDelay,
    typingDuration,
    totalDelay: readDelay + thinkDelay + typingDuration,
  };
}

// =============================================================================
// SMART MESSAGE SCHEDULING (Queue)
// =============================================================================

/**
 * Queues messages and sends them at optimal times
 * instead of immediately, to avoid burst patterns
 */
export class MessageScheduler {
  constructor(options = {}) {
    this.queue = [];
    this.processing = false;
    this.sendFunction = options.sendFunction; // Actual send function
    this.logger = options.logger || console;

    // Scheduling options
    this.minDelay = options.minDelay || 30000;       // 30 sec minimum between messages
    this.maxDelay = options.maxDelay || 120000;      // 2 min max delay
    this.batchSize = options.batchSize || 3;         // Process 3 messages then pause
    this.batchPause = options.batchPause || 300000;  // 5 min pause between batches

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
      priority, // 'high' (reply), 'normal', 'low' (broadcast)
      enqueuedAt: Date.now(),
    };

    // High priority messages go to front
    if (priority === 'high') {
      this.queue.unshift(message);
    } else {
      this.queue.push(message);
    }

    this.logger.debug({ queueLength: this.queue.length, priority }, 'Message enqueued');

    // Start processing if not already
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
      // Check if we need batch pause
      if (this.messagesSentInBatch >= this.batchSize) {
        const pauseTime = humanDelay(this.batchPause, 0.3);
        this.logger.info({ pauseTime, batchSize: this.batchSize }, 'Batch pause');
        await new Promise(resolve => setTimeout(resolve, pauseTime));
        this.messagesSentInBatch = 0;
      }

      // Calculate delay since last message
      const timeSinceLast = Date.now() - this.lastSendTime;
      const requiredDelay = humanDelay(this.minDelay, 0.4);

      if (timeSinceLast < requiredDelay) {
        const waitTime = requiredDelay - timeSinceLast;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      // Get next message (prioritize high priority)
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
        // Re-queue with lower priority on failure
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

// =============================================================================
// DELIVERY STATUS TRACKING
// =============================================================================

/**
 * Tracks message delivery status to detect blocks/failures early
 * WhatsApp shows: ✓ (sent) → ✓✓ (delivered) → ✓✓ blue (read)
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

// =============================================================================
// GRADUAL RAMP AFTER DOWNTIME
// =============================================================================

/**
 * After being offline for extended periods, gradually ramp up activity
 * to avoid sudden burst of messages which looks suspicious
 */
export class ActivityRamper {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
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

  loadState() {
    if (!this.sessionsDir) return;

    const stateFile = join(this.sessionsDir, '.activity-ramp-state.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        this.lastActiveTime = data.lastActiveTime || Date.now();
      }
    } catch (err) {
      // Ignore
    }
  }

  saveState() {
    if (!this.sessionsDir) return;

    const stateFile = join(this.sessionsDir, '.activity-ramp-state.json');
    try {
      writeFileSync(stateFile, JSON.stringify({
        lastActiveTime: this.lastActiveTime,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {
      // Ignore
    }
  }
}

// =============================================================================
// WEEKEND/HOLIDAY PATTERNS
// =============================================================================

/**
 * Adjusts behavior based on day of week
 * Weekends typically have more casual, slower messaging patterns
 */
export class WeekendPatterns {
  constructor(options = {}) {
    // Weekend days (0 = Sunday, 6 = Saturday)
    this.weekendDays = options.weekendDays || [0, 6];

    // Holiday dates (MM-DD format)
    this.holidays = options.holidays || [
      '01-01', // New Year
      '12-25', // Christmas
      '12-31', // New Year's Eve
    ];

    // Adjustments
    this.weekendMultiplier = options.weekendMultiplier || 0.6;   // 60% activity on weekends
    this.holidayMultiplier = options.holidayMultiplier || 0.4;   // 40% activity on holidays
    this.weekendDelayBonus = options.weekendDelayBonus || 1.5;   // 50% longer delays
  }

  /**
   * Check if today is a weekend
   */
  isWeekend() {
    const day = new Date().getDay();
    return this.weekendDays.includes(day);
  }

  /**
   * Check if today is a holiday
   */
  isHoliday() {
    const today = new Date();
    const mmdd = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return this.holidays.includes(mmdd);
  }

  /**
   * Get rate multiplier for today
   */
  getRateMultiplier() {
    if (this.isHoliday()) return this.holidayMultiplier;
    if (this.isWeekend()) return this.weekendMultiplier;
    return 1.0;
  }

  /**
   * Get delay multiplier for today
   */
  getDelayMultiplier() {
    if (this.isHoliday()) return 2.0;  // Double delays on holidays
    if (this.isWeekend()) return this.weekendDelayBonus;
    return 1.0;
  }

  /**
   * Adjust a rate limit based on day
   */
  adjustLimit(baseLimit) {
    return Math.max(1, Math.floor(baseLimit * this.getRateMultiplier()));
  }

  /**
   * Adjust a delay based on day
   */
  adjustDelay(baseDelay) {
    return Math.floor(baseDelay * this.getDelayMultiplier());
  }

  getStatus() {
    return {
      isWeekend: this.isWeekend(),
      isHoliday: this.isHoliday(),
      rateMultiplier: (this.getRateMultiplier() * 100).toFixed(0) + '%',
      delayMultiplier: this.getDelayMultiplier().toFixed(1) + 'x',
      dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()],
    };
  }
}

// =============================================================================
// TYPING CORRECTIONS SIMULATION
// =============================================================================

/**
 * Simulates human typing with occasional "corrections"
 * Shows typing → pause → typing again (like fixing a typo)
 */
export class TypingSimulator {
  constructor(options = {}) {
    // Probability of "correction" pause during typing
    this.correctionProbability = options.correctionProbability || 0.15; // 15% chance
    this.correctionPauseMin = options.correctionPauseMin || 500;         // 0.5 sec
    this.correctionPauseMax = options.correctionPauseMax || 2000;        // 2 sec
  }

  /**
   * Generate a typing sequence with possible corrections
   * @param {number} baseDuration - Base typing duration
   * @returns {Array<{action: string, duration: number}>} Sequence of actions
   */
  generateTypingSequence(baseDuration) {
    const sequence = [];

    // Should we add a correction?
    if (Math.random() < this.correctionProbability && baseDuration > 2000) {
      // Split typing into two parts with a pause
      const splitPoint = 0.3 + Math.random() * 0.4; // 30-70% through

      const firstPart = Math.floor(baseDuration * splitPoint);
      const pauseDuration = this.correctionPauseMin +
        Math.floor(Math.random() * (this.correctionPauseMax - this.correctionPauseMin));
      const secondPart = baseDuration - firstPart;

      sequence.push({ action: 'composing', duration: firstPart });
      sequence.push({ action: 'paused', duration: pauseDuration });  // "Thinking" or "correcting"
      sequence.push({ action: 'composing', duration: secondPart });
    } else {
      // Normal typing
      sequence.push({ action: 'composing', duration: baseDuration });
    }

    return sequence;
  }

  /**
   * Execute typing sequence on socket
   */
  async executeSequence(socket, jid, sequence) {
    const { delay } = await import('@whiskeysockets/baileys');

    for (const step of sequence) {
      await socket.sendPresenceUpdate(step.action, jid);
      await delay(step.duration);
    }
  }
}

// =============================================================================
// EMOJI USAGE PATTERNS
// =============================================================================

/**
 * Adds natural emoji usage to messages
 * Humans often end messages with relevant emojis
 */
export class EmojiEnhancer {
  constructor(options = {}) {
    this.probability = options.probability || 0.25; // 25% of messages get emoji

    // Context-based emojis
    this.emojiPatterns = {
      greeting: ['👋', '😊', '🙂', 'hi', 'hello', 'hey', 'halo'],
      thanks: ['🙏', '😊', '❤️', 'thanks', 'thank', 'makasih', 'terima kasih'],
      goodbye: ['👋', '😊', '🙂', 'bye', 'goodbye', 'sampai jumpa', 'dadah'],
      question: ['🤔', '❓', '?'],
      positive: ['👍', '✅', '😊', '🎉', 'ok', 'yes', 'sure', 'great', 'bagus', 'oke', 'siap'],
      negative: ['😅', '😔', 'sorry', 'tidak', 'no', 'maaf'],
      excited: ['🎉', '🔥', '💪', '!', 'wow', 'amazing', 'keren', 'mantap'],
    };

    // General emojis for random addition
    this.generalEmojis = ['😊', '🙂', '👍', '✨', '💫'];
  }

  /**
   * Maybe add emoji to message
   */
  maybeAddEmoji(text) {
    if (!text || text.length < 5) return text;
    if (Math.random() > this.probability) return text;

    // Check if already has emoji
    if (/[\u{1F300}-\u{1F9FF}]/u.test(text)) return text;

    const lowerText = text.toLowerCase();
    let emoji = null;

    // Find contextual emoji
    for (const [context, patterns] of Object.entries(this.emojiPatterns)) {
      const emojis = patterns.filter(p => /[\u{1F300}-\u{1F9FF}]/u.test(p) || p.length <= 2);
      const keywords = patterns.filter(p => p.length > 2);

      if (keywords.some(k => lowerText.includes(k))) {
        emoji = emojis[Math.floor(Math.random() * emojis.length)];
        break;
      }
    }

    // Use general emoji if no context match
    if (!emoji) {
      emoji = this.generalEmojis[Math.floor(Math.random() * this.generalEmojis.length)];
    }

    // Add emoji (sometimes at end, rarely at start)
    if (Math.random() > 0.1) {
      return text.trim() + ' ' + emoji;
    } else {
      return emoji + ' ' + text.trim();
    }
  }
}

// =============================================================================
// CONTACT WARMUP TRACKING
// =============================================================================

/**
 * Tracks new contacts and enforces warmup period
 * Don't blast new contacts immediately after adding them
 */
export class ContactWarmup {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.contacts = new Map(); // phone -> { firstContact, messageCount, lastMessage }

    // Warmup settings
    this.warmupPeriod = options.warmupPeriod || 7 * 24 * 60 * 60 * 1000;  // 7 days
    this.initialDailyLimit = options.initialDailyLimit || 2;               // 2 msgs/day for new contacts
    this.warmupDailyLimit = options.warmupDailyLimit || 5;                // 5 msgs/day during warmup
    this.normalDailyLimit = options.normalDailyLimit || 20;               // 20 msgs/day after warmup

    this.loadContacts();
  }

  /**
   * Record contact interaction
   */
  recordContact(phone) {
    const now = Date.now();
    const existing = this.contacts.get(phone);

    if (!existing) {
      this.contacts.set(phone, {
        firstContact: now,
        messageCount: 1,
        messagesThisPeriod: 1,
        periodStart: now,
        lastMessage: now,
      });
    } else {
      existing.messageCount++;
      existing.lastMessage = now;

      // Reset period counter if new day
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      if (existing.periodStart < oneDayAgo) {
        existing.messagesThisPeriod = 1;
        existing.periodStart = now;
      } else {
        existing.messagesThisPeriod++;
      }

      this.contacts.set(phone, existing);
    }

    this.saveContacts();
  }

  /**
   * Check if we can message this contact
   */
  canMessage(phone) {
    const contact = this.contacts.get(phone);
    const now = Date.now();

    if (!contact) {
      // New contact - allow but will be tracked
      return { allowed: true, isNew: true, dailyLimit: this.initialDailyLimit };
    }

    const contactAge = now - contact.firstContact;
    let dailyLimit;

    if (contactAge < 24 * 60 * 60 * 1000) {
      // First day - very limited
      dailyLimit = this.initialDailyLimit;
    } else if (contactAge < this.warmupPeriod) {
      // Warmup period
      dailyLimit = this.warmupDailyLimit;
    } else {
      // Warmed up
      dailyLimit = this.normalDailyLimit;
    }

    if (contact.messagesThisPeriod >= dailyLimit) {
      return {
        allowed: false,
        reason: `Daily limit for this contact reached (${dailyLimit}/day during warmup)`,
        contactAge: Math.floor(contactAge / (24 * 60 * 60 * 1000)),
      };
    }

    return { allowed: true, dailyLimit, remaining: dailyLimit - contact.messagesThisPeriod };
  }

  /**
   * Get contact warmup status
   */
  getContactStatus(phone) {
    const contact = this.contacts.get(phone);
    if (!contact) {
      return { status: 'new', warmupDaysRemaining: 7 };
    }

    const now = Date.now();
    const contactAge = now - contact.firstContact;
    const warmupDaysRemaining = Math.max(0, Math.ceil((this.warmupPeriod - contactAge) / (24 * 60 * 60 * 1000)));

    return {
      status: warmupDaysRemaining > 0 ? 'warming' : 'warmed',
      firstContact: contact.firstContact,
      messageCount: contact.messageCount,
      messagesThisPeriod: contact.messagesThisPeriod,
      warmupDaysRemaining,
    };
  }

  loadContacts() {
    if (!this.sessionsDir) return;

    const contactsFile = join(this.sessionsDir, '.contact-warmup.json');
    try {
      if (existsSync(contactsFile)) {
        const data = JSON.parse(readFileSync(contactsFile, 'utf-8'));
        this.contacts = new Map(Object.entries(data.contacts || {}));
      }
    } catch (err) {
      // Ignore
    }
  }

  saveContacts() {
    if (!this.sessionsDir) return;

    const contactsFile = join(this.sessionsDir, '.contact-warmup.json');
    try {
      const obj = {};
      for (const [k, v] of this.contacts) {
        obj[k] = v;
      }
      writeFileSync(contactsFile, JSON.stringify({ contacts: obj, savedAt: Date.now() }, null, 2));
    } catch (err) {
      // Ignore
    }
  }
}

// =============================================================================
// GROUP VS DM BEHAVIOR
// =============================================================================

/**
 * Different behavior patterns for groups vs individual chats
 * Groups: less formal, more delay, lower response rate
 */
export class GroupBehavior {
  constructor(options = {}) {
    // Group detection
    this.groupSuffix = '@g.us';

    // Group-specific settings
    this.groupDelayMultiplier = options.groupDelayMultiplier || 2.0;   // 2x slower in groups
    this.groupResponseProbability = options.groupResponseProbability || 0.7; // 70% response rate in groups
    this.groupTypingMultiplier = options.groupTypingMultiplier || 1.3;  // Slightly longer typing
  }

  /**
   * Check if JID is a group
   */
  isGroup(jid) {
    return jid && jid.endsWith(this.groupSuffix);
  }

  /**
   * Should we respond to this group message?
   */
  shouldRespondInGroup() {
    return Math.random() < this.groupResponseProbability;
  }

  /**
   * Adjust delay for group context
   */
  adjustDelay(baseDelay, jid) {
    if (this.isGroup(jid)) {
      return Math.floor(baseDelay * this.groupDelayMultiplier);
    }
    return baseDelay;
  }

  /**
   * Adjust typing duration for group context
   */
  adjustTypingDuration(baseDuration, jid) {
    if (this.isGroup(jid)) {
      return Math.floor(baseDuration * this.groupTypingMultiplier);
    }
    return baseDuration;
  }

  getConfig(jid) {
    const isGroup = this.isGroup(jid);
    return {
      isGroup,
      delayMultiplier: isGroup ? this.groupDelayMultiplier : 1.0,
      typingMultiplier: isGroup ? this.groupTypingMultiplier : 1.0,
      responseProbability: isGroup ? this.groupResponseProbability : 1.0,
    };
  }
}

// =============================================================================
// NETWORK FINGERPRINT CONSISTENCY
// =============================================================================

/**
 * Ensures consistent network fingerprint to avoid detection
 * Tracks and validates IP/network patterns
 */
export class NetworkFingerprint {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.lastKnownIP = null;
    this.ipHistory = [];
    this.maxHistorySize = 100;

    // Warning thresholds
    this.ipChangeWarningThreshold = 3;  // Warn if IP changes > 3 times in 24h
    this.suspiciousPatterns = [
      /^10\./,       // Private network (might indicate VPN hopping)
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
    ];

    this.loadState();
  }

  /**
   * Record current IP (call periodically)
   */
  async recordIP() {
    try {
      // Try to get external IP (you'd implement actual IP fetch)
      const ip = await this.fetchExternalIP();
      if (!ip) return;

      const now = Date.now();

      if (this.lastKnownIP && this.lastKnownIP !== ip) {
        this.ipHistory.push({
          from: this.lastKnownIP,
          to: ip,
          timestamp: now,
        });

        // Trim history
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
   * Fetch external IP (placeholder - implement with actual service)
   */
  async fetchExternalIP() {
    // This would call an IP service like ipify.org
    // For now, return null (user can implement)
    return null;
  }

  /**
   * Check network health/consistency
   */
  checkNetworkHealth() {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const warnings = [];

    // Count IP changes in last 24 hours
    const recentChanges = this.ipHistory.filter(h => h.timestamp > oneDayAgo);
    if (recentChanges.length >= this.ipChangeWarningThreshold) {
      warnings.push(`IP changed ${recentChanges.length} times in 24h (suspicious)`);
    }

    // Check for suspicious IP patterns
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
   * Get recommended actions based on network state
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
    } catch (err) {
      // Ignore
    }
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
    } catch (err) {
      // Ignore
    }
  }
}

// =============================================================================
// PHASE 3: REACTION USAGE
// =============================================================================

/**
 * Manages adding reactions to incoming messages
 * Humans react to messages - bots typically don't
 */
export class ReactionManager {
  constructor(options = {}) {
    this.socket = null;
    this.reactionProbability = options.reactionProbability || 0.15; // 15% of messages get reaction

    // Common reactions with weights
    this.reactions = [
      { emoji: '👍', weight: 30 },   // Most common
      { emoji: '❤️', weight: 20 },
      { emoji: '😂', weight: 15 },
      { emoji: '😊', weight: 10 },
      { emoji: '🙏', weight: 10 },
      { emoji: '👏', weight: 5 },
      { emoji: '🔥', weight: 5 },
      { emoji: '💯', weight: 5 },
    ];

    // Context-based reactions
    this.contextReactions = {
      thanks: ['🙏', '❤️', '😊'],
      funny: ['😂', '🤣', '😆'],
      good: ['👍', '💯', '🔥', '👏'],
      love: ['❤️', '😍', '💕'],
      sad: ['😔', '🙏', '❤️'],
      question: ['🤔', '👍'],
    };

    this.totalWeight = this.reactions.reduce((sum, r) => sum + r.weight, 0);
  }

  setSocket(socket) {
    this.socket = socket;
  }

  /**
   * Decide if we should react to a message
   */
  shouldReact(messageText) {
    return Math.random() < this.reactionProbability;
  }

  /**
   * Get appropriate reaction based on message content
   */
  getReaction(messageText) {
    const lowerText = messageText.toLowerCase();

    // Check for context matches
    if (/thank|makasih|terima kasih|thx/i.test(lowerText)) {
      return this.pickFrom(this.contextReactions.thanks);
    }
    if (/haha|lol|wkwk|😂|🤣/i.test(lowerText)) {
      return this.pickFrom(this.contextReactions.funny);
    }
    if (/bagus|mantap|keren|great|awesome|nice/i.test(lowerText)) {
      return this.pickFrom(this.contextReactions.good);
    }
    if (/love|sayang|cinta|❤️|💕/i.test(lowerText)) {
      return this.pickFrom(this.contextReactions.love);
    }
    if (/sedih|sad|sorry|maaf/i.test(lowerText)) {
      return this.pickFrom(this.contextReactions.sad);
    }
    if (/\?$/.test(lowerText.trim())) {
      return this.pickFrom(this.contextReactions.question);
    }

    // Random weighted reaction
    return this.pickWeightedRandom();
  }

  pickFrom(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  pickWeightedRandom() {
    let random = Math.random() * this.totalWeight;
    for (const reaction of this.reactions) {
      random -= reaction.weight;
      if (random <= 0) return reaction.emoji;
    }
    return '👍';
  }

  /**
   * React to a message with delay
   */
  async maybeReact(messageKey, messageText) {
    if (!this.socket || !this.shouldReact(messageText)) return false;

    const reaction = this.getReaction(messageText);

    // Delay reaction (humans don't react instantly)
    const reactionDelay = humanDelay(3000, 0.5); // 3 seconds ± 50%
    await new Promise(resolve => setTimeout(resolve, reactionDelay));

    try {
      await this.socket.sendMessage(messageKey.remoteJid, {
        react: {
          text: reaction,
          key: messageKey,
        }
      });
      return true;
    } catch (err) {
      // Ignore reaction errors
      return false;
    }
  }
}

// =============================================================================
// PHASE 3: REPLY PROBABILITY
// =============================================================================

/**
 * Controls whether to reply to messages
 * Humans don't reply to every single message
 */
export class ReplyProbability {
  constructor(options = {}) {
    this.baseReplyRate = options.baseReplyRate || 0.9; // 90% reply rate
    this.sessionsDir = options.sessionsDir;

    // Track message patterns per contact
    this.contactPatterns = new Map();

    // Factors that affect reply probability
    this.factors = {
      directQuestion: 1.0,      // Always reply to direct questions
      greeting: 0.95,           // Almost always reply to greetings
      shortMessage: 0.85,       // Single word/emoji messages
      longMessage: 0.92,        // Long thoughtful messages
      rapidFire: 0.5,           // Multiple messages in quick succession
      lateNight: 0.7,           // Late night messages
      media: 0.8,               // Media messages
    };
  }

  /**
   * Determine if we should reply to a message
   */
  shouldReply(message, context = {}) {
    const text = message.text || '';
    const from = message.from;
    const now = new Date();
    const hour = now.getHours();

    let probability = this.baseReplyRate;

    // Direct questions always get replies
    if (text.includes('?') || /^(apa|siapa|kapan|dimana|bagaimana|kenapa|berapa)/i.test(text)) {
      return { shouldReply: true, reason: 'direct_question', probability: 1.0 };
    }

    // Greetings almost always get replies
    if (/^(hi|hello|hey|halo|hai|assalam|selamat)/i.test(text.trim())) {
      probability = this.factors.greeting;
    }

    // Short messages (emoji only, single word)
    if (text.length < 5) {
      probability *= this.factors.shortMessage;
    }

    // Late night (11 PM - 6 AM)
    if (hour >= 23 || hour < 6) {
      probability *= this.factors.lateNight;
    }

    // Check for rapid fire messages from same contact
    const pattern = this.contactPatterns.get(from);
    if (pattern && pattern.lastMessageTime) {
      const timeSince = Date.now() - pattern.lastMessageTime;
      if (timeSince < 30000) { // Less than 30 seconds
        probability *= this.factors.rapidFire;
      }
    }

    // Update contact pattern
    this.updateContactPattern(from);

    // Make the decision
    const shouldReply = Math.random() < probability;

    return {
      shouldReply,
      probability: Math.round(probability * 100),
      reason: shouldReply ? 'probability_passed' : 'probability_skipped',
    };
  }

  updateContactPattern(from) {
    const existing = this.contactPatterns.get(from) || {
      messageCount: 0,
      lastMessageTime: null,
    };

    existing.messageCount++;
    existing.lastMessageTime = Date.now();

    this.contactPatterns.set(from, existing);
  }

  /**
   * Get "no reply" message for logging
   */
  getSkipReason() {
    const reasons = [
      'Simulating busy moment',
      'Message noted but not replied',
      'Will reply later (simulated)',
      'Natural conversation pause',
    ];
    return reasons[Math.floor(Math.random() * reasons.length)];
  }
}

// =============================================================================
// PHASE 3: MESSAGE LENGTH LIMITS / SPLITTING
// =============================================================================

/**
 * Handles message length limits and natural splitting
 * Very long automated messages look suspicious
 */
export class MessageSplitter {
  constructor(options = {}) {
    this.maxLength = options.maxLength || 500;          // Max chars per message
    this.splitThreshold = options.splitThreshold || 300; // Start considering split
    this.minDelay = options.minDelay || 1500;            // Min delay between parts
    this.maxDelay = options.maxDelay || 4000;            // Max delay between parts
  }

  /**
   * Check if message should be split
   */
  shouldSplit(text) {
    return text.length > this.splitThreshold;
  }

  /**
   * Split message into natural parts
   */
  split(text) {
    if (text.length <= this.maxLength) {
      return [text];
    }

    const parts = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= this.maxLength) {
        parts.push(remaining);
        break;
      }

      // Find good split points (in order of preference)
      let splitIndex = -1;
      const searchRange = remaining.substring(0, this.maxLength);

      // Try to split at paragraph
      const paragraphIndex = searchRange.lastIndexOf('\n\n');
      if (paragraphIndex > this.maxLength * 0.3) {
        splitIndex = paragraphIndex;
      }

      // Try to split at sentence
      if (splitIndex === -1) {
        const sentenceEnds = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
        for (const end of sentenceEnds) {
          const idx = searchRange.lastIndexOf(end);
          if (idx > this.maxLength * 0.3 && idx > splitIndex) {
            splitIndex = idx + end.length - 1;
          }
        }
      }

      // Try to split at comma or semicolon
      if (splitIndex === -1) {
        const commaIndex = searchRange.lastIndexOf(', ');
        const semiIndex = searchRange.lastIndexOf('; ');
        splitIndex = Math.max(commaIndex, semiIndex);
      }

      // Last resort: split at space
      if (splitIndex === -1 || splitIndex < this.maxLength * 0.3) {
        splitIndex = searchRange.lastIndexOf(' ');
      }

      // Absolute last resort: hard split
      if (splitIndex === -1) {
        splitIndex = this.maxLength;
      }

      parts.push(remaining.substring(0, splitIndex + 1).trim());
      remaining = remaining.substring(splitIndex + 1).trim();
    }

    return parts;
  }

  /**
   * Get delay between message parts
   */
  getPartDelay() {
    return humanDelay((this.minDelay + this.maxDelay) / 2, 0.4);
  }

  /**
   * Add continuation indicators
   */
  addContinuationIndicators(parts) {
    if (parts.length <= 1) return parts;

    return parts.map((part, index) => {
      if (index < parts.length - 1) {
        // Add continuation hint sometimes
        if (Math.random() < 0.3) {
          return part + '...';
        }
      }
      return part;
    });
  }
}

// =============================================================================
// PHASE 3: STATUS/STORY VIEWING
// =============================================================================

/**
 * Simulates viewing WhatsApp statuses/stories
 * Bots never view statuses - humans do regularly
 */
export class StatusViewer {
  constructor(options = {}) {
    this.socket = null;
    this.sessionsDir = options.sessionsDir;

    // Viewing schedule
    this.viewInterval = options.viewInterval || 2 * 60 * 60 * 1000; // Check every 2 hours
    this.viewProbability = options.viewProbability || 0.6; // 60% chance to view when checking

    // Track viewed statuses
    this.viewedStatuses = new Set();
    this.lastViewTime = 0;
    this.viewTimer = null;

    this.loadState();
  }

  setSocket(socket) {
    this.socket = socket;
  }

  /**
   * Start automatic status viewing
   */
  startViewing() {
    if (this.viewTimer) return;

    this.viewTimer = setInterval(() => {
      this.maybeViewStatuses();
    }, this.viewInterval);

    // Initial view after random delay
    const initialDelay = humanDelay(5 * 60 * 1000, 0.5); // 5 min ± 50%
    setTimeout(() => this.maybeViewStatuses(), initialDelay);
  }

  stopViewing() {
    if (this.viewTimer) {
      clearInterval(this.viewTimer);
      this.viewTimer = null;
    }
  }

  /**
   * Maybe view some statuses
   */
  async maybeViewStatuses() {
    if (!this.socket || Math.random() > this.viewProbability) return;

    try {
      // Get status list (this is a simplified version)
      // In real implementation, you'd fetch actual statuses
      console.log('[StatusViewer] Simulating status viewing behavior');
      this.lastViewTime = Date.now();
      this.saveState();
    } catch (err) {
      // Ignore errors
    }
  }

  /**
   * View a specific contact's status
   */
  async viewContactStatus(jid) {
    if (!this.socket) return;

    try {
      // Mark status as read with realistic delay
      const viewDelay = humanDelay(2000, 0.5);
      await new Promise(resolve => setTimeout(resolve, viewDelay));

      // In Baileys, viewing status is implicit when fetching
      // This is a placeholder for the actual implementation
      this.viewedStatuses.add(jid);
    } catch (err) {
      // Ignore
    }
  }

  getStatus() {
    return {
      lastViewTime: this.lastViewTime,
      viewedCount: this.viewedStatuses.size,
      isActive: this.viewTimer !== null,
    };
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.status-viewer-state.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        this.lastViewTime = data.lastViewTime || 0;
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.status-viewer-state.json');
    try {
      writeFileSync(stateFile, JSON.stringify({
        lastViewTime: this.lastViewTime,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

// =============================================================================
// PHASE 3: SPAM REPORT DETECTION
// =============================================================================

/**
 * Detects patterns that suggest you've been reported for spam
 * Warning signs: sudden delivery failures, blocks, rate limits
 */
export class SpamReportDetector {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.onSpamWarning = options.onSpamWarning || (() => {});

    // Tracking windows
    this.metrics = {
      recentDeliveryFailures: [],
      recentBlocks: [],
      recentRateLimits: [],
      suddenDrops: [],
    };

    // Thresholds
    this.thresholds = {
      deliveryFailuresPerHour: 3,
      blocksPerDay: 2,
      rateLimitsPerHour: 2,
      suddenDropThreshold: 0.5, // 50% drop in delivery rate
    };

    // Historical delivery rate for comparison
    this.historicalDeliveryRate = 0.95;

    this.loadMetrics();
  }

  /**
   * Record a delivery failure
   */
  recordDeliveryFailure(to, reason) {
    this.metrics.recentDeliveryFailures.push({
      to,
      reason,
      timestamp: Date.now(),
    });
    this.cleanOldMetrics();
    this.analyzePatterns();
    this.saveMetrics();
  }

  /**
   * Record being blocked
   */
  recordBlock(by) {
    this.metrics.recentBlocks.push({
      by,
      timestamp: Date.now(),
    });
    this.cleanOldMetrics();
    this.analyzePatterns();
    this.saveMetrics();
  }

  /**
   * Record rate limit hit
   */
  recordRateLimit() {
    this.metrics.recentRateLimits.push({
      timestamp: Date.now(),
    });
    this.cleanOldMetrics();
    this.analyzePatterns();
    this.saveMetrics();
  }

  /**
   * Record delivery rate for trend analysis
   */
  recordDeliveryRate(rate) {
    if (rate < this.historicalDeliveryRate * this.thresholds.suddenDropThreshold) {
      this.metrics.suddenDrops.push({
        rate,
        expected: this.historicalDeliveryRate,
        timestamp: Date.now(),
      });
      this.analyzePatterns();
    }

    // Update historical average (exponential moving average)
    this.historicalDeliveryRate = 0.9 * this.historicalDeliveryRate + 0.1 * rate;
    this.saveMetrics();
  }

  /**
   * Clean metrics older than 24 hours
   */
  cleanOldMetrics() {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    this.metrics.recentDeliveryFailures = this.metrics.recentDeliveryFailures
      .filter(m => m.timestamp > oneHourAgo);
    this.metrics.recentBlocks = this.metrics.recentBlocks
      .filter(m => m.timestamp > oneDayAgo);
    this.metrics.recentRateLimits = this.metrics.recentRateLimits
      .filter(m => m.timestamp > oneHourAgo);
    this.metrics.suddenDrops = this.metrics.suddenDrops
      .filter(m => m.timestamp > oneDayAgo);
  }

  /**
   * Analyze patterns for spam report indicators
   */
  analyzePatterns() {
    const warnings = [];
    let riskLevel = 'normal';

    // Check delivery failures
    if (this.metrics.recentDeliveryFailures.length >= this.thresholds.deliveryFailuresPerHour) {
      warnings.push({
        type: 'delivery_failures',
        count: this.metrics.recentDeliveryFailures.length,
        message: `${this.metrics.recentDeliveryFailures.length} delivery failures in last hour`,
      });
      riskLevel = 'elevated';
    }

    // Check blocks
    if (this.metrics.recentBlocks.length >= this.thresholds.blocksPerDay) {
      warnings.push({
        type: 'blocks',
        count: this.metrics.recentBlocks.length,
        message: `Blocked by ${this.metrics.recentBlocks.length} users in last 24h`,
      });
      riskLevel = 'high';
    }

    // Check rate limits
    if (this.metrics.recentRateLimits.length >= this.thresholds.rateLimitsPerHour) {
      warnings.push({
        type: 'rate_limits',
        count: this.metrics.recentRateLimits.length,
        message: `Hit rate limit ${this.metrics.recentRateLimits.length} times in last hour`,
      });
      riskLevel = riskLevel === 'high' ? 'critical' : 'high';
    }

    // Check sudden drops
    if (this.metrics.suddenDrops.length > 0) {
      warnings.push({
        type: 'delivery_drop',
        message: 'Sudden drop in delivery rate detected',
      });
      riskLevel = 'critical';
    }

    if (warnings.length > 0) {
      this.onSpamWarning({
        riskLevel,
        warnings,
        recommendation: this.getRecommendation(riskLevel),
        timestamp: Date.now(),
      });
    }

    return { riskLevel, warnings };
  }

  getRecommendation(riskLevel) {
    switch (riskLevel) {
      case 'critical':
        return 'STOP all messaging immediately. You may have been reported. Wait 24-48 hours.';
      case 'high':
        return 'Reduce messaging significantly. Only respond to incoming messages.';
      case 'elevated':
        return 'Monitor closely. Reduce outbound messaging by 50%.';
      default:
        return 'Continue normal operation.';
    }
  }

  getMetrics() {
    return {
      recentDeliveryFailures: this.metrics.recentDeliveryFailures.length,
      recentBlocks: this.metrics.recentBlocks.length,
      recentRateLimits: this.metrics.recentRateLimits.length,
      suddenDrops: this.metrics.suddenDrops.length,
      historicalDeliveryRate: (this.historicalDeliveryRate * 100).toFixed(1) + '%',
      analysis: this.analyzePatterns(),
    };
  }

  loadMetrics() {
    if (!this.sessionsDir) return;
    const metricsFile = join(this.sessionsDir, '.spam-detection-metrics.json');
    try {
      if (existsSync(metricsFile)) {
        const data = JSON.parse(readFileSync(metricsFile, 'utf-8'));
        if (data.date === new Date().toDateString()) {
          this.metrics = data.metrics || this.metrics;
          this.historicalDeliveryRate = data.historicalDeliveryRate || 0.95;
        }
      }
    } catch (err) {}
  }

  saveMetrics() {
    if (!this.sessionsDir) return;
    const metricsFile = join(this.sessionsDir, '.spam-detection-metrics.json');
    try {
      writeFileSync(metricsFile, JSON.stringify({
        date: new Date().toDateString(),
        metrics: this.metrics,
        historicalDeliveryRate: this.historicalDeliveryRate,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

// =============================================================================
// PHASE 3: GEOGRAPHIC IP MATCHING
// =============================================================================

/**
 * Validates that IP location matches phone country
 * Mismatch can trigger suspicion
 */
export class GeoIPMatcher {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.phoneCountry = null;
    this.currentIPCountry = null;
    this.mismatchWarnings = 0;

    // Country codes from phone prefixes
    this.phonePrefixes = {
      '62': 'ID',  // Indonesia
      '1': 'US',   // USA/Canada
      '44': 'GB',  // UK
      '60': 'MY',  // Malaysia
      '65': 'SG',  // Singapore
      '61': 'AU',  // Australia
      '81': 'JP',  // Japan
      '82': 'KR',  // South Korea
      '86': 'CN',  // China
      '91': 'IN',  // India
      '49': 'DE',  // Germany
      '33': 'FR',  // France
    };
  }

  /**
   * Set phone number to extract country
   */
  setPhoneNumber(phone) {
    const cleaned = phone.replace(/\D/g, '');

    for (const [prefix, country] of Object.entries(this.phonePrefixes)) {
      if (cleaned.startsWith(prefix)) {
        this.phoneCountry = country;
        return country;
      }
    }

    return null;
  }

  /**
   * Check IP country (call periodically)
   */
  async checkIPCountry() {
    try {
      // Use a geo-IP service (simplified - you'd use actual API)
      const response = await fetch('https://ipapi.co/json/', {
        timeout: 5000,
      });

      if (response.ok) {
        const data = await response.json();
        this.currentIPCountry = data.country_code;
        return this.validateMatch();
      }
    } catch (err) {
      // Can't check, assume OK
      return { matched: true, warning: false };
    }

    return { matched: true, warning: false };
  }

  /**
   * Validate phone country matches IP country
   */
  validateMatch() {
    if (!this.phoneCountry || !this.currentIPCountry) {
      return { matched: true, warning: false, reason: 'Unable to determine' };
    }

    if (this.phoneCountry === this.currentIPCountry) {
      this.mismatchWarnings = 0;
      return { matched: true, warning: false };
    }

    this.mismatchWarnings++;

    return {
      matched: false,
      warning: true,
      phoneCountry: this.phoneCountry,
      ipCountry: this.currentIPCountry,
      mismatchCount: this.mismatchWarnings,
      recommendation: 'IP country does not match phone country. Consider using VPN to match location.',
    };
  }

  getStatus() {
    return {
      phoneCountry: this.phoneCountry,
      currentIPCountry: this.currentIPCountry,
      matched: this.phoneCountry === this.currentIPCountry,
      mismatchWarnings: this.mismatchWarnings,
    };
  }
}

// =============================================================================
// PHASE 3: PROFILE PICTURE VIEWING
// =============================================================================

/**
 * Occasionally fetches contact profile pictures
 * Bots don't look at profiles - humans do
 */
export class ProfileViewer {
  constructor(options = {}) {
    this.socket = null;
    this.viewProbability = options.viewProbability || 0.1; // 10% chance per new contact
    this.viewedProfiles = new Set();
    this.sessionsDir = options.sessionsDir;

    this.loadState();
  }

  setSocket(socket) {
    this.socket = socket;
  }

  /**
   * Maybe view a contact's profile picture
   */
  async maybeViewProfile(jid) {
    if (!this.socket) return;

    // Skip if already viewed recently
    if (this.viewedProfiles.has(jid)) return;

    // Random chance to view
    if (Math.random() > this.viewProbability) return;

    try {
      // Delay before viewing (natural behavior)
      const viewDelay = humanDelay(2000, 0.5);
      await new Promise(resolve => setTimeout(resolve, viewDelay));

      // Fetch profile picture URL
      await this.socket.profilePictureUrl(jid, 'image');

      this.viewedProfiles.add(jid);
      this.saveState();
    } catch (err) {
      // Profile might be private, that's OK
    }
  }

  /**
   * View profile of a specific contact (forced)
   */
  async viewProfile(jid) {
    if (!this.socket) return null;

    try {
      const url = await this.socket.profilePictureUrl(jid, 'image');
      this.viewedProfiles.add(jid);
      return url;
    } catch (err) {
      return null;
    }
  }

  getStats() {
    return {
      viewedCount: this.viewedProfiles.size,
    };
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.profile-viewer-state.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        if (data.date === new Date().toDateString()) {
          this.viewedProfiles = new Set(data.viewedProfiles || []);
        }
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.profile-viewer-state.json');
    try {
      writeFileSync(stateFile, JSON.stringify({
        date: new Date().toDateString(),
        viewedProfiles: [...this.viewedProfiles],
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

// =============================================================================
// PHASE 3: FORWARD MESSAGE DETECTION
// =============================================================================

/**
 * Detects and handles forwarded messages differently
 * Forwarded messages have different reply patterns
 */
export class ForwardHandler {
  constructor(options = {}) {
    // Reply probability for forwarded messages (lower than direct)
    this.forwardReplyProbability = options.forwardReplyProbability || 0.5;

    // Delay multiplier for forwarded messages
    this.forwardDelayMultiplier = options.forwardDelayMultiplier || 1.5;
  }

  /**
   * Check if a message is forwarded
   */
  isForwarded(message) {
    // Baileys message structure includes forward info
    return message?.message?.extendedTextMessage?.contextInfo?.isForwarded ||
           message?.message?.imageMessage?.contextInfo?.isForwarded ||
           message?.message?.videoMessage?.contextInfo?.isForwarded ||
           false;
  }

  /**
   * Get forward count (how many times forwarded)
   */
  getForwardCount(message) {
    return message?.message?.extendedTextMessage?.contextInfo?.forwardingScore ||
           message?.message?.imageMessage?.contextInfo?.forwardingScore ||
           0;
  }

  /**
   * Should we reply to this forwarded message?
   */
  shouldReplyToForward(message) {
    if (!this.isForwarded(message)) {
      return { shouldReply: true, isForward: false };
    }

    const forwardCount = this.getForwardCount(message);

    // Heavily forwarded content (viral) - lower reply probability
    let probability = this.forwardReplyProbability;
    if (forwardCount > 5) {
      probability *= 0.5; // Halve probability for viral content
    }

    return {
      shouldReply: Math.random() < probability,
      isForward: true,
      forwardCount,
      probability: Math.round(probability * 100),
    };
  }

  /**
   * Adjust delay for forwarded messages
   */
  adjustDelay(baseDelay, message) {
    if (this.isForwarded(message)) {
      return Math.floor(baseDelay * this.forwardDelayMultiplier);
    }
    return baseDelay;
  }
}

// =============================================================================
// PHASE 3: CONVERSATION MEMORY
// =============================================================================

/**
 * Tracks conversation context per contact
 * Helps maintain natural conversation flow
 */
export class ConversationMemory {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.maxMessages = options.maxMessages || 20;  // Keep last 20 messages per contact
    this.conversations = new Map();

    this.loadState();
  }

  /**
   * Record a message (sent or received)
   */
  recordMessage(contact, message, direction = 'received') {
    const conversation = this.conversations.get(contact) || {
      messages: [],
      lastActivity: null,
      topics: [],
      sentiment: 'neutral',
    };

    conversation.messages.push({
      text: message.text || message,
      direction,
      timestamp: Date.now(),
    });

    // Keep only recent messages
    if (conversation.messages.length > this.maxMessages) {
      conversation.messages = conversation.messages.slice(-this.maxMessages);
    }

    conversation.lastActivity = Date.now();

    // Update topics (simple keyword extraction)
    this.updateTopics(conversation, message.text || message);

    // Update sentiment
    this.updateSentiment(conversation, message.text || message);

    this.conversations.set(contact, conversation);
    this.saveState();
  }

  /**
   * Get conversation context for a contact
   */
  getContext(contact) {
    const conversation = this.conversations.get(contact);
    if (!conversation) {
      return {
        isNew: true,
        messageCount: 0,
        lastActivity: null,
        topics: [],
        sentiment: 'neutral',
      };
    }

    return {
      isNew: false,
      messageCount: conversation.messages.length,
      lastActivity: conversation.lastActivity,
      lastMessage: conversation.messages[conversation.messages.length - 1],
      topics: conversation.topics,
      sentiment: conversation.sentiment,
      timeSinceLastMessage: Date.now() - conversation.lastActivity,
    };
  }

  /**
   * Check if we're in an active conversation (within 10 minutes)
   */
  isActiveConversation(contact) {
    const context = this.getContext(contact);
    if (context.isNew) return false;

    return context.timeSinceLastMessage < 10 * 60 * 1000; // 10 minutes
  }

  /**
   * Simple topic extraction
   */
  updateTopics(conversation, text) {
    if (!text) return;

    const topics = [];
    const lowerText = text.toLowerCase();

    // Simple topic detection
    const topicPatterns = {
      work: /kerja|kantor|project|meeting|deadline|boss/i,
      money: /uang|bayar|harga|murah|mahal|transfer|rupiah/i,
      food: /makan|lapar|resto|makanan|masak/i,
      health: /sakit|sehat|dokter|rumah sakit|obat/i,
      family: /keluarga|mama|papa|anak|istri|suami/i,
      travel: /jalan|liburan|pergi|pulang|sampai/i,
    };

    for (const [topic, pattern] of Object.entries(topicPatterns)) {
      if (pattern.test(lowerText)) {
        topics.push(topic);
      }
    }

    // Merge with existing topics, keep unique
    conversation.topics = [...new Set([...conversation.topics, ...topics])].slice(-5);
  }

  /**
   * Simple sentiment analysis
   */
  updateSentiment(conversation, text) {
    if (!text) return;

    const lowerText = text.toLowerCase();

    const positiveWords = /bagus|senang|baik|terima kasih|makasih|suka|love|mantap|keren|oke|yes|iya|🙂|😊|❤️|👍|🎉/i;
    const negativeWords = /tidak|bukan|salah|marah|kesal|sedih|gagal|buruk|jelek|😢|😡|😔|👎/i;

    if (positiveWords.test(lowerText)) {
      conversation.sentiment = 'positive';
    } else if (negativeWords.test(lowerText)) {
      conversation.sentiment = 'negative';
    }
    // Keep previous sentiment if no clear signal
  }

  /**
   * Get all active conversations (activity in last hour)
   */
  getActiveConversations() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const active = [];

    for (const [contact, conv] of this.conversations) {
      if (conv.lastActivity > oneHourAgo) {
        active.push({ contact, ...this.getContext(contact) });
      }
    }

    return active;
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.conversation-memory.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        // Only load if within last 24 hours
        if (data.savedAt > Date.now() - 24 * 60 * 60 * 1000) {
          this.conversations = new Map(Object.entries(data.conversations || {}));
        }
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.conversation-memory.json');
    try {
      const obj = {};
      for (const [k, v] of this.conversations) {
        obj[k] = v;
      }
      writeFileSync(stateFile, JSON.stringify({
        conversations: obj,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

// =============================================================================
// PHASE 4: BLOCK DETECTION
// =============================================================================

/**
 * Detects when you've been blocked by a contact
 * Signs: single check never becomes double, profile picture unavailable
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

// =============================================================================
// PHASE 4: SESSION PERSISTENCE / BACKUP
// =============================================================================

/**
 * Manages session backup and recovery
 * Helps avoid re-scanning QR code after restarts
 */
export class SessionManager {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.backupDir = options.backupDir || join(this.sessionsDir, '..', 'session-backups');
    this.maxBackups = options.maxBackups || 5;
    this.autoBackupInterval = options.autoBackupInterval || 60 * 60 * 1000; // 1 hour

    this.backupTimer = null;
    this.lastBackupTime = 0;

    // Ensure backup directory exists
    this.ensureBackupDir();
  }

  ensureBackupDir() {
    try {
      if (!existsSync(this.backupDir)) {
        const { mkdirSync } = require('fs');
        mkdirSync(this.backupDir, { recursive: true });
      }
    } catch (err) {
      console.error('Failed to create backup directory:', err.message);
    }
  }

  /**
   * Start automatic backups
   */
  startAutoBackup() {
    if (this.backupTimer) return;

    this.backupTimer = setInterval(() => {
      this.createBackup();
    }, this.autoBackupInterval);

    // Initial backup after 5 minutes
    setTimeout(() => this.createBackup(), 5 * 60 * 1000);
  }

  stopAutoBackup() {
    if (this.backupTimer) {
      clearInterval(this.backupTimer);
      this.backupTimer = null;
    }
  }

  /**
   * Create a backup of current session
   */
  createBackup() {
    if (!existsSync(this.sessionsDir)) {
      return { success: false, reason: 'sessions_dir_not_found' };
    }

    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = join(this.backupDir, `backup-${timestamp}`);

      // Copy session files
      const { cpSync } = require('fs');
      cpSync(this.sessionsDir, backupPath, { recursive: true });

      this.lastBackupTime = Date.now();

      // Cleanup old backups
      this.cleanupOldBackups();

      return { success: true, path: backupPath, timestamp };
    } catch (err) {
      return { success: false, reason: err.message };
    }
  }

  /**
   * Restore from a backup
   */
  restoreBackup(backupName) {
    const backupPath = join(this.backupDir, backupName);

    if (!existsSync(backupPath)) {
      return { success: false, reason: 'backup_not_found' };
    }

    try {
      const { cpSync, rmSync } = require('fs');

      // Remove current session
      if (existsSync(this.sessionsDir)) {
        rmSync(this.sessionsDir, { recursive: true });
      }

      // Copy backup to sessions
      cpSync(backupPath, this.sessionsDir, { recursive: true });

      return { success: true, restored: backupName };
    } catch (err) {
      return { success: false, reason: err.message };
    }
  }

  /**
   * List available backups
   */
  listBackups() {
    try {
      if (!existsSync(this.backupDir)) return [];

      const { readdirSync, statSync } = require('fs');
      const backups = readdirSync(this.backupDir)
        .filter(name => name.startsWith('backup-'))
        .map(name => {
          const path = join(this.backupDir, name);
          const stats = statSync(path);
          return {
            name,
            createdAt: stats.mtime,
            size: this.getDirSize(path),
          };
        })
        .sort((a, b) => b.createdAt - a.createdAt);

      return backups;
    } catch (err) {
      return [];
    }
  }

  /**
   * Get directory size
   */
  getDirSize(dirPath) {
    try {
      const { readdirSync, statSync } = require('fs');
      let size = 0;
      const files = readdirSync(dirPath);
      for (const file of files) {
        const filePath = join(dirPath, file);
        const stats = statSync(filePath);
        if (stats.isDirectory()) {
          size += this.getDirSize(filePath);
        } else {
          size += stats.size;
        }
      }
      return size;
    } catch (err) {
      return 0;
    }
  }

  /**
   * Remove old backups beyond maxBackups
   */
  cleanupOldBackups() {
    const backups = this.listBackups();
    if (backups.length <= this.maxBackups) return;

    const toDelete = backups.slice(this.maxBackups);
    const { rmSync } = require('fs');

    for (const backup of toDelete) {
      try {
        rmSync(join(this.backupDir, backup.name), { recursive: true });
      } catch (err) {}
    }
  }

  getStatus() {
    return {
      lastBackupTime: this.lastBackupTime,
      autoBackupActive: this.backupTimer !== null,
      backupCount: this.listBackups().length,
      backupDir: this.backupDir,
    };
  }
}

// =============================================================================
// PHASE 4: MESSAGE QUEUE PERSISTENCE
// =============================================================================

/**
 * Persists message queue across restarts
 * Prevents message loss during crashes/restarts
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

// =============================================================================
// PHASE 4: WEBHOOK RETRY LOGIC
// =============================================================================

/**
 * Manages webhook delivery with retry logic
 * Ensures messages are forwarded even during temporary failures
 */
export class WebhookManager {
  constructor(options = {}) {
    this.webhookUrl = options.webhookUrl;
    this.apiSecret = options.apiSecret;
    this.sessionsDir = options.sessionsDir;
    this.logger = options.logger || console;

    // Retry settings
    this.maxRetries = options.maxRetries || 5;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 60000;

    // Queue for failed webhooks
    this.failedQueue = [];
    this.retryTimer = null;

    this.loadFailedQueue();
  }

  /**
   * Send webhook with automatic retry
   */
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

        // Non-retryable errors
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          return { success: false, status: response.status, reason: 'client_error' };
        }

        lastError = `HTTP ${response.status}`;
      } catch (err) {
        lastError = err.message;
      }

      // Exponential backoff
      if (attempt < this.maxRetries - 1) {
        const delay = Math.min(this.baseDelay * Math.pow(2, attempt), this.maxDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // All retries failed - add to failed queue for later
    this.addToFailedQueue(payload);

    return { success: false, reason: lastError, queued: true };
  }

  /**
   * Add to failed queue for background retry
   */
  addToFailedQueue(payload) {
    this.failedQueue.push({
      payload,
      addedAt: Date.now(),
      attempts: 0,
    });

    this.saveFailedQueue();
    this.startRetryTimer();
  }

  /**
   * Start background retry timer
   */
  startRetryTimer() {
    if (this.retryTimer) return;

    this.retryTimer = setInterval(() => {
      this.processFailedQueue();
    }, 60000); // Check every minute
  }

  stopRetryTimer() {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Process failed queue in background
   */
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
          // Re-add to queue if under max attempts
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

// =============================================================================
// PHASE 4: HEALTH MONITORING ALERTS
// =============================================================================

/**
 * Monitors system health and sends alerts
 * Proactive detection of issues before they cause bans
 */
export class HealthMonitor {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.logger = options.logger || console;
    this.onAlert = options.onAlert || (() => {});

    // Health metrics
    this.metrics = {
      connectionDrops: [],
      deliveryFailures: [],
      rateLimitHits: [],
      errors: [],
      lastHealthCheck: null,
    };

    // Alert thresholds
    this.thresholds = {
      connectionDropsPerHour: 3,
      deliveryFailuresPerHour: 5,
      rateLimitHitsPerHour: 3,
      errorsPerHour: 10,
    };

    // Check interval
    this.checkInterval = options.checkInterval || 5 * 60 * 1000; // 5 minutes
    this.checkTimer = null;

    // Overall health status
    this.healthStatus = 'healthy';

    this.loadMetrics();
  }

  /**
   * Start health monitoring
   */
  start() {
    if (this.checkTimer) return;

    this.checkTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.checkInterval);

    // Initial check after 1 minute
    setTimeout(() => this.performHealthCheck(), 60000);
  }

  stop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * Record a connection drop
   */
  recordConnectionDrop() {
    this.metrics.connectionDrops.push(Date.now());
    this.cleanOldMetrics();
    this.performHealthCheck();
    this.saveMetrics();
  }

  /**
   * Record a delivery failure
   */
  recordDeliveryFailure(reason) {
    this.metrics.deliveryFailures.push({ timestamp: Date.now(), reason });
    this.cleanOldMetrics();
    this.saveMetrics();
  }

  /**
   * Record a rate limit hit
   */
  recordRateLimitHit() {
    this.metrics.rateLimitHits.push(Date.now());
    this.cleanOldMetrics();
    this.saveMetrics();
  }

  /**
   * Record an error
   */
  recordError(error) {
    this.metrics.errors.push({ timestamp: Date.now(), error: error.message || error });
    this.cleanOldMetrics();
    this.saveMetrics();
  }

  /**
   * Clean old metrics (older than 1 hour)
   */
  cleanOldMetrics() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    this.metrics.connectionDrops = this.metrics.connectionDrops.filter(t => t > oneHourAgo);
    this.metrics.deliveryFailures = this.metrics.deliveryFailures.filter(m => m.timestamp > oneHourAgo);
    this.metrics.rateLimitHits = this.metrics.rateLimitHits.filter(t => t > oneHourAgo);
    this.metrics.errors = this.metrics.errors.filter(m => m.timestamp > oneHourAgo);
  }

  /**
   * Perform health check
   */
  performHealthCheck() {
    this.cleanOldMetrics();
    this.metrics.lastHealthCheck = Date.now();

    const alerts = [];
    let status = 'healthy';

    // Check connection drops
    if (this.metrics.connectionDrops.length >= this.thresholds.connectionDropsPerHour) {
      alerts.push({
        type: 'connection_instability',
        count: this.metrics.connectionDrops.length,
        message: `${this.metrics.connectionDrops.length} connection drops in last hour`,
        severity: 'warning',
      });
      status = 'degraded';
    }

    // Check delivery failures
    if (this.metrics.deliveryFailures.length >= this.thresholds.deliveryFailuresPerHour) {
      alerts.push({
        type: 'delivery_issues',
        count: this.metrics.deliveryFailures.length,
        message: `${this.metrics.deliveryFailures.length} delivery failures in last hour`,
        severity: 'warning',
      });
      status = 'degraded';
    }

    // Check rate limits
    if (this.metrics.rateLimitHits.length >= this.thresholds.rateLimitHitsPerHour) {
      alerts.push({
        type: 'rate_limit_pressure',
        count: this.metrics.rateLimitHits.length,
        message: `Hit rate limit ${this.metrics.rateLimitHits.length} times in last hour`,
        severity: 'critical',
      });
      status = 'critical';
    }

    // Check errors
    if (this.metrics.errors.length >= this.thresholds.errorsPerHour) {
      alerts.push({
        type: 'high_error_rate',
        count: this.metrics.errors.length,
        message: `${this.metrics.errors.length} errors in last hour`,
        severity: 'warning',
      });
      if (status !== 'critical') status = 'degraded';
    }

    this.healthStatus = status;

    // Send alerts
    if (alerts.length > 0) {
      this.onAlert({
        status,
        alerts,
        timestamp: Date.now(),
        recommendation: this.getRecommendation(status),
      });
    }

    this.saveMetrics();

    return { status, alerts };
  }

  getRecommendation(status) {
    switch (status) {
      case 'critical':
        return 'REDUCE or STOP messaging. System is under stress. Wait for recovery.';
      case 'degraded':
        return 'Monitor closely. Consider reducing message volume by 50%.';
      default:
        return 'System is healthy. Continue normal operation.';
    }
  }

  getStatus() {
    return {
      health: this.healthStatus,
      lastCheck: this.metrics.lastHealthCheck,
      metrics: {
        connectionDrops: this.metrics.connectionDrops.length,
        deliveryFailures: this.metrics.deliveryFailures.length,
        rateLimitHits: this.metrics.rateLimitHits.length,
        errors: this.metrics.errors.length,
      },
      monitoring: this.checkTimer !== null,
    };
  }

  loadMetrics() {
    if (!this.sessionsDir) return;
    const metricsFile = join(this.sessionsDir, '.health-metrics.json');
    try {
      if (existsSync(metricsFile)) {
        const data = JSON.parse(readFileSync(metricsFile, 'utf-8'));
        // Only load if recent (within last hour)
        if (data.savedAt > Date.now() - 60 * 60 * 1000) {
          this.metrics = { ...this.metrics, ...data.metrics };
        }
      }
    } catch (err) {}
  }

  saveMetrics() {
    if (!this.sessionsDir) return;
    const metricsFile = join(this.sessionsDir, '.health-metrics.json');
    try {
      writeFileSync(metricsFile, JSON.stringify({
        metrics: this.metrics,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

// =============================================================================
// PHASE 4: LANGUAGE DETECTION
// =============================================================================

/**
 * Detects message language and tracks language preferences
 * Helps respond in the same language as the sender
 */
export class LanguageDetector {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.contactLanguages = new Map();

    // Language patterns
    this.patterns = {
      id: {
        name: 'Indonesian',
        indicators: [
          /\b(apa|siapa|kapan|dimana|bagaimana|kenapa|berapa)\b/i,
          /\b(saya|kamu|anda|dia|mereka|kami|kita)\b/i,
          /\b(yang|dan|atau|tapi|dengan|untuk|dari)\b/i,
          /\b(tidak|bukan|jangan|belum|sudah|akan)\b/i,
          /\b(terima kasih|makasih|tolong|mohon|maaf)\b/i,
          /\b(selamat|pagi|siang|sore|malam)\b/i,
          /\b(bisa|mau|ingin|perlu|harus)\b/i,
        ],
      },
      en: {
        name: 'English',
        indicators: [
          /\b(what|who|when|where|how|why|which)\b/i,
          /\b(i|you|he|she|they|we|it)\b/i,
          /\b(the|and|or|but|with|for|from)\b/i,
          /\b(don't|can't|won't|isn't|aren't)\b/i,
          /\b(please|thank|sorry|excuse|welcome)\b/i,
          /\b(good|morning|afternoon|evening|night)\b/i,
          /\b(can|want|need|must|should)\b/i,
        ],
      },
    };

    this.loadState();
  }

  /**
   * Detect language of a message
   */
  detect(text) {
    if (!text || text.length < 5) {
      return { language: null, confidence: 0 };
    }

    const scores = {};

    for (const [lang, config] of Object.entries(this.patterns)) {
      let matches = 0;
      for (const pattern of config.indicators) {
        if (pattern.test(text)) {
          matches++;
        }
      }
      scores[lang] = matches / config.indicators.length;
    }

    // Find highest score
    let detectedLang = null;
    let maxScore = 0;

    for (const [lang, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        detectedLang = lang;
      }
    }

    // Only return if confidence is reasonable
    if (maxScore < 0.1) {
      return { language: null, confidence: 0 };
    }

    return {
      language: detectedLang,
      name: this.patterns[detectedLang]?.name,
      confidence: Math.round(maxScore * 100),
    };
  }

  /**
   * Record language for a contact
   */
  recordContactLanguage(contact, text) {
    const detection = this.detect(text);
    if (!detection.language) return;

    const existing = this.contactLanguages.get(contact) || {
      languages: {},
      primary: null,
      messageCount: 0,
    };

    existing.languages[detection.language] = (existing.languages[detection.language] || 0) + 1;
    existing.messageCount++;

    // Determine primary language
    let maxCount = 0;
    for (const [lang, count] of Object.entries(existing.languages)) {
      if (count > maxCount) {
        maxCount = count;
        existing.primary = lang;
      }
    }

    this.contactLanguages.set(contact, existing);
    this.saveState();
  }

  /**
   * Get preferred language for a contact
   */
  getContactLanguage(contact) {
    const data = this.contactLanguages.get(contact);
    if (!data || !data.primary) {
      return { language: 'id', name: 'Indonesian', confidence: 0 }; // Default to Indonesian
    }

    const totalMessages = data.messageCount;
    const primaryCount = data.languages[data.primary];
    const confidence = Math.round((primaryCount / totalMessages) * 100);

    return {
      language: data.primary,
      name: this.patterns[data.primary]?.name || data.primary,
      confidence,
    };
  }

  /**
   * Check if message matches contact's preferred language
   */
  isMatchingLanguage(contact, text) {
    const preferredLang = this.getContactLanguage(contact);
    const messageLang = this.detect(text);

    if (!messageLang.language) return true; // Can't determine, assume OK
    if (!preferredLang.language) return true;

    return messageLang.language === preferredLang.language;
  }

  getStats() {
    return {
      trackedContacts: this.contactLanguages.size,
      languages: ['id', 'en'],
    };
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.language-detector-state.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        this.contactLanguages = new Map(Object.entries(data.contactLanguages || {}));
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.language-detector-state.json');
    try {
      const obj = {};
      for (const [k, v] of this.contactLanguages) {
        obj[k] = v;
      }
      writeFileSync(stateFile, JSON.stringify({
        contactLanguages: obj,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

// =============================================================================
// PHASE 5A: ANALYTICS & INTELLIGENCE
// =============================================================================

/**
 * MessageAnalytics - Track message statistics and patterns
 * Provides insights into messaging behavior and engagement
 */
export class MessageAnalytics {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.contacts = new Map(); // contact -> stats
    this.hourlyStats = new Array(24).fill(0); // Messages per hour
    this.dailyStats = new Map(); // date -> count
    this.responseTimeHistory = []; // Last 100 response times
    this.maxHistory = 100;

    this.loadState();
  }

  /**
   * Record an outgoing message
   */
  recordSent(contact, messageLength) {
    const now = new Date();
    const hour = now.getHours();
    const dateKey = now.toISOString().split('T')[0];

    // Update hourly stats
    this.hourlyStats[hour]++;

    // Update daily stats
    this.dailyStats.set(dateKey, (this.dailyStats.get(dateKey) || 0) + 1);

    // Keep only last 30 days
    if (this.dailyStats.size > 30) {
      const oldestKey = [...this.dailyStats.keys()].sort()[0];
      this.dailyStats.delete(oldestKey);
    }

    // Update contact stats
    const stats = this.getOrCreateContactStats(contact);
    stats.sent++;
    stats.totalCharsSent += messageLength;
    stats.lastSent = now.getTime();
    stats.sentByHour[hour] = (stats.sentByHour[hour] || 0) + 1;

    this.contacts.set(contact, stats);
    this.saveState();
  }

  /**
   * Record an incoming message
   */
  recordReceived(contact, messageLength) {
    const now = new Date();
    const stats = this.getOrCreateContactStats(contact);

    stats.received++;
    stats.totalCharsReceived += messageLength;
    stats.lastReceived = now.getTime();

    // Calculate response time if we have a pending sent message
    if (stats.lastSent && !stats.lastResponseTime) {
      const responseTime = now.getTime() - stats.lastSent;
      stats.responseTimes.push(responseTime);
      if (stats.responseTimes.length > 20) {
        stats.responseTimes.shift();
      }

      // Track global response times
      this.responseTimeHistory.push({ contact, time: responseTime, at: now.getTime() });
      if (this.responseTimeHistory.length > this.maxHistory) {
        this.responseTimeHistory.shift();
      }
    }

    this.contacts.set(contact, stats);
    this.saveState();
  }

  /**
   * Get or create stats for a contact
   */
  getOrCreateContactStats(contact) {
    return this.contacts.get(contact) || {
      sent: 0,
      received: 0,
      totalCharsSent: 0,
      totalCharsReceived: 0,
      lastSent: null,
      lastReceived: null,
      responseTimes: [],
      sentByHour: {},
      firstContact: Date.now(),
    };
  }

  /**
   * Get contact statistics
   */
  getContactStats(contact) {
    const stats = this.contacts.get(contact);
    if (!stats) return null;

    const avgResponseTime = stats.responseTimes.length > 0
      ? Math.round(stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length)
      : null;

    const peakHour = Object.entries(stats.sentByHour)
      .sort(([, a], [, b]) => b - a)[0];

    return {
      ...stats,
      avgResponseTime,
      avgResponseTimeFormatted: avgResponseTime ? this.formatDuration(avgResponseTime) : 'N/A',
      peakHour: peakHour ? parseInt(peakHour[0]) : null,
      engagementRate: stats.sent > 0 ? Math.round((stats.received / stats.sent) * 100) : 0,
      relationshipAge: Date.now() - stats.firstContact,
    };
  }

  /**
   * Get peak messaging hours
   */
  getPeakHours() {
    const sorted = this.hourlyStats
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count);

    return {
      peak: sorted[0],
      top3: sorted.slice(0, 3),
      quietest: sorted[sorted.length - 1],
      distribution: this.hourlyStats,
    };
  }

  /**
   * Get daily message trends
   */
  getDailyTrends() {
    const entries = [...this.dailyStats.entries()].sort();
    const values = entries.map(([, v]) => v);

    return {
      days: entries.map(([k]) => k),
      counts: values,
      average: values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0,
      max: Math.max(...values, 0),
      min: Math.min(...values, Infinity) === Infinity ? 0 : Math.min(...values),
      total: values.reduce((a, b) => a + b, 0),
    };
  }

  /**
   * Get global analytics summary
   */
  getSummary() {
    let totalSent = 0;
    let totalReceived = 0;
    let activeContacts = 0;
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const stats of this.contacts.values()) {
      totalSent += stats.sent;
      totalReceived += stats.received;
      if (stats.lastSent > dayAgo || stats.lastReceived > dayAgo) {
        activeContacts++;
      }
    }

    return {
      totalContacts: this.contacts.size,
      activeContacts24h: activeContacts,
      totalMessagesSent: totalSent,
      totalMessagesReceived: totalReceived,
      overallEngagementRate: totalSent > 0 ? Math.round((totalReceived / totalSent) * 100) : 0,
      peakHours: this.getPeakHours(),
      dailyTrends: this.getDailyTrends(),
    };
  }

  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    return `${Math.round(ms / 3600000)}h`;
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.analytics-state.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        this.contacts = new Map(Object.entries(data.contacts || {}));
        this.hourlyStats = data.hourlyStats || new Array(24).fill(0);
        this.dailyStats = new Map(Object.entries(data.dailyStats || {}));
        this.responseTimeHistory = data.responseTimeHistory || [];
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.analytics-state.json');
    try {
      const contactsObj = {};
      for (const [k, v] of this.contacts) {
        contactsObj[k] = v;
      }
      const dailyObj = {};
      for (const [k, v] of this.dailyStats) {
        dailyObj[k] = v;
      }
      writeFileSync(stateFile, JSON.stringify({
        contacts: contactsObj,
        hourlyStats: this.hourlyStats,
        dailyStats: dailyObj,
        responseTimeHistory: this.responseTimeHistory,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

/**
 * ContactScoring - Score contacts based on engagement
 * Higher scores = more engaged/valuable contacts
 */
export class ContactScoring {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.weights = {
      replyRate: 30,        // How often they reply
      responseSpeed: 20,    // How fast they reply
      messageLength: 10,    // Average message length
      frequency: 20,        // How often they message
      recency: 20,          // How recent the interaction
    };
    this.scores = new Map();
    this.contactData = new Map();

    this.loadState();
  }

  /**
   * Record interaction for scoring
   */
  recordInteraction(contact, type, data = {}) {
    const existing = this.contactData.get(contact) || {
      messagesSent: 0,
      messagesReceived: 0,
      totalResponseTime: 0,
      responseCount: 0,
      totalMessageLength: 0,
      lastInteraction: 0,
      firstInteraction: Date.now(),
    };

    if (type === 'sent') {
      existing.messagesSent++;
      existing.lastSentAt = Date.now();
    } else if (type === 'received') {
      existing.messagesReceived++;
      existing.totalMessageLength += data.length || 0;

      // Calculate response time
      if (existing.lastSentAt) {
        const responseTime = Date.now() - existing.lastSentAt;
        existing.totalResponseTime += responseTime;
        existing.responseCount++;
        existing.lastSentAt = null; // Reset
      }
    }

    existing.lastInteraction = Date.now();
    this.contactData.set(contact, existing);

    // Recalculate score
    this.calculateScore(contact);
    this.saveState();
  }

  /**
   * Calculate engagement score for a contact
   */
  calculateScore(contact) {
    const data = this.contactData.get(contact);
    if (!data) return 0;

    let score = 0;

    // Reply rate (0-30 points)
    if (data.messagesSent > 0) {
      const replyRate = Math.min(data.messagesReceived / data.messagesSent, 1);
      score += replyRate * this.weights.replyRate;
    }

    // Response speed (0-20 points) - faster is better
    if (data.responseCount > 0) {
      const avgResponseTime = data.totalResponseTime / data.responseCount;
      // Under 1 minute = full points, over 1 hour = 0 points
      const speedScore = Math.max(0, 1 - (avgResponseTime / 3600000));
      score += speedScore * this.weights.responseSpeed;
    }

    // Message length (0-10 points) - longer messages = more engaged
    if (data.messagesReceived > 0) {
      const avgLength = data.totalMessageLength / data.messagesReceived;
      // 100+ chars = full points
      const lengthScore = Math.min(avgLength / 100, 1);
      score += lengthScore * this.weights.messageLength;
    }

    // Frequency (0-20 points) - based on messages per day
    const daysSinceFirst = Math.max(1, (Date.now() - data.firstInteraction) / (24 * 60 * 60 * 1000));
    const msgsPerDay = (data.messagesSent + data.messagesReceived) / daysSinceFirst;
    // 5+ messages per day = full points
    const frequencyScore = Math.min(msgsPerDay / 5, 1);
    score += frequencyScore * this.weights.frequency;

    // Recency (0-20 points) - recent interaction = higher score
    const daysSinceLast = (Date.now() - data.lastInteraction) / (24 * 60 * 60 * 1000);
    // Within 1 day = full points, over 7 days = 0 points
    const recencyScore = Math.max(0, 1 - (daysSinceLast / 7));
    score += recencyScore * this.weights.recency;

    this.scores.set(contact, Math.round(score));
    return Math.round(score);
  }

  /**
   * Get score for a contact
   */
  getScore(contact) {
    return this.scores.get(contact) || 0;
  }

  /**
   * Get contact tier based on score
   */
  getTier(contact) {
    const score = this.getScore(contact);
    if (score >= 80) return { tier: 'platinum', label: 'Highly Engaged', color: '#E5E4E2' };
    if (score >= 60) return { tier: 'gold', label: 'Engaged', color: '#FFD700' };
    if (score >= 40) return { tier: 'silver', label: 'Active', color: '#C0C0C0' };
    if (score >= 20) return { tier: 'bronze', label: 'Casual', color: '#CD7F32' };
    return { tier: 'new', label: 'New Contact', color: '#808080' };
  }

  /**
   * Get top contacts by score
   */
  getTopContacts(limit = 10) {
    return [...this.scores.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([contact, score]) => ({
        contact,
        score,
        tier: this.getTier(contact),
        data: this.contactData.get(contact),
      }));
  }

  /**
   * Get contacts needing attention (declining engagement)
   */
  getContactsNeedingAttention() {
    const results = [];
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const [contact, data] of this.contactData) {
      const score = this.getScore(contact);
      // High value contacts with no recent interaction
      if (score >= 40 && data.lastInteraction < weekAgo) {
        results.push({
          contact,
          score,
          daysSinceContact: Math.round((Date.now() - data.lastInteraction) / (24 * 60 * 60 * 1000)),
          tier: this.getTier(contact),
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  getStats() {
    const tiers = { platinum: 0, gold: 0, silver: 0, bronze: 0, new: 0 };
    for (const contact of this.scores.keys()) {
      const tier = this.getTier(contact).tier;
      tiers[tier]++;
    }

    return {
      totalContacts: this.scores.size,
      tiers,
      topContacts: this.getTopContacts(5),
      needingAttention: this.getContactsNeedingAttention().length,
    };
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.scoring-state.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        this.scores = new Map(Object.entries(data.scores || {}));
        this.contactData = new Map(Object.entries(data.contactData || {}));
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.scoring-state.json');
    try {
      const scoresObj = Object.fromEntries(this.scores);
      const dataObj = Object.fromEntries(this.contactData);
      writeFileSync(stateFile, JSON.stringify({
        scores: scoresObj,
        contactData: dataObj,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

/**
 * SentimentDetector - Basic sentiment analysis
 * Detects positive, negative, or neutral sentiment in messages
 */
export class SentimentDetector {
  constructor(options = {}) {
    // Indonesian and English sentiment words
    this.positiveWords = new Set([
      // English
      'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'awesome',
      'happy', 'love', 'like', 'thanks', 'thank', 'appreciate', 'perfect', 'best',
      'nice', 'cool', 'beautiful', 'brilliant', 'helpful', 'yes', 'sure', 'okay',
      // Indonesian
      'bagus', 'baik', 'mantap', 'keren', 'hebat', 'luar biasa', 'sempurna',
      'senang', 'suka', 'cinta', 'terima kasih', 'makasih', 'oke', 'siap',
      'asik', 'asyik', 'top', 'josss', 'mantul', 'gokil', 'sip',
    ]);

    this.negativeWords = new Set([
      // English
      'bad', 'terrible', 'awful', 'horrible', 'hate', 'dislike', 'angry', 'sad',
      'disappointed', 'frustrated', 'annoyed', 'upset', 'problem', 'issue', 'wrong',
      'no', 'not', 'never', 'cant', 'wont', 'fail', 'failed', 'sorry', 'unfortunately',
      // Indonesian
      'buruk', 'jelek', 'benci', 'marah', 'sedih', 'kecewa', 'kesal', 'frustasi',
      'masalah', 'salah', 'tidak', 'bukan', 'jangan', 'gagal', 'maaf', 'sayang',
      'payah', 'parah', 'zonk', 'ampun', 'waduh', 'aduh',
    ]);

    this.intensifiers = new Set([
      'very', 'really', 'so', 'extremely', 'super', 'totally', 'absolutely',
      'sangat', 'banget', 'sekali', 'amat', 'paling',
    ]);

    this.negators = new Set([
      'not', 'no', 'never', 'dont', "don't", 'doesnt', "doesn't", 'isnt', "isn't",
      'tidak', 'bukan', 'tak', 'gak', 'ga', 'nggak', 'enggak', 'belum',
    ]);

    this.contactSentiment = new Map();
    this.sessionsDir = options.sessionsDir;

    this.loadState();
  }

  /**
   * Analyze sentiment of a text
   */
  analyze(text) {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1);

    let positiveScore = 0;
    let negativeScore = 0;
    let intensifierMultiplier = 1;
    let negated = false;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const prevWord = words[i - 1] || '';

      // Check for intensifiers
      if (this.intensifiers.has(prevWord)) {
        intensifierMultiplier = 1.5;
      }

      // Check for negators
      if (this.negators.has(prevWord)) {
        negated = true;
      }

      // Score positive words
      if (this.positiveWords.has(word)) {
        if (negated) {
          negativeScore += intensifierMultiplier;
        } else {
          positiveScore += intensifierMultiplier;
        }
      }

      // Score negative words
      if (this.negativeWords.has(word)) {
        if (negated) {
          positiveScore += intensifierMultiplier * 0.5; // Negated negative is weakly positive
        } else {
          negativeScore += intensifierMultiplier;
        }
      }

      // Reset modifiers
      intensifierMultiplier = 1;
      negated = false;
    }

    // Check for emoji sentiment
    const emojiSentiment = this.analyzeEmojis(text);
    positiveScore += emojiSentiment.positive;
    negativeScore += emojiSentiment.negative;

    // Calculate overall sentiment
    const total = positiveScore + negativeScore;
    if (total === 0) {
      return { sentiment: 'neutral', score: 0, confidence: 0 };
    }

    const sentimentScore = (positiveScore - negativeScore) / Math.max(total, 1);
    const confidence = Math.min(Math.round(total * 20), 100);

    let sentiment = 'neutral';
    if (sentimentScore > 0.2) sentiment = 'positive';
    else if (sentimentScore < -0.2) sentiment = 'negative';

    return {
      sentiment,
      score: Math.round(sentimentScore * 100) / 100,
      confidence,
      details: {
        positiveScore,
        negativeScore,
        wordCount: words.length,
      },
    };
  }

  /**
   * Analyze emoji sentiment
   */
  analyzeEmojis(text) {
    const positive = (text.match(/[😀😃😄😁😆😊🙂😍🥰❤️💕👍🎉✨🔥💪👏🙏✅]/g) || []).length;
    const negative = (text.match(/[😢😭😤😡🤬😠💔👎❌😞😔😩😫]/g) || []).length;
    return { positive: positive * 0.5, negative: negative * 0.5 };
  }

  /**
   * Record sentiment for a contact
   */
  recordContactSentiment(contact, text) {
    const analysis = this.analyze(text);
    const existing = this.contactSentiment.get(contact) || {
      positive: 0,
      negative: 0,
      neutral: 0,
      history: [],
    };

    existing[analysis.sentiment]++;
    existing.history.push({
      sentiment: analysis.sentiment,
      score: analysis.score,
      at: Date.now(),
    });

    // Keep only last 50 entries
    if (existing.history.length > 50) {
      existing.history.shift();
    }

    this.contactSentiment.set(contact, existing);
    this.saveState();

    return analysis;
  }

  /**
   * Get overall sentiment for a contact
   */
  getContactSentiment(contact) {
    const data = this.contactSentiment.get(contact);
    if (!data) return { overall: 'unknown', confidence: 0 };

    const total = data.positive + data.negative + data.neutral;
    if (total === 0) return { overall: 'unknown', confidence: 0 };

    const scores = {
      positive: data.positive / total,
      negative: data.negative / total,
      neutral: data.neutral / total,
    };

    const dominant = Object.entries(scores).sort(([, a], [, b]) => b - a)[0];

    // Check recent trend (last 10 messages)
    const recent = data.history.slice(-10);
    const recentPositive = recent.filter(h => h.sentiment === 'positive').length;
    const recentNegative = recent.filter(h => h.sentiment === 'negative').length;

    let trend = 'stable';
    if (recentPositive > recentNegative + 2) trend = 'improving';
    else if (recentNegative > recentPositive + 2) trend = 'declining';

    return {
      overall: dominant[0],
      confidence: Math.round(dominant[1] * 100),
      breakdown: {
        positive: Math.round(scores.positive * 100),
        negative: Math.round(scores.negative * 100),
        neutral: Math.round(scores.neutral * 100),
      },
      trend,
      totalMessages: total,
    };
  }

  getStats() {
    return {
      trackedContacts: this.contactSentiment.size,
    };
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.sentiment-state.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        this.contactSentiment = new Map(Object.entries(data.contactSentiment || {}));
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.sentiment-state.json');
    try {
      const obj = Object.fromEntries(this.contactSentiment);
      writeFileSync(stateFile, JSON.stringify({ contactSentiment: obj, savedAt: Date.now() }, null, 2));
    } catch (err) {}
  }
}

// =============================================================================
// PHASE 5B: SECURITY HARDENING
// =============================================================================

/**
 * IPWhitelist - Restrict API access to specific IPs
 */
export class IPWhitelist {
  constructor(options = {}) {
    this.enabled = options.enabled ?? false;
    this.whitelist = new Set(options.whitelist || []);
    this.blacklist = new Set(options.blacklist || []);
    this.failedAttempts = new Map(); // IP -> { count, lastAttempt }
    this.maxFailedAttempts = options.maxFailedAttempts || 5;
    this.blockDuration = options.blockDuration || 15 * 60 * 1000; // 15 minutes
    this.sessionsDir = options.sessionsDir;

    // Always allow localhost
    this.whitelist.add('127.0.0.1');
    this.whitelist.add('::1');
    this.whitelist.add('localhost');

    this.loadState();
  }

  /**
   * Check if IP is allowed
   */
  isAllowed(ip) {
    // Normalize IP
    const normalizedIP = this.normalizeIP(ip);

    // Check blacklist first
    if (this.blacklist.has(normalizedIP)) {
      return { allowed: false, reason: 'IP is blacklisted' };
    }

    // Check if temporarily blocked due to failed attempts
    const blocked = this.isTemporarilyBlocked(normalizedIP);
    if (blocked) {
      return { allowed: false, reason: `Temporarily blocked (${blocked.remainingMinutes}m remaining)` };
    }

    // If whitelist is enabled, check it
    if (this.enabled && this.whitelist.size > 0) {
      if (!this.whitelist.has(normalizedIP) && !this.matchesCIDR(normalizedIP)) {
        return { allowed: false, reason: 'IP not in whitelist' };
      }
    }

    return { allowed: true };
  }

  /**
   * Record failed authentication attempt
   */
  recordFailedAttempt(ip) {
    const normalizedIP = this.normalizeIP(ip);
    const existing = this.failedAttempts.get(normalizedIP) || { count: 0, lastAttempt: 0 };

    // Reset if last attempt was more than block duration ago
    if (Date.now() - existing.lastAttempt > this.blockDuration) {
      existing.count = 0;
    }

    existing.count++;
    existing.lastAttempt = Date.now();
    this.failedAttempts.set(normalizedIP, existing);

    // Auto-blacklist if too many failures
    if (existing.count >= this.maxFailedAttempts) {
      this.blacklist.add(normalizedIP);
      this.saveState();
      return { blocked: true, reason: 'Too many failed attempts - IP blacklisted' };
    }

    this.saveState();
    return { blocked: false, remainingAttempts: this.maxFailedAttempts - existing.count };
  }

  /**
   * Record successful authentication
   */
  recordSuccess(ip) {
    const normalizedIP = this.normalizeIP(ip);
    this.failedAttempts.delete(normalizedIP);
  }

  /**
   * Check if IP is temporarily blocked
   */
  isTemporarilyBlocked(ip) {
    const normalizedIP = this.normalizeIP(ip);
    const attempts = this.failedAttempts.get(normalizedIP);

    if (!attempts || attempts.count < this.maxFailedAttempts) {
      return null;
    }

    const elapsed = Date.now() - attempts.lastAttempt;
    if (elapsed > this.blockDuration) {
      this.failedAttempts.delete(normalizedIP);
      return null;
    }

    return {
      blocked: true,
      remainingMinutes: Math.ceil((this.blockDuration - elapsed) / 60000),
    };
  }

  /**
   * Add IP to whitelist
   */
  addToWhitelist(ip) {
    this.whitelist.add(this.normalizeIP(ip));
    this.blacklist.delete(this.normalizeIP(ip));
    this.saveState();
  }

  /**
   * Remove IP from whitelist
   */
  removeFromWhitelist(ip) {
    this.whitelist.delete(this.normalizeIP(ip));
    this.saveState();
  }

  /**
   * Add IP to blacklist
   */
  addToBlacklist(ip) {
    this.blacklist.add(this.normalizeIP(ip));
    this.whitelist.delete(this.normalizeIP(ip));
    this.saveState();
  }

  /**
   * Normalize IP address
   */
  normalizeIP(ip) {
    // Handle IPv6-mapped IPv4 addresses
    if (ip.startsWith('::ffff:')) {
      return ip.substring(7);
    }
    return ip;
  }

  /**
   * Check if IP matches any CIDR in whitelist
   */
  matchesCIDR(ip) {
    // Simple CIDR matching for common cases
    for (const entry of this.whitelist) {
      if (entry.includes('/')) {
        const [network, bits] = entry.split('/');
        if (this.ipInCIDR(ip, network, parseInt(bits))) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Check if IP is in CIDR range (simplified)
   */
  ipInCIDR(ip, network, bits) {
    // Simplified check for common cases like 192.168.0.0/16
    const ipParts = ip.split('.').map(Number);
    const networkParts = network.split('.').map(Number);

    if (ipParts.length !== 4 || networkParts.length !== 4) {
      return false;
    }

    const mask = bits >= 8 ? Math.floor(bits / 8) : 0;
    for (let i = 0; i < mask; i++) {
      if (ipParts[i] !== networkParts[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Enable/disable whitelist
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    this.saveState();
  }

  getStatus() {
    return {
      enabled: this.enabled,
      whitelistCount: this.whitelist.size,
      blacklistCount: this.blacklist.size,
      blockedIPs: [...this.blacklist],
      whitelist: [...this.whitelist],
    };
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.ipwhitelist-state.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        if (data.whitelist) this.whitelist = new Set([...this.whitelist, ...data.whitelist]);
        if (data.blacklist) this.blacklist = new Set(data.blacklist);
        if (data.enabled !== undefined) this.enabled = data.enabled;
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.ipwhitelist-state.json');
    try {
      writeFileSync(stateFile, JSON.stringify({
        enabled: this.enabled,
        whitelist: [...this.whitelist],
        blacklist: [...this.blacklist],
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

/**
 * AuditLogger - Log all API calls and actions
 */
export class AuditLogger {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.maxLogs = options.maxLogs || 1000;
    this.logs = [];
    this.enabled = options.enabled ?? true;

    this.loadState();
  }

  /**
   * Log an event
   */
  log(event) {
    if (!this.enabled) return;

    const entry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      ...event,
    };

    this.logs.push(entry);

    // Trim old logs
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    this.saveState();
    return entry;
  }

  /**
   * Log API call
   */
  logAPICall(req, result) {
    return this.log({
      type: 'api_call',
      method: req.method,
      path: req.path,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers?.['user-agent'],
      statusCode: result.statusCode,
      duration: result.duration,
    });
  }

  /**
   * Log authentication event
   */
  logAuth(type, ip, success, details = {}) {
    return this.log({
      type: 'auth',
      authType: type,
      ip,
      success,
      ...details,
    });
  }

  /**
   * Log message event
   */
  logMessage(type, to, messageId, details = {}) {
    return this.log({
      type: 'message',
      messageType: type,
      to,
      messageId,
      ...details,
    });
  }

  /**
   * Log security event
   */
  logSecurity(event, ip, details = {}) {
    return this.log({
      type: 'security',
      event,
      ip,
      severity: details.severity || 'medium',
      ...details,
    });
  }

  /**
   * Log system event
   */
  logSystem(event, details = {}) {
    return this.log({
      type: 'system',
      event,
      ...details,
    });
  }

  /**
   * Get logs with filtering
   */
  getLogs(filter = {}) {
    let results = [...this.logs];

    if (filter.type) {
      results = results.filter(l => l.type === filter.type);
    }

    if (filter.since) {
      const since = new Date(filter.since).getTime();
      results = results.filter(l => new Date(l.timestamp).getTime() >= since);
    }

    if (filter.ip) {
      results = results.filter(l => l.ip === filter.ip);
    }

    if (filter.limit) {
      results = results.slice(-filter.limit);
    }

    return results.reverse(); // Most recent first
  }

  /**
   * Get security events
   */
  getSecurityEvents(hours = 24) {
    const since = Date.now() - hours * 60 * 60 * 1000;
    return this.getLogs({ type: 'security', since });
  }

  /**
   * Get failed auth attempts
   */
  getFailedAuths(hours = 24) {
    const since = Date.now() - hours * 60 * 60 * 1000;
    return this.getLogs({ type: 'auth', since })
      .filter(l => !l.success);
  }

  /**
   * Generate stats
   */
  getStats(hours = 24) {
    const since = Date.now() - hours * 60 * 60 * 1000;
    const recent = this.logs.filter(l => new Date(l.timestamp).getTime() >= since);

    const byType = {};
    for (const log of recent) {
      byType[log.type] = (byType[log.type] || 0) + 1;
    }

    const failedAuths = recent.filter(l => l.type === 'auth' && !l.success).length;
    const securityEvents = recent.filter(l => l.type === 'security').length;

    return {
      total: recent.length,
      byType,
      failedAuths,
      securityEvents,
      period: `${hours}h`,
    };
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.audit-logs.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        this.logs = data.logs || [];
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.audit-logs.json');
    try {
      writeFileSync(stateFile, JSON.stringify({
        logs: this.logs,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

/**
 * APIRateLimiter - Rate limit API calls per IP/token
 */
export class APIRateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60 * 1000; // 1 minute
    this.maxRequests = options.maxRequests || 60; // 60 requests per minute
    this.clients = new Map(); // IP/token -> { count, resetTime }
    this.enabled = options.enabled ?? true;

    // Different limits for different endpoints
    this.endpointLimits = {
      '/api/send': { windowMs: 60000, max: 30 },
      '/api/queue': { windowMs: 60000, max: 50 },
      '/api/persistent-queue': { windowMs: 60000, max: 50 },
      'default': { windowMs: 60000, max: 100 },
    };

    // Cleanup old entries every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if request should be allowed
   */
  checkLimit(identifier, endpoint = 'default') {
    if (!this.enabled) return { allowed: true };

    const limits = this.endpointLimits[endpoint] || this.endpointLimits.default;
    const key = `${identifier}:${endpoint}`;
    const now = Date.now();

    let client = this.clients.get(key);

    // Reset if window expired
    if (!client || now > client.resetTime) {
      client = {
        count: 0,
        resetTime: now + limits.windowMs,
      };
    }

    client.count++;
    this.clients.set(key, client);

    if (client.count > limits.max) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded',
        retryAfter: Math.ceil((client.resetTime - now) / 1000),
        limit: limits.max,
        remaining: 0,
        resetTime: client.resetTime,
      };
    }

    return {
      allowed: true,
      limit: limits.max,
      remaining: limits.max - client.count,
      resetTime: client.resetTime,
    };
  }

  /**
   * Set custom limit for endpoint
   */
  setEndpointLimit(endpoint, windowMs, max) {
    this.endpointLimits[endpoint] = { windowMs, max };
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, client] of this.clients) {
      if (now > client.resetTime) {
        this.clients.delete(key);
      }
    }
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      enabled: this.enabled,
      activeClients: this.clients.size,
      endpointLimits: this.endpointLimits,
    };
  }

  /**
   * Enable/disable rate limiting
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// =============================================================================
// PHASE 5C: SMART AUTOMATION
// =============================================================================

/**
 * AutoResponder - Rule-based auto-replies
 */
export class AutoResponder {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.enabled = options.enabled ?? false;
    this.rules = [];
    this.ruleStats = new Map(); // ruleId -> { triggered, lastTriggered }

    this.loadState();
  }

  /**
   * Add a rule
   */
  addRule(rule) {
    const newRule = {
      id: this.generateId(),
      enabled: true,
      priority: rule.priority || 0,
      ...rule,
      createdAt: Date.now(),
    };

    // Validate rule
    if (!newRule.trigger || !newRule.response) {
      throw new Error('Rule must have trigger and response');
    }

    this.rules.push(newRule);
    this.rules.sort((a, b) => b.priority - a.priority);
    this.saveState();

    return newRule;
  }

  /**
   * Update a rule
   */
  updateRule(ruleId, updates) {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index === -1) throw new Error('Rule not found');

    this.rules[index] = { ...this.rules[index], ...updates, updatedAt: Date.now() };
    this.rules.sort((a, b) => b.priority - a.priority);
    this.saveState();

    return this.rules[index];
  }

  /**
   * Delete a rule
   */
  deleteRule(ruleId) {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index === -1) return false;

    this.rules.splice(index, 1);
    this.saveState();
    return true;
  }

  /**
   * Check if message matches any rule
   */
  checkMessage(message, context = {}) {
    if (!this.enabled) return null;

    const text = message.text?.toLowerCase() || '';
    const from = message.from;

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      // Check contact filter
      if (rule.contacts && !rule.contacts.includes(from)) continue;
      if (rule.excludeContacts && rule.excludeContacts.includes(from)) continue;

      // Check time restrictions
      if (!this.isWithinSchedule(rule)) continue;

      // Check trigger
      if (this.matchesTrigger(text, rule.trigger)) {
        // Record stats
        const stats = this.ruleStats.get(rule.id) || { triggered: 0 };
        stats.triggered++;
        stats.lastTriggered = Date.now();
        this.ruleStats.set(rule.id, stats);
        this.saveState();

        return {
          matched: true,
          rule,
          response: this.processResponse(rule.response, message, context),
        };
      }
    }

    return null;
  }

  /**
   * Check if text matches trigger
   */
  matchesTrigger(text, trigger) {
    if (trigger.type === 'exact') {
      return text === trigger.value.toLowerCase();
    }

    if (trigger.type === 'contains') {
      return text.includes(trigger.value.toLowerCase());
    }

    if (trigger.type === 'startsWith') {
      return text.startsWith(trigger.value.toLowerCase());
    }

    if (trigger.type === 'regex') {
      try {
        const regex = new RegExp(trigger.value, 'i');
        return regex.test(text);
      } catch {
        return false;
      }
    }

    if (trigger.type === 'keywords') {
      const keywords = trigger.value.map(k => k.toLowerCase());
      return keywords.some(k => text.includes(k));
    }

    return false;
  }

  /**
   * Process response template
   */
  processResponse(response, message, context) {
    let text = response;

    // Replace variables
    text = text.replace(/\{from\}/g, message.from || '');
    text = text.replace(/\{name\}/g, context.name || 'there');
    text = text.replace(/\{time\}/g, new Date().toLocaleTimeString('id-ID'));
    text = text.replace(/\{date\}/g, new Date().toLocaleDateString('id-ID'));
    text = text.replace(/\{day\}/g, ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][new Date().getDay()]);

    return text;
  }

  /**
   * Check if current time is within rule's schedule
   */
  isWithinSchedule(rule) {
    if (!rule.schedule) return true;

    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    // Check days
    if (rule.schedule.days && !rule.schedule.days.includes(day)) {
      return false;
    }

    // Check hours
    if (rule.schedule.startHour !== undefined && hour < rule.schedule.startHour) {
      return false;
    }
    if (rule.schedule.endHour !== undefined && hour >= rule.schedule.endHour) {
      return false;
    }

    return true;
  }

  /**
   * Get all rules
   */
  getRules() {
    return this.rules.map(rule => ({
      ...rule,
      stats: this.ruleStats.get(rule.id) || { triggered: 0 },
    }));
  }

  getStats() {
    let totalTriggered = 0;
    for (const stats of this.ruleStats.values()) {
      totalTriggered += stats.triggered;
    }

    return {
      enabled: this.enabled,
      totalRules: this.rules.length,
      activeRules: this.rules.filter(r => r.enabled).length,
      totalTriggered,
    };
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.saveState();
  }

  generateId() {
    return 'rule_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.autoresponder-state.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        this.rules = data.rules || [];
        this.enabled = data.enabled ?? false;
        this.ruleStats = new Map(Object.entries(data.ruleStats || {}));
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.autoresponder-state.json');
    try {
      writeFileSync(stateFile, JSON.stringify({
        enabled: this.enabled,
        rules: this.rules,
        ruleStats: Object.fromEntries(this.ruleStats),
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

/**
 * MessageTemplates - Templates with variable substitution
 */
export class MessageTemplates {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.templates = new Map();
    this.usageStats = new Map();

    this.loadState();
  }

  /**
   * Create a template
   */
  create(name, content, metadata = {}) {
    const template = {
      name,
      content,
      variables: this.extractVariables(content),
      category: metadata.category || 'general',
      language: metadata.language || 'id',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.templates.set(name, template);
    this.saveState();

    return template;
  }

  /**
   * Update a template
   */
  update(name, content, metadata = {}) {
    const existing = this.templates.get(name);
    if (!existing) throw new Error('Template not found');

    const updated = {
      ...existing,
      content,
      variables: this.extractVariables(content),
      ...metadata,
      updatedAt: Date.now(),
    };

    this.templates.set(name, updated);
    this.saveState();

    return updated;
  }

  /**
   * Delete a template
   */
  delete(name) {
    const result = this.templates.delete(name);
    if (result) this.saveState();
    return result;
  }

  /**
   * Get a template
   */
  get(name) {
    return this.templates.get(name);
  }

  /**
   * Render a template with variables
   */
  render(name, variables = {}) {
    const template = this.templates.get(name);
    if (!template) throw new Error('Template not found');

    let content = template.content;

    // Replace variables
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      content = content.replace(regex, value);
    }

    // Replace built-in variables
    content = content.replace(/\{time\}/g, new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
    content = content.replace(/\{date\}/g, new Date().toLocaleDateString('id-ID'));
    content = content.replace(/\{day\}/g, ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][new Date().getDay()]);
    content = content.replace(/\{greeting\}/g, this.getGreeting());

    // Track usage
    const stats = this.usageStats.get(name) || { used: 0 };
    stats.used++;
    stats.lastUsed = Date.now();
    this.usageStats.set(name, stats);

    return content;
  }

  /**
   * Extract variable names from content
   */
  extractVariables(content) {
    const matches = content.match(/\{(\w+)\}/g) || [];
    const builtIn = ['time', 'date', 'day', 'greeting'];
    return [...new Set(matches.map(m => m.slice(1, -1)).filter(v => !builtIn.includes(v)))];
  }

  /**
   * Get time-appropriate greeting
   */
  getGreeting() {
    const hour = new Date().getHours();
    if (hour < 11) return 'Selamat pagi';
    if (hour < 15) return 'Selamat siang';
    if (hour < 18) return 'Selamat sore';
    return 'Selamat malam';
  }

  /**
   * List all templates
   */
  list(category = null) {
    let templates = [...this.templates.values()];

    if (category) {
      templates = templates.filter(t => t.category === category);
    }

    return templates.map(t => ({
      ...t,
      stats: this.usageStats.get(t.name) || { used: 0 },
    }));
  }

  /**
   * Get categories
   */
  getCategories() {
    const categories = new Set();
    for (const template of this.templates.values()) {
      categories.add(template.category);
    }
    return [...categories];
  }

  getStats() {
    return {
      totalTemplates: this.templates.size,
      categories: this.getCategories(),
      mostUsed: [...this.usageStats.entries()]
        .sort(([, a], [, b]) => b.used - a.used)
        .slice(0, 5)
        .map(([name, stats]) => ({ name, ...stats })),
    };
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.templates-state.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        this.templates = new Map(Object.entries(data.templates || {}));
        this.usageStats = new Map(Object.entries(data.usageStats || {}));
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.templates-state.json');
    try {
      writeFileSync(stateFile, JSON.stringify({
        templates: Object.fromEntries(this.templates),
        usageStats: Object.fromEntries(this.usageStats),
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

/**
 * ScheduledMessages - Send messages at specific times
 */
export class ScheduledMessages {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.sendFunction = options.sendFunction;
    this.logger = options.logger || console;
    this.scheduled = []; // { id, to, message, sendAt, status, ... }
    this.checkInterval = null;

    this.loadState();
  }

  /**
   * Schedule a message
   */
  schedule(to, message, sendAt, options = {}) {
    const scheduled = {
      id: this.generateId(),
      to,
      message,
      sendAt: new Date(sendAt).getTime(),
      status: 'pending',
      replyTo: options.replyTo || null,
      repeat: options.repeat || null, // null, 'daily', 'weekly'
      createdAt: Date.now(),
    };

    // Validate sendAt is in the future
    if (scheduled.sendAt <= Date.now()) {
      throw new Error('Scheduled time must be in the future');
    }

    this.scheduled.push(scheduled);
    this.saveState();

    return scheduled;
  }

  /**
   * Cancel a scheduled message
   */
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

  /**
   * Start the scheduler
   */
  start() {
    if (this.checkInterval) return;

    // Check every 30 seconds
    this.checkInterval = setInterval(() => this.processScheduled(), 30000);
    this.logger.info('Scheduled messages processor started');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Process scheduled messages
   */
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

        // Handle repeat
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

  /**
   * Schedule repeat of a message
   */
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

  /**
   * Get scheduled messages
   */
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

  /**
   * Get upcoming messages
   */
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

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  humanDelay,
  calculateTypingDuration,
  calculateThinkingPause,
  getBrowserFingerprint,
  checkMessageSafety,
  MessageRateLimiter,
  ReconnectionManager,
  ActivityTracker,
  // Phase 1 features
  PresenceManager,
  BanWarningSystem,
  MessageVariator,
  calculateReadDelay,
  calculateThinkingDelay,
  simulateHumanReading,
  // Phase 2 features
  MessageScheduler,
  DeliveryTracker,
  ActivityRamper,
  WeekendPatterns,
  TypingSimulator,
  EmojiEnhancer,
  ContactWarmup,
  GroupBehavior,
  NetworkFingerprint,
  // Phase 3 features
  ReactionManager,
  ReplyProbability,
  MessageSplitter,
  StatusViewer,
  SpamReportDetector,
  GeoIPMatcher,
  ProfileViewer,
  ForwardHandler,
  ConversationMemory,
  // Phase 4 features
  BlockDetector,
  SessionManager,
  PersistentQueue,
  WebhookManager,
  HealthMonitor,
  LanguageDetector,
  // Phase 5A: Analytics & Intelligence
  MessageAnalytics,
  ContactScoring,
  SentimentDetector,
  // Phase 5B: Security Hardening
  IPWhitelist,
  AuditLogger,
  APIRateLimiter,
  // Phase 5C: Smart Automation
  AutoResponder,
  MessageTemplates,
  ScheduledMessages,
};
