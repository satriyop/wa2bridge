# WA2Bridge Developer Guide

This guide explains how to extend and modify the wa2bridge system.

## Prerequisites

- Node.js 18+
- Understanding of ES modules (import/export)
- Familiarity with Express.js
- Basic understanding of the WhatsApp Web protocol

## Project Structure

```
wa2bridge/
├── src/
│   ├── index.js              # Entry point
│   ├── api.js                # Express server setup
│   ├── config.js             # Centralized configuration
│   ├── errors.js             # Custom error classes
│   ├── whatsapp/             # WhatsApp client modules
│   ├── routes/               # API route handlers
│   ├── anti-ban/             # Anti-ban components
│   ├── middleware/           # Express middleware
│   └── utils/                # Utility modules
├── tests/                    # Test files
├── sessions/                 # WhatsApp session data
└── docs/                     # Documentation
```

---

## Adding a New API Endpoint

### Step 1: Choose the Right Route Module

| If your endpoint relates to... | Add it to... |
|-------------------------------|--------------|
| Status, send, reconnect | `routes/core.js` |
| Delivery, warmup, queuing | `routes/anti-ban.js` |
| Block detection, sessions | `routes/recovery.js` |
| Statistics, metrics | `routes/analytics.js` |
| IP whitelist, audit | `routes/security.js` |
| Auto-responder, templates | `routes/automation.js` |
| Webhook management | `routes/webhooks.js` |

### Step 2: Add the Route Handler

```javascript
// src/routes/core.js

import { wrapHandler } from '../middleware/handler.js';
import { ValidationError } from '../errors.js';

export function createCoreRoutes(whatsappClient, authenticate) {
  const router = Router();

  // Add your new endpoint
  router.post('/my-feature', authenticate, wrapHandler(async (req) => {
    const { param1, param2 } = req.body;

    // Validate inputs
    if (!param1) {
      throw new ValidationError('Missing "param1"');
    }

    // Call WhatsApp client methods
    const result = await whatsappClient.someMethod(param1, param2);

    // Return response (will be JSON-serialized)
    return {
      success: true,
      data: result,
    };
  }));

  return router;
}
```

### Step 3: Use wrapHandler Pattern

The `wrapHandler` utility automatically:
- Catches errors and passes to error middleware
- Serializes return values to JSON
- Handles async/await properly

```javascript
// Without wrapHandler (verbose)
router.post('/endpoint', authenticate, async (req, res, next) => {
  try {
    const result = await doSomething();
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// With wrapHandler (clean)
router.post('/endpoint', authenticate, wrapHandler(async (req) => {
  const result = await doSomething();
  return { success: true, data: result };
}));
```

### Step 4: Use Custom Error Classes

```javascript
import { ValidationError, NotFoundError, RateLimitError } from '../errors.js';

// Throws 400 Bad Request
throw new ValidationError('Invalid phone number format');

// Throws 404 Not Found
throw new NotFoundError('Contact not found');

// Throws 429 Too Many Requests
throw new RateLimitError('Hourly limit exceeded', { retryAfterMs: 3600000 });
```

---

## Adding a New Anti-Ban Component

### Step 1: Create Component File

```javascript
// src/anti-ban/myfeature/my-component.js

/**
 * MyComponent - Brief description
 *
 * Longer description of what this component does
 * and how it helps with anti-ban protection.
 */
export class MyComponent {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.logger = options.logger;

    // Initialize state
    this.counter = 0;
  }

  /**
   * Main method description
   * @param {string} phone - Phone number
   * @returns {Object} Result object
   */
  doSomething(phone) {
    this.counter++;
    return {
      phone,
      count: this.counter,
    };
  }

  /**
   * Get status for API
   */
  getStatus() {
    return {
      counter: this.counter,
    };
  }

  /**
   * Cleanup method (called on disconnect)
   */
  destroy() {
    // Clean up timers, connections, etc.
    this.counter = 0;
  }
}

export default MyComponent;
```

### Step 2: Export from Index

```javascript
// src/anti-ban/index.js

// Add named export
export { MyComponent } from './myfeature/my-component.js';

// Add to default export object
import { MyComponent } from './myfeature/my-component.js';

export default {
  // ... existing exports
  MyComponent,
};
```

### Step 3: Initialize in Orchestrator

```javascript
// src/whatsapp/AntiBanOrchestrator.js

import { MyComponent } from '../anti-ban/index.js';

export class AntiBanOrchestrator {
  constructor(options = {}) {
    // ... existing components

    // Initialize your component
    this.myComponent = new MyComponent({
      sessionsDir: options.sessionsDir,
      logger: options.logger,
    });
  }

  // Add getter for backward compatibility
  get myComponent() {
    return this._myComponent;
  }
}
```

### Step 4: Add API Endpoints (Optional)

```javascript
// src/routes/anti-ban.js

router.get('/my-component', wrapHandler(() => {
  return whatsappClient.myComponent.getStatus();
}));
```

---

## Using TimerRegistry for Timers

**Always** use TimerRegistry for setInterval/setTimeout to prevent memory leaks.

```javascript
// src/anti-ban/myfeature/my-component.js

import { TimerRegistry } from '../../utils/timer-registry.js';

export class MyComponent {
  constructor(options = {}) {
    this.timers = new TimerRegistry();

    // Register interval
    this.timers.setInterval('cleanup', () => {
      this.cleanup();
    }, 60000);
  }

  // Schedule one-time task
  scheduleTask(delay) {
    this.timers.setTimeout('task', () => {
      this.runTask();
    }, delay);
  }

  destroy() {
    // Clears all timers automatically
    this.timers.clearAll();
  }
}
```

---

## Using LRUMap for Caches

