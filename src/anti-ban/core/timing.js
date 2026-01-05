/**
 * Human-Like Timing Utilities
 *
 * These utilities generate randomized delays to avoid WhatsApp's
 * ML-based bot detection. Fixed timing patterns are a major bot fingerprint.
 *
 * CRITICAL: Always use these instead of fixed delays.
 */

/**
 * Generate a randomized delay with variance to avoid detection
 * WhatsApp ML detects fixed timing patterns - this adds ±variance% jitter
 *
 * @param {number} baseMs - Base delay in milliseconds
 * @param {number} variancePercent - Variance as decimal (0.3 = ±30%)
 * @returns {number} Randomized delay in milliseconds
 */
export function humanDelay(baseMs, variancePercent = 0.3) {
  const variance = baseMs * variancePercent;
  const min = Math.floor(baseMs - variance);
  const max = Math.ceil(baseMs + variance);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Calculate typing duration based on message length
 * Simulates human typing speed (~50ms per character with variance)
 *
 * @param {string} text - Message text
 * @param {number} minDuration - Minimum typing duration
 * @param {number} maxDuration - Maximum typing duration
 * @returns {number} Typing duration in milliseconds
 */
export function calculateTypingDuration(text, minDuration = 1000, maxDuration = 6000) {
  // Average typing speed: ~40-60ms per character with variance
  const msPerChar = humanDelay(50, 0.4);
  const baseDuration = text.length * msPerChar;

  // Clamp between min and max
  return Math.min(Math.max(baseDuration, minDuration), maxDuration);
}

/**
 * Generate a "thinking" pause before responding
 * Humans don't respond instantly - they read and think first
 *
 * @param {string} incomingMessage - The message being responded to
 * @returns {number} Thinking pause in milliseconds
 */
export function calculateThinkingPause(incomingMessage) {
  // Base thinking time: 500-2000ms depending on message complexity
  const baseThinking = Math.min(incomingMessage.length * 20, 2000);
  return humanDelay(Math.max(baseThinking, 500), 0.5);
}

/**
 * Calculate delay for simulating reading an incoming message
 * Longer messages = longer read time
 *
 * @param {string|number} messageOrLength - Message text or length in characters
 * @returns {number} Read delay in milliseconds
 */
export function calculateReadDelay(messageOrLength) {
  // Handle both string (message) and number (length)
  const messageLength = typeof messageOrLength === 'string'
    ? messageOrLength.length
    : messageOrLength;

  // Average reading speed: ~200-300ms per word (~5 chars)
  const words = Math.ceil(messageLength / 5);
  const readTime = words * humanDelay(250, 0.3);
  // Minimum 500ms, maximum 5000ms
  return Math.min(Math.max(readTime, 500), 5000);
}

/**
 * @deprecated Use calculateThinkingPause instead
 * Kept for backward compatibility
 */
export function calculateThinkingDelay(message = '') {
  return calculateThinkingPause(message);
}

/**
 * Simulate human reading behavior with variable pauses
 * Returns total time to "read" the text
 *
 * @param {string} text - Text to "read"
 * @returns {number} Total reading time in milliseconds
 */
export function simulateHumanReading(text) {
  if (!text) return humanDelay(500, 0.3);

  // Base reading time based on length
  const baseTime = calculateReadDelay(text.length);

  // Add extra time for complexity (questions, multiple sentences)
  let complexity = 1.0;

  if (text.includes('?')) complexity += 0.2;           // Questions need more thought
  if ((text.match(/[.!]/g) || []).length > 2) {        // Multiple sentences
    complexity += 0.15;
  }
  if (text.length > 200) complexity += 0.1;            // Longer messages

  return Math.floor(baseTime * complexity);
}

export default {
  humanDelay,
  calculateTypingDuration,
  calculateThinkingPause,
  calculateReadDelay,
  calculateThinkingDelay,
  simulateHumanReading,
};
