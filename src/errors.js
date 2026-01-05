/**
 * Custom Error Classes
 *
 * Structured errors with HTTP status codes for consistent API responses.
 */

/**
 * Base application error with HTTP status code and error code
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 400 Bad Request - Invalid input or malformed request
 */
export class ValidationError extends AppError {
  constructor(message, code = 'VALIDATION_ERROR') {
    super(message, 400, code);
  }
}

/**
 * 404 Not Found - Resource does not exist
 */
export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

/**
 * 429 Too Many Requests - Rate limit exceeded
 */
export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded', retryAfter = 60) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }
}

/**
 * 401 Unauthorized - Missing or invalid authentication
 */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required', code = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

/**
 * 503 Service Unavailable - Service temporarily unavailable
 */
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable', code = 'SERVICE_UNAVAILABLE') {
    super(message, 503, code);
  }
}

/**
 * WhatsApp-specific errors
 */
export class WhatsAppError extends AppError {
  constructor(message, code = 'WHATSAPP_ERROR') {
    super(message, 500, code);
  }
}

export class WhatsAppNotConnectedError extends ServiceUnavailableError {
  constructor(message = 'WhatsApp is not connected') {
    super(message, 'WHATSAPP_NOT_CONNECTED');
  }
}

export class WhatsAppRateLimitError extends RateLimitError {
  constructor(message = 'WhatsApp rate limit reached', retryAfter = 60) {
    super(message, retryAfter);
    this.code = 'WHATSAPP_RATE_LIMIT';
  }
}

export default {
  AppError,
  ValidationError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ServiceUnavailableError,
  WhatsAppError,
  WhatsAppNotConnectedError,
  WhatsAppRateLimitError,
};
