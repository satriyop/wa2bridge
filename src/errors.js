/**
 * Custom Error Classes for WA2Bridge
 *
 * Provides structured error handling with:
 * - Error categorization (operational vs programmer errors)
 * - HTTP status code mapping
 * - Error logging and tracking
 */

/**
 * Base error class for WA2Bridge errors
 */
export class WA2BridgeError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code || 'WA2BRIDGE_ERROR';
    this.statusCode = options.statusCode || 500;
    this.isOperational = options.isOperational !== false; // Default true
    this.context = options.context || {};
    this.timestamp = new Date().toISOString();

    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.message,
      code: this.code,
      statusCode: this.statusCode,
      context: this.context,
      timestamp: this.timestamp,
    };
  }
}

/**
 * Authentication/Authorization errors
 */
export class AuthError extends WA2BridgeError {
  constructor(message = 'Authentication required', options = {}) {
    super(message, {
      code: 'AUTH_ERROR',
      statusCode: 401,
      ...options,
    });
  }
}

/**
 * Validation errors (bad input)
 */
export class ValidationError extends WA2BridgeError {
  constructor(message = 'Validation failed', options = {}) {
    super(message, {
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      ...options,
    });
  }
}

/**
 * Rate limit exceeded
 */
export class RateLimitError extends WA2BridgeError {
  constructor(message = 'Rate limit exceeded', options = {}) {
    super(message, {
      code: 'RATE_LIMIT_ERROR',
      statusCode: 429,
      ...options,
    });
    this.waitMs = options.waitMs || 60000;
    this.limitType = options.limitType || 'unknown';
  }

  toJSON() {
    return {
      ...super.toJSON(),
      waitMs: this.waitMs,
      limitType: this.limitType,
    };
  }
}

/**
 * WhatsApp connection errors
 */
export class ConnectionError extends WA2BridgeError {
  constructor(message = 'WhatsApp not connected', options = {}) {
    super(message, {
      code: 'CONNECTION_ERROR',
      statusCode: 503,
      ...options,
    });
  }
}

/**
 * Message send failures
 */
export class SendError extends WA2BridgeError {
  constructor(message = 'Failed to send message', options = {}) {
    super(message, {
      code: 'SEND_ERROR',
      statusCode: 500,
      ...options,
    });
    this.to = options.to;
    this.messageId = options.messageId;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      to: this.to,
      messageId: this.messageId,
    };
  }
}

/**
 * Webhook delivery errors
 */
export class WebhookError extends WA2BridgeError {
  constructor(message = 'Webhook delivery failed', options = {}) {
    super(message, {
      code: 'WEBHOOK_ERROR',
      statusCode: 502,
      ...options,
    });
    this.webhookUrl = options.webhookUrl;
    this.retryable = options.retryable !== false;
  }
}

/**
 * Anti-ban protection triggered
 */
export class AntiBanError extends WA2BridgeError {
  constructor(message = 'Anti-ban protection activated', options = {}) {
    super(message, {
      code: 'ANTIBAN_ERROR',
      statusCode: 429,
      ...options,
    });
    this.riskLevel = options.riskLevel || 'unknown';
    this.recommendation = options.recommendation;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      riskLevel: this.riskLevel,
      recommendation: this.recommendation,
    };
  }
}

/**
 * Block detection
 */
export class BlockedError extends WA2BridgeError {
  constructor(message = 'Contact appears to have blocked you', options = {}) {
    super(message, {
      code: 'BLOCKED_ERROR',
      statusCode: 403,
      ...options,
    });
    this.phone = options.phone;
  }
}

/**
 * Resource not found
 */
export class NotFoundError extends WA2BridgeError {
  constructor(message = 'Resource not found', options = {}) {
    super(message, {
      code: 'NOT_FOUND_ERROR',
      statusCode: 404,
      ...options,
    });
  }
}

/**
 * Error handler class for centralized error management
 */
export class ErrorHandler {
  constructor(options = {}) {
    this.logLevel = options.logLevel || 'error';
    this.onError = options.onError; // Optional callback
    this.errors = []; // Recent errors for debugging
    this.maxErrors = 100;
  }

  /**
   * Handle an error
   */
  handle(error, context = {}) {
    // Normalize to WA2BridgeError
    const normalizedError = this.normalize(error);

    // Add context
    normalizedError.context = {
      ...normalizedError.context,
      ...context,
    };

    // Log
    this.log(normalizedError);

    // Track
    this.track(normalizedError);

    // Callback
    if (this.onError) {
      try {
        this.onError(normalizedError);
      } catch (e) {
        console.error('Error in error callback:', e);
      }
    }

    return normalizedError;
  }

  /**
   * Normalize any error to WA2BridgeError
   */
  normalize(error) {
    if (error instanceof WA2BridgeError) {
      return error;
    }

    // Handle known error patterns
    const message = error.message || 'Unknown error';

    // Connection errors
    if (message.includes('not connected') || message.includes('connection')) {
      return new ConnectionError(message, { context: { originalError: error.name } });
    }

    // Rate limit errors
    if (message.includes('rate limit') || message.includes('too many')) {
      return new RateLimitError(message, { context: { originalError: error.name } });
    }

    // Auth errors
    if (message.includes('unauthorized') || message.includes('auth')) {
      return new AuthError(message, { context: { originalError: error.name } });
    }

    // Default to base error
    return new WA2BridgeError(message, {
      isOperational: false, // Unknown errors are programmer errors
      context: { originalError: error.name, stack: error.stack },
    });
  }

  /**
   * Log error
   */
  log(error) {
    const logData = {
      level: error.isOperational ? 'warn' : 'error',
      code: error.code,
      message: error.message,
      context: error.context,
      timestamp: error.timestamp,
    };

    if (error.isOperational) {
      console.warn(`[${error.code}] ${error.message}`, error.context);
    } else {
      console.error(`[${error.code}] ${error.message}`, error.context);
      console.error(error.stack);
    }
  }

  /**
   * Track error for debugging
   */
  track(error) {
    this.errors.push({
      code: error.code,
      message: error.message,
      timestamp: error.timestamp,
      isOperational: error.isOperational,
    });

    while (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit = 20) {
    return this.errors.slice(-limit);
  }

  /**
   * Get error statistics
   */
  getStats() {
    const byCode = {};
    for (const error of this.errors) {
      byCode[error.code] = (byCode[error.code] || 0) + 1;
    }

    return {
      total: this.errors.length,
      byCode,
      operational: this.errors.filter((e) => e.isOperational).length,
      programmer: this.errors.filter((e) => !e.isOperational).length,
    };
  }

  /**
   * Express error middleware
   */
  expressMiddleware() {
    return (error, req, res, next) => {
      const handled = this.handle(error, {
        method: req.method,
        path: req.path,
        ip: req.ip,
      });

      res.status(handled.statusCode).json(handled.toJSON());
    };
  }
}

/**
 * Create global error handler instance
 */
export const errorHandler = new ErrorHandler();

/**
 * Wrap async route handlers to catch errors
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export default {
  WA2BridgeError,
  AuthError,
  ValidationError,
  RateLimitError,
  ConnectionError,
  SendError,
  WebhookError,
  AntiBanError,
  BlockedError,
  NotFoundError,
  ErrorHandler,
  errorHandler,
  asyncHandler,
};
