/**
 * Message Splitting for Long Messages
 *
 * Splits long messages into natural parts to avoid
 * looking like automated bulk messages.
 */

import { humanDelay } from '../core/timing.js';

/**
 * Splits long messages into natural parts
 */
export class MessageSplitter {
  constructor(options = {}) {
    this.maxLength = options.maxLength || 500;          // Max chars per message
    this.splitThreshold = options.splitThreshold || 300; // Start considering split
    this.minDelay = options.minDelay || 1500;            // Min delay between parts
    this.maxDelay = options.maxDelay || 4000;            // Max delay between parts
  }

  /**
   * Check if message should be split
   */
  shouldSplit(text) {
    return text.length > this.splitThreshold;
  }

  /**
   * Split message into natural parts
   */
  split(text) {
    if (text.length <= this.maxLength) {
      return [text];
    }

    const parts = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= this.maxLength) {
        parts.push(remaining);
        break;
      }

      // Find good split points (in order of preference)
      let splitIndex = -1;
      const searchRange = remaining.substring(0, this.maxLength);

      // Try to split at paragraph
      const paragraphIndex = searchRange.lastIndexOf('\n\n');
      if (paragraphIndex > this.maxLength * 0.3) {
        splitIndex = paragraphIndex;
      }

      // Try to split at sentence
      if (splitIndex === -1) {
        const sentenceEnds = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
        for (const end of sentenceEnds) {
          const idx = searchRange.lastIndexOf(end);
          if (idx > this.maxLength * 0.3 && idx > splitIndex) {
            splitIndex = idx + end.length - 1;
          }
        }
      }

      // Try to split at comma or semicolon
      if (splitIndex === -1) {
        const commaIndex = searchRange.lastIndexOf(', ');
        const semiIndex = searchRange.lastIndexOf('; ');
        splitIndex = Math.max(commaIndex, semiIndex);
      }

      // Last resort: split at space
      if (splitIndex === -1 || splitIndex < this.maxLength * 0.3) {
        splitIndex = searchRange.lastIndexOf(' ');
      }

      // Absolute last resort: hard split
      if (splitIndex === -1) {
        splitIndex = this.maxLength;
      }

      parts.push(remaining.substring(0, splitIndex + 1).trim());
      remaining = remaining.substring(splitIndex + 1).trim();
    }

    return parts;
  }

  /**
   * Get delay between message parts
   */
  getPartDelay() {
    return humanDelay((this.minDelay + this.maxDelay) / 2, 0.4);
  }

  /**
   * Add continuation indicators
   */
  addContinuationIndicators(parts) {
    if (parts.length <= 1) return parts;

    return parts.map((part, index) => {
      if (index < parts.length - 1) {
        // Add continuation hint sometimes
        if (Math.random() < 0.3) {
          return part + '...';
        }
      }
      return part;
    });
  }
}

export default MessageSplitter;
