/**
 * Emoji Enhancement
 *
 * Randomly adds contextual emojis to messages to make them
 * appear more human-like. Bots typically don't use emojis naturally.
 */

/**
 * Adds contextual emojis to messages
 */
export class EmojiEnhancer {
  constructor(options = {}) {
    this.probability = options.probability || 0.25; // 25% of messages get emoji

    // Context-based emojis
    this.emojiPatterns = {
      greeting: ['👋', '😊', '🙂', 'hi', 'hello', 'hey', 'halo'],
      thanks: ['🙏', '😊', '❤️', 'thanks', 'thank', 'makasih', 'terima kasih'],
      goodbye: ['👋', '😊', '🙂', 'bye', 'goodbye', 'sampai jumpa', 'dadah'],
      question: ['🤔', '❓', '?'],
      positive: ['👍', '✅', '😊', '🎉', 'ok', 'yes', 'sure', 'great', 'bagus', 'oke', 'siap'],
      negative: ['😅', '😔', 'sorry', 'tidak', 'no', 'maaf'],
      excited: ['🎉', '🔥', '💪', '!', 'wow', 'amazing', 'keren', 'mantap'],
    };

    // General emojis for random addition
    this.generalEmojis = ['😊', '🙂', '👍', '✨', '💫'];
  }

  /**
   * Maybe add emoji to message
   */
  maybeAddEmoji(text) {
    if (!text || text.length < 5) return text;
    if (Math.random() > this.probability) return text;

    // Check if already has emoji
    if (/[\u{1F300}-\u{1F9FF}]/u.test(text)) return text;

    const lowerText = text.toLowerCase();
    let emoji = null;

    // Find contextual emoji
    for (const [context, patterns] of Object.entries(this.emojiPatterns)) {
      const emojis = patterns.filter(p => /[\u{1F300}-\u{1F9FF}]/u.test(p) || p.length <= 2);
      const keywords = patterns.filter(p => p.length > 2);

      if (keywords.some(k => lowerText.includes(k))) {
        emoji = emojis[Math.floor(Math.random() * emojis.length)];
        break;
      }
    }

    // Use general emoji if no context match
    if (!emoji) {
      emoji = this.generalEmojis[Math.floor(Math.random() * this.generalEmojis.length)];
    }

    // Add emoji (sometimes at end, rarely at start)
    if (Math.random() > 0.1) {
      return text.trim() + ' ' + emoji;
    } else {
      return emoji + ' ' + text.trim();
    }
  }
}

export default EmojiEnhancer;
