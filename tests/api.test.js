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

// Mock WhatsApp client for testing
const createMockWhatsAppClient = (overrides = {}) => ({
  getStatus: vi.fn(() => ({
    connected: true,
    phone: '6281234567890',
    name: 'Test User',
    qr: null,
    banWarning: { hibernationMode: false },
    ...(overrides.status || {}),
  })),
  sendMessage: vi.fn(() => Promise.resolve({ key: { id: 'msg123' } })),
  rateLimiter: { getStatus: vi.fn(() => ({ hourly: { used: 0 } })) },
  banWarning: { getStatus: vi.fn(() => ({ currentLevel: 'normal' })) },
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
    expect(res.body.error).toBe('Invalid phone number format');
  });

  it('should reject phone that is too short', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/send')
      .set('Authorization', 'Bearer test-secret')
      .send({ to: '12345', message: 'Hello' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid phone number format');
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
    expect(res.body.error).toBe('Not found');
    expect(res.body.message).toContain('/api/unknown-route');
  });

  it('should return 404 for unknown POST routes', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client);

    const res = await request(app)
      .post('/api/does-not-exist')
      .send({});

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
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
