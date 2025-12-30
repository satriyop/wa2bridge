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
  it('should return message id when enqueuing', () => {
    const scheduler = new MessageScheduler();

    const messageId = scheduler.enqueue('123@s.whatsapp.net', 'Hello!');

    expect(messageId).toBeDefined();
    expect(typeof messageId).toBe('string');
  });

  it('should support priority parameter', () => {
    const scheduler = new MessageScheduler();

    // Add with different priorities - should not throw
    const normalId = scheduler.enqueue('123@s.whatsapp.net', 'Normal message', null, 'normal');
    const highId = scheduler.enqueue('456@s.whatsapp.net', 'High priority!', null, 'high');
    const lowId = scheduler.enqueue('789@s.whatsapp.net', 'Low priority', null, 'low');

    expect(normalId).toBeDefined();
    expect(highId).toBeDefined();
    expect(lowId).toBeDefined();
  });

  it('should clear queue', () => {
    const scheduler = new MessageScheduler();

    scheduler.clear();

    const status = scheduler.getStatus();
    expect(status.queueLength).toBe(0);
  });

  it('should track batch processing state', () => {
    const scheduler = new MessageScheduler();

    const status = scheduler.getStatus();
    expect(status.messagesSentInBatch).toBeDefined();
    expect(status.batchSize).toBeDefined();
    expect(status.processing).toBeDefined();
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

  it('should track new contacts as new status', () => {
    const warmup = new ContactWarmup({ sessionsDir: tempDir });

    const status = warmup.getContactStatus('new@s.whatsapp.net');
    expect(status.status).toBe('new');
  });

  it('should warm up contacts over interactions', () => {
    const warmup = new ContactWarmup({ sessionsDir: tempDir });
    const contact = 'test@s.whatsapp.net';

    // Simulate multiple interactions
    warmup.recordContact(contact);
    warmup.recordContact(contact);
    warmup.recordContact(contact);

    const status = warmup.getContactStatus(contact);
    expect(status.messageCount).toBe(3);
  });

  it('should track warmup days remaining', () => {
    const warmup = new ContactWarmup({ sessionsDir: tempDir });

    const status = warmup.getContactStatus('cold@s.whatsapp.net');
    expect(status.warmupDaysRemaining).toBe(7);  // Default 7 days for new contacts
  });

  it('should check if messaging is allowed', () => {
    const warmup = new ContactWarmup({ sessionsDir: tempDir });

    const canMessage = warmup.canMessage('new@s.whatsapp.net');
    expect(canMessage.allowed).toBe(true);
    expect(canMessage.isNew).toBe(true);
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

    tracker.recordSent('msg1', 'contact1@s.whatsapp.net');

    const stats = tracker.getStats();
    expect(stats.sent).toBe(1);
    expect(stats.pending).toBe(1);
  });

  it('should update delivery status', () => {
    const tracker = new DeliveryTracker({ sessionsDir: tempDir });

    tracker.recordSent('msg1', 'contact1@s.whatsapp.net');
    tracker.updateStatus('msg1', 'delivered');

    const stats = tracker.getStats();
    expect(stats.delivered).toBe(1);
  });

  it('should track delivery rates', () => {
    const tracker = new DeliveryTracker({ sessionsDir: tempDir });

    tracker.recordSent('msg1', 'contact1@s.whatsapp.net');
    tracker.updateStatus('msg1', 'delivered');
    tracker.recordSent('msg2', 'contact2@s.whatsapp.net');
    tracker.updateStatus('msg2', 'delivered');

    const stats = tracker.getStats();
    expect(stats.deliveryRate).toBe('100.0%');
  });

  it('should check delivery health', () => {
    const tracker = new DeliveryTracker({ sessionsDir: tempDir });

    tracker.recordSent('msg1', 'contact1@s.whatsapp.net');
    tracker.updateStatus('msg1', 'delivered');

    const health = tracker.checkDeliveryHealth();
    expect(health.healthy).toBe(true);
    expect(health.issues).toHaveLength(0);
  });
});

// =============================================================================
// PHASE 3: CONVERSATION MEMORY
// =============================================================================

