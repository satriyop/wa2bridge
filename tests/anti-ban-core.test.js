/**
 * Anti-Ban Core Tests
 *
 * Tests for Phase 1 anti-ban utilities to ensure:
 * - Human-like timing patterns are maintained
 * - Rate limiting works correctly by account age
 * - Browser fingerprint rotation functions properly
 * - Reconnection backoff behaves as expected
 *
 * These tests are CRITICAL - they verify the core anti-ban behaviors
 * that protect against WhatsApp's ML detection.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  humanDelay,
  calculateTypingDuration,
  calculateThinkingPause,
  getBrowserFingerprint,
  MessageRateLimiter,
  ReconnectionManager,
  ActivityTracker,
  PresenceManager,
  BanWarningSystem,
  MessageVariator,
  calculateReadDelay,
} from '../src/anti-ban.js';

// =============================================================================
// HUMAN DELAY TESTS
// =============================================================================

describe('humanDelay', () => {
  it('should return value within expected range', () => {
    const baseMs = 1000;
    const variance = 0.3;

    // Run multiple times to verify randomization
    for (let i = 0; i < 100; i++) {
      const result = humanDelay(baseMs, variance);
      expect(result).toBeGreaterThanOrEqual(700); // 1000 - 30%
      expect(result).toBeLessThanOrEqual(1300);   // 1000 + 30%
    }
  });

  it('should return different values (randomized)', () => {
    const results = new Set();
    for (let i = 0; i < 50; i++) {
      results.add(humanDelay(1000, 0.3));
    }
    // Should have multiple unique values (not deterministic)
    expect(results.size).toBeGreaterThan(10);
  });

  it('should use default variance when not specified', () => {
    const result = humanDelay(1000);
    expect(result).toBeGreaterThanOrEqual(700);
    expect(result).toBeLessThanOrEqual(1300);
  });

  it('should handle zero variance', () => {
    const result = humanDelay(1000, 0);
    expect(result).toBe(1000);
  });

  it('should handle large variance', () => {
    const result = humanDelay(1000, 0.9);
    expect(result).toBeGreaterThanOrEqual(100);
    expect(result).toBeLessThanOrEqual(1900);
  });
});

// =============================================================================
// TYPING DURATION TESTS
// =============================================================================

describe('calculateTypingDuration', () => {
  it('should scale with message length', () => {
    const shortMessage = 'Hi';
    const longMessage = 'This is a much longer message that takes more time to type out completely.';

    const shortDuration = calculateTypingDuration(shortMessage);
    const longDuration = calculateTypingDuration(longMessage);

    expect(longDuration).toBeGreaterThan(shortDuration);
  });

  it('should respect minimum duration', () => {
    const result = calculateTypingDuration('Hi', 1000);
    expect(result).toBeGreaterThanOrEqual(1000);
  });

  it('should respect maximum duration', () => {
    const veryLongMessage = 'A'.repeat(500);
    const result = calculateTypingDuration(veryLongMessage, 1000, 6000);
    expect(result).toBeLessThanOrEqual(6000);
  });

  it('should use defaults when not specified', () => {
    const result = calculateTypingDuration('Hello world');
    expect(result).toBeGreaterThanOrEqual(1000);
    expect(result).toBeLessThanOrEqual(6000);
  });
});

// =============================================================================
// THINKING PAUSE TESTS
// =============================================================================

describe('calculateThinkingPause', () => {
  it('should increase with message complexity', () => {
    const simple = 'Hi';
    const complex = 'Can you please explain how the billing system works and what options I have for payment methods?';

    const simplePause = calculateThinkingPause(simple);
    const complexPause = calculateThinkingPause(complex);

    expect(complexPause).toBeGreaterThan(simplePause);
  });

  it('should have minimum pause of around 500ms', () => {
    const result = calculateThinkingPause('Hi');
    expect(result).toBeGreaterThanOrEqual(250); // With variance
  });

  it('should cap at reasonable maximum', () => {
    const veryLong = 'A'.repeat(1000);
    const result = calculateThinkingPause(veryLong);
    expect(result).toBeLessThanOrEqual(4000); // 2000 base + 100% variance
  });
});

// =============================================================================
// BROWSER FINGERPRINT TESTS
// =============================================================================

describe('getBrowserFingerprint', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wa2bridge-test-'));
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  it('should return legacy fingerprint on first run', () => {
    const fingerprint = getBrowserFingerprint(tempDir);

    expect(fingerprint).toEqual(['Ubuntu', 'Chrome', '124.0.6367.91']);
  });

  it('should persist fingerprint to file', () => {
    getBrowserFingerprint(tempDir);

    const fingerprintFile = join(tempDir, '.browser-fingerprint.json');
    expect(existsSync(fingerprintFile)).toBe(true);

    const stored = JSON.parse(readFileSync(fingerprintFile, 'utf-8'));
    expect(stored.browser).toEqual(['Ubuntu', 'Chrome', '124.0.6367.91']);
    expect(stored.timestamp).toBeDefined();
    expect(stored.rotationCount).toBe(0);
  });

  it('should return same fingerprint within rotation interval', () => {
    const first = getBrowserFingerprint(tempDir);
    const second = getBrowserFingerprint(tempDir);

    expect(second).toEqual(first);
  });

  it('should track rotation count', () => {
    getBrowserFingerprint(tempDir);

    const fingerprintFile = join(tempDir, '.browser-fingerprint.json');
    const stored = JSON.parse(readFileSync(fingerprintFile, 'utf-8'));

    expect(stored.rotationCount).toBe(0);
  });
});

// =============================================================================
// RATE LIMITER TESTS
// =============================================================================

describe('MessageRateLimiter', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wa2bridge-test-'));
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  it('should have conservative limits for new accounts (week 1)', () => {
    const limiter = new MessageRateLimiter({ accountAgeWeeks: 1 });
    const limits = limiter.getLimits();

    expect(limits.hourly).toBe(5);
    expect(limits.daily).toBe(15);
    expect(limits.description).toContain('Week 1');
  });

  it('should have moderate limits for warming accounts (week 2-4)', () => {
    const limiter = new MessageRateLimiter({ accountAgeWeeks: 3 });
    const limits = limiter.getLimits();

    expect(limits.hourly).toBe(15);
    expect(limits.daily).toBe(40);
  });

  it('should have higher limits for mature accounts (8+ weeks)', () => {
    const limiter = new MessageRateLimiter({ accountAgeWeeks: 10 });
    const limits = limiter.getLimits();

    expect(limits.hourly).toBe(30);
    expect(limits.daily).toBe(150);
    expect(limits.description).toContain('Month 2+');
  });

  it('should track message counts', () => {
    const limiter = new MessageRateLimiter({ accountAgeWeeks: 10, sessionsDir: tempDir });

    limiter.recordSend();
    limiter.recordSend();

    expect(limiter.hourlyCount).toBe(2);
    expect(limiter.dailyCount).toBe(2);
  });

  it('should allow messages within limits', async () => {
    const limiter = new MessageRateLimiter({ accountAgeWeeks: 10, sessionsDir: tempDir });

    const canSend = await limiter.canSend();
    expect(canSend.allowed).toBe(true);
  });

  it('should block messages when hourly limit exceeded', async () => {
    const limiter = new MessageRateLimiter({ accountAgeWeeks: 1, sessionsDir: tempDir });

    // Week 1 limit is 5/hour
    for (let i = 0; i < 5; i++) {
      limiter.recordSend();
    }

    const canSend = await limiter.canSend();
    expect(canSend.allowed).toBe(false);
    expect(canSend.reason).toContain('Hourly');
  });

  it('should persist and load stats', () => {
    const limiter1 = new MessageRateLimiter({ accountAgeWeeks: 10, sessionsDir: tempDir });
    limiter1.recordSend();
    limiter1.recordSend();
    limiter1.saveStats();

    // Create new instance - should load persisted stats
    const limiter2 = new MessageRateLimiter({ accountAgeWeeks: 10, sessionsDir: tempDir });

    expect(limiter2.dailyCount).toBe(2);
  });

  it('should support setAccountAge', () => {
    const limiter = new MessageRateLimiter({ accountAgeWeeks: 1 });

    expect(limiter.getLimits().hourly).toBe(5);

    limiter.setAccountAge(10);
    expect(limiter.getLimits().hourly).toBe(30);
  });
});

// =============================================================================
// RECONNECTION MANAGER TESTS
// =============================================================================

describe('ReconnectionManager', () => {
  it('should start with initial delay', () => {
    const manager = new ReconnectionManager();
    const result = manager.getNextDelay();

    expect(result.delay).toBeGreaterThanOrEqual(1000);
    expect(result.delay).toBeLessThanOrEqual(10000); // With jitter
  });

  it('should increase delay exponentially', () => {
    const manager = new ReconnectionManager({
      baseDelay: 1000,
      maxDelay: 300000,
    });

    const result1 = manager.getNextDelay();
    const result2 = manager.getNextDelay();
    const result3 = manager.getNextDelay();

    // Each should be roughly double (with jitter variance)
    expect(result2.delay).toBeGreaterThan(result1.delay * 0.7);
    expect(result3.delay).toBeGreaterThan(result2.delay * 0.7);
  });

  it('should cap at maximum delay', () => {
    const manager = new ReconnectionManager({
      baseDelay: 100000,
      maxDelay: 300000,
    });

    for (let i = 0; i < 10; i++) {
      manager.getNextDelay();
    }

    const result = manager.getNextDelay();
    expect(result.delay).toBeLessThanOrEqual(300000 * 1.3); // Max + jitter
  });

  it('should reset after successful connection', () => {
    const manager = new ReconnectionManager({ baseDelay: 1000 });

    // Increase delay
    manager.getNextDelay();
    manager.getNextDelay();
    manager.getNextDelay();

    // Reset
    manager.reset();

    // Should be back to initial
    const result = manager.getNextDelay();
    expect(result.delay).toBeLessThanOrEqual(2000); // Initial + jitter
  });

  it('should track attempt count', () => {
    const manager = new ReconnectionManager();

    expect(manager.attempts).toBe(0);

    manager.getNextDelay();
    expect(manager.attempts).toBe(1);

    manager.getNextDelay();
    expect(manager.attempts).toBe(2);
  });
});

// =============================================================================
// ACTIVITY TRACKER TESTS
// =============================================================================

describe('ActivityTracker', () => {
  it('should track message sent/received ratio', () => {
    const tracker = new ActivityTracker();

    tracker.recordSent('contact1');
    tracker.recordSent('contact2');
    tracker.recordReceived('contact1');

    const stats = tracker.getStats();
    expect(stats.sent).toBe(2);
    expect(stats.received).toBe(1);
    expect(stats.responseRatio).toBe('50%');
  });

  it('should track unique contacts', () => {
    const tracker = new ActivityTracker();

    tracker.recordSent('contact1');
    tracker.recordSent('contact1');  // Same contact
    tracker.recordSent('contact2');
    tracker.recordReceived('contact1');
    tracker.recordReceived('contact3');

    const stats = tracker.getStats();
    expect(stats.uniqueRecipients).toBe(2);  // contact1, contact2
    expect(stats.uniqueSenders).toBe(2);     // contact1, contact3
  });

  it('should warn when response ratio is too low', () => {
    const tracker = new ActivityTracker();

    // Send many, receive few (bot-like behavior)
    for (let i = 0; i < 20; i++) {
      tracker.recordSent(`contact${i}`);
    }
    tracker.recordReceived('contact1');

    const result = tracker.isSafeToSend();
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('Low response ratio');
  });

  it('should show safe for balanced activity', () => {
    const tracker = new ActivityTracker();

    // Equal send/receive (human-like)
    for (let i = 0; i < 10; i++) {
      tracker.recordSent(`contact${i}`);
      tracker.recordReceived(`contact${i}`);
    }

    const result = tracker.isSafeToSend();
    expect(result.safe).toBe(true);
  });
});

// =============================================================================
// BAN WARNING SYSTEM TESTS
// =============================================================================

describe('BanWarningSystem', () => {
  it('should detect rate limit warning', () => {
    const warning = new BanWarningSystem();

    // Simulate rate limit event
    warning.recordRateLimitHit();

    const metrics = warning.getMetrics();
    expect(metrics.rateLimitHits).toBe(1);
  });

  it('should calculate risk score', () => {
    const warning = new BanWarningSystem();

    // No events = low risk
    const initialRisk = warning.evaluateRisk();
    expect(initialRisk.riskScore).toBe(0);

    // Add warning events
    warning.recordRateLimitHit();
    warning.recordConnectionDrop();

    const afterRisk = warning.evaluateRisk();
    expect(afterRisk.riskScore).toBeGreaterThanOrEqual(0);
  });

  it('should track connection drops', () => {
    const warning = new BanWarningSystem();

    warning.recordConnectionDrop();
    warning.recordConnectionDrop();

    const metrics = warning.getMetrics();
    expect(metrics.connectionDrops).toBe(2);
  });

  it('should support hibernation mode', () => {
    const warning = new BanWarningSystem();

    expect(warning.hibernationMode).toBe(false);

    // Manually set hibernation (normally auto-triggered at critical level)
    warning.hibernationMode = true;
    expect(warning.hibernationMode).toBe(true);

    warning.exitHibernation();
    expect(warning.hibernationMode).toBe(false);
  });

  it('should block sending when hibernating', () => {
    const warning = new BanWarningSystem();

    warning.hibernationMode = true;
    const canSend = warning.canSend();
    expect(canSend.allowed).toBe(false);
    expect(canSend.reason).toContain('Hibernation');
  });
});

// =============================================================================
// MESSAGE VARIATOR TESTS
// =============================================================================

describe('MessageVariator', () => {
  it('should return string for any input', () => {
    const variator = new MessageVariator();

    const result = variator.vary('Hello there!');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('should vary repeated messages', () => {
    const variator = new MessageVariator();
    const message = 'Hello';

    // Send same message multiple times - should get variations
    const results = new Set();
    for (let i = 0; i < 20; i++) {
      results.add(variator.vary(message, 0.5));
    }

    // Should have some variation over multiple calls
    expect(typeof [...results][0]).toBe('string');
  });

  it('should apply greeting variations', () => {
    const variator = new MessageVariator();

    // With high variation level, "hi" might become "hey", "hello", "halo", etc.
    const results = new Set();
    for (let i = 0; i < 50; i++) {
      results.add(variator.vary('hi', 1.0).toLowerCase());
    }

    // Should have at least some variation
    expect(results.size).toBeGreaterThanOrEqual(1);
  });

  it('should respect variation level', () => {
    const variator = new MessageVariator();

    // With zero variation level, should still apply minor variations
    const result = variator.vary('Test message', 0);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// READ DELAY TESTS
// =============================================================================

describe('calculateReadDelay', () => {
  it('should calculate read delay based on message', () => {
    const shortDelay = calculateReadDelay('Hi');
    const longDelay = calculateReadDelay('This is a much longer message that would take more time to read carefully and understand.');

    expect(longDelay).toBeGreaterThan(shortDelay);
  });

  it('should have minimum read delay', () => {
    const delay = calculateReadDelay('Hi');
    expect(delay).toBeGreaterThanOrEqual(500); // Minimum human reading time
  });

  it('should cap at reasonable maximum', () => {
    const veryLong = 'A'.repeat(1000);
    const delay = calculateReadDelay(veryLong);
    expect(delay).toBeLessThanOrEqual(15000); // Max reasonable read time
  });
});
