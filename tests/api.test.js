/**
 * API Tests
 *
 * Tests for API server functionality:
 * - Phone number validation
 * - Health endpoints with memory stats
 * - Global error handler
 * - 404 handler
 * - Authentication
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../src/api.js';

// Comprehensive mock WhatsApp client for testing
const createMockWhatsAppClient = (overrides = {}) => ({
  // Core status
  getStatus: vi.fn(() => ({
    connected: true,
    phone: '6281234567890',
    name: 'Test User',
    qr: null,
    banWarning: { hibernationMode: false },
    rateLimits: {
      hourlyCount: 5,
      hourlyLimit: 30,
      dailyCount: 15,
      dailyLimit: 150,
      hourlyResetIn: 2400000,
      dailyResetIn: 43200000,
    },
    activity: {
      sent: 15,
      received: 10,
      responseRatio: '67%',
      uniqueRecipients: 5,
      uniqueSenders: 3,
    },
    reconnection: {
      attempts: 0,
      maxAttempts: 15,
      willGiveUp: false,
    },
    presence: {
      isOnline: true,
      withinActiveHours: true,
      activeHours: '7:00 - 23:00',
    },
    ...(overrides.status || {}),
  })),

  // Core methods
  sendMessage: vi.fn(() => Promise.resolve({ key: { id: 'msg123' } })),
  disconnect: vi.fn(() => Promise.resolve()),
  connect: vi.fn(() => Promise.resolve()),
  setAccountAge: vi.fn(),
  exitHibernation: vi.fn(),
  resetBanWarning: vi.fn(),
  queueMessage: vi.fn(() => 'queue_123'),

  // Rate limiter
  rateLimiter: {
    getStatus: vi.fn(() => ({ hourly: { used: 0 } })),
    getLimits: vi.fn(() => ({ hourly: 30, daily: 150, minIntervalMs: 30000 })),
    ...(overrides.rateLimiter || {}),
  },

  // Ban warning
  banWarning: {
    getStatus: vi.fn(() => ({ currentLevel: 'normal' })),
    getMetrics: vi.fn(() => ({
      warningLevel: 'normal',
      hibernationMode: false,
      triggeredAt: null,
    })),
    ...(overrides.banWarning || {}),
  },

  // Presence manager
  presenceManager: {
    getStatus: vi.fn(() => ({
      isOnline: true,
      withinActiveHours: true,
      activeHours: '7:00 - 23:00',
    })),
    goOnline: vi.fn(() => Promise.resolve()),
    goOffline: vi.fn(() => Promise.resolve()),
    ...(overrides.presenceManager || {}),
  },

  // Delivery tracker
  deliveryTracker: {
    checkDeliveryHealth: vi.fn(() => ({
      healthy: true,
      issues: [],
      stats: { sent: 10, delivered: 9, failed: 1 },
    })),
    ...(overrides.deliveryTracker || {}),
  },

  // Contact warmup
  contactWarmup: {
    getContactStatus: vi.fn(() => ({
      status: 'established',
      messageCount: 10,
      daysSinceFirst: 7,
    })),
    canMessage: vi.fn(() => ({ allowed: true })),
    ...(overrides.contactWarmup || {}),
  },

  // Message scheduler
  messageScheduler: {
    getStatus: vi.fn(() => ({ queueLength: 0, processing: false })),
    clear: vi.fn(),
    ...(overrides.messageScheduler || {}),
  },

  // Weekend patterns
  weekendPatterns: {
    getPatterns: vi.fn(() => ({
      isWeekend: false,
      isHoliday: false,
      adjustedLimits: { hourly: 30, daily: 150 },
    })),
    ...(overrides.weekendPatterns || {}),
  },

  // Activity ramp
  activityRamp: {
    getStatus: vi.fn(() => ({
      isRamping: false,
      currentLevel: 1.0,
      minutesSinceStart: 60,
    })),
    ...(overrides.activityRamp || {}),
  },

  // Network fingerprint
  networkFingerprint: {
    getHealth: vi.fn(() => ({
      healthy: true,
      currentFingerprint: 'fp_abc123',
      lastRotation: Date.now() - 3600000,
    })),
    ...(overrides.networkFingerprint || {}),
  },

  ...overrides,
});

// =============================================================================
// PHONE VALIDATION TESTS
// =============================================================================

describe('Phone Number Validation', () => {
  it('should accept valid phone with country code', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/send')
      .set('Authorization', 'Bearer test-secret')
      .send({ to: '+6281234567890', message: 'Hello' });

    expect(res.status).toBe(200);
    expect(client.sendMessage).toHaveBeenCalled();
  });

  it('should accept valid phone without plus sign', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/send')
      .set('Authorization', 'Bearer test-secret')
      .send({ to: '6281234567890', message: 'Hello' });

    expect(res.status).toBe(200);
  });

  it('should accept WhatsApp JID format', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/send')
      .set('Authorization', 'Bearer test-secret')
      .send({ to: '6281234567890@s.whatsapp.net', message: 'Hello' });

    expect(res.status).toBe(200);
  });

  it('should reject invalid phone format', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/send')
      .set('Authorization', 'Bearer test-secret')
      .send({ to: 'invalid-phone', message: 'Hello' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid phone number format');
  });

  it('should reject phone that is too short', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/send')
      .set('Authorization', 'Bearer test-secret')
      .send({ to: '12345', message: 'Hello' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid phone number format');
  });

  it('should reject phone with letters', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/send')
      .set('Authorization', 'Bearer test-secret')
      .send({ to: '+62812abc7890', message: 'Hello' });

    expect(res.status).toBe(400);
  });

  it('should handle phone with spaces (cleaned)', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/send')
      .set('Authorization', 'Bearer test-secret')
      .send({ to: '+62 812 3456 7890', message: 'Hello' });

    expect(res.status).toBe(200);
  });

  it('should reject missing to field', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/send')
      .set('Authorization', 'Bearer test-secret')
      .send({ message: 'Hello' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing');
  });

  it('should reject missing message field', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/send')
      .set('Authorization', 'Bearer test-secret')
      .send({ to: '6281234567890' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Missing');
  });
});

// =============================================================================
// HEALTH ENDPOINT TESTS
// =============================================================================

describe('Health Endpoints', () => {
  it('should return liveness with memory stats', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client);

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.uptime).toBe('number');
    expect(res.body.memory).toBeDefined();
    expect(typeof res.body.memory.heapUsed).toBe('number');
    expect(typeof res.body.memory.heapTotal).toBe('number');
    expect(typeof res.body.memory.rss).toBe('number');
  });

  it('should return readiness when connected', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client);

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(200);
    expect(res.body.ready).toBe(true);
    expect(res.body.connected).toBe(true);
    expect(res.body.hibernating).toBe(false);
  });

  it('should return 503 when not connected', async () => {
    const client = createMockWhatsAppClient({
      status: { connected: false },
    });
    const app = createApiServer(client);

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.reason).toBe('WhatsApp not connected');
  });

  it('should return 503 when hibernating', async () => {
    const client = createMockWhatsAppClient({
      status: { connected: true, banWarning: { hibernationMode: true } },
    });
    const app = createApiServer(client);

    const res = await request(app).get('/health/ready');

    expect(res.status).toBe(503);
    expect(res.body.ready).toBe(false);
    expect(res.body.hibernating).toBe(true);
  });
});

// =============================================================================
// ERROR HANDLER TESTS
// =============================================================================

describe('Error Handlers', () => {
  it('should return 404 for unknown routes', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client);

    const res = await request(app).get('/api/unknown-route');

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('/api/unknown-route');
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('should return 404 for unknown POST routes', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client);

    const res = await request(app)
      .post('/api/does-not-exist')
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('/api/does-not-exist');
    expect(res.body.code).toBe('NOT_FOUND');
  });
});

// =============================================================================
// AUTHENTICATION TESTS
// =============================================================================

describe('Authentication', () => {
  it('should reject requests without token when secret is set', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/send')
      .send({ to: '6281234567890', message: 'Hello' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Unauthorized');
  });

  it('should reject requests with wrong token', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/send')
      .set('Authorization', 'Bearer wrong-token')
      .send({ to: '6281234567890', message: 'Hello' });

    expect(res.status).toBe(401);
  });

  it('should allow requests with correct token', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/send')
      .set('Authorization', 'Bearer test-secret')
      .send({ to: '6281234567890', message: 'Hello' });

    expect(res.status).toBe(200);
  });

  it('should allow health endpoints without auth', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
  });

  it('should allow QR endpoint without auth', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/qr');

    expect(res.status).toBe(200);
  });

  it('should reject non-Bearer authorization', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/send')
      .set('Authorization', 'Basic dXNlcjpwYXNz')
      .send({ to: '6281234567890', message: 'Hello' });

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Bearer');
  });
});

// =============================================================================
// IP RATE LIMITING TESTS
// =============================================================================

// =============================================================================
// CORS TESTS
// =============================================================================

describe('CORS', () => {
  it('should set CORS headers', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client);

    const res = await request(app).get('/health');

    expect(res.headers['access-control-allow-origin']).toBeDefined();
    expect(res.headers['access-control-allow-methods']).toContain('GET');
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  it('should handle OPTIONS preflight request', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client);

    const res = await request(app)
      .options('/api/send')
      .set('Origin', 'http://localhost:3000');

    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toBeDefined();
  });
});

// =============================================================================
// REQUEST ID TRACING TESTS
// =============================================================================

describe('Request ID Tracing', () => {
  it('should generate request ID if not provided', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client);

    const res = await request(app).get('/health');

    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).toMatch(/^req_\d+_\d+$/);
  });

  it('should use provided X-Request-ID', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client);

    const res = await request(app)
      .get('/health')
      .set('X-Request-ID', 'my-custom-id-123');

    expect(res.headers['x-request-id']).toBe('my-custom-id-123');
  });

  it('should expose X-Request-ID header via CORS', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client);

    const res = await request(app).get('/health');

    expect(res.headers['access-control-expose-headers']).toContain('X-Request-ID');
  });
});

// =============================================================================
// IP RATE LIMITING TESTS
// =============================================================================

describe('IP Rate Limiting', () => {
  it('should allow requests under the limit', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client);

    // Make 5 requests - should all succeed
    for (let i = 0; i < 5; i++) {
      const res = await request(app).get('/api/qr');
      expect(res.status).toBe(200);
    }
  });

  it('should skip rate limiting for health endpoints', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client);

    // Health endpoint should never be rate limited
    for (let i = 0; i < 10; i++) {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
    }
  });

  it('should return 429 with Retry-After header when limit exceeded', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client);

    // Make 101 requests to exceed limit (100 per minute)
    let lastRes;
    for (let i = 0; i < 102; i++) {
      lastRes = await request(app).get('/api/qr');
      if (lastRes.status === 429) break;
    }

    expect(lastRes.status).toBe(429);
    expect(lastRes.body.error).toBe('Too many requests');
    expect(lastRes.headers['retry-after']).toBeDefined();
  });
});

// =============================================================================
// STATUS ENDPOINT TESTS
// =============================================================================

describe('GET /api/status', () => {
  it('should return full status when authenticated', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/status')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.connected).toBe(true);
    expect(res.body.phone).toBe('6281234567890');
    expect(res.body.name).toBe('Test User');
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/status');

    expect(res.status).toBe(401);
  });

  it('should return rateLimits in status', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/status')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.rateLimits).toBeDefined();
    expect(res.body.rateLimits.hourlyCount).toBe(5);
    expect(res.body.rateLimits.dailyCount).toBe(15);
  });

  it('should return activity stats in status', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/status')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.activity).toBeDefined();
    expect(res.body.activity.sent).toBe(15);
    expect(res.body.activity.received).toBe(10);
  });
});

// =============================================================================
// RATE LIMITS ENDPOINT TESTS
// =============================================================================

describe('GET /api/rate-limits', () => {
  it('should return rate limit status', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/rate-limits')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.rateLimits).toBeDefined();
  });

  it('should include activity data', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/rate-limits')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.activity).toBeDefined();
  });

  it('should include reconnection stats', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/rate-limits')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.reconnection).toBeDefined();
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/rate-limits');

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// ACCOUNT AGE ENDPOINT TESTS
// =============================================================================

describe('POST /api/account-age', () => {
  it('should update account age', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/account-age')
      .set('Authorization', 'Bearer test-secret')
      .send({ weeks: 8 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.accountAgeWeeks).toBe(8);
    expect(client.setAccountAge).toHaveBeenCalledWith(8);
  });

  it('should return new limits after update', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/account-age')
      .set('Authorization', 'Bearer test-secret')
      .send({ weeks: 8 });

    expect(res.body.newLimits).toBeDefined();
    expect(res.body.newLimits.hourly).toBe(30);
  });

  it('should reject non-positive weeks', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/account-age')
      .set('Authorization', 'Bearer test-secret')
      .send({ weeks: 0 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('positive');
  });

  it('should reject non-number weeks', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/account-age')
      .set('Authorization', 'Bearer test-secret')
      .send({ weeks: 'invalid' });

    expect(res.status).toBe(400);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/account-age')
      .send({ weeks: 8 });

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// RECONNECT ENDPOINT TESTS
// =============================================================================

describe('POST /api/reconnect', () => {
  it('should disconnect and schedule reconnect', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/reconnect')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('reconnecting');
    expect(client.disconnect).toHaveBeenCalled();
  });

  it('should return reconnect delay', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/reconnect')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.delayMs).toBeDefined();
    expect(typeof res.body.delayMs).toBe('number');
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).post('/api/reconnect');

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// BAN WARNING ENDPOINT TESTS
// =============================================================================

describe('GET /api/ban-warning', () => {
  it('should return ban warning status', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/ban-warning')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.banWarning).toBeDefined();
  });

  it('should include presence info', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/ban-warning')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.presence).toBeDefined();
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/ban-warning');

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// EXIT HIBERNATION ENDPOINT TESTS
// =============================================================================

describe('POST /api/exit-hibernation', () => {
  it('should exit hibernation mode', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/exit-hibernation')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(client.exitHibernation).toHaveBeenCalled();
  });

  it('should return warning message', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/exit-hibernation')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.message).toContain('caution');
  });

  it('should return current ban warning metrics', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/exit-hibernation')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.banWarning).toBeDefined();
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).post('/api/exit-hibernation');

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// RESET BAN WARNING ENDPOINT TESTS
// =============================================================================

describe('POST /api/reset-ban-warning', () => {
  it('should reset ban warning metrics', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/reset-ban-warning')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(client.resetBanWarning).toHaveBeenCalled();
  });

  it('should return reset confirmation message', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/reset-ban-warning')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.message).toContain('reset');
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).post('/api/reset-ban-warning');

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// PRESENCE ENDPOINT TESTS
// =============================================================================

describe('POST /api/presence', () => {
  it('should set presence to online', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/presence')
      .set('Authorization', 'Bearer test-secret')
      .send({ status: 'online' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(client.presenceManager.goOnline).toHaveBeenCalled();
  });

  it('should set presence to offline', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/presence')
      .set('Authorization', 'Bearer test-secret')
      .send({ status: 'offline' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(client.presenceManager.goOffline).toHaveBeenCalled();
  });

  it('should return current presence status', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/presence')
      .set('Authorization', 'Bearer test-secret')
      .send({ status: 'online' });

    expect(res.body.presence).toBeDefined();
    expect(res.body.presence.isOnline).toBe(true);
  });

  it('should reject invalid status values', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/presence')
      .set('Authorization', 'Bearer test-secret')
      .send({ status: 'away' });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('online');
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/presence')
      .send({ status: 'online' });

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// QR ENDPOINT TESTS (Extended)
// =============================================================================

describe('GET /api/qr (Extended)', () => {
  it('should return connected status when connected', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client);

    const res = await request(app).get('/api/qr');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('connected');
    expect(res.body.qr).toBeNull();
    expect(res.body.phone).toBe('6281234567890');
  });

  it('should return QR code when not connected', async () => {
    const client = createMockWhatsAppClient({
      status: { connected: false, qr: 'qr-code-data-here' },
    });
    const app = createApiServer(client);

    const res = await request(app).get('/api/qr');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('waiting_scan');
    expect(res.body.qr).toBe('qr-code-data-here');
  });

  it('should return initializing when no QR yet', async () => {
    const client = createMockWhatsAppClient({
      status: { connected: false, qr: null },
    });
    const app = createApiServer(client);

    const res = await request(app).get('/api/qr');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('initializing');
    expect(res.body.qr).toBeNull();
  });
});

// =============================================================================
// SEND MESSAGE ENDPOINT TESTS (Extended)
// =============================================================================

describe('POST /api/send (Extended)', () => {
  it('should successfully send a message', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/send')
      .set('Authorization', 'Bearer test-secret')
      .send({ to: '+6281234567890', message: 'Hello!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.messageId).toBe('msg123');
    expect(res.body.to).toBe('+6281234567890');
  });

  it('should call sendMessage with correct parameters', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    await request(app)
      .post('/api/send')
      .set('Authorization', 'Bearer test-secret')
      .send({ to: '+6281234567890', message: 'Hello!', reply_to: 'msg_abc' });

    expect(client.sendMessage).toHaveBeenCalledWith('+6281234567890', 'Hello!', 'msg_abc');
  });

  it('should handle sendMessage errors', async () => {
    const client = createMockWhatsAppClient({
      sendMessage: vi.fn(() => Promise.reject(new Error('Send failed'))),
    });
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/send')
      .set('Authorization', 'Bearer test-secret')
      .send({ to: '+6281234567890', message: 'Hello!' });

    expect(res.status).toBe(500);
    expect(res.body.error).toContain('Send failed');
  });
});