describe('ConversationMemory', () => {
  it('should track conversation history', () => {
    const memory = new ConversationMemory();

    memory.recordMessage('123@s.whatsapp.net', 'Hello!', 'sent');

    const context = memory.getContext('123@s.whatsapp.net');
    expect(context.messageCount).toBe(1);
    expect(context.isNew).toBe(false);
  });

  it('should track message direction', () => {
    const memory = new ConversationMemory();
    const contact = '123@s.whatsapp.net';

    memory.recordMessage(contact, 'Hi', 'sent');
    memory.recordMessage(contact, 'Hello', 'received');
    memory.recordMessage(contact, 'How are you?', 'sent');

    const context = memory.getContext(contact);
    expect(context.messageCount).toBe(3);
  });

  it('should list active conversations', () => {
    const memory = new ConversationMemory();

    memory.recordMessage('contact1@s.whatsapp.net', 'Hi', 'sent');
    memory.recordMessage('contact2@s.whatsapp.net', 'Hello', 'sent');
    memory.recordMessage('contact3@s.whatsapp.net', 'Hey', 'received');

    const active = memory.getActiveConversations();
    expect(active.length).toBe(3);
  });

  it('should detect active conversation within time window', () => {
    const memory = new ConversationMemory();
    const contact = '123@s.whatsapp.net';

    memory.recordMessage(contact, 'Hi', 'sent');

    const isActive = memory.isActiveConversation(contact);
    expect(isActive).toBe(true);
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

    detector.recordContactLanguage(contact, 'Selamat pagi apa kabar');
    detector.recordContactLanguage(contact, 'Terima kasih banyak');

    const pref = detector.getContactLanguage(contact);
    expect(pref.language).toBe('id');
    expect(pref.confidence).toBeGreaterThan(0);
  });
});

// =============================================================================
// PHASE 5A: MESSAGE ANALYTICS
// =============================================================================

describe('MessageAnalytics', () => {
  it('should track message counts', () => {
    const analytics = new MessageAnalytics();

    analytics.recordSent('123@s.whatsapp.net', 10);
    analytics.recordSent('456@s.whatsapp.net', 15);
    analytics.recordReceived('123@s.whatsapp.net', 20);

    const summary = analytics.getSummary();
    expect(summary.totalMessagesSent).toBe(2);
    expect(summary.totalMessagesReceived).toBe(1);
  });

  it('should track by contact', () => {
    const analytics = new MessageAnalytics();
    const contact = '123@s.whatsapp.net';

    analytics.recordSent(contact, 10);
    analytics.recordSent(contact, 15);
    analytics.recordReceived(contact, 20);

    const contactStats = analytics.getContactStats(contact);
    expect(contactStats.sent).toBe(2);
    expect(contactStats.received).toBe(1);
  });

  it('should identify peak hours', () => {
    const analytics = new MessageAnalytics();

    // Record several messages
    for (let i = 0; i < 20; i++) {
      analytics.recordSent('123@s.whatsapp.net', 10);
    }

    const peakHours = analytics.getPeakHours();
    expect(peakHours).toBeDefined();
  });
});

// =============================================================================
// PHASE 5A: CONTACT SCORING
// =============================================================================

describe('ContactScoring', () => {
  it('should score new contacts as new tier', () => {
    const scoring = new ContactScoring();

    const score = scoring.getScore('new@s.whatsapp.net');
    const tier = scoring.getTier('new@s.whatsapp.net');
    expect(score).toBe(0);
    expect(tier.tier).toBe('new');
  });

  it('should increase score on interactions', () => {
    const scoring = new ContactScoring();
    const contact = '123@s.whatsapp.net';

    scoring.recordInteraction(contact, 'sent');
    scoring.recordInteraction(contact, 'received', { length: 100 });

    const score = scoring.getScore(contact);
    expect(score).toBeGreaterThan(0);
  });

  it('should calculate score based on engagement', () => {
    const scoring = new ContactScoring();
    const contact = '123@s.whatsapp.net';

    // Good engagement: equal sent/received ratio with decent message length
    for (let i = 0; i < 10; i++) {
      scoring.recordInteraction(contact, 'sent');
      scoring.recordInteraction(contact, 'received', { length: 150 });
    }

    const score = scoring.getScore(contact);
    expect(score).toBeGreaterThan(10);
  });

  it('should identify top contacts', () => {
    const scoring = new ContactScoring();

    // Create high engagement contact
    for (let i = 0; i < 5; i++) {
      scoring.recordInteraction('high@s.whatsapp.net', 'sent');
      scoring.recordInteraction('high@s.whatsapp.net', 'received', { length: 200 });
    }

    // Create low engagement contact
    scoring.recordInteraction('low@s.whatsapp.net', 'sent');

    const top = scoring.getTopContacts(5);
    expect(top[0].contact).toBe('high@s.whatsapp.net');
  });
});

// =============================================================================
// PHASE 5A: SENTIMENT DETECTOR
// =============================================================================

describe('SentimentDetector', () => {
  it('should detect positive sentiment', () => {
    const detector = new SentimentDetector();

    const result = detector.analyze('Sangat bagus sekali, mantap! Terima kasih banyak!');
    expect(result.sentiment).toBe('positive');
    expect(result.score).toBeGreaterThan(0);
  });

  it('should detect negative sentiment', () => {
    const detector = new SentimentDetector();

    const result = detector.analyze('Sangat buruk dan jelek, saya kecewa');
    expect(result.sentiment).toBe('negative');
    expect(result.score).toBeLessThan(0);
  });

  it('should return sentiment analysis structure', () => {
    const detector = new SentimentDetector();

    const result = detector.analyze('Halo');
    expect(result).toHaveProperty('sentiment');
    expect(result).toHaveProperty('score');
    expect(['positive', 'negative', 'neutral']).toContain(result.sentiment);
  });

  it('should work with English', () => {
    const detector = new SentimentDetector();

    const positive = detector.analyze('Thank you! This is great and wonderful!');
    const negative = detector.analyze('This is terrible and horrible, very bad');

    expect(positive.sentiment).toBe('positive');
    expect(negative.sentiment).toBe('negative');
  });
});

