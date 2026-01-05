/**
 * Message Content Safety Checks
 *
 * Analyzes message content for patterns that might trigger
 * WhatsApp's spam detection algorithms.
 */

/**
 * Check if message content might trigger spam detection
 *
 * @param {string} text - Message text to check
 * @returns {{safe: boolean, warnings: string[]}}
 */
export function checkMessageSafety(text) {
  const warnings = [];

  // Check for spam trigger words
  const spamTriggers = [
    /\bfree\b/i, /\bwin\b/i, /\blimited.?time\b/i, /\burgent\b/i,
    /\bclick\s+here\b/i, /\bact\s+now\b/i, /\boffer\b/i, /\bpromo\b/i,
  ];

  for (const trigger of spamTriggers) {
    if (trigger.test(text)) {
      warnings.push(`Contains potential spam trigger: "${text.match(trigger)[0]}"`);
    }
  }

  // Check for excessive URLs
  const urlCount = (text.match(/https?:\/\//gi) || []).length;
  if (urlCount > 2) {
    warnings.push(`Contains ${urlCount} URLs (might trigger spam filter)`);
  }

  // Check for excessive caps
  const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  if (capsRatio > 0.5 && text.length > 20) {
    warnings.push('Excessive caps usage (might seem like spam)');
  }

  // Check for repetitive content
  const words = text.toLowerCase().split(/\s+/);
  const uniqueWords = new Set(words);
  if (words.length > 10 && uniqueWords.size / words.length < 0.5) {
    warnings.push('Repetitive content detected');
  }

  return {
    safe: warnings.length === 0,
    warnings,
  };
}

/**
 * Sanitize message content to reduce spam risk
 * Note: This modifies content - use with caution
 *
 * @param {string} text - Message text
 * @returns {string} Sanitized text
 */
export function sanitizeMessage(text) {
  let result = text;

  // Convert excessive caps to title case
  const capsRatio = (text.match(/[A-Z]/g) || []).length / text.length;
  if (capsRatio > 0.5 && text.length > 20) {
    result = result.toLowerCase().replace(/(^|\.\s+)([a-z])/g,
      (match, p1, p2) => p1 + p2.toUpperCase()
    );
  }

  return result;
}

export default {
  checkMessageSafety,
  sanitizeMessage,
};
