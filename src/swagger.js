/**
 * Swagger/OpenAPI Configuration for WA2Bridge
 *
 * Provides interactive API documentation at /api-docs
 * Uses swagger-jsdoc for annotation-based docs
 */

import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'WA2Bridge API',
      version: '2.0.0',
      description: `
## WhatsApp Bridge with Anti-Ban Protection

WA2Bridge provides a REST API for WhatsApp Web integration with enterprise-grade
anti-ban protection. It wraps the Baileys WhatsApp Web library with 50+ features
designed to avoid detection and account bans.

### Features by Phase

**Phase 1 (Core Anti-Ban):**
- Human-like delays and typing simulation
- Rate limiting by account age
- Browser fingerprint rotation
- Presence cycling

**Phase 2 (Smart Messaging):**
- Message queuing with optimal timing
- Contact warmup tracking
- Weekend/holiday patterns

**Phase 3 (Advanced Simulation):**
- Reaction and reply probability
- Status viewing simulation
- Spam detection

**Phase 4 (Reliability):**
- Block detection
- Session backup/restore
- Persistent message queue
- Webhook retry

**Phase 5 (Analytics & Automation):**
- Message analytics
- Contact scoring
- Sentiment analysis
- Auto-responder
- Scheduled messages

**Phase 6 (Enhanced Webhooks):**
- Granular event types
- Subscription management
- Event history

### Anti-Ban Priority

This system prioritizes anti-ban protection above all else.
All messaging operations include:
- Randomized delays
- Typing indicators
- Rate limit enforcement
- Activity ratio monitoring
`,
      contact: {
        name: 'WA2Bridge Support',
      },
      license: {
        name: 'MIT',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'API authentication token (API_SECRET from .env)',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
            },
          },
        },
        Success: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true,
            },
          },
        },
        Status: {
          type: 'object',
          properties: {
            connected: {
              type: 'boolean',
              description: 'WhatsApp connection status',
            },
            phone: {
              type: 'string',
              description: 'Connected phone number',
              example: '6281234567890',
            },
            name: {
              type: 'string',
              description: 'WhatsApp profile name',
            },
            qr: {
              type: 'string',
              nullable: true,
              description: 'QR code for pairing (null if connected)',
            },
            uptime: {
              type: 'number',
              description: 'Connection uptime in milliseconds',
            },
            rateLimits: {
              type: 'object',
              description: 'Current rate limit status',
            },
            antiBan: {
              type: 'object',
              description: 'Anti-ban metrics',
            },
          },
        },
        Message: {
          type: 'object',
          required: ['to', 'message'],
          properties: {
            to: {
              type: 'string',
              description: 'Recipient phone number (with country code)',
              example: '+6281234567890',
            },
            message: {
              type: 'string',
              description: 'Message text to send',
            },
            reply_to: {
              type: 'string',
              description: 'Optional message ID to reply to',
            },
          },
        },
        SendResult: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
            },
            messageId: {
              type: 'string',
              description: 'Sent message ID',
            },
            to: {
              type: 'string',
              description: 'Recipient phone number',
            },
          },
        },
        WebhookEvent: {
          type: 'object',
          properties: {
            event: {
              type: 'string',
              description: 'Event type (e.g., message.received)',
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
            },
            data: {
              type: 'object',
              description: 'Event-specific payload',
            },
          },
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: [], // We define paths inline below
};

// Generate base spec
const swaggerSpec = swaggerJsdoc(options);