// =============================================================================
// PHASE 5C: AUTO RESPONDER
// =============================================================================

describe('AutoResponder', () => {
  it('should match contains rules', () => {
    const responder = new AutoResponder({ enabled: true });

    responder.addRule({
      trigger: { type: 'contains', value: 'halo' },
      response: 'Halo! Ada yang bisa dibantu?',
    });

    const match = responder.checkMessage({ text: 'Halo, apakah masih buka?' });
    expect(match).not.toBeNull();
    expect(match.response).toContain('Ada yang bisa dibantu');
  });

  it('should match regex rules', () => {
    const responder = new AutoResponder({ enabled: true });

    responder.addRule({
      trigger: { type: 'regex', value: 'harga|price|berapa' },
      response: 'Silakan cek price list kami di website',
    });

    const match = responder.checkMessage({ text: 'Berapa harganya?' });
    expect(match).not.toBeNull();
  });

  it('should respect rule priority', () => {
    const responder = new AutoResponder({ enabled: true });

    responder.addRule({
      trigger: { type: 'contains', value: 'halo' },
      response: 'Halo umum',
      priority: 1,
    });

    responder.addRule({
      trigger: { type: 'contains', value: 'halo' },
      response: 'Halo VIP!',
      priority: 10,
    });

    const match = responder.checkMessage({ text: 'Halo!' });
    expect(match.response).toBe('Halo VIP!');
  });

  it('should support enable/disable', () => {
    const responder = new AutoResponder({ enabled: false });

    responder.addRule({
      trigger: { type: 'contains', value: 'test' },
      response: 'Test response',
    });

    const match = responder.checkMessage({ text: 'test' });
    expect(match).toBeNull();
  });
});

// =============================================================================
// PHASE 5C: MESSAGE TEMPLATES
// =============================================================================

describe('MessageTemplates', () => {
  it('should render templates with variables', () => {
    const templates = new MessageTemplates();

    templates.create('greeting', 'Halo {name}, selamat {time}!');

    const result = templates.render('greeting', {
      name: 'Budi',
      time: 'pagi',
    });

    expect(result).toBe('Halo Budi, selamat pagi!');
  });

  it('should get template by name', () => {
    const templates = new MessageTemplates();

    templates.create('welcome', 'Selamat datang!');

    const template = templates.get('welcome');
    expect(template).toBeDefined();
    expect(template.content).toBe('Selamat datang!');
  });

  it('should list all templates', () => {
    const templates = new MessageTemplates();

    templates.create('template1', 'Test 1');
    templates.create('template2', 'Test 2');

    const list = templates.list();
    expect(list.length).toBe(2);
  });

  it('should delete templates', () => {
    const templates = new MessageTemplates();

    templates.create('toDelete', 'Delete me');
    templates.delete('toDelete');

    const template = templates.get('toDelete');
    expect(template).toBeUndefined();
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

    const scheduled = scheduler.schedule(
      '123@s.whatsapp.net',
      'Scheduled message',
      new Date(Date.now() + 3600000) // 1 hour from now
    );

    expect(scheduled.id).toBeDefined();

    const pending = scheduler.getUpcoming();
    expect(pending.length).toBe(1);
  });

  it('should schedule daily recurring messages', () => {
    const scheduler = new ScheduledMessages({ sessionsDir: tempDir });

    const scheduled = scheduler.schedule(
      '123@s.whatsapp.net',
      'Daily reminder',
      new Date(Date.now() + 3600000),
      { repeat: 'daily' }
    );

    expect(scheduled.repeat).toBe('daily');
  });

  it('should cancel scheduled messages', () => {
    const scheduler = new ScheduledMessages({ sessionsDir: tempDir });

    const scheduled = scheduler.schedule(
      '123@s.whatsapp.net',
      'Will be cancelled',
      new Date(Date.now() + 3600000)
    );

    scheduler.cancel(scheduled.id);

    const pending = scheduler.getUpcoming();
    expect(pending.find((s) => s.id === scheduled.id && s.status === 'pending')).toBeUndefined();
  });

  it('should track scheduled message stats', () => {
    const scheduler = new ScheduledMessages({ sessionsDir: tempDir });

    scheduler.schedule(
      '123@s.whatsapp.net',
      'Test 1',
      new Date(Date.now() + 3600000)
    );

    scheduler.schedule(
      '456@s.whatsapp.net',
      'Test 2',
      new Date(Date.now() + 7200000),
      { repeat: 'daily' }
    );

    const stats = scheduler.getStats();
    expect(stats.byStatus.pending).toBe(2);
  });
});
