/**
 * Custom Error Classes Tests
 *
 * Tests for error class hierarchy and properties:
 * - AppError (base class)
 * - ValidationError, NotFoundError, RateLimitError
 * - UnauthorizedError, ServiceUnavailableError
 * - WhatsApp-specific errors
 */

import { describe, it, expect } from 'vitest';
import {
  AppError,
  ValidationError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ServiceUnavailableError,
  WhatsAppError,
  WhatsAppNotConnectedError,
  WhatsAppRateLimitError,
} from '../src/errors.js';

// =============================================================================
// APP ERROR (BASE CLASS) TESTS
// =============================================================================

describe('AppError', () => {
  it('should set message, statusCode, and code', () => {
    const error = new AppError('Test error', 400, 'TEST_ERROR');

    expect(error.message).toBe('Test error');
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('TEST_ERROR');
  });

  it('should default to 500 status and INTERNAL_ERROR code', () => {
    const error = new AppError('Server error');

    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_ERROR');
  });

  it('should capture stack trace', () => {
    const error = new AppError('Stack test');

    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('AppError');
  });

  it('should be instanceof Error', () => {
    const error = new AppError('Test');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
  });

  it('should have correct name property', () => {
    const error = new AppError('Test');

    expect(error.name).toBe('AppError');
  });
});

// =============================================================================
// VALIDATION ERROR TESTS
// =============================================================================

describe('ValidationError', () => {
  it('should default to 400 status', () => {
    const error = new ValidationError('Invalid input');

    expect(error.statusCode).toBe(400);
    expect(error.message).toBe('Invalid input');
  });

  it('should use VALIDATION_ERROR code by default', () => {
    const error = new ValidationError('Bad data');

    expect(error.code).toBe('VALIDATION_ERROR');
  });

  it('should allow custom code', () => {
    const error = new ValidationError('Missing field', 'MISSING_FIELD');

    expect(error.code).toBe('MISSING_FIELD');
  });

  it('should be instanceof AppError', () => {
    const error = new ValidationError('Test');

    expect(error).toBeInstanceOf(AppError);
    expect(error).toBeInstanceOf(ValidationError);
  });

  it('should have correct name property', () => {
    const error = new ValidationError('Test');

    expect(error.name).toBe('ValidationError');
  });
});

// =============================================================================
// NOT FOUND ERROR TESTS
// =============================================================================

describe('NotFoundError', () => {
  it('should default to 404 status', () => {
    const error = new NotFoundError();

    expect(error.statusCode).toBe(404);
  });

  it('should use default message', () => {
    const error = new NotFoundError();

    expect(error.message).toBe('Resource not found');
  });

  it('should use NOT_FOUND code by default', () => {
    const error = new NotFoundError();

    expect(error.code).toBe('NOT_FOUND');
  });

  it('should allow custom message and code', () => {
    const error = new NotFoundError('User not found', 'USER_NOT_FOUND');

    expect(error.message).toBe('User not found');
    expect(error.code).toBe('USER_NOT_FOUND');
  });
});

// =============================================================================
// RATE LIMIT ERROR TESTS
// =============================================================================

