/**
 * Phase 2 API Endpoint Tests
 *
 * Tests for Phase 2 anti-ban endpoints:
 * - Delivery health
 * - Contact warmup
 * - Message queue
 * - Weekend patterns
 * - Activity ramp
 * - Network health
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../src/api.js';

// Mock WhatsApp client with Phase 2 components
const createMockWhatsAppClient = (overrides = {}) => ({
  getStatus: vi.fn(() => ({
    connected: true,
    phone: '6281234567890',
    name: 'Test User',
    qr: null,
    banWarning: { hibernationMode: false },
    rateLimits: {},
    activity: {},
    reconnection: {},
    presence: {},
  })),
  sendMessage: vi.fn(() => Promise.resolve({ key: { id: 'msg123' } })),
  queueMessage: vi.fn(() => 'queue_msg_456'),

  // Delivery tracker
  deliveryTracker: {
    checkDeliveryHealth: vi.fn(() => ({
      healthy: true,
      issues: [],
      stats: { sent: 100, delivered: 95, failed: 5 },
      deliveryRate: 0.95,
    })),
    ...(overrides.deliveryTracker || {}),
  },

  // Contact warmup
  contactWarmup: {
    getContactStatus: vi.fn(() => ({
      status: 'established',
      messageCount: 15,
      daysSinceFirst: 10,
      lastMessage: Date.now() - 86400000,
    })),
    canMessage: vi.fn(() => ({
      allowed: true,
      reason: null,
      suggestedDelay: 0,
    })),
    ...(overrides.contactWarmup || {}),
  },

  // Message scheduler
  messageScheduler: {
    getStatus: vi.fn(() => ({
      queueLength: 3,
      processing: false,
      nextSendTime: Date.now() + 60000,
    })),
    clear: vi.fn(),
    ...(overrides.messageScheduler || {}),
  },

  // Weekend patterns
  weekendPatterns: {
    getStatus: vi.fn(() => ({
      isWeekend: false,
      isHoliday: false,
      dayOfWeek: 'Monday',
      adjustedLimits: { hourly: 30, daily: 150 },
      activityMultiplier: 1.0,
    })),
    ...(overrides.weekendPatterns || {}),
  },

  // Activity ramp
  activityRamper: {
    getStatus: vi.fn(() => ({
      isRamping: false,
      currentLevel: 1.0,
      targetLevel: 1.0,
      minutesSinceStart: 120,
      stepsCompleted: 5,
    })),
    ...(overrides.activityRamper || {}),
  },

  // Network fingerprint
  networkFingerprint: {
    checkNetworkHealth: vi.fn(() => ({
      healthy: true,
      currentIP: '192.168.1.1',
      ipStability: 'stable',
      connectionQuality: 'good',
    })),
    getRecommendations: vi.fn(() => []),
    ...(overrides.networkFingerprint || {}),
  },

  ...overrides,
});

// =============================================================================
// DELIVERY HEALTH ENDPOINT TESTS
// =============================================================================

describe('GET /api/delivery-health', () => {
  it('should return delivery health status', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/delivery-health')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.healthy).toBe(true);
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.sent).toBe(100);
    expect(res.body.stats.delivered).toBe(95);
  });

  it('should return delivery rate', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/delivery-health')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.deliveryRate).toBe(0.95);
  });

  it('should return issues array', async () => {
    const client = createMockWhatsAppClient({
      deliveryTracker: {
        checkDeliveryHealth: vi.fn(() => ({
          healthy: false,
          issues: ['High failure rate', 'Multiple timeouts'],
          stats: { sent: 100, delivered: 70, failed: 30 },
        })),
      },
    });
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/delivery-health')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.healthy).toBe(false);
    expect(res.body.issues).toHaveLength(2);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/delivery-health');

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// CONTACT WARMUP ENDPOINT TESTS
// =============================================================================

describe('GET /api/contact-warmup/:phone', () => {
  it('should return contact warmup status', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/contact-warmup/6281234567890')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('established');
    expect(res.body.messageCount).toBe(15);
  });

  it('should include canMessage info', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/contact-warmup/6281234567890')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.allowed).toBe(true);
  });

  it('should handle new contacts', async () => {
    const client = createMockWhatsAppClient({
      contactWarmup: {
        getContactStatus: vi.fn(() => ({
          status: 'new',
          messageCount: 0,
          daysSinceFirst: 0,
        })),
        canMessage: vi.fn(() => ({
          allowed: true,
          reason: 'first contact',
          suggestedDelay: 0,
        })),
      },
    });
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/contact-warmup/6289999999999')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.status).toBe('new');
    expect(res.body.messageCount).toBe(0);
  });

  it('should handle restricted contacts', async () => {
    const client = createMockWhatsAppClient({
      contactWarmup: {
        getContactStatus: vi.fn(() => ({
          status: 'warming',
          messageCount: 2,
          daysSinceFirst: 1,
        })),
        canMessage: vi.fn(() => ({
          allowed: false,
          reason: 'daily limit reached',
          suggestedDelay: 3600000,
        })),
      },
    });
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/contact-warmup/6289999999999')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.allowed).toBe(false);
    expect(res.body.reason).toBe('daily limit reached');
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/contact-warmup/6281234567890');

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// MESSAGE QUEUE ENDPOINT TESTS
// =============================================================================

describe('POST /api/queue', () => {
  it('should queue a message successfully', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/queue')
      .set('Authorization', 'Bearer test-secret')
      .send({ to: '+6281234567890', message: 'Hello!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.queued).toBe(true);
    expect(res.body.queuedMessageId).toBe('queue_msg_456');
  });

  it('should return queue status after queuing', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/queue')
      .set('Authorization', 'Bearer test-secret')
      .send({ to: '+6281234567890', message: 'Hello!' });

    expect(res.body.queueStatus).toBeDefined();
    expect(res.body.queueStatus.queueLength).toBe(3);
  });

  it('should accept priority parameter', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    await request(app)
      .post('/api/queue')
      .set('Authorization', 'Bearer test-secret')
      .send({ to: '+6281234567890', message: 'Urgent!', priority: 'high' });

    expect(client.queueMessage).toHaveBeenCalledWith(
      '+6281234567890',
      'Urgent!',
      undefined,
      'high'
    );
  });

  it('should reject missing to field', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/queue')
      .set('Authorization', 'Bearer test-secret')
      .send({ message: 'Hello!' });

    expect(res.status).toBe(400);
  });

  it('should reject missing message field', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/queue')
      .set('Authorization', 'Bearer test-secret')
      .send({ to: '+6281234567890' });

    expect(res.status).toBe(400);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/queue')
      .send({ to: '+6281234567890', message: 'Hello!' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/queue-status', () => {
  it('should return queue status', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/queue-status')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.queueLength).toBe(3);
    expect(res.body.processing).toBe(false);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/queue-status');

    expect(res.status).toBe(401);
  });
});

describe('POST /api/queue-clear', () => {
  it('should clear the message queue', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/queue-clear')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(client.messageScheduler.clear).toHaveBeenCalled();
  });

  it('should return updated queue status', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/queue-clear')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.queueStatus).toBeDefined();
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).post('/api/queue-clear');

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// WEEKEND PATTERNS ENDPOINT TESTS
// =============================================================================

describe('GET /api/weekend-patterns', () => {
  it('should return weekend pattern status', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/weekend-patterns')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.isWeekend).toBe(false);
    expect(res.body.dayOfWeek).toBe('Monday');
  });

  it('should return adjusted limits', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/weekend-patterns')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.adjustedLimits).toBeDefined();
    expect(res.body.adjustedLimits.hourly).toBe(30);
  });

  it('should handle weekend mode', async () => {
    const client = createMockWhatsAppClient({
      weekendPatterns: {
        getStatus: vi.fn(() => ({
          isWeekend: true,
          isHoliday: false,
          dayOfWeek: 'Saturday',
          adjustedLimits: { hourly: 15, daily: 75 },
          activityMultiplier: 0.5,
        })),
      },
    });
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/weekend-patterns')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.isWeekend).toBe(true);
    expect(res.body.activityMultiplier).toBe(0.5);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/weekend-patterns');

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// ACTIVITY RAMP ENDPOINT TESTS
// =============================================================================

describe('GET /api/activity-ramp', () => {
  it('should return activity ramp status', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/activity-ramp')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.isRamping).toBe(false);
    expect(res.body.currentLevel).toBe(1.0);
  });

  it('should handle active ramping', async () => {
    const client = createMockWhatsAppClient({
      activityRamper: {
        getStatus: vi.fn(() => ({
          isRamping: true,
          currentLevel: 0.6,
          targetLevel: 1.0,
          minutesSinceStart: 30,
          stepsCompleted: 3,
          estimatedTimeToFull: 45,
        })),
      },
    });
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/activity-ramp')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.isRamping).toBe(true);
    expect(res.body.currentLevel).toBe(0.6);
    expect(res.body.stepsCompleted).toBe(3);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/activity-ramp');

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// NETWORK HEALTH ENDPOINT TESTS
// =============================================================================

describe('GET /api/network-health', () => {
  it('should return network health status', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/network-health')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.healthy).toBe(true);
    expect(res.body.ipStability).toBe('stable');
  });

  it('should include recommendations', async () => {
    const client = createMockWhatsAppClient({
      networkFingerprint: {
        checkNetworkHealth: vi.fn(() => ({
          healthy: false,
          ipStability: 'unstable',
        })),
        getRecommendations: vi.fn(() => [
          'Use a stable VPN connection',
          'Avoid public WiFi networks',
        ]),
      },
    });
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/network-health')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.recommendations).toHaveLength(2);
    expect(res.body.recommendations[0]).toContain('VPN');
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/network-health');

    expect(res.status).toBe(401);
  });
});
