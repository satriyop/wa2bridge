/**
 * Reaction Manager
 *
 * Adds reactions to received messages randomly.
 * Bots typically never react - humans do.
 */

import { humanDelay } from '../core/timing.js';

/**
 * Manages message reactions with human-like patterns
 */
export class ReactionManager {
  constructor(options = {}) {
    this.socket = null;
    this.reactionProbability = options.reactionProbability || 0.15; // 15% of messages get reaction

    // Common reactions with weights
    this.reactions = [
      { emoji: '👍', weight: 30 },   // Most common
      { emoji: '❤️', weight: 20 },
      { emoji: '😂', weight: 15 },
      { emoji: '😊', weight: 10 },
      { emoji: '🙏', weight: 10 },
      { emoji: '👏', weight: 5 },
      { emoji: '🔥', weight: 5 },
      { emoji: '💯', weight: 5 },
    ];

    // Context-based reactions
    this.contextReactions = {
      thanks: ['🙏', '❤️', '😊'],
      funny: ['😂', '🤣', '😆'],
      good: ['👍', '💯', '🔥', '👏'],
      love: ['❤️', '😍', '💕'],
      sad: ['😔', '🙏', '❤️'],
      question: ['🤔', '👍'],
    };

    this.totalWeight = this.reactions.reduce((sum, r) => sum + r.weight, 0);
  }

  setSocket(socket) {
    this.socket = socket;
  }

  /**
   * Decide if we should react to a message
   */
  shouldReact(messageText) {
    return Math.random() < this.reactionProbability;
  }

  /**
   * Get appropriate reaction based on message content
   */
  getReaction(messageText) {
    const lowerText = messageText.toLowerCase();

    // Check for context matches
    if (/thank|makasih|terima kasih|thx/i.test(lowerText)) {
      return this.pickFrom(this.contextReactions.thanks);
    }
    if (/haha|lol|wkwk|😂|🤣/i.test(lowerText)) {
      return this.pickFrom(this.contextReactions.funny);
    }
    if (/bagus|mantap|keren|great|awesome|nice/i.test(lowerText)) {
      return this.pickFrom(this.contextReactions.good);
    }
    if (/love|sayang|cinta|❤️|💕/i.test(lowerText)) {
      return this.pickFrom(this.contextReactions.love);
    }
    if (/sedih|sad|sorry|maaf/i.test(lowerText)) {
      return this.pickFrom(this.contextReactions.sad);
    }
    if (/\?$/.test(lowerText.trim())) {
      return this.pickFrom(this.contextReactions.question);
    }

    // Random weighted reaction
    return this.pickWeightedRandom();
  }

  pickFrom(array) {
    return array[Math.floor(Math.random() * array.length)];
  }

  pickWeightedRandom() {
    let random = Math.random() * this.totalWeight;
    for (const reaction of this.reactions) {
      random -= reaction.weight;
      if (random <= 0) return reaction.emoji;
    }
    return '👍';
  }

  /**
   * React to a message with delay
   */
  async maybeReact(messageKey, messageText) {
    if (!this.socket || !this.shouldReact(messageText)) return false;

    const reaction = this.getReaction(messageText);

    // Delay reaction (humans don't react instantly)
    const reactionDelay = humanDelay(3000, 0.5); // 3 seconds ± 50%
    await new Promise(resolve => setTimeout(resolve, reactionDelay));

    try {
      await this.socket.sendMessage(messageKey.remoteJid, {
        react: {
          text: reaction,
          key: messageKey,
        }
      });
      return true;
    } catch (err) {
      // Ignore reaction errors
      return false;
    }
  }
}

export default ReactionManager;
