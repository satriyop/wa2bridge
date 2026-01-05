/**
 * Error Handling Middleware
 *
 * Centralized error handling with structured JSON responses.
 * Logs errors with request context for debugging.
 */

import { AppError, RateLimitError } from '../errors.js';

/**
 * Error handler middleware
 * Must be registered AFTER all routes
 *
 * @param {Error} err - Error object
 * @param {import('express').Request} req - Express request
 * @param {import('express').Response} res - Express response
 * @param {import('express').NextFunction} next - Express next function
 */
export function errorHandler(err, req, res, next) {
  // Already sent response (shouldn't happen, but safety check)
  if (res.headersSent) {
    return next(err);
  }

  // Determine status code
  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';

  // Build error response
  const errorResponse = {
    error: err.message || 'An unexpected error occurred',
    code,
  };

  // Add retry-after header for rate limit errors
  if (err instanceof RateLimitError && err.retryAfter) {
    res.set('Retry-After', String(err.retryAfter));
    errorResponse.retryAfter = err.retryAfter;
  }

  // Include stack trace in development only
  if (process.env.NODE_ENV === 'development') {
    errorResponse.stack = err.stack;
  }

  // Log error with context
  const logData = {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    statusCode,
    code,
    message: err.message,
  };

  // Log internal errors with stack, client errors without
  if (statusCode >= 500) {
    console.error('[ERROR]', logData, err.stack);
  } else {
    console.warn('[WARN]', logData);
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * 404 Not Found handler for unmatched routes
 * Must be registered AFTER all routes but BEFORE errorHandler
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: `Route ${req.method} ${req.path} not found`,
    code: 'NOT_FOUND',
  });
}

export default {
  errorHandler,
  notFoundHandler,
};
