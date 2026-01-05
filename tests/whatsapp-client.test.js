/**
 * WhatsApp Client Tests
 *
 * Tests for the main WhatsApp client functionality:
 * - sendMessage with rate limiting and ban protection
 * - Connection lifecycle (connect, disconnect, reconnect)
 * - Status reporting
 * - Message queueing
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Baileys before importing WhatsAppClient
vi.mock('@whiskeysockets/baileys', () => ({
  default: vi.fn(() => ({
    ev: {
      on: vi.fn(),
      off: vi.fn(),
    },
    sendMessage: vi.fn(() => Promise.resolve({ key: { id: 'MSG_123' } })),
    sendPresenceUpdate: vi.fn(() => Promise.resolve()),
    presenceSubscribe: vi.fn(() => Promise.resolve()),
    readMessages: vi.fn(() => Promise.resolve()),
    logout: vi.fn(() => Promise.resolve()),
    ws: { close: vi.fn() },
  })),
  useMultiFileAuthState: vi.fn(() => Promise.resolve({
    state: { creds: {}, keys: {} },
    saveCreds: vi.fn(),
  })),
  fetchLatestBaileysVersion: vi.fn(() => Promise.resolve({
    version: [2, 2412, 7],
    isLatest: true,
  })),
  DisconnectReason: {
    loggedOut: 401,
    connectionLost: 408,
    connectionClosed: 428,
    timedOut: 440,
    restartRequired: 515,
  },
  Browsers: {
    ubuntu: () => ['Ubuntu', 'Chrome', '124.0'],
  },
  makeCacheableSignalKeyStore: vi.fn((keys) => keys),
  // Mock delay to resolve immediately in tests
  delay: vi.fn(() => Promise.resolve()),
}));

// Mock anti-ban utilities
vi.mock('../src/anti-ban/index.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    humanDelay: vi.fn(() => 0), // Return 0ms delay in tests
    calculateTypingDuration: vi.fn(() => 0),
  };
});

// Mock pino logger
vi.mock('pino', () => ({
  default: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  })),
}));

// Mock fs for session directory
vi.mock('fs', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    existsSync: vi.fn(() => true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn(() => '{}'),
    readdirSync: vi.fn(() => []),
    unlinkSync: vi.fn(),
    rmSync: vi.fn(),
  };
});

// Import after mocks
import WhatsAppClient from '../src/whatsapp.js';

// =============================================================================
// CONSTRUCTOR TESTS
// =============================================================================

describe('WhatsAppClient Constructor', () => {
  it('should initialize with default options', () => {
    const client = new WhatsAppClient({});

    expect(client.baseMessageDelay).toBe(1500);
    expect(client.baseTypingDelay).toBe(500);
    expect(client.isConnected).toBe(false);
  });

  it('should accept custom options', () => {
    const client = new WhatsAppClient({
      messageDelay: 2000,
      typingDelay: 700,
      accountAgeWeeks: 8,
    });

    expect(client.baseMessageDelay).toBe(2000);
    expect(client.baseTypingDelay).toBe(700);
  });

  it('should initialize stats object', () => {
    const client = new WhatsAppClient({});

    expect(client.stats.messagesSent).toBe(0);
    expect(client.stats.messagesReceived).toBe(0);
  });

  it('should initialize rate limiter', () => {
    const client = new WhatsAppClient({ accountAgeWeeks: 4 });

    expect(client.rateLimiter).toBeDefined();
  });

  it('should initialize ban warning system', () => {
    const client = new WhatsAppClient({});

    expect(client.banWarning).toBeDefined();
  });

  it('should initialize activity tracker', () => {
    const client = new WhatsAppClient({});

    expect(client.activityTracker).toBeDefined();
  });
});

// =============================================================================
// GETSTATUS TESTS
// =============================================================================

describe('WhatsAppClient.getStatus()', () => {
  it('should return connection status when disconnected', () => {
    const client = new WhatsAppClient({});

    const status = client.getStatus();

    expect(status.connected).toBe(false);
    expect(status.phone).toBeNull();
    expect(status.name).toBeNull();
  });

  it('should include QR code when available', () => {
    const client = new WhatsAppClient({});
    client.qrCode = 'test-qr-code';

    const status = client.getStatus();

    expect(status.qr).toBe('test-qr-code');
  });

  it('should include stats', () => {
    const client = new WhatsAppClient({});
    client.stats.messagesSent = 10;
    client.stats.messagesReceived = 5;
    client.stats.startedAt = Date.now() - 3600000;

    const status = client.getStatus();

    expect(status.stats.messagesSent).toBe(10);
    expect(status.stats.messagesReceived).toBe(5);
    expect(status.stats.uptime).toBeGreaterThan(0);
  });

  it('should include rate limits', () => {
    const client = new WhatsAppClient({ accountAgeWeeks: 4 });

    const status = client.getStatus();

    expect(status.rateLimits).toBeDefined();
    expect(status.rateLimits.hourlyLimit).toBeDefined();
    expect(status.rateLimits.dailyLimit).toBeDefined();
  });

  it('should include ban warning status', () => {
    const client = new WhatsAppClient({});

    const status = client.getStatus();

    expect(status.banWarning).toBeDefined();
    expect(status.banWarning.hibernationMode).toBeDefined();
  });

  it('should include activity metrics', () => {
    const client = new WhatsAppClient({});

    const status = client.getStatus();

    expect(status.activity).toBeDefined();
    expect(status.activity.sent).toBeDefined();
    expect(status.activity.received).toBeDefined();
  });

  it('should include reconnection info', () => {
    const client = new WhatsAppClient({});

    const status = client.getStatus();

    expect(status.reconnection).toBeDefined();
    expect(status.reconnection.attempts).toBeDefined();
  });
});

// =============================================================================
// SENDMESSAGE TESTS
// =============================================================================

describe('WhatsAppClient.sendMessage()', () => {
  let client;

  beforeEach(() => {
    client = new WhatsAppClient({});
    client.isConnected = true;
    client.socket = {
      sendMessage: vi.fn(() => Promise.resolve({ key: { id: 'MSG_123' } })),
      presenceSubscribe: vi.fn(() => Promise.resolve()),
      sendPresenceUpdate: vi.fn(() => Promise.resolve()),
    };

    // Mock rate limiter to allow sending (returns object with allowed property)
    client.rateLimiter.canSend = vi.fn(() => ({ allowed: true }));
    client.rateLimiter.recordSend = vi.fn();

    // Mock ban warning to allow sending (returns object with allowed property)
    client.banWarning.canSend = vi.fn(() => ({ allowed: true }));
    client.banWarning.recordHit = vi.fn();
    client.banWarning.recordRateLimitHit = vi.fn();
    client.banWarning.recordDeliverySuccess = vi.fn();

    // Mock contact warmup (returns object with allowed property)
    client.contactWarmup.canMessage = vi.fn(() => ({ allowed: true, isNew: false }));
    client.contactWarmup.recordInteraction = vi.fn();

    // Mock activity tracker
    client.activityTracker.isSafeToSend = vi.fn(() => true);
    client.activityTracker.recordSent = vi.fn();

    // Mock typing simulator (uses generateTypingSequence and executeSequence)
    client.typingSimulator.generateTypingSequence = vi.fn(() => [{ type: 'composing', duration: 0 }]);
    client.typingSimulator.executeSequence = vi.fn(() => Promise.resolve());

    // Mock delivery tracker
    client.deliveryTracker.track = vi.fn();

    // Mock message variator
    client.messageVariator.vary = vi.fn((text) => text);

    // Mock emoji enhancer
    client.emojiEnhancer.shouldAddEmoji = vi.fn(() => false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should throw if not connected', async () => {
    client.isConnected = false;

    await expect(client.sendMessage('6281234567890', 'Hello'))
      .rejects.toThrow(/not connected/i);
  });

  it('should check ban warning before sending', async () => {
    await client.sendMessage('6281234567890', 'Hello');

    expect(client.banWarning.canSend).toHaveBeenCalled();
  });

  it('should throw if ban warning blocks sending', async () => {
    client.banWarning.canSend = vi.fn(() => ({ allowed: false, reason: 'Hibernation mode' }));

    await expect(client.sendMessage('6281234567890', 'Hello'))
      .rejects.toThrow(/ban protection/i);
  });

  it('should check rate limits before sending', async () => {
    await client.sendMessage('6281234567890', 'Hello');

    expect(client.rateLimiter.canSend).toHaveBeenCalled();
  });

  it('should throw if rate limit exceeded', async () => {
    client.rateLimiter.canSend = vi.fn(() => ({ allowed: false, reason: 'Hourly limit exceeded' }));

    await expect(client.sendMessage('6281234567890', 'Hello'))
      .rejects.toThrow(/rate limit/i);
  });

  it('should check contact warmup', async () => {
    await client.sendMessage('6281234567890', 'Hello');

    expect(client.contactWarmup.canMessage).toHaveBeenCalledWith('6281234567890');
  });

  it('should throw if contact warmup blocks', async () => {
    client.contactWarmup.canMessage = vi.fn(() => ({ allowed: false, reason: 'Too many messages to new contact' }));

    await expect(client.sendMessage('6281234567890', 'Hello'))
      .rejects.toThrow(/warmup/i);
  });

  it('should simulate typing before sending', async () => {
    await client.sendMessage('6281234567890', 'Hello');

    expect(client.typingSimulator.generateTypingSequence).toHaveBeenCalled();
    expect(client.typingSimulator.executeSequence).toHaveBeenCalled();
  });

  it('should send message via socket', async () => {
    const result = await client.sendMessage('6281234567890', 'Hello');

    expect(client.socket.sendMessage).toHaveBeenCalled();
    expect(result.key.id).toBe('MSG_123');
  });

  it('should record send in rate limiter', async () => {
    await client.sendMessage('6281234567890', 'Hello');

    expect(client.rateLimiter.recordSend).toHaveBeenCalled();
  });

  it('should record activity in tracker', async () => {
    await client.sendMessage('6281234567890', 'Hello');

    expect(client.activityTracker.recordSent).toHaveBeenCalled();
  });

  it('should record delivery success in ban warning', async () => {
    await client.sendMessage('6281234567890', 'Hello');

    expect(client.banWarning.recordDeliverySuccess).toHaveBeenCalled();
  });

  it('should increment stats counter', async () => {
    await client.sendMessage('6281234567890', 'Hello');

    expect(client.stats.messagesSent).toBe(1);
  });

  it('should format phone number correctly', async () => {
    await client.sendMessage('+6281234567890', 'Hello');

    // Should strip + and add @s.whatsapp.net
    const callArgs = client.socket.sendMessage.mock.calls[0];
    expect(callArgs[0]).toBe('6281234567890@s.whatsapp.net');
  });

  it('should handle reply_to message ID', async () => {
    await client.sendMessage('6281234567890', 'Hello', 'REPLY_TO_MSG_ID');

    const callArgs = client.socket.sendMessage.mock.calls[0];
    // Reply options are passed as third argument
    expect(callArgs[2]).toHaveProperty('quoted');
    expect(callArgs[2].quoted.key.id).toBe('REPLY_TO_MSG_ID');
  });
});

// =============================================================================
// SETACCOUNTAGE TESTS
// =============================================================================

describe('WhatsAppClient.setAccountAge()', () => {
  it('should update rate limiter with new account age', () => {
    const client = new WhatsAppClient({ accountAgeWeeks: 1 });

    client.setAccountAge(8);

    const status = client.getStatus();
    // 8 weeks = mature account with higher limits
    expect(status.rateLimits.hourlyLimit).toBeGreaterThan(15);
  });

  it('should accept number parameter', () => {
    const client = new WhatsAppClient({});

    expect(() => client.setAccountAge(4)).not.toThrow();
  });
});

// =============================================================================
// DISCONNECT TESTS
// =============================================================================

describe('WhatsAppClient.disconnect()', () => {
  let client;

  beforeEach(() => {
    client = new WhatsAppClient({});
    client.socket = {
      logout: vi.fn(() => Promise.resolve()),
      ws: { close: vi.fn() },
      ev: { off: vi.fn() },
    };
    client.isConnected = true;
  });

  it('should call socket logout', async () => {
    await client.disconnect();

    expect(client.socket.logout).toHaveBeenCalled();
  });

  it('should set isConnected to false', async () => {
    await client.disconnect();

    expect(client.isConnected).toBe(false);
  });

  it('should destroy lifecycle components', async () => {
    client.lifecycle = {
      destroyAll: vi.fn(() => Promise.resolve()),
    };

    await client.disconnect();

    expect(client.lifecycle.destroyAll).toHaveBeenCalled();
  });

  it('should handle disconnect when socket is null', async () => {
    client.socket = null;

    await expect(client.disconnect()).resolves.not.toThrow();
  });
});

// =============================================================================
// QUEUEMESSAGE TESTS
// =============================================================================

describe('WhatsAppClient.queueMessage()', () => {
  let client;

  beforeEach(() => {
    client = new WhatsAppClient({});
    client.messageScheduler = {
      enqueue: vi.fn(() => Promise.resolve({ queued: true })),
    };
  });

  it('should delegate to message scheduler', async () => {
    await client.queueMessage('6281234567890', 'Hello', null, 'high');

    expect(client.messageScheduler.enqueue).toHaveBeenCalled();
  });

  it('should pass priority to scheduler', async () => {
    await client.queueMessage('6281234567890', 'Hello', null, 'urgent');

    const callArgs = client.messageScheduler.enqueue.mock.calls[0];
    expect(callArgs).toContain('urgent');
  });
});

// =============================================================================
// EXITHIBERNATION TESTS
// =============================================================================

describe('WhatsAppClient.exitHibernation()', () => {
  it('should call banWarning exitHibernation', () => {
    const client = new WhatsAppClient({});
    client.banWarning.exitHibernation = vi.fn();

    client.exitHibernation();

    expect(client.banWarning.exitHibernation).toHaveBeenCalled();
  });
});

// =============================================================================
// RESETBANWARNING TESTS
// =============================================================================

describe('WhatsAppClient.resetBanWarning()', () => {
  it('should call banWarning resetMetrics', () => {
    const client = new WhatsAppClient({});
    client.banWarning.resetMetrics = vi.fn();

    client.resetBanWarning();

    expect(client.banWarning.resetMetrics).toHaveBeenCalled();
  });
});

// =============================================================================
// RATE LIMITER INTEGRATION TESTS
// =============================================================================

describe('WhatsAppClient Rate Limiting Integration', () => {
  it('should use conservative limits for new accounts', () => {
    const client = new WhatsAppClient({ accountAgeWeeks: 1 });

    const status = client.getStatus();

    // New account limits should be low
    expect(status.rateLimits.hourlyLimit).toBeLessThanOrEqual(10);
    expect(status.rateLimits.dailyLimit).toBeLessThanOrEqual(20);
  });

  it('should use moderate limits for warming accounts', () => {
    const client = new WhatsAppClient({ accountAgeWeeks: 4 });

    const status = client.getStatus();

    // Warming account limits
    expect(status.rateLimits.hourlyLimit).toBeGreaterThanOrEqual(10);
    expect(status.rateLimits.dailyLimit).toBeGreaterThanOrEqual(30);
  });

  it('should use higher limits for mature accounts', () => {
    const client = new WhatsAppClient({ accountAgeWeeks: 12 });

    const status = client.getStatus();

    // Mature account limits should be higher
    expect(status.rateLimits.hourlyLimit).toBeGreaterThan(20);
    expect(status.rateLimits.dailyLimit).toBeGreaterThan(100);
  });
});

// =============================================================================
// PHONE NUMBER FORMATTING TESTS
// =============================================================================

describe('Phone Number Formatting', () => {
  let client;

  beforeEach(() => {
    client = new WhatsAppClient({});
    client.isConnected = true;
    client.socket = {
      sendMessage: vi.fn(() => Promise.resolve({ key: { id: 'MSG_123' } })),
      presenceSubscribe: vi.fn(),
      sendPresenceUpdate: vi.fn(),
    };
    client.rateLimiter.canSend = vi.fn(() => ({ allowed: true }));
    client.rateLimiter.recordSend = vi.fn();
    client.banWarning.canSend = vi.fn(() => ({ allowed: true }));
    client.banWarning.recordHit = vi.fn();
    client.banWarning.recordRateLimitHit = vi.fn();
    client.banWarning.recordDeliverySuccess = vi.fn();
    client.contactWarmup.canMessage = vi.fn(() => ({ allowed: true, isNew: false }));
    client.contactWarmup.recordInteraction = vi.fn();
    client.activityTracker.isSafeToSend = vi.fn(() => true);
    client.activityTracker.recordSent = vi.fn();
    client.typingSimulator.generateTypingSequence = vi.fn(() => [{ type: 'composing', duration: 0 }]);
    client.typingSimulator.executeSequence = vi.fn(() => Promise.resolve());
    client.deliveryTracker.track = vi.fn();
    client.messageVariator.vary = vi.fn((text) => text);
    client.emojiEnhancer.shouldAddEmoji = vi.fn(() => false);
  });

  it('should handle number with + prefix', async () => {
    await client.sendMessage('+6281234567890', 'Hello');

    const jid = client.socket.sendMessage.mock.calls[0][0];
    expect(jid).not.toContain('+');
    expect(jid).toBe('6281234567890@s.whatsapp.net');
  });

  it('should handle number without prefix', async () => {
    await client.sendMessage('6281234567890', 'Hello');

    const jid = client.socket.sendMessage.mock.calls[0][0];
    expect(jid).toBe('6281234567890@s.whatsapp.net');
  });

  it('should handle JID format', async () => {
    await client.sendMessage('6281234567890@s.whatsapp.net', 'Hello');

    const jid = client.socket.sendMessage.mock.calls[0][0];
    expect(jid).toBe('6281234567890@s.whatsapp.net');
  });
});
