/**
 * Phase 6 API Endpoint Tests
 *
 * Tests for Phase 6 endpoints:
 * - Webhook management (status, subscribe, history, retries)
 * - SSE event stream
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../src/api.js';

// Mock WhatsApp client with Phase 6 webhook components
const createMockWhatsAppClient = (overrides = {}) => ({
  getStatus: vi.fn(() => ({
    connected: true,
    phone: '6281234567890',
    name: 'Test User',
    qr: null,
    banWarning: { hibernationMode: false },
  })),

  // Webhook emitter
  webhookEmitter: {
    getStats: vi.fn(() => ({
      enabled: true,
      webhookUrl: 'https://example.com/webhook',
      subscribedEvents: ['message.received', 'message.sent'],
      totalSent: 150,
      failedCount: 3,
      lastSent: Date.now() - 60000,
    })),
    getHistory: vi.fn((limit) => [
      { event: 'message.received', timestamp: Date.now() - 60000, success: true },
      { event: 'message.sent', timestamp: Date.now() - 120000, success: true },
      { event: 'message.sent', timestamp: Date.now() - 180000, success: false },
    ].slice(0, limit)),
    subscribe: vi.fn((events) => events),
    unsubscribe: vi.fn((events) => events),
    subscriptions: new Set(['message.received', 'message.sent']),
    setEnabled: vi.fn(),
    getPendingRetries: vi.fn(() => [
      { id: 'retry1', event: 'message.sent', attempts: 2, lastAttempt: Date.now() - 300000 },
    ]),
    processRetries: vi.fn(() => Promise.resolve({ processed: 1, succeeded: 1, failed: 0 })),
    emit: vi.fn(() => Promise.resolve({ success: true, delivered: true })),
    ...(overrides.webhookEmitter || {}),
  },

  ...overrides,
});

// =============================================================================
// WEBHOOK STATUS ENDPOINT TESTS
// =============================================================================

describe('GET /api/webhooks', () => {
  it('should return webhook stats', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/webhooks')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.webhookUrl).toBe('https://example.com/webhook');
    expect(res.body.subscribedEvents).toContain('message.received');
  });

  it('should handle missing webhook emitter', async () => {
    const client = createMockWhatsAppClient({ webhookEmitter: null });
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/webhooks')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/webhooks');
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// WEBHOOK HISTORY ENDPOINT TESTS
// =============================================================================

describe('GET /api/webhooks/history', () => {
  it('should return webhook history', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/webhooks/history')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(3);
    expect(res.body.events[0].event).toBe('message.received');
  });

  it('should accept limit parameter', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    await request(app)
      .get('/api/webhooks/history?limit=5')
      .set('Authorization', 'Bearer test-secret');

    expect(client.webhookEmitter.getHistory).toHaveBeenCalledWith(5);
  });

  it('should handle missing webhook emitter', async () => {
    const client = createMockWhatsAppClient({ webhookEmitter: null });
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/webhooks/history')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.events).toEqual([]);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/webhooks/history');
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// WEBHOOK SUBSCRIBE ENDPOINT TESTS
// =============================================================================

describe('POST /api/webhooks/subscribe', () => {
  it('should subscribe to events', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/webhooks/subscribe')
      .set('Authorization', 'Bearer test-secret')
      .send({ events: ['message.received', 'status.change'] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(client.webhookEmitter.subscribe).toHaveBeenCalledWith(['message.received', 'status.change']);
  });

  it('should reject missing events array', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/webhooks/subscribe')
      .set('Authorization', 'Bearer test-secret')
      .send({});

    expect(res.status).toBe(400);
  });

  it('should reject non-array events', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/webhooks/subscribe')
      .set('Authorization', 'Bearer test-secret')
      .send({ events: 'message.received' });

    expect(res.status).toBe(400);
  });

  it('should handle missing webhook emitter', async () => {
    const client = createMockWhatsAppClient({ webhookEmitter: null });
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/webhooks/subscribe')
      .set('Authorization', 'Bearer test-secret')
      .send({ events: ['message.received'] });

    expect(res.status).toBe(400);
  });
});

// =============================================================================
// WEBHOOK UNSUBSCRIBE ENDPOINT TESTS
// =============================================================================

describe('POST /api/webhooks/unsubscribe', () => {
  it('should unsubscribe from events', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/webhooks/unsubscribe')
      .set('Authorization', 'Bearer test-secret')
      .send({ events: ['message.received'] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(client.webhookEmitter.unsubscribe).toHaveBeenCalledWith(['message.received']);
  });

  it('should reject missing events array', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/webhooks/unsubscribe')
      .set('Authorization', 'Bearer test-secret')
      .send({});

    expect(res.status).toBe(400);
  });
});

// =============================================================================
// WEBHOOK TOGGLE ENDPOINT TESTS
// =============================================================================

describe('POST /api/webhooks/toggle', () => {
  it('should toggle webhooks on', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/webhooks/toggle')
      .set('Authorization', 'Bearer test-secret')
      .send({ enabled: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(client.webhookEmitter.setEnabled).toHaveBeenCalledWith(true);
  });

  it('should toggle webhooks off', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/webhooks/toggle')
      .set('Authorization', 'Bearer test-secret')
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(client.webhookEmitter.setEnabled).toHaveBeenCalledWith(false);
  });

  it('should reject missing enabled boolean', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/webhooks/toggle')
      .set('Authorization', 'Bearer test-secret')
      .send({});

    expect(res.status).toBe(400);
  });

  it('should reject non-boolean enabled', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/webhooks/toggle')
      .set('Authorization', 'Bearer test-secret')
      .send({ enabled: 'yes' });

    expect(res.status).toBe(400);
  });
});

// =============================================================================
// WEBHOOK RETRIES ENDPOINT TESTS
// =============================================================================

describe('GET /api/webhooks/retries', () => {
  it('should return pending retries', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/webhooks/retries')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.pending).toHaveLength(1);
    expect(res.body.pending[0].event).toBe('message.sent');
  });

  it('should handle missing webhook emitter', async () => {
    const client = createMockWhatsAppClient({ webhookEmitter: null });
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/webhooks/retries')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.pending).toEqual([]);
  });
});

describe('POST /api/webhooks/retries', () => {
  it('should process pending retries', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/webhooks/retries')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(1);
    expect(res.body.succeeded).toBe(1);
    expect(client.webhookEmitter.processRetries).toHaveBeenCalled();
  });

  it('should handle missing webhook emitter', async () => {
    const client = createMockWhatsAppClient({ webhookEmitter: null });
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/webhooks/retries')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.processed).toBe(0);
  });
});

// =============================================================================
// WEBHOOK TEST ENDPOINT TESTS
// =============================================================================

describe('POST /api/webhooks/test', () => {
  it('should send test webhook', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/webhooks/test')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(client.webhookEmitter.emit).toHaveBeenCalledWith('webhook.test', expect.any(Object));
  });

  it('should handle missing webhook emitter', async () => {
    const client = createMockWhatsAppClient({ webhookEmitter: null });
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/webhooks/test')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(400);
  });
});

// =============================================================================
// WEBHOOK EVENTS ENDPOINT TESTS
// =============================================================================

describe('GET /api/webhooks/events', () => {
  it('should return available events', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/webhooks/events')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.events).toBeDefined();
    expect(res.body.events.message).toBeDefined();
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/webhooks/events');
    expect(res.status).toBe(401);
  });
});

// =============================================================================
// SSE EVENT STREAM ENDPOINT TESTS
// Note: Full SSE testing requires EventSource, which isn't available in Node.
// These tests verify the endpoint exists and handles the connection correctly.
// =============================================================================

describe('GET /api/events (SSE)', () => {
  it('should accept connection and respond with SSE content type', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    // Use http module directly for better SSE handling
    const http = await import('http');
    const server = http.createServer(app);

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    // Make request and check headers, then close
    const response = await new Promise((resolve) => {
      const req = http.get(`http://localhost:${port}/api/events`, (res) => {
        resolve(res);
        req.destroy(); // Close after getting response
      });
    });

    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.headers['cache-control']).toBe('no-cache');
    expect(response.statusCode).toBe(200);

    server.close();
  });

  it('should not require authentication for SSE', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const http = await import('http');
    const server = http.createServer(app);

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const response = await new Promise((resolve) => {
      const req = http.get(`http://localhost:${port}/api/events`, (res) => {
        resolve(res);
        req.destroy();
      });
    });

    // Should not return 401
    expect(response.statusCode).toBe(200);

    server.close();
  });
});
