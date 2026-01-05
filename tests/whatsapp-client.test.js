/**
 * WhatsApp Client Tests
 *
 * Tests for the main WhatsApp client functionality:
 * - sendMessage with rate limiting and ban protection
 * - Connection lifecycle (connect, disconnect, reconnect)
 * - Status reporting
 * - Message queueing
 *
 * Updated for modular WhatsAppClient structure (Phase 8).
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
// HELPER: Create mock socket
// =============================================================================
function createMockSocket() {
  return {
    sendMessage: vi.fn(() => Promise.resolve({ key: { id: 'MSG_123' } })),
    presenceSubscribe: vi.fn(() => Promise.resolve()),
    sendPresenceUpdate: vi.fn(() => Promise.resolve()),
    readMessages: vi.fn(() => Promise.resolve()),
    logout: vi.fn(() => Promise.resolve()),
    ev: { on: vi.fn(), off: vi.fn() },
    ws: { close: vi.fn() },
    user: { id: '6281234567890:0', name: 'Test User' },
  };
}

// =============================================================================
// HELPER: Setup client for sendMessage tests
// =============================================================================
function setupClientForSend(client) {
  // Mock connection manager state
  const mockSocket = createMockSocket();
  client.connectionManager.isConnected = true;
  client.connectionManager.socket = mockSocket;
  client.connectionManager.getSocket = vi.fn(() => mockSocket);

  // Mock rate limiter
  client.orchestrator.rateLimiter.canSend = vi.fn(() => ({ allowed: true }));
  client.orchestrator.rateLimiter.recordSend = vi.fn();

  // Mock ban warning
  client.orchestrator.banWarning.canSend = vi.fn(() => ({ allowed: true }));
  client.orchestrator.banWarning.recordRateLimitHit = vi.fn();
  client.orchestrator.banWarning.recordDeliverySuccess = vi.fn();

  // Mock contact warmup
  client.orchestrator.contactWarmup.canMessage = vi.fn(() => ({ allowed: true, isNew: false }));
  client.orchestrator.contactWarmup.recordContact = vi.fn();

  // Mock activity tracker
  client.orchestrator.activityTracker.isSafeToSend = vi.fn(() => ({ safe: true }));
  client.orchestrator.activityTracker.recordSent = vi.fn();

  // Mock typing simulator
  client.orchestrator.typingSimulator.generateTypingSequence = vi.fn(() => []);
  client.orchestrator.typingSimulator.executeSequence = vi.fn(() => Promise.resolve());

  // Mock delivery tracker
  client.orchestrator.deliveryTracker.recordSent = vi.fn();

  // Mock message variator
  client.orchestrator.messageVariator.vary = vi.fn((text) => text);
  client.orchestrator.messageVariator.isRecentDuplicate = vi.fn(() => false);

  // Mock emoji enhancer
  client.orchestrator.emojiEnhancer.maybeAddEmoji = vi.fn((text) => text);

  // Mock presence manager
  client.orchestrator.presenceManager.temporaryOnline = vi.fn(() => Promise.resolve({
    restore: vi.fn(() => Promise.resolve()),
  }));

  // Mock weekend patterns
  client.orchestrator.weekendPatterns.getDelayMultiplier = vi.fn(() => 1);
  client.orchestrator.weekendPatterns.isWeekend = vi.fn(() => false);

  // Mock activity ramper
  client.orchestrator.activityRamper.getRateMultiplier = vi.fn(() => 1);
  client.orchestrator.activityRamper.getExtraDelay = vi.fn(() => 0);
  client.orchestrator.activityRamper.recordActivity = vi.fn();

  // Mock group behavior
  client.orchestrator.groupBehavior.isGroup = vi.fn(() => false);
  client.orchestrator.groupBehavior.adjustDelay = vi.fn((delay) => delay);
  client.orchestrator.groupBehavior.adjustTypingDuration = vi.fn((duration) => duration);

  // Mock message splitter
  client.orchestrator.messageSplitter.shouldSplit = vi.fn(() => false);

  // Mock conversation memory
  client.orchestrator.conversationMemory.recordMessage = vi.fn();

  // Mock analytics
  client.orchestrator.analytics.recordSent = vi.fn();

  // Mock contact scoring
  client.orchestrator.contactScoring.recordInteraction = vi.fn();

  // Mock audit logger
  client.orchestrator.auditLogger.logMessage = vi.fn();

  // Mock webhook emitter
  client.orchestrator.webhookEmitter.messageSent = vi.fn();

  return mockSocket;
}

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
    client.connectionManager.qrCode = 'test-qr-code';

    const status = client.getStatus();

    expect(status.qr).toBe('test-qr-code');
  });

  it('should include stats', () => {
    const client = new WhatsAppClient({});
    client.messageHandler.stats.messagesSent = 10;
    client.messageHandler.stats.messagesReceived = 5;
    client.messageHandler.stats.startedAt = Date.now() - 3600000;

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
  let mockSocket;

  beforeEach(() => {
    client = new WhatsAppClient({});
    mockSocket = setupClientForSend(client);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should throw if not connected', async () => {
    client.connectionManager.isConnected = false;

    await expect(client.sendMessage('6281234567890', 'Hello'))
      .rejects.toThrow(/not connected/i);
  });

  it('should check ban warning before sending', async () => {
    await client.sendMessage('6281234567890', 'Hello');

    expect(client.orchestrator.banWarning.canSend).toHaveBeenCalled();
  });

  it('should throw if ban warning blocks sending', async () => {
    client.orchestrator.banWarning.canSend = vi.fn(() => ({
      allowed: false,
      reason: 'Hibernation mode',
    }));

    await expect(client.sendMessage('6281234567890', 'Hello'))
      .rejects.toThrow(/ban protection/i);
  });

  it('should check rate limits before sending', async () => {
    await client.sendMessage('6281234567890', 'Hello');

    expect(client.orchestrator.rateLimiter.canSend).toHaveBeenCalled();
  });

  it('should throw if rate limit exceeded', async () => {
    client.orchestrator.rateLimiter.canSend = vi.fn(() => ({
      allowed: false,
      reason: 'Hourly limit exceeded',
    }));

    await expect(client.sendMessage('6281234567890', 'Hello'))
      .rejects.toThrow(/rate limit/i);
  });

  it('should check contact warmup', async () => {
    await client.sendMessage('6281234567890', 'Hello');

    expect(client.orchestrator.contactWarmup.canMessage).toHaveBeenCalledWith('6281234567890');
  });

  it('should throw if contact warmup blocks', async () => {
    client.orchestrator.contactWarmup.canMessage = vi.fn(() => ({
      allowed: false,
      reason: 'Too many messages to new contact',
    }));

    await expect(client.sendMessage('6281234567890', 'Hello'))
      .rejects.toThrow(/warmup/i);
  });

  it('should simulate typing before sending', async () => {
    await client.sendMessage('6281234567890', 'Hello');

    expect(client.orchestrator.typingSimulator.generateTypingSequence).toHaveBeenCalled();
    expect(client.orchestrator.typingSimulator.executeSequence).toHaveBeenCalled();
  });

  it('should send message via socket', async () => {
    const result = await client.sendMessage('6281234567890', 'Hello');

    expect(mockSocket.sendMessage).toHaveBeenCalled();
    expect(result.key.id).toBe('MSG_123');
  });

  it('should record send in rate limiter', async () => {
    await client.sendMessage('6281234567890', 'Hello');

    expect(client.orchestrator.rateLimiter.recordSend).toHaveBeenCalled();
  });

  it('should record activity in tracker', async () => {
    await client.sendMessage('6281234567890', 'Hello');

    expect(client.orchestrator.activityTracker.recordSent).toHaveBeenCalled();
  });

  it('should record delivery success in ban warning', async () => {
    await client.sendMessage('6281234567890', 'Hello');

    expect(client.orchestrator.banWarning.recordDeliverySuccess).toHaveBeenCalled();
  });

  it('should increment stats counter', async () => {
    await client.sendMessage('6281234567890', 'Hello');

    expect(client.stats.messagesSent).toBe(1);
  });

  it('should format phone number correctly', async () => {
    await client.sendMessage('+6281234567890', 'Hello');

    // Should strip + and add @s.whatsapp.net
    const callArgs = mockSocket.sendMessage.mock.calls[0];
    expect(callArgs[0]).toBe('6281234567890@s.whatsapp.net');
  });

  it('should handle reply_to message ID', async () => {
    await client.sendMessage('6281234567890', 'Hello', 'REPLY_TO_MSG_ID');

    const callArgs = mockSocket.sendMessage.mock.calls[0];
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
    // Setup mock socket on connection manager
    const mockSocket = createMockSocket();
    client.connectionManager.socket = mockSocket;
    client.connectionManager.isConnected = true;
  });

  it('should call socket logout', async () => {
    const socket = client.connectionManager.socket;

    await client.disconnect();

    expect(socket.logout).toHaveBeenCalled();
  });

  it('should set isConnected to false', async () => {
    await client.disconnect();

    expect(client.connectionManager.isConnected).toBe(false);
  });

  it('should destroy lifecycle components', async () => {
    const destroySpy = vi.spyOn(client.orchestrator, 'destroy');

    await client.disconnect();

    expect(destroySpy).toHaveBeenCalled();
  });

  it('should handle disconnect when socket is null', async () => {
    client.connectionManager.socket = null;

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
    client.orchestrator.messageScheduler.enqueue = vi.fn(() =>
      Promise.resolve({ queued: true })
    );
  });

  it('should delegate to message scheduler', async () => {
    await client.queueMessage('6281234567890', 'Hello', null, 'high');

    expect(client.orchestrator.messageScheduler.enqueue).toHaveBeenCalled();
  });

  it('should pass priority to scheduler', async () => {
    await client.queueMessage('6281234567890', 'Hello', null, 'urgent');

    const callArgs = client.orchestrator.messageScheduler.enqueue.mock.calls[0];
    expect(callArgs).toContain('urgent');
  });
});

// =============================================================================
// EXITHIBERNATION TESTS
// =============================================================================

describe('WhatsAppClient.exitHibernation()', () => {
  it('should call banWarning exitHibernation', () => {
    const client = new WhatsAppClient({});
    const exitSpy = vi.spyOn(client.orchestrator.banWarning, 'exitHibernation');

    client.exitHibernation();

    expect(exitSpy).toHaveBeenCalled();
  });
});

// =============================================================================
// RESETBANWARNING TESTS
// =============================================================================

describe('WhatsAppClient.resetBanWarning()', () => {
  it('should call banWarning resetMetrics', () => {
    const client = new WhatsAppClient({});
    const resetSpy = vi.spyOn(client.orchestrator.banWarning, 'resetMetrics');

    client.resetBanWarning();

    expect(resetSpy).toHaveBeenCalled();
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
  let mockSocket;

  beforeEach(() => {
    client = new WhatsAppClient({});
    mockSocket = setupClientForSend(client);
  });

  it('should handle number with + prefix', async () => {
    await client.sendMessage('+6281234567890', 'Hello');

    const jid = mockSocket.sendMessage.mock.calls[0][0];
    expect(jid).not.toContain('+');
    expect(jid).toBe('6281234567890@s.whatsapp.net');
  });

  it('should handle number without prefix', async () => {
    await client.sendMessage('6281234567890', 'Hello');

    const jid = mockSocket.sendMessage.mock.calls[0][0];
    expect(jid).toBe('6281234567890@s.whatsapp.net');
  });

  it('should handle JID format', async () => {
    await client.sendMessage('6281234567890@s.whatsapp.net', 'Hello');

    const jid = mockSocket.sendMessage.mock.calls[0][0];
    expect(jid).toBe('6281234567890@s.whatsapp.net');
  });
});

// =============================================================================
// BACKWARD COMPATIBILITY GETTERS TESTS
// =============================================================================

describe('WhatsAppClient Backward Compatibility', () => {
  it('should expose rateLimiter via getter', () => {
    const client = new WhatsAppClient({});
    expect(client.rateLimiter).toBe(client.orchestrator.rateLimiter);
  });

  it('should expose banWarning via getter', () => {
    const client = new WhatsAppClient({});
    expect(client.banWarning).toBe(client.orchestrator.banWarning);
  });

  it('should expose activityTracker via getter', () => {
    const client = new WhatsAppClient({});
    expect(client.activityTracker).toBe(client.orchestrator.activityTracker);
  });

  it('should expose presenceManager via getter', () => {
    const client = new WhatsAppClient({});
    expect(client.presenceManager).toBe(client.orchestrator.presenceManager);
  });

  it('should expose analytics via getter', () => {
    const client = new WhatsAppClient({});
    expect(client.analytics).toBe(client.orchestrator.analytics);
  });

  it('should expose webhookEmitter via getter', () => {
    const client = new WhatsAppClient({});
    expect(client.webhookEmitter).toBe(client.orchestrator.webhookEmitter);
  });
});
