/**
 * Phase 4 API Endpoint Tests
 *
 * Tests for Phase 4 detection & recovery endpoints:
 * - Block detection
 * - Session backup/restore
 * - Persistent queue
 * - Webhook retry
 * - Health monitor
 * - Language detection
 */

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApiServer } from '../src/api.js';

// Mock WhatsApp client with Phase 4 components
const createMockWhatsAppClient = (overrides = {}) => ({
  getStatus: vi.fn(() => ({
    connected: true,
    phone: '6281234567890',
    name: 'Test User',
    qr: null,
    banWarning: { hibernationMode: false },
  })),

  // Block detector
  blockDetector: {
    getStats: vi.fn(() => ({
      totalChecked: 50,
      blockedCount: 2,
      lastCheck: Date.now() - 3600000,
    })),
    checkIfBlocked: vi.fn(() => Promise.resolve(false)),
    getContactStatus: vi.fn(() => ({
      status: 'normal',
      lastDelivery: Date.now() - 86400000,
      failureCount: 0,
    })),
    ...(overrides.blockDetector || {}),
  },

  // Session manager
  sessionManager: {
    getBackupInfo: vi.fn(() => ({
      lastBackup: Date.now() - 21600000,
      backupCount: 5,
      backupPath: '/sessions/backups',
      autoBackupEnabled: true,
    })),
    backup: vi.fn(() => Promise.resolve('/sessions/backups/backup_123.zip')),
    restore: vi.fn(() => Promise.resolve(true)),
    ...(overrides.sessionManager || {}),
  },

  // Persistent queue
  persistentQueue: {
    getStats: vi.fn(() => ({
      queueLength: 3,
      pendingCount: 2,
      failedCount: 1,
      processed: 100,
    })),
    enqueue: vi.fn(() => 'persistent_msg_789'),
    processQueue: vi.fn(() => Promise.resolve()),
    ...(overrides.persistentQueue || {}),
  },

  // Webhook manager
  webhookManager: {
    getStats: vi.fn(() => ({
      totalSent: 200,
      failedCount: 5,
      retryQueueLength: 3,
      lastSuccess: Date.now() - 60000,
    })),
    retryFailed: vi.fn(() => Promise.resolve()),
    ...(overrides.webhookManager || {}),
  },

  // Health monitor
  healthMonitor: {
    getStatus: vi.fn(() => ({
      overall: 'healthy',
      components: {
        whatsapp: 'healthy',
        database: 'healthy',
        network: 'healthy',
      },
      uptime: 86400000,
    })),
    generateReport: vi.fn(() => ({
      generatedAt: Date.now(),
      overall: 'healthy',
      details: {
        messagesSent: 500,
        deliveryRate: 0.95,
        errorRate: 0.02,
      },
      recommendations: [],
    })),
    ...(overrides.healthMonitor || {}),
  },

  // Language detector
  languageDetector: {
    getContactLanguage: vi.fn(() => 'id'),
    getLanguageConfidence: vi.fn(() => 0.92),
    getAllLanguages: vi.fn(() => ({
      languages: { id: 45, en: 12 },
      total: 57,
    })),
    ...(overrides.languageDetector || {}),
  },

  ...overrides,
});

// =============================================================================
// BLOCK DETECTION ENDPOINT TESTS
// =============================================================================

describe('GET /api/block-detection', () => {
  it('should return block detection stats', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/block-detection')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.totalChecked).toBe(50);
    expect(res.body.blockedCount).toBe(2);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/block-detection');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/block-detection/:phone', () => {
  it('should check if contact has blocked', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/block-detection/6281234567890')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.phone).toBe('6281234567890');
    expect(res.body.isBlocked).toBe(false);
  });

  it('should include contact status', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/block-detection/6281234567890')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.status).toBe('normal');
  });

  it('should detect blocked contacts', async () => {
    const client = createMockWhatsAppClient({
      blockDetector: {
        getStats: vi.fn(() => ({})),
        checkIfBlocked: vi.fn(() => Promise.resolve(true)),
        getContactStatus: vi.fn(() => ({
          status: 'blocked',
          lastDelivery: null,
          failureCount: 5,
        })),
      },
    });
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/block-detection/6289999999999')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.isBlocked).toBe(true);
    expect(res.body.status).toBe('blocked');
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/block-detection/6281234567890');

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// SESSION BACKUP ENDPOINT TESTS
// =============================================================================

describe('GET /api/session-backup', () => {
  it('should return session backup info', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/session-backup')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.backupCount).toBe(5);
    expect(res.body.autoBackupEnabled).toBe(true);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/session-backup');

    expect(res.status).toBe(401);
  });
});

describe('POST /api/session-backup', () => {
  it('should trigger manual backup', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/session-backup')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.backupPath).toContain('backup');
    expect(client.sessionManager.backup).toHaveBeenCalled();
  });

  it('should return updated backup info', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/session-backup')
      .set('Authorization', 'Bearer test-secret');

    expect(res.body.backupInfo).toBeDefined();
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).post('/api/session-backup');

    expect(res.status).toBe(401);
  });
});

