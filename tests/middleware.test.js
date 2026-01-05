/**
 * Middleware Tests
 *
 * Tests for handler wrappers and error handling middleware:
 * - asyncHandler, wrapHandler, wrapCustomHandler
 * - errorHandler, notFoundHandler
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { asyncHandler, wrapHandler, wrapCustomHandler } from '../src/middleware/handler.js';
import { errorHandler, notFoundHandler } from '../src/middleware/errors.js';
import {
  AppError,
  ValidationError,
  RateLimitError,
  NotFoundError,
  UnauthorizedError,
  ServiceUnavailableError,
} from '../src/errors.js';

// =============================================================================
// ASYNC HANDLER TESTS
// =============================================================================

describe('asyncHandler', () => {
  it('should call the wrapped async function', async () => {
    const app = express();
    const mockFn = vi.fn().mockResolvedValue(undefined);

    app.get('/test', asyncHandler(async (req, res) => {
      await mockFn();
      res.json({ ok: true });
    }));

    await request(app).get('/test');
    expect(mockFn).toHaveBeenCalled();
  });

  it('should pass errors to next() for async functions', async () => {
    const app = express();

    app.get('/test', asyncHandler(async () => {
      throw new Error('Async error');
    }));
    app.use(errorHandler);

    const res = await request(app).get('/test');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Async error');
  });

  it('should pass errors to next() for rejected promises', async () => {
    const app = express();

    app.get('/test', asyncHandler(() => {
      return Promise.reject(new ValidationError('Validation failed'));
    }));
    app.use(errorHandler);

    const res = await request(app).get('/test');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  it('should handle sync functions that return promises', async () => {
    const app = express();

    app.get('/test', asyncHandler((req, res) => {
      return Promise.resolve().then(() => {
        res.json({ sync: true });
      });
    }));

    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(res.body.sync).toBe(true);
  });
});

// =============================================================================
// WRAP HANDLER TESTS
// =============================================================================

describe('wrapHandler', () => {
  it('should return JSON response from handler return value', async () => {
    const app = express();

    app.get('/test', wrapHandler(() => {
      return { message: 'Hello', value: 42 };
    }));

    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Hello', value: 42 });
  });

  it('should handle async handlers returning data', async () => {
    const app = express();

    app.get('/test', wrapHandler(async () => {
      await new Promise(resolve => setTimeout(resolve, 1));
      return { async: true };
    }));

    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(res.body.async).toBe(true);
  });

  it('should not send response if headers already sent', async () => {
    const app = express();

    app.get('/test', wrapHandler((req, res) => {
      res.status(201).json({ custom: true });
      return { shouldNotBeSent: true };
    }));

    const res = await request(app).get('/test');

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ custom: true });
    expect(res.body.shouldNotBeSent).toBeUndefined();
  });

  it('should pass errors to error handler', async () => {
    const app = express();

    app.get('/test', wrapHandler(() => {
      throw new ValidationError('Bad input');
    }));
    app.use(errorHandler);

    const res = await request(app).get('/test');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Bad input');
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should handle null return value', async () => {
    const app = express();

    app.get('/test', wrapHandler(() => null));

    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  it('should handle array return value', async () => {
    const app = express();

    app.get('/test', wrapHandler(() => [1, 2, 3]));

    const res = await request(app).get('/test');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([1, 2, 3]);
  });

  it('should provide req and res to handler', async () => {
    const app = express();

    app.get('/test/:id', wrapHandler((req) => {
      return { id: req.params.id, query: req.query.q };
    }));

    const res = await request(app).get('/test/123?q=search');

    expect(res.body.id).toBe('123');
    expect(res.body.query).toBe('search');
  });
});

// =============================================================================
// WRAP CUSTOM HANDLER TESTS
// =============================================================================

describe('wrapCustomHandler', () => {
  it('should allow custom response handling', async () => {
    const app = express();

    app.post('/test', wrapCustomHandler(async (req, res) => {
      res.status(201).json({ created: true, id: 'new-123' });
    }));

    const res = await request(app).post('/test');

    expect(res.status).toBe(201);
    expect(res.body.created).toBe(true);
    expect(res.body.id).toBe('new-123');
  });

  it('should catch and forward errors', async () => {
    const app = express();

    app.post('/test', wrapCustomHandler(async () => {
      throw new NotFoundError('Resource not found');
    }));
    app.use(errorHandler);

    const res = await request(app).post('/test');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Resource not found');
  });

  it('should allow setting custom headers', async () => {
    const app = express();

    app.get('/test', wrapCustomHandler((req, res) => {
      res.set('X-Custom-Header', 'custom-value');
      res.json({ ok: true });
    }));

    const res = await request(app).get('/test');

    expect(res.headers['x-custom-header']).toBe('custom-value');
  });
});

// =============================================================================
// ERROR HANDLER TESTS
// =============================================================================

describe('errorHandler', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.NODE_ENV;
    // Suppress console output during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    vi.restoreAllMocks();
  });

  it('should return JSON error response with statusCode', async () => {
    const app = express();

    app.get('/test', () => {
      throw new ValidationError('Invalid data');
    });
    app.use(errorHandler);

    const res = await request(app).get('/test');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Invalid data');
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should default to 500 for unknown errors', async () => {
    const app = express();

    app.get('/test', () => {
      throw new Error('Something broke');
    });
    app.use(errorHandler);

    const res = await request(app).get('/test');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Something broke');
    expect(res.body.code).toBe('INTERNAL_ERROR');
  });

  it('should include stack trace in development', async () => {
    process.env.NODE_ENV = 'development';
    const app = express();

    app.get('/test', () => {
      throw new Error('Dev error');
    });
    app.use(errorHandler);

    const res = await request(app).get('/test');

    expect(res.body.stack).toBeDefined();
    expect(res.body.stack).toContain('Error: Dev error');
  });

  it('should not include stack trace in production', async () => {
    process.env.NODE_ENV = 'production';
    const app = express();

    app.get('/test', () => {
      throw new Error('Prod error');
    });
    app.use(errorHandler);

    const res = await request(app).get('/test');

    expect(res.body.stack).toBeUndefined();
  });

  it('should handle RateLimitError with Retry-After header', async () => {
    const app = express();

    app.get('/test', () => {
      throw new RateLimitError('Too many requests', 120);
    });
    app.use(errorHandler);

    const res = await request(app).get('/test');

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBe('120');
    expect(res.body.retryAfter).toBe(120);
    expect(res.body.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('should log 5xx errors with stack', async () => {
    const app = express();
    const consoleSpy = vi.spyOn(console, 'error');

    app.get('/test', () => {
      throw new AppError('Server error', 500);
    });
    app.use(errorHandler);

    await request(app).get('/test');

    expect(consoleSpy).toHaveBeenCalled();
    // First call, first arg should be '[ERROR]'
    expect(consoleSpy.mock.calls[0][0]).toBe('[ERROR]');
  });

  it('should log 4xx errors without stack (warn level)', async () => {
    const app = express();
    const warnSpy = vi.spyOn(console, 'warn');
    const errorSpy = vi.spyOn(console, 'error');

    app.get('/test', () => {
      throw new ValidationError('Bad request');
    });
    app.use(errorHandler);

    await request(app).get('/test');

    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toBe('[WARN]');
    // Error should not have been called for 4xx
    const errorCalls = errorSpy.mock.calls.filter(call => call[0] === '[ERROR]');
    expect(errorCalls.length).toBe(0);
  });

  it('should handle errors without message', async () => {
    const app = express();

    app.get('/test', () => {
      const err = new Error();
      err.statusCode = 500;
      throw err;
    });
    app.use(errorHandler);

    const res = await request(app).get('/test');

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('An unexpected error occurred');
  });

  it('should handle all AppError subclasses correctly', async () => {
    const testCases = [
      { ErrorClass: ValidationError, expectedStatus: 400, message: 'Validation' },
      { ErrorClass: NotFoundError, expectedStatus: 404, message: 'Not found' },
      { ErrorClass: UnauthorizedError, expectedStatus: 401, message: 'Unauthorized' },
      { ErrorClass: ServiceUnavailableError, expectedStatus: 503, message: 'Unavailable' },
    ];

    for (const { ErrorClass, expectedStatus, message } of testCases) {
      const app = express();
      app.get('/test', () => {
        throw new ErrorClass(message);
      });
      app.use(errorHandler);

      const res = await request(app).get('/test');
      expect(res.status).toBe(expectedStatus);
      expect(res.body.error).toBe(message);
    }
  });
});

// =============================================================================
// NOT FOUND HANDLER TESTS
// =============================================================================

describe('notFoundHandler', () => {
  it('should return 404 with route info', async () => {
    const app = express();
    app.use(notFoundHandler);

    const res = await request(app).get('/unknown/path');

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('/unknown/path');
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('should include method in error message', async () => {
    const app = express();
    app.use(notFoundHandler);

    const res = await request(app).post('/api/missing');

    expect(res.status).toBe(404);
    expect(res.body.error).toContain('POST');
    expect(res.body.error).toContain('/api/missing');
  });

  it('should handle various HTTP methods', async () => {
    const app = express();
    app.use(notFoundHandler);

    const methods = ['get', 'post', 'put', 'delete', 'patch'];

    for (const method of methods) {
      const res = await request(app)[method]('/test');
      expect(res.status).toBe(404);
      expect(res.body.error).toContain(method.toUpperCase());
    }
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe('Handler and Error Integration', () => {
  it('should work together in a full request flow', async () => {
    const app = express();

    // Success endpoint
    app.get('/success', wrapHandler(() => ({ status: 'ok' })));

    // Error endpoint
    app.get('/error', wrapHandler(() => {
      throw new ValidationError('Bad data');
    }));

    // 404 handler
    app.use(notFoundHandler);

    // Error handler
    app.use(errorHandler);

    // Test success
    const successRes = await request(app).get('/success');
    expect(successRes.status).toBe(200);
    expect(successRes.body.status).toBe('ok');

    // Test error
    const errorRes = await request(app).get('/error');
    expect(errorRes.status).toBe(400);
    expect(errorRes.body.error).toBe('Bad data');

    // Test 404
    const notFoundRes = await request(app).get('/missing');
    expect(notFoundRes.status).toBe(404);
    expect(notFoundRes.body.code).toBe('NOT_FOUND');
  });
});