describe('RateLimitError', () => {
  it('should default to 429 status', () => {
    const error = new RateLimitError();

    expect(error.statusCode).toBe(429);
  });

  it('should include retryAfter property', () => {
    const error = new RateLimitError('Too fast', 120);

    expect(error.retryAfter).toBe(120);
  });

  it('should default to 60 seconds retryAfter', () => {
    const error = new RateLimitError();

    expect(error.retryAfter).toBe(60);
  });

  it('should use RATE_LIMIT_EXCEEDED code', () => {
    const error = new RateLimitError();

    expect(error.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('should use default message', () => {
    const error = new RateLimitError();

    expect(error.message).toBe('Rate limit exceeded');
  });
});

// =============================================================================
// UNAUTHORIZED ERROR TESTS
// =============================================================================

describe('UnauthorizedError', () => {
  it('should default to 401 status', () => {
    const error = new UnauthorizedError();

    expect(error.statusCode).toBe(401);
  });

  it('should use default message', () => {
    const error = new UnauthorizedError();

    expect(error.message).toBe('Authentication required');
  });

  it('should use UNAUTHORIZED code by default', () => {
    const error = new UnauthorizedError();

    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('should allow custom message and code', () => {
    const error = new UnauthorizedError('Token expired', 'TOKEN_EXPIRED');

    expect(error.message).toBe('Token expired');
    expect(error.code).toBe('TOKEN_EXPIRED');
  });
});

// =============================================================================
// SERVICE UNAVAILABLE ERROR TESTS
// =============================================================================

describe('ServiceUnavailableError', () => {
  it('should default to 503 status', () => {
    const error = new ServiceUnavailableError();

    expect(error.statusCode).toBe(503);
  });

  it('should use default message', () => {
    const error = new ServiceUnavailableError();

    expect(error.message).toBe('Service temporarily unavailable');
  });

  it('should use SERVICE_UNAVAILABLE code by default', () => {
    const error = new ServiceUnavailableError();

    expect(error.code).toBe('SERVICE_UNAVAILABLE');
  });
});

// =============================================================================
// WHATSAPP ERROR TESTS
// =============================================================================

describe('WhatsAppError', () => {
  it('should default to 500 status', () => {
    const error = new WhatsAppError('Connection failed');

    expect(error.statusCode).toBe(500);
  });

  it('should use WHATSAPP_ERROR code by default', () => {
    const error = new WhatsAppError('Send failed');

    expect(error.code).toBe('WHATSAPP_ERROR');
  });

  it('should allow custom code', () => {
    const error = new WhatsAppError('Timeout', 'WHATSAPP_TIMEOUT');

    expect(error.code).toBe('WHATSAPP_TIMEOUT');
  });
});

describe('WhatsAppNotConnectedError', () => {
  it('should extend ServiceUnavailableError', () => {
    const error = new WhatsAppNotConnectedError();

    expect(error).toBeInstanceOf(ServiceUnavailableError);
    expect(error.statusCode).toBe(503);
  });

  it('should use default message', () => {
    const error = new WhatsAppNotConnectedError();

    expect(error.message).toBe('WhatsApp is not connected');
  });

  it('should use WHATSAPP_NOT_CONNECTED code', () => {
    const error = new WhatsAppNotConnectedError();

    expect(error.code).toBe('WHATSAPP_NOT_CONNECTED');
  });

  it('should allow custom message', () => {
    const error = new WhatsAppNotConnectedError('Please scan QR code');

    expect(error.message).toBe('Please scan QR code');
  });
});

describe('WhatsAppRateLimitError', () => {
  it('should extend RateLimitError', () => {
    const error = new WhatsAppRateLimitError();

    expect(error).toBeInstanceOf(RateLimitError);
    expect(error.statusCode).toBe(429);
  });

  it('should use default message', () => {
    const error = new WhatsAppRateLimitError();

    expect(error.message).toBe('WhatsApp rate limit reached');
  });

  it('should use WHATSAPP_RATE_LIMIT code', () => {
    const error = new WhatsAppRateLimitError();

    expect(error.code).toBe('WHATSAPP_RATE_LIMIT');
  });

  it('should include retryAfter', () => {
    const error = new WhatsAppRateLimitError('Slow down', 300);

    expect(error.retryAfter).toBe(300);
  });
});

// =============================================================================
// ERROR HIERARCHY TESTS
// =============================================================================

describe('Error Hierarchy', () => {
  it('should maintain correct inheritance chain', () => {
    const errors = [
      { instance: new ValidationError('test'), parents: [AppError, Error] },
      { instance: new NotFoundError(), parents: [AppError, Error] },
      { instance: new RateLimitError(), parents: [AppError, Error] },
      { instance: new UnauthorizedError(), parents: [AppError, Error] },
      { instance: new ServiceUnavailableError(), parents: [AppError, Error] },
      { instance: new WhatsAppError('test'), parents: [AppError, Error] },
      { instance: new WhatsAppNotConnectedError(), parents: [ServiceUnavailableError, AppError, Error] },
      { instance: new WhatsAppRateLimitError(), parents: [RateLimitError, AppError, Error] },
    ];

    for (const { instance, parents } of errors) {
      for (const Parent of parents) {
        expect(instance).toBeInstanceOf(Parent);
      }
    }
  });

  it('should all have proper error names', () => {
    const errors = [
      new AppError('test'),
      new ValidationError('test'),
      new NotFoundError(),
      new RateLimitError(),
      new UnauthorizedError(),
      new ServiceUnavailableError(),
      new WhatsAppError('test'),
      new WhatsAppNotConnectedError(),
      new WhatsAppRateLimitError(),
    ];

    for (const error of errors) {
      expect(error.name).toBe(error.constructor.name);
    }
  });
});
