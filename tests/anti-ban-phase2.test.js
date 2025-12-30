/**
 * Anti-Ban Phase 2+ Feature Tests
 *
 * Tests for Phase 2-5 anti-ban features including:
 * - Smart message scheduling
 * - Contact warmup tracking
 * - Language detection
 * - Sentiment analysis
 * - Contact scoring
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  // Phase 2
  MessageScheduler,
  DeliveryTracker,
  ContactWarmup,
  WeekendPatterns,
  // Phase 3
  ConversationMemory,
  SpamReportDetector,
  MessageSplitter,
  // Phase 4
  LanguageDetector,
  BlockDetector,
  // Phase 5
  MessageAnalytics,
  ContactScoring,
  SentimentDetector,
  AutoResponder,
  MessageTemplates,
  ScheduledMessages,
} from '../src/anti-ban.js';

// =============================================================================
// PHASE 2: MESSAGE SCHEDULER
// =============================================================================

describe('MessageScheduler', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wa2bridge-test-'));
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  it('should add messages to queue', () => {
    const scheduler = new MessageScheduler({ sessionsDir: tempDir });

    scheduler.add('123@s.whatsapp.net', 'Hello!');

    const status = scheduler.getStatus();
    expect(status.queueLength).toBe(1);
  });

  it('should get next message from queue', () => {
    const scheduler = new MessageScheduler({ sessionsDir: tempDir });

    scheduler.add('123@s.whatsapp.net', 'Hello!');

    const next = scheduler.getNext();
    expect(next).not.toBeNull();
    expect(next.to).toBe('123@s.whatsapp.net');
  });

  it('should clear queue', () => {
    const scheduler = new MessageScheduler({ sessionsDir: tempDir });

    scheduler.add('123@s.whatsapp.net', 'Hello!');
    scheduler.add('456@s.whatsapp.net', 'Hi!');

    scheduler.clear();

    const status = scheduler.getStatus();
    expect(status.queueLength).toBe(0);
  });
});

// =============================================================================
// PHASE 2: CONTACT WARMUP
// =============================================================================

describe('ContactWarmup', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wa2bridge-test-'));
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  it('should track new contacts as cold', () => {
    const warmup = new ContactWarmup({ sessionsDir: tempDir });

    const status = warmup.getStatus('new@s.whatsapp.net');
    expect(status.level).toBe('cold');
  });

  it('should warm up contacts over interactions', () => {
    const warmup = new ContactWarmup({ sessionsDir: tempDir });
    const contact = 'test@s.whatsapp.net';

    // Simulate multiple interactions
    warmup.recordInteraction(contact);
    warmup.recordInteraction(contact);
    warmup.recordInteraction(contact);

    const status = warmup.getStatus(contact);
    expect(status.interactionCount).toBe(3);
  });

  it('should recommend wait time for cold contacts', () => {
    const warmup = new ContactWarmup({ sessionsDir: tempDir });

    const status = warmup.getStatus('cold@s.whatsapp.net');
    expect(status.recommendedWaitMs).toBeGreaterThan(0);
  });

  it('should check if sending is safe', () => {
    const warmup = new ContactWarmup({ sessionsDir: tempDir });

    const isSafe = warmup.canSendTo('new@s.whatsapp.net');
    expect(typeof isSafe).toBe('boolean');
  });
});

// =============================================================================
// PHASE 2: DELIVERY TRACKER
// =============================================================================

describe('DeliveryTracker', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wa2bridge-test-'));
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  it('should track message delivery', () => {
    const tracker = new DeliveryTracker({ sessionsDir: tempDir });

    tracker.trackMessage('msg1', 'contact1@s.whatsapp.net');

    const stats = tracker.getStats();
    expect(stats.totalTracked).toBe(1);
  });

  it('should update delivery status', () => {
    const tracker = new DeliveryTracker({ sessionsDir: tempDir });

    tracker.trackMessage('msg1', 'contact1@s.whatsapp.net');
    tracker.updateStatus('msg1', 'delivered');

    const status = tracker.getMessageStatus('msg1');
    expect(status.status).toBe('delivered');
  });

  it('should track delivery rates', () => {
    const tracker = new DeliveryTracker({ sessionsDir: tempDir });

    tracker.trackMessage('msg1', 'contact1@s.whatsapp.net');
    tracker.updateStatus('msg1', 'delivered');
    tracker.trackMessage('msg2', 'contact2@s.whatsapp.net');
    tracker.updateStatus('msg2', 'delivered');

    const health = tracker.getDeliveryHealth();
    expect(health.deliveryRate).toBeGreaterThan(0);
  });
});

// =============================================================================
// PHASE 3: CONVERSATION MEMORY
// =============================================================================

describe('ConversationMemory', () => {
  it('should track conversation history', () => {
    const memory = new ConversationMemory();

    memory.recordMessage('123@s.whatsapp.net', 'out', 'Hello!');

    const context = memory.getContext('123@s.whatsapp.net');
    expect(context.messageCount).toBe(1);
  });

  it('should track message direction', () => {
    const memory = new ConversationMemory();
    const contact = '123@s.whatsapp.net';

    memory.recordMessage(contact, 'out', 'Hi');
    memory.recordMessage(contact, 'in', 'Hello');
    memory.recordMessage(contact, 'out', 'How are you?');

    const context = memory.getContext(contact);
    expect(context.outgoing).toBe(2);
    expect(context.incoming).toBe(1);
  });

  it('should list active conversations', () => {
    const memory = new ConversationMemory();

    memory.recordMessage('contact1@s.whatsapp.net', 'out', 'Hi');
    memory.recordMessage('contact2@s.whatsapp.net', 'out', 'Hello');
    memory.recordMessage('contact3@s.whatsapp.net', 'in', 'Hey');

    const active = memory.getActiveConversations();
    expect(active.length).toBe(3);
  });
});

// =============================================================================
// PHASE 3: MESSAGE SPLITTER
// =============================================================================

describe('MessageSplitter', () => {
  it('should not split short messages', () => {
    const splitter = new MessageSplitter({ maxLength: 500 });

    const result = splitter.split('Hello there!');
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('Hello there!');
  });

  it('should split long messages', () => {
    const splitter = new MessageSplitter({ maxLength: 100 });

    const longMessage = 'First sentence here. Second sentence follows. Third sentence is added. Fourth sentence comes next. Fifth sentence appears.';
    const result = splitter.split(longMessage);

    expect(result.length).toBeGreaterThan(1);
    // Each part should be under max length
    result.forEach((part) => {
      expect(part.length).toBeLessThanOrEqual(100);
    });
  });

  it('should use default max length', () => {
    const splitter = new MessageSplitter();

    const shortMessage = 'Short message';
    const result = splitter.split(shortMessage);

    expect(result).toHaveLength(1);
  });
});

// =============================================================================
// PHASE 4: LANGUAGE DETECTOR
// =============================================================================

describe('LanguageDetector', () => {
  it('should detect Indonesian', () => {
    const detector = new LanguageDetector();

    const result = detector.detect('Selamat pagi, apa kabar?');
    expect(result.language).toBe('id');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('should detect English', () => {
    const detector = new LanguageDetector();

    const result = detector.detect('Hello, how are you today?');
    expect(result.language).toBe('en');
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it('should handle mixed language', () => {
    const detector = new LanguageDetector();

    const result = detector.detect('Hey apa kabar, I am fine thanks');
    // Should still detect a language
    expect(['en', 'id', 'unknown']).toContain(result.language);
  });

  it('should handle short messages gracefully', () => {
    const detector = new LanguageDetector();

    const result = detector.detect('OK');
    // Should not crash, may return unknown
    expect(result).toBeDefined();
    expect(result.language).toBeDefined();
  });

  it('should track contact language history', () => {
    const detector = new LanguageDetector();
    const contact = '123@s.whatsapp.net';

    detector.recordForContact(contact, 'Selamat pagi');
    detector.recordForContact(contact, 'Terima kasih');

    const pref = detector.getContactLanguage(contact);
    expect(pref.primary).toBe('id');
  });
});

// =============================================================================
// PHASE 5A: MESSAGE ANALYTICS
// =============================================================================

describe('MessageAnalytics', () => {
  it('should track message counts', () => {
    const analytics = new MessageAnalytics();

    analytics.recordMessage('out', '123@s.whatsapp.net');
    analytics.recordMessage('out', '456@s.whatsapp.net');
    analytics.recordMessage('in', '123@s.whatsapp.net');

    const stats = analytics.getStats();
    expect(stats.totalSent).toBe(2);
    expect(stats.totalReceived).toBe(1);
  });

  it('should track by contact', () => {
    const analytics = new MessageAnalytics();
    const contact = '123@s.whatsapp.net';

    analytics.recordMessage('out', contact);
    analytics.recordMessage('out', contact);
    analytics.recordMessage('in', contact);

    const contactStats = analytics.getContactStats(contact);
    expect(contactStats.sent).toBe(2);
    expect(contactStats.received).toBe(1);
  });

  it('should identify peak hours', () => {
    const analytics = new MessageAnalytics();

    // Record several messages
    for (let i = 0; i < 20; i++) {
      analytics.recordMessage('out', '123@s.whatsapp.net');
    }

    const peakHours = analytics.getPeakHours();
    expect(peakHours).toBeDefined();
  });
});

// =============================================================================
// PHASE 5A: CONTACT SCORING
// =============================================================================

describe('ContactScoring', () => {
  it('should score new contacts as bronze', () => {
    const scoring = new ContactScoring();

    const score = scoring.getScore('new@s.whatsapp.net');
    expect(score.tier).toBe('bronze');
    expect(score.points).toBe(0);
  });

  it('should increase score on interactions', () => {
    const scoring = new ContactScoring();
    const contact = '123@s.whatsapp.net';

    scoring.recordInteraction(contact, 'message_sent');
    scoring.recordInteraction(contact, 'message_received');
    scoring.recordInteraction(contact, 'reply_received');

    const score = scoring.getScore(contact);
    expect(score.points).toBeGreaterThan(0);
  });

  it('should promote to higher tiers with many interactions', () => {
    const scoring = new ContactScoring();
    const contact = '123@s.whatsapp.net';

    // Simulate lots of positive interactions
    for (let i = 0; i < 100; i++) {
      scoring.recordInteraction(contact, 'message_sent');
      scoring.recordInteraction(contact, 'reply_received');
    }

    const score = scoring.getScore(contact);
    expect(['silver', 'gold', 'platinum']).toContain(score.tier);
  });

  it('should identify top contacts', () => {
    const scoring = new ContactScoring();

    // Create contacts with different scores
    scoring.recordInteraction('high@s.whatsapp.net', 'reply_received');
    scoring.recordInteraction('high@s.whatsapp.net', 'reply_received');
    scoring.recordInteraction('low@s.whatsapp.net', 'message_sent');

    const top = scoring.getTopContacts(5);
    expect(top[0].phone).toBe('high@s.whatsapp.net');
  });
});

// =============================================================================
// PHASE 5A: SENTIMENT DETECTOR
// =============================================================================

describe('SentimentDetector', () => {
  it('should detect positive sentiment', () => {
    const detector = new SentimentDetector();

    const result = detector.analyze('Terima kasih banyak! Sangat membantu!');
    expect(result.sentiment).toBe('positive');
    expect(result.score).toBeGreaterThan(0);
  });

  it('should detect negative sentiment', () => {
    const detector = new SentimentDetector();

    const result = detector.analyze('Ini sangat buruk, mengecewakan sekali');
    expect(result.sentiment).toBe('negative');
    expect(result.score).toBeLessThan(0);
  });

  it('should detect neutral sentiment', () => {
    const detector = new SentimentDetector();

    const result = detector.analyze('Baik, saya mengerti');
    expect(result.sentiment).toBe('neutral');
  });

  it('should work with English', () => {
    const detector = new SentimentDetector();

    const positive = detector.analyze('Thank you so much! This is wonderful!');
    const negative = detector.analyze('This is terrible, very disappointing');

    expect(positive.sentiment).toBe('positive');
    expect(negative.sentiment).toBe('negative');
  });
});

// =============================================================================
// PHASE 5C: AUTO RESPONDER
// =============================================================================

describe('AutoResponder', () => {
  it('should match keyword rules', () => {
    const responder = new AutoResponder();

    responder.addRule({
      id: 'greeting',
      trigger: { type: 'keyword', value: 'halo' },
      response: 'Halo! Ada yang bisa dibantu?',
    });

    const match = responder.findMatch('Halo, apakah masih buka?');
    expect(match).not.toBeNull();
    expect(match.response).toContain('Ada yang bisa dibantu');
  });

  it('should match regex rules', () => {
    const responder = new AutoResponder();

    responder.addRule({
      id: 'price',
      trigger: { type: 'regex', value: 'harga|price|berapa' },
      response: 'Silakan cek price list kami di website',
    });

    const match = responder.findMatch('Berapa harganya?');
    expect(match).not.toBeNull();
  });

  it('should respect rule priority', () => {
    const responder = new AutoResponder();

    responder.addRule({
      id: 'general',
      trigger: { type: 'keyword', value: 'halo' },
      response: 'Halo umum',
      priority: 1,
    });

    responder.addRule({
      id: 'vip',
      trigger: { type: 'keyword', value: 'halo' },
      response: 'Halo VIP!',
      priority: 10,
    });

    const match = responder.findMatch('Halo!');
    expect(match.response).toBe('Halo VIP!');
  });

  it('should support enable/disable', () => {
    const responder = new AutoResponder();

    responder.addRule({
      id: 'test',
      trigger: { type: 'keyword', value: 'test' },
      response: 'Test response',
      enabled: false,
    });

    const match = responder.findMatch('test');
    expect(match).toBeNull();
  });
});

// =============================================================================
// PHASE 5C: MESSAGE TEMPLATES
// =============================================================================

describe('MessageTemplates', () => {
  it('should render templates with variables', () => {
    const templates = new MessageTemplates();

    templates.add({
      name: 'greeting',
      template: 'Halo {{name}}, selamat {{time}}!',
    });

    const result = templates.render('greeting', {
      name: 'Budi',
      time: 'pagi',
    });

    expect(result).toBe('Halo Budi, selamat pagi!');
  });

  it('should support default values', () => {
    const templates = new MessageTemplates();

    templates.add({
      name: 'welcome',
      template: 'Selamat datang {{name:Pelanggan}}!',
    });

    const result = templates.render('welcome', {});
    expect(result).toBe('Selamat datang Pelanggan!');
  });

  it('should list all templates', () => {
    const templates = new MessageTemplates();

    templates.add({ name: 'template1', template: 'Test 1' });
    templates.add({ name: 'template2', template: 'Test 2' });

    const list = templates.list();
    expect(list.length).toBe(2);
  });

  it('should delete templates', () => {
    const templates = new MessageTemplates();

    templates.add({ name: 'toDelete', template: 'Delete me' });
    templates.delete('toDelete');

    const result = templates.render('toDelete', {});
    expect(result).toBeNull();
  });
});

// =============================================================================
// PHASE 5C: SCHEDULED MESSAGES
// =============================================================================

describe('ScheduledMessages', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'wa2bridge-test-'));
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true });
    }
  });

  it('should schedule one-time messages', () => {
    const scheduler = new ScheduledMessages({ sessionsDir: tempDir });

    const id = scheduler.schedule({
      to: '123@s.whatsapp.net',
      message: 'Scheduled message',
      sendAt: new Date(Date.now() + 3600000), // 1 hour from now
      type: 'once',
    });

    expect(id).toBeDefined();

    const pending = scheduler.getUpcoming();
    expect(pending.length).toBe(1);
  });

  it('should schedule daily recurring messages', () => {
    const scheduler = new ScheduledMessages({ sessionsDir: tempDir });

    const id = scheduler.schedule({
      to: '123@s.whatsapp.net',
      message: 'Daily reminder',
      sendAt: new Date(Date.now() + 3600000),
      type: 'daily',
    });

    const scheduled = scheduler.getById(id);
    expect(scheduled.type).toBe('daily');
  });

  it('should cancel scheduled messages', () => {
    const scheduler = new ScheduledMessages({ sessionsDir: tempDir });

    const id = scheduler.schedule({
      to: '123@s.whatsapp.net',
      message: 'Will be cancelled',
      sendAt: new Date(Date.now() + 3600000),
      type: 'once',
    });

    scheduler.cancel(id);

    const pending = scheduler.getUpcoming();
    expect(pending.find((s) => s.id === id)).toBeUndefined();
  });

  it('should track scheduled message stats', () => {
    const scheduler = new ScheduledMessages({ sessionsDir: tempDir });

    scheduler.schedule({
      to: '123@s.whatsapp.net',
      message: 'Test 1',
      sendAt: new Date(Date.now() + 3600000),
      type: 'once',
    });

    scheduler.schedule({
      to: '456@s.whatsapp.net',
      message: 'Test 2',
      sendAt: new Date(Date.now() + 7200000),
      type: 'daily',
    });

    const stats = scheduler.getStats();
    expect(stats.total).toBe(2);
  });
});