Use LRUMap instead of Map for caches to prevent unbounded memory growth.

```javascript
// src/anti-ban/myfeature/my-component.js

import { LRUMap } from '../../utils/lru-map.js';

export class MyComponent {
  constructor(options = {}) {
    // Max 1000 entries, oldest removed when full
    this.cache = new LRUMap(1000);
  }

  addToCache(key, value) {
    this.cache.set(key, value);
  }

  getFromCache(key) {
    return this.cache.get(key); // Also refreshes entry
  }
}
```

---

## Writing Tests

### Test File Structure

```javascript
// tests/my-component.test.js

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MyComponent } from '../src/anti-ban/myfeature/my-component.js';

describe('MyComponent', () => {
  let component;

  beforeEach(() => {
    component = new MyComponent({
      sessionsDir: '/tmp/test-sessions',
    });
  });

  afterEach(() => {
    component.destroy();
  });

  it('should initialize with zero counter', () => {
    expect(component.counter).toBe(0);
  });

  it('should increment counter on doSomething', () => {
    component.doSomething('6281234567890');
    expect(component.counter).toBe(1);
  });

  describe('getStatus', () => {
    it('should return current state', () => {
      component.doSomething('6281234567890');
      const status = component.getStatus();
      expect(status.counter).toBe(1);
    });
  });
});
```

### Mocking WhatsApp Client

```javascript
// tests/helpers/mocks.js

export function createMockWhatsAppClient(overrides = {}) {
  return {
    isConnected: true,
    sendMessage: vi.fn().mockResolvedValue({ key: { id: 'msg_123' } }),
    getStatus: vi.fn(() => ({
      connected: true,
      phone: '6281234567890',
    })),
    rateLimiter: {
      canSend: vi.fn().mockResolvedValue({ allowed: true }),
      recordSend: vi.fn(),
      getStats: vi.fn(() => ({})),
    },
    banWarning: {
      canSend: vi.fn(() => ({ allowed: true })),
      getMetrics: vi.fn(() => ({})),
    },
    // Add more mocks as needed
    ...overrides,
  };
}
```

### Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test -- tests/my-component.test.js

# Run with coverage
npm run test:coverage

# Watch mode
npm test -- --watch
```

---

## Configuration Best Practices

### Adding New Config Values

```javascript
// src/config.js

export const config = {
  // ... existing config

  myFeature: {
    enabled: process.env.MY_FEATURE_ENABLED === 'true',
    maxItems: parseNumber(process.env.MY_FEATURE_MAX_ITEMS, 100),
    timeout: parseNumber(process.env.MY_FEATURE_TIMEOUT, 5000),
  },
};
```

### Using Config in Components

```javascript
import { config } from '../config.js';

export class MyComponent {
  constructor(options = {}) {
    // Use config values with option overrides
    this.maxItems = options.maxItems ?? config.myFeature.maxItems;
    this.timeout = options.timeout ?? config.myFeature.timeout;
  }
}
```

### Document New Environment Variables

Update `.env.example`:

```env
# My Feature Configuration
MY_FEATURE_ENABLED=false
MY_FEATURE_MAX_ITEMS=100
MY_FEATURE_TIMEOUT=5000
```

---

## Code Style Guidelines

### File Naming

- Use kebab-case: `my-component.js`
- Test files: `my-component.test.js`
- Index files: `index.js`

### Export Patterns

```javascript
// Named export (preferred for components)
export class MyComponent { }
export function myFunction() { }

// Default export (for main module entry)
export default MyComponent;
```

### JSDoc Comments

```javascript
/**
 * Brief description of the function.
 *
 * @param {string} phone - Phone number in E.164 format
 * @param {Object} [options] - Optional configuration
 * @param {number} [options.timeout=5000] - Timeout in milliseconds
 * @returns {Promise<Object>} Result object with status
 * @throws {ValidationError} If phone format is invalid
 *
 * @example
 * const result = await myFunction('6281234567890', { timeout: 10000 });
 */
export async function myFunction(phone, options = {}) {
  // Implementation
}
```

---

## Common Patterns

### Persistence with Daily Reset

```javascript
import { DailyPersistenceBase } from '../shared/persistence.js';

export class MyComponent extends DailyPersistenceBase {
  constructor(options = {}) {
    super(options.sessionsDir, '.my-component-state.json');
    this.loadState();
  }

  getStateData() {
    return {
      counter: this.counter,
      lastUpdated: Date.now(),
    };
  }

  restoreState(data) {
    this.counter = data.counter || 0;
  }
}
```

### Event Callbacks

```javascript
export class MyComponent {
  constructor(options = {}) {
    this.onEvent = options.onEvent || (() => {});
  }

  doSomething() {
    // ... logic
    this.onEvent({ type: 'something', data: {} });
  }
}
```

---

## Debugging Tips

### Enable Debug Logging

```env
LOG_LEVEL=debug
```

### Log with Context

```javascript
this.logger.info({ phone, messageId, delay }, 'Message sent');
this.logger.warn({ error: err.message, stack: err.stack }, 'Operation failed');
```

### Check Memory Usage

```bash
curl http://localhost:3001/health | jq '.memory'
```

### Monitor SSE Events

```javascript
// In browser console
const es = new EventSource('http://localhost:3001/api/events');
es.onmessage = (e) => console.log('Event:', e.data);
es.onerror = (e) => console.error('SSE Error:', e);
```

---

## Related Documentation

- [Architecture](./ARCHITECTURE.md) - System overview
- [Anti-Ban System](./ANTI-BAN-SYSTEM.md) - Protection details
- [API Reference](./API-REFERENCE.md) - Endpoint documentation
- [Configuration](./CONFIGURATION.md) - Environment variables
