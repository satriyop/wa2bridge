/**
 * Reply Probability
 *
 * Determines whether to reply to a message based on various factors.
 * Humans don't reply to every message - bots typically do.
 */

/**
 * Determines reply probability based on message context
 */
export class ReplyProbability {
  constructor(options = {}) {
    this.baseReplyRate = options.baseReplyRate || 0.9; // 90% reply rate
    this.sessionsDir = options.sessionsDir;

    // Track message patterns per contact
    this.contactPatterns = new Map();

    // Factors that affect reply probability
    this.factors = {
      directQuestion: 1.0,      // Always reply to direct questions
      greeting: 0.95,           // Almost always reply to greetings
      shortMessage: 0.85,       // Single word/emoji messages
      longMessage: 0.92,        // Long thoughtful messages
      rapidFire: 0.5,           // Multiple messages in quick succession
      lateNight: 0.7,           // Late night messages
      media: 0.8,               // Media messages
    };
  }

  /**
   * Determine if we should reply to a message
   */
  shouldReply(message, context = {}) {
    const text = message.text || '';
    const from = message.from;
    const now = new Date();
    const hour = now.getHours();

    let probability = this.baseReplyRate;

    // Direct questions always get replies
    if (text.includes('?') || /^(apa|siapa|kapan|dimana|bagaimana|kenapa|berapa)/i.test(text)) {
      return { shouldReply: true, reason: 'direct_question', probability: 1.0 };
    }

    // Greetings almost always get replies
    if (/^(hi|hello|hey|halo|hai|assalam|selamat)/i.test(text.trim())) {
      probability = this.factors.greeting;
    }

    // Short messages (emoji only, single word)
    if (text.length < 5) {
      probability *= this.factors.shortMessage;
    }

    // Late night (11 PM - 6 AM)
    if (hour >= 23 || hour < 6) {
      probability *= this.factors.lateNight;
    }

    // Check for rapid fire messages from same contact
    const pattern = this.contactPatterns.get(from);
    if (pattern && pattern.lastMessageTime) {
      const timeSince = Date.now() - pattern.lastMessageTime;
      if (timeSince < 30000) { // Less than 30 seconds
        probability *= this.factors.rapidFire;
      }
    }

    // Update contact pattern
    this.updateContactPattern(from);

    // Make the decision
    const shouldReply = Math.random() < probability;

    return {
      shouldReply,
      probability: Math.round(probability * 100),
      reason: shouldReply ? 'probability_passed' : 'probability_skipped',
    };
  }

  updateContactPattern(from) {
    const existing = this.contactPatterns.get(from) || {
      messageCount: 0,
      lastMessageTime: null,
    };

    existing.messageCount++;
    existing.lastMessageTime = Date.now();

    this.contactPatterns.set(from, existing);
  }

  /**
   * Get "no reply" message for logging
   */
  getSkipReason() {
    const reasons = [
      'Simulating busy moment',
      'Message noted but not replied',
      'Will reply later (simulated)',
      'Natural conversation pause',
    ];
    return reasons[Math.floor(Math.random() * reasons.length)];
  }
}

export default ReplyProbability;
