/**
 * Handler Wrapper Utilities
 *
 * Eliminates try-catch boilerplate from route handlers.
 * Provides consistent async error handling and response formatting.
 */

/**
 * Wraps an async function to catch errors and pass them to Express error handler
 * @param {Function} fn - Async route handler function
 * @returns {Function} Express middleware function
 */
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Wraps a handler function that returns data to be sent as JSON
 * Automatically handles the res.json() call and error catching
 *
 * @param {Function} handlerFn - Function that returns data or throws errors
 * @returns {Function} Express middleware function
 *
 * @example
 * // BEFORE:
 * app.get('/api/status', authenticate, (req, res) => {
 *   try {
 *     const status = client.getStatus();
 *     res.json(status);
 *   } catch (error) {
 *     res.status(500).json({ error: error.message });
 *   }
 * });
 *
 * // AFTER:
 * app.get('/api/status', authenticate, wrapHandler(() => {
 *   return client.getStatus();
 * }));
 */
export function wrapHandler(handlerFn) {
  return asyncHandler(async (req, res) => {
    const result = await handlerFn(req, res);
    // Only send response if handler didn't already do it
    if (!res.headersSent) {
      res.json(result);
    }
  });
}

/**
 * Wraps a handler that needs to send custom status or response
 * Use when you need more control than wrapHandler provides
 *
 * @param {Function} handlerFn - Function with (req, res) that sends response
 * @returns {Function} Express middleware function
 *
 * @example
 * app.post('/api/send', authenticate, wrapCustomHandler(async (req, res) => {
 *   const result = await client.sendMessage(req.body);
 *   res.status(201).json({ success: true, ...result });
 * }));
 */
export function wrapCustomHandler(handlerFn) {
  return asyncHandler(handlerFn);
}

export default {
  asyncHandler,
  wrapHandler,
  wrapCustomHandler,
};
