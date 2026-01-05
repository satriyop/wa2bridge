/**
 * Phase 3 API Endpoint Tests
 *
 * Tests for Phase 3 anti-ban endpoints:
 * - Spam detection
 * - Geo IP matching
 * - Conversation context
 * - Status viewer
 * - Reply probability
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../src/api.js';

// Mock WhatsApp client with Phase 3 components
const createMockWhatsAppClient = (overrides = {}) => ({
  getStatus: vi.fn(() => ({
    connected: true,
    phone: '6281234567890',
    name: 'Test User',
    qr: null,
    banWarning: { hibernationMode: false },
  })),

  // Spam detector
  spamDetector: {
    getMetrics: vi.fn(() => ({
      spamScore: 0.15,
      reportedByCount: 0,
      suspiciousPatterns: [],
      lastCheck: Date.now() - 3600000,
    })),
    ...(overrides.spamDetector || {}),
  },

  // Geo matcher
  geoMatcher: {
    getStatus: vi.fn(() => ({
      currentCountry: 'ID',
      phoneCountry: 'ID',
      matched: true,
      lastCheck: Date.now() - 3600000,
    })),
    checkIPCountry: vi.fn(() => Promise.resolve({
      ip: '103.28.x.x',
      country: 'ID',
      matched: true,
    })),
    ...(overrides.geoMatcher || {}),
  },

  // Conversation memory
  conversationMemory: {
    getContext: vi.fn(() => ({
      messageCount: 25,
      firstMessage: Date.now() - 86400000 * 7,
      lastMessage: Date.now() - 3600000,
      topics: ['work', 'meeting'],
      sentiment: 'positive',
    })),
    getActiveConversations: vi.fn(() => [
      { phone: '6281234567890', lastMessage: Date.now() - 3600000 },
      { phone: '6289876543210', lastMessage: Date.now() - 7200000 },
    ]),
    ...(overrides.conversationMemory || {}),
  },

  // Status viewer
  statusViewer: {
    getStatus: vi.fn(() => ({
      viewedCount: 15,
      lastViewed: Date.now() - 1800000,
      autoViewEnabled: true,
    })),
    ...(overrides.statusViewer || {}),
  },

  // Reply probability
  replyProbability: {
    shouldReply: vi.fn(() => ({
      shouldReply: true,
      probability: 0.85,
      reason: 'Direct question detected',
      suggestedDelay: 5000,
    })),
    ...(overrides.replyProbability || {}),
  },

  ...overrides,
});

// =============================================================================
// SPAM DETECTION ENDPOINT TESTS
// =============================================================================

describe('GET /api/spam-detection', () => {
  it('should return spam detection metrics', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/spam-detection')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.spamScore).toBe(0.15);
    expect(res.body.reportedByCount).toBe(0);
  });

  it('should return suspicious patterns', async () => {
    const client = createMockWhatsAppClient({
      spamDetector: {
        getMetrics: vi.fn(() => ({
          spamScore: 0.65,
          reportedByCount: 2,
          suspiciousPatterns: ['repetitive content', 'bulk sending'],
        })),
      },
    });
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/spam-detection')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.spamScore).toBe(0.65);
    expect(res.body.suspiciousPatterns).toHaveLength(2);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/spam-detection');

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// GEO MATCH ENDPOINT TESTS
// =============================================================================

describe('GET /api/geo-match', () => {
  it('should return geo match status', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/geo-match')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.currentCountry).toBe('ID');
    expect(res.body.phoneCountry).toBe('ID');
    expect(res.body.matched).toBe(true);
  });

  it('should include IP check result', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/geo-match')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.check).toBeDefined();
    expect(res.body.check.country).toBe('ID');
  });

  it('should handle geo mismatch', async () => {
    const client = createMockWhatsAppClient({
      geoMatcher: {
        getStatus: vi.fn(() => ({
          currentCountry: 'US',
          phoneCountry: 'ID',
          matched: false,
        })),
        checkIPCountry: vi.fn(() => Promise.resolve({
          ip: '8.8.8.8',
          country: 'US',
          matched: false,
        })),
      },
    });
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/geo-match')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.matched).toBe(false);
    expect(res.body.currentCountry).toBe('US');
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/geo-match');

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// CONVERSATION CONTEXT ENDPOINT TESTS
// =============================================================================

describe('GET /api/conversation/:phone', () => {
  it('should return conversation context', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/conversation/6281234567890')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.messageCount).toBe(25);
    expect(res.body.topics).toContain('work');
  });

  it('should call getContext with phone parameter', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    await request(app)
      .get('/api/conversation/6289999999999')
      .set('Authorization', 'Bearer test-secret');

    expect(client.conversationMemory.getContext).toHaveBeenCalledWith('6289999999999');
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/conversation/6281234567890');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/conversations-active', () => {
  it('should return active conversations', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/conversations-active')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.conversations).toHaveLength(2);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/conversations-active');

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// STATUS VIEWER ENDPOINT TESTS
// =============================================================================

describe('GET /api/status-viewer', () => {
  it('should return status viewer info', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/status-viewer')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.viewedCount).toBe(15);
    expect(res.body.autoViewEnabled).toBe(true);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/status-viewer');

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// REPLY CHECK ENDPOINT TESTS
// =============================================================================

describe('POST /api/reply-check', () => {
  it('should return reply probability', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/reply-check')
      .set('Authorization', 'Bearer test-secret')
      .send({ text: 'Are you available?', from: '6281234567890' });

    expect(res.status).toBe(200);
    expect(res.body.shouldReply).toBe(true);
    expect(res.body.probability).toBe(0.85);
  });

  it('should include reason for reply decision', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/reply-check')
      .set('Authorization', 'Bearer test-secret')
      .send({ text: 'Hello?', from: '6281234567890' });

    expect(res.body.reason).toBeDefined();
    expect(res.body.suggestedDelay).toBe(5000);
  });

  it('should reject missing text field', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/reply-check')
      .set('Authorization', 'Bearer test-secret')
      .send({ from: '6281234567890' });

    expect(res.status).toBe(400);
  });

  it('should reject missing from field', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/reply-check')
      .set('Authorization', 'Bearer test-secret')
      .send({ text: 'Hello?' });

    expect(res.status).toBe(400);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/reply-check')
      .send({ text: 'Hello?', from: '6281234567890' });

    expect(res.status).toBe(401);
  });
});