// Add paths manually (swagger-jsdoc comments don't work well with our structure)
swaggerSpec.paths = {
  '/health': {
    get: {
      summary: 'Health check',
      tags: ['System'],
      security: [],
      responses: {
        200: {
          description: 'Service is healthy',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', example: 'ok' },
                  timestamp: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
      },
    },
  },

  '/api/status': {
    get: {
      summary: 'Get WhatsApp connection status',
      tags: ['Connection'],
      responses: {
        200: {
          description: 'Connection status',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Status' },
            },
          },
        },
        401: {
          description: 'Unauthorized',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
      },
    },
  },

  '/api/qr': {
    get: {
      summary: 'Get QR code for WhatsApp pairing',
      tags: ['Connection'],
      security: [],
      responses: {
        200: {
          description: 'QR code or connection status',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['connected', 'waiting_scan', 'waiting_qr'] },
                  qr: { type: 'string', nullable: true },
                  phone: { type: 'string', nullable: true },
                },
              },
            },
          },
        },
      },
    },
  },

  '/api/send': {
    post: {
      summary: 'Send a WhatsApp message',
      description: 'Sends a message with anti-ban protection (delays, typing, rate limits)',
      tags: ['Messaging'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Message' },
          },
        },
      },
      responses: {
        200: {
          description: 'Message sent successfully',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SendResult' },
            },
          },
        },
        400: {
          description: 'Bad request (missing fields)',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
        429: {
          description: 'Rate limited',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  error: { type: 'string' },
                  waitMs: { type: 'number', description: 'Milliseconds to wait' },
                },
              },
            },
          },
        },
        500: {
          description: 'Send failed',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Error' },
            },
          },
        },
      },
    },
  },

  '/api/rate-limits': {
    get: {
      summary: 'Get current rate limit status',
      tags: ['Anti-Ban'],
      responses: {
        200: {
          description: 'Rate limit status',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  hourly: {
                    type: 'object',
                    properties: {
                      used: { type: 'number' },
                      limit: { type: 'number' },
                      remaining: { type: 'number' },
                    },
                  },
                  daily: {
                    type: 'object',
                    properties: {
                      used: { type: 'number' },
                      limit: { type: 'number' },
                      remaining: { type: 'number' },
                    },
                  },
                  accountAge: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },

  '/api/ban-warning': {
    get: {
      summary: 'Get ban warning metrics',
      tags: ['Anti-Ban'],
      responses: {
        200: {
          description: 'Ban warning status',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  riskScore: { type: 'number', description: '0-100 risk score' },
                  isHibernating: { type: 'boolean' },
                  recentEvents: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        type: { type: 'string' },
                        timestamp: { type: 'number' },
                      },
                    },
                  },
                  recommendation: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },

  '/api/webhooks': {
    get: {
      summary: 'Get webhook status and statistics',
      tags: ['Webhooks'],
      responses: {
        200: {
          description: 'Webhook statistics',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  enabled: { type: 'boolean' },
                  totalEvents: { type: 'number' },
                  subscriptions: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  errors: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
  },

  '/api/webhooks/events': {
    get: {
      summary: 'Get available webhook event types',
      tags: ['Webhooks'],
      responses: {
        200: {
          description: 'Available event types by category',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  events: {
                    type: 'object',
                    additionalProperties: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  '/api/webhooks/subscribe': {
    post: {
      summary: 'Subscribe to webhook events',
      tags: ['Webhooks'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['events'],
              properties: {
                events: {
                  type: 'array',
                  items: { type: 'string' },
                  example: ['message.received', 'connection.open'],
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Subscribed successfully',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                  subscriptions: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  '/api/webhooks/test': {
    post: {
      summary: 'Send a test webhook event',
      tags: ['Webhooks'],
      responses: {
        200: {
          description: 'Test result',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  sent: { type: 'boolean' },
                  reason: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
  },

  '/api/analytics': {
    get: {
      summary: 'Get message analytics summary',
      tags: ['Analytics'],
      responses: {
        200: {
          description: 'Analytics summary',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  totalSent: { type: 'number' },
                  totalReceived: { type: 'number' },
                  peakHours: {
                    type: 'array',
                    items: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  '/api/scoring/{phone}': {
    get: {
      summary: 'Get contact engagement score',
      tags: ['Analytics'],
      parameters: [
        {
          name: 'phone',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'Phone number (WhatsApp ID format)',
        },
      ],
      responses: {
        200: {
          description: 'Contact score',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  phone: { type: 'string' },
                  points: { type: 'number' },
                  tier: {
                    type: 'string',
                    enum: ['bronze', 'silver', 'gold', 'platinum'],
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  '/api/auto-responder': {
    get: {
      summary: 'Get auto-responder status and rules',
      tags: ['Automation'],
      responses: {
        200: {
          description: 'Auto-responder status',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  enabled: { type: 'boolean' },
                  rules: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        id: { type: 'string' },
                        trigger: { type: 'object' },
                        response: { type: 'string' },
                        priority: { type: 'number' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },

  '/api/scheduled': {
    get: {
      summary: 'Get scheduled messages',
      tags: ['Automation'],
      responses: {
        200: {
          description: 'Scheduled messages list',
        },
      },
    },
    post: {
      summary: 'Schedule a new message',
      tags: ['Automation'],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['to', 'message', 'sendAt'],
              properties: {
                to: { type: 'string', description: 'Phone number' },
                message: { type: 'string', description: 'Message text' },
                sendAt: { type: 'string', format: 'date-time' },
                repeat: {
                  type: 'string',
                  enum: ['once', 'daily', 'weekly'],
                },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Message scheduled',
        },
      },
    },
  },
};

/**
 * Setup Swagger UI middleware
 */
export function setupSwagger(app) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'WA2Bridge API Documentation',
  }));

  // Serve raw OpenAPI spec
  app.get('/api-docs/openapi.json', (req, res) => {
    res.json(swaggerSpec);
  });

  console.log('Swagger UI available at /api-docs');
}

export default { setupSwagger, swaggerSpec };
