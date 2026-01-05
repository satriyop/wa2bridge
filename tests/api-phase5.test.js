/**
 * Phase 5 API Endpoint Tests
 *
 * Tests for Phase 5 endpoints:
 * - Phase 5A: Analytics & Intelligence (analytics, scoring, sentiment)
 * - Phase 5B: Security (IP whitelist, audit logs, rate limiter)
 * - Phase 5C: Automation (auto-responder, templates, scheduled)
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../src/api.js';

// Mock WhatsApp client with Phase 5 components
const createMockWhatsAppClient = (overrides = {}) => ({
  getStatus: vi.fn(() => ({
    connected: true,
    phone: '6281234567890',
    name: 'Test User',
    qr: null,
    banWarning: { hibernationMode: false },
  })),

  // Analytics
  analytics: {
    getSummary: vi.fn(() => ({
      totalMessages: 500,
      sentToday: 25,
      receivedToday: 18,
      peakHour: 14,
      topContacts: ['6281234567890', '6289876543210'],
    })),
    getContactStats: vi.fn((phone) => ({
      phone,
      messageCount: 45,
      lastMessage: Date.now() - 3600000,
      avgResponseTime: 120000,
    })),
    getPeakHours: vi.fn(() => ({
      hours: { 9: 15, 10: 22, 14: 35, 15: 28 },
      peak: 14,
      recommendation: 'Send between 14:00-16:00 for best engagement',
    })),
    ...(overrides.analytics || {}),
  },

  // Contact scoring
  contactScoring: {
    getStats: vi.fn(() => ({
      totalContacts: 50,
      tiers: { gold: 5, silver: 15, bronze: 30 },
      avgScore: 65,
    })),
    getScore: vi.fn(() => 85),
    getTier: vi.fn(() => 'gold'),
    getTopContacts: vi.fn(() => [
      { phone: '6281111111111', score: 95 },
      { phone: '6282222222222', score: 88 },
    ]),
    getContactsNeedingAttention: vi.fn(() => [
      { phone: '6283333333333', reason: 'No response in 7 days' },
    ]),
    ...(overrides.contactScoring || {}),
  },

  // Sentiment detector
  sentimentDetector: {
    analyze: vi.fn(() => ({
      sentiment: 'positive',
      score: 0.75,
      keywords: ['terima kasih', 'bagus'],
    })),
    getContactSentiment: vi.fn(() => ({
      overall: 'positive',
      history: [
        { date: '2025-01-01', sentiment: 'positive' },
        { date: '2025-01-02', sentiment: 'neutral' },
      ],
    })),
    ...(overrides.sentimentDetector || {}),
  },

  // IP Whitelist
  ipWhitelist: {
    getStatus: vi.fn(() => ({
      enabled: true,
      whitelist: ['127.0.0.1', '192.168.1.0/24'],
      blacklist: ['1.2.3.4'],
      blockedCount: 5,
    })),
    setEnabled: vi.fn(),
    addToWhitelist: vi.fn(),
    addToBlacklist: vi.fn(),
    ...(overrides.ipWhitelist || {}),
  },

  // Audit logger
  auditLogger: {
    getLogs: vi.fn(() => ({
      logs: [
        { timestamp: Date.now(), type: 'api', action: 'send_message' },
        { timestamp: Date.now() - 60000, type: 'security', action: 'blocked_ip' },
      ],
      total: 2,
    })),
    getStats: vi.fn(() => ({
      totalLogs: 150,
      byType: { api: 100, security: 30, message: 20 },
    })),
    getSecurityEvents: vi.fn(() => ({
      events: [{ type: 'blocked_ip', count: 5 }],
      critical: 0,
    })),
    ...(overrides.auditLogger || {}),
  },

  // API rate limiter
  apiRateLimiter: {
    getStats: vi.fn(() => ({
      requests: { total: 1000, limited: 5 },
      endpoints: { '/api/send': 500, '/api/status': 200 },
    })),
    ...(overrides.apiRateLimiter || {}),
  },

  // Auto-responder
  autoResponder: {
    getStats: vi.fn(() => ({
      enabled: true,
      rulesCount: 3,
      triggeredToday: 12,
    })),
    getRules: vi.fn(() => [
      { id: 'rule1', pattern: 'hello', response: 'Hi there!' },
    ]),
    setEnabled: vi.fn(),
    addRule: vi.fn((rule) => ({ id: 'new_rule', ...rule })),
    updateRule: vi.fn((id, rule) => ({ id, ...rule })),
    deleteRule: vi.fn(() => true),
    ...(overrides.autoResponder || {}),
  },

  // Message Templates (API uses messageTemplates not templates)
  messageTemplates: {
    list: vi.fn(() => ({
      templates: [
        { name: 'greeting', content: 'Hello {{name}}!' },
        { name: 'thanks', content: 'Thank you for your message.' },
      ],
      count: 2,
    })),
    create: vi.fn((name, content, opts) => ({ name, content, ...opts, createdAt: Date.now() })),
    render: vi.fn(() => 'Hello John!'),
    delete: vi.fn(() => true),
    ...(overrides.messageTemplates || {}),
  },

  // Scheduled messages
  scheduledMessages: {
    getScheduled: vi.fn(() => ({
      messages: [
        { id: 'sched1', to: '6281234567890', message: 'Hi', sendAt: Date.now() + 3600000 },
      ],
      count: 1,
    })),
    schedule: vi.fn(() => ({ id: 'sched_new', to: '6281234567890', message: 'Hi' })),
    cancel: vi.fn(() => true),
    getStats: vi.fn(() => ({ pending: 3, sent: 50, failed: 2 })),
    ...(overrides.scheduledMessages || {}),
  },

  ...overrides,
});

// =============================================================================
// PHASE 5A: ANALYTICS ENDPOINT TESTS
// =============================================================================

describe('GET /api/analytics', () => {
  it('should return analytics summary', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/analytics')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.totalMessages).toBe(500);
    expect(res.body.peakHour).toBe(14);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/analytics');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/analytics/:phone', () => {
  it('should return contact analytics', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/analytics/6281234567890')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.messageCount).toBe(45);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/analytics/6281234567890');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/analytics/peak-hours', () => {
  it('should return peak hours data', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/analytics/peak-hours')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.peak).toBe(14);
    expect(res.body.recommendation).toContain('14:00');
  });
});

// =============================================================================
// PHASE 5A: SCORING ENDPOINT TESTS
// =============================================================================

describe('GET /api/scoring', () => {
  it('should return scoring stats', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/scoring')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.totalContacts).toBe(50);
    expect(res.body.tiers.gold).toBe(5);
  });
});

describe('GET /api/scoring/:phone', () => {
  it('should return contact score and tier', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/scoring/6281234567890')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.score).toBe(85);
    expect(res.body.tier).toBe('gold');
  });
});

describe('GET /api/scoring/top/:limit', () => {
  it('should return top contacts', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/scoring/top/5')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].score).toBe(95);
  });
});

describe('GET /api/scoring/attention', () => {
  it('should return contacts needing attention', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/scoring/attention')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body[0].reason).toContain('No response');
  });
});

// =============================================================================
// PHASE 5A: SENTIMENT ENDPOINT TESTS
// =============================================================================

describe('POST /api/sentiment/analyze', () => {
  it('should analyze text sentiment', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/sentiment/analyze')
      .set('Authorization', 'Bearer test-secret')
      .send({ text: 'Terima kasih, bagus sekali!' });

    expect(res.status).toBe(200);
    expect(res.body.sentiment).toBe('positive');
    expect(res.body.score).toBe(0.75);
  });

  it('should reject missing text', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/sentiment/analyze')
      .set('Authorization', 'Bearer test-secret')
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('GET /api/sentiment/:phone', () => {
  it('should return contact sentiment history', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/sentiment/6281234567890')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.overall).toBe('positive');
    expect(res.body.history).toHaveLength(2);
  });
});

// =============================================================================
// PHASE 5B: SECURITY ENDPOINT TESTS
// =============================================================================

describe('GET /api/security/ip-whitelist', () => {
  it('should return IP whitelist status', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/security/ip-whitelist')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.whitelist).toContain('127.0.0.1');
  });
});

describe('POST /api/security/ip-whitelist/toggle', () => {
  it('should toggle IP whitelist', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/security/ip-whitelist/toggle')
      .set('Authorization', 'Bearer test-secret')
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(client.ipWhitelist.setEnabled).toHaveBeenCalledWith(false);
  });
});

describe('POST /api/security/ip-whitelist/add', () => {
  it('should add IP to whitelist', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/security/ip-whitelist/add')
      .set('Authorization', 'Bearer test-secret')
      .send({ ip: '10.0.0.1' });

    expect(res.status).toBe(200);
    expect(client.ipWhitelist.addToWhitelist).toHaveBeenCalledWith('10.0.0.1');
  });

  it('should reject missing IP', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/security/ip-whitelist/add')
      .set('Authorization', 'Bearer test-secret')
      .send({});

    expect(res.status).toBe(400);
  });
});

describe('POST /api/security/ip-blacklist/add', () => {
  it('should add IP to blacklist', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/security/ip-blacklist/add')
      .set('Authorization', 'Bearer test-secret')
      .send({ ip: '5.6.7.8' });

    expect(res.status).toBe(200);
    expect(client.ipWhitelist.addToBlacklist).toHaveBeenCalledWith('5.6.7.8');
  });
});

describe('GET /api/security/audit-logs', () => {
  it('should return audit logs', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/security/audit-logs')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(2);
  });

  it('should accept filter parameters', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    await request(app)
      .get('/api/security/audit-logs?type=security&limit=10')
      .set('Authorization', 'Bearer test-secret');

    expect(client.auditLogger.getLogs).toHaveBeenCalled();
  });
});

describe('GET /api/security/audit-stats', () => {
  it('should return audit stats', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/security/audit-stats')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.totalLogs).toBe(150);
  });
});

describe('GET /api/security/events', () => {
  it('should return security events', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/security/events')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.critical).toBe(0);
  });
});

describe('GET /api/security/rate-limiter', () => {
  it('should return rate limiter stats', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/security/rate-limiter')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.requests.total).toBe(1000);
  });
});

// =============================================================================
// PHASE 5C: AUTO-RESPONDER ENDPOINT TESTS
// =============================================================================

describe('GET /api/auto-responder', () => {
  it('should return auto-responder status', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/auto-responder')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.stats.enabled).toBe(true);
    expect(res.body.rules).toHaveLength(1);
  });
});

describe('POST /api/auto-responder/toggle', () => {
  it('should toggle auto-responder', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/auto-responder/toggle')
      .set('Authorization', 'Bearer test-secret')
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    expect(client.autoResponder.setEnabled).toHaveBeenCalledWith(false);
  });
});

describe('POST /api/auto-responder/rules', () => {
  it('should add auto-responder rule', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/auto-responder/rules')
      .set('Authorization', 'Bearer test-secret')
      .send({ pattern: 'price', response: 'Check our website' });

    expect(res.status).toBe(200);
    expect(res.body.rule.id).toBe('new_rule');
  });
});

describe('PUT /api/auto-responder/rules/:id', () => {
  it('should update auto-responder rule', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .put('/api/auto-responder/rules/rule1')
      .set('Authorization', 'Bearer test-secret')
      .send({ response: 'Updated response' });

    expect(res.status).toBe(200);
    expect(client.autoResponder.updateRule).toHaveBeenCalledWith('rule1', { response: 'Updated response' });
  });
});

describe('DELETE /api/auto-responder/rules/:id', () => {
  it('should delete auto-responder rule', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .delete('/api/auto-responder/rules/rule1')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(client.autoResponder.deleteRule).toHaveBeenCalledWith('rule1');
  });
});

// =============================================================================
// PHASE 5C: TEMPLATES ENDPOINT TESTS
// =============================================================================

describe('GET /api/templates', () => {
  it('should return templates', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/templates')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.templates).toHaveLength(2);
  });
});

describe('POST /api/templates', () => {
  it('should create template', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/templates')
      .set('Authorization', 'Bearer test-secret')
      .send({ name: 'welcome', content: 'Welcome {{name}}!' });

    expect(res.status).toBe(200);
    expect(res.body.template.name).toBe('welcome');
  });
});

describe('POST /api/templates/render', () => {
  it('should render template', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/templates/render')
      .set('Authorization', 'Bearer test-secret')
      .send({ name: 'greeting', variables: { name: 'John' } });

    expect(res.status).toBe(200);
    expect(res.body.rendered).toBe('Hello John!');
  });
});

describe('DELETE /api/templates/:name', () => {
  it('should delete template', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .delete('/api/templates/greeting')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(client.messageTemplates.delete).toHaveBeenCalledWith('greeting');
  });
});

// =============================================================================
// PHASE 5C: SCHEDULED MESSAGES ENDPOINT TESTS
// =============================================================================

describe('GET /api/scheduled', () => {
  it('should return scheduled messages', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/scheduled')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
  });
});

describe('POST /api/scheduled', () => {
  it('should schedule a message', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/scheduled')
      .set('Authorization', 'Bearer test-secret')
      .send({ to: '6281234567890', message: 'Hi', sendAt: Date.now() + 3600000 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.scheduled).toBeDefined();
  });

  it('should reject missing required fields', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/scheduled')
      .set('Authorization', 'Bearer test-secret')
      .send({ to: '6281234567890', message: 'Hi' }); // missing sendAt

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/scheduled/:id', () => {
  it('should cancel scheduled message', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .delete('/api/scheduled/sched1')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(client.scheduledMessages.cancel).toHaveBeenCalledWith('sched1');
  });
});

describe('GET /api/scheduled/stats', () => {
  it('should return scheduled stats', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/scheduled/stats')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.pending).toBe(3);
    expect(res.body.sent).toBe(50);
  });
});
