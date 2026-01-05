/**
 * Message Variation to Avoid Content Detection
 *
 * Adds subtle variations to messages to avoid WhatsApp's
 * content similarity detection (mass messaging detection).
 */

/**
 * Varies messages to avoid duplicate content detection
 */
export class MessageVariator {
  constructor() {
    // Track recently sent messages to avoid exact duplicates
    this.recentMessages = [];
    this.maxRecentMessages = 50;

    // Variation strategies
    this.punctuationVariants = {
      '.': ['.', '..', '...', '!'],
      '!': ['!', '!!', '!.', '.'],
      '?': ['?', '??', '?!', '..?'],
    };

    this.greetingVariants = {
      'hi': ['hi', 'hey', 'hello', 'halo', 'hai'],
      'hello': ['hello', 'hi', 'hey', 'halo'],
      'thanks': ['thanks', 'thank you', 'thx', 'makasih', 'terima kasih'],
      'ok': ['ok', 'okay', 'oke', 'siap', 'baik'],
      'yes': ['yes', 'ya', 'yup', 'iya', 'yep'],
      'no': ['no', 'tidak', 'nope', 'nggak', 'ga'],
    };

    // Indonesian casual variations
    this.indonesianVariants = {
      'apa': ['apa', 'apakah'],
      'tidak': ['tidak', 'nggak', 'ga', 'enggak'],
      'sudah': ['sudah', 'udah', 'sdh'],
      'belum': ['belum', 'blm'],
      'dengan': ['dengan', 'dgn', 'sama'],
      'yang': ['yang', 'yg'],
      'untuk': ['untuk', 'utk', 'buat'],
      'saya': ['saya', 'aku', 'gue'],
      'kamu': ['kamu', 'anda', 'lo'],
    };
  }

  /**
   * Apply variations to a message
   * @param {string} text - Original message
   * @param {number} variationLevel - 0-1, how much to vary (0.3 = 30% variation)
   * @returns {string} Varied message
   */
  vary(text, variationLevel = 0.3) {
    if (!text || text.length < 3) return text;

    let varied = text;

    // Only apply variations sometimes (based on variationLevel)
    if (Math.random() > variationLevel) {
      return this.addMinorVariation(varied);
    }

    // Apply greeting variations
    varied = this.varyGreetings(varied);

    // Apply Indonesian casual variations (if Indonesian text detected)
    if (this.isIndonesian(varied)) {
      varied = this.varyIndonesian(varied);
    }

    // Apply punctuation variations
    varied = this.varyPunctuation(varied);

    // Add or remove trailing spaces/newlines
    varied = this.varyWhitespace(varied);

    // Track this message
    this.trackMessage(text);

    return varied;
  }

  /**
   * Add minor variations (safe, minimal changes)
   */
  addMinorVariation(text) {
    const variations = [
      // Add/remove trailing period
      () => text.endsWith('.') ? text.slice(0, -1) : text + '.',
      // Add trailing space
      () => text + ' ',
      // Capitalize/lowercase first letter
      () => text.charAt(0) === text.charAt(0).toUpperCase()
        ? text.charAt(0).toLowerCase() + text.slice(1)
        : text.charAt(0).toUpperCase() + text.slice(1),
      // No change
      () => text,
    ];

    return variations[Math.floor(Math.random() * variations.length)]();
  }

  /**
   * Vary greetings and common words
   */
  varyGreetings(text) {
    let result = text;

    for (const [word, variants] of Object.entries(this.greetingVariants)) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      if (regex.test(result) && Math.random() > 0.5) {
        const variant = variants[Math.floor(Math.random() * variants.length)];
        result = result.replace(regex, variant);
        break; // Only replace one word per message
      }
    }

    return result;
  }

  /**
   * Check if text appears to be Indonesian
   */
  isIndonesian(text) {
    const indonesianIndicators = ['apa', 'yang', 'dan', 'dengan', 'untuk', 'ini', 'itu', 'dari'];
    const lowerText = text.toLowerCase();
    return indonesianIndicators.some(word => lowerText.includes(word));
  }

  /**
   * Apply Indonesian casual variations
   */
  varyIndonesian(text) {
    let result = text;

    for (const [word, variants] of Object.entries(this.indonesianVariants)) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      if (regex.test(result) && Math.random() > 0.6) {
        const variant = variants[Math.floor(Math.random() * variants.length)];
        result = result.replace(regex, variant);
        break; // Only replace one word per message
      }
    }

    return result;
  }

  /**
   * Vary punctuation
   */
  varyPunctuation(text) {
    if (Math.random() > 0.3) return text;

    const lastChar = text.slice(-1);
    if (this.punctuationVariants[lastChar]) {
      const variants = this.punctuationVariants[lastChar];
      const newPunct = variants[Math.floor(Math.random() * variants.length)];
      return text.slice(0, -1) + newPunct;
    }

    return text;
  }

  /**
   * Add minor whitespace variations
   */
  varyWhitespace(text) {
    if (Math.random() > 0.2) return text;

    const variations = [
      () => text.trim(),
      () => text.trim() + ' ',
      () => text.trim() + '\n',
      () => ' ' + text.trim(),
    ];

    return variations[Math.floor(Math.random() * variations.length)]();
  }

  /**
   * Track sent message to avoid duplicates
   */
  trackMessage(text) {
    this.recentMessages.push({
      text: text.toLowerCase().trim(),
      timestamp: Date.now(),
    });

    // Keep only recent messages
    if (this.recentMessages.length > this.maxRecentMessages) {
      this.recentMessages.shift();
    }
  }

  /**
   * Check if message was recently sent (potential duplicate)
   */
  isRecentDuplicate(text) {
    const normalizedText = text.toLowerCase().trim();
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    return this.recentMessages.some(
      msg => msg.text === normalizedText && msg.timestamp > fiveMinutesAgo
    );
  }

  /**
   * Get similarity score between two messages (0-1)
   */
  getSimilarity(text1, text2) {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }
}

export default MessageVariator;