describe('POST /api/session-restore', () => {
  it('should restore from backup', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/session-restore')
      .set('Authorization', 'Bearer test-secret')
      .send({ backupName: 'backup_123.zip' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain('restored');
  });

  it('should handle restore failure', async () => {
    const client = createMockWhatsAppClient({
      sessionManager: {
        getBackupInfo: vi.fn(() => ({})),
        backup: vi.fn(() => Promise.resolve('')),
        restore: vi.fn(() => Promise.resolve(false)),
      },
    });
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/session-restore')
      .set('Authorization', 'Bearer test-secret')
      .send({ backupName: 'invalid.zip' });

    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain('failed');
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/session-restore')
      .send({ backupName: 'backup.zip' });

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// PERSISTENT QUEUE ENDPOINT TESTS
// =============================================================================

describe('GET /api/persistent-queue', () => {
  it('should return persistent queue stats', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/persistent-queue')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.queueLength).toBe(3);
    expect(res.body.processed).toBe(100);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/persistent-queue');

    expect(res.status).toBe(401);
  });
});

describe('POST /api/persistent-queue', () => {
  it('should enqueue to persistent queue', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/persistent-queue')
      .set('Authorization', 'Bearer test-secret')
      .send({ to: '+6281234567890', message: 'Hello!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.queuedMessageId).toBe('persistent_msg_789');
  });

  it('should reject missing fields', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/persistent-queue')
      .set('Authorization', 'Bearer test-secret')
      .send({ to: '+6281234567890' });

    expect(res.status).toBe(400);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/persistent-queue')
      .send({ to: '+6281234567890', message: 'Hello!' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/persistent-queue/process', () => {
  it('should process the queue', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/persistent-queue/process')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(client.persistentQueue.processQueue).toHaveBeenCalled();
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).post('/api/persistent-queue/process');

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// WEBHOOK RETRY ENDPOINT TESTS
// =============================================================================

describe('GET /api/webhook-retry', () => {
  it('should return webhook stats', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/webhook-retry')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.totalSent).toBe(200);
    expect(res.body.retryQueueLength).toBe(3);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/webhook-retry');

    expect(res.status).toBe(401);
  });
});

describe('POST /api/webhook-retry', () => {
  it('should retry failed webhooks', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .post('/api/webhook-retry')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(client.webhookManager.retryFailed).toHaveBeenCalled();
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).post('/api/webhook-retry');

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// HEALTH MONITOR ENDPOINT TESTS
// =============================================================================

describe('GET /api/health-monitor', () => {
  it('should return health status', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/health-monitor')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.overall).toBe('healthy');
    expect(res.body.components).toBeDefined();
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/health-monitor');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/health-report', () => {
  it('should return full health report', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/health-report')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.overall).toBe('healthy');
    expect(res.body.details).toBeDefined();
    expect(res.body.details.deliveryRate).toBe(0.95);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/health-report');

    expect(res.status).toBe(401);
  });
});

// =============================================================================
// LANGUAGE DETECTION ENDPOINT TESTS
// =============================================================================

describe('GET /api/language/:phone', () => {
  it('should return detected language', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/language/6281234567890')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.phone).toBe('6281234567890');
    expect(res.body.language).toBe('id');
    expect(res.body.confidence).toBe(0.92);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/language/6281234567890');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/languages', () => {
  it('should return all detected languages', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app)
      .get('/api/languages')
      .set('Authorization', 'Bearer test-secret');

    expect(res.status).toBe(200);
    expect(res.body.languages).toBeDefined();
    expect(res.body.languages.id).toBe(45);
    expect(res.body.total).toBe(57);
  });

  it('should require authentication', async () => {
    const client = createMockWhatsAppClient();
    const app = createApiServer(client, { apiSecret: 'test-secret' });

    const res = await request(app).get('/api/languages');

    expect(res.status).toBe(401);
  });
});
