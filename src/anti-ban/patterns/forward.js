/**
 * Forwarded Message Handler
 *
 * Humans respond differently to forwarded messages.
 * This adjusts behavior based on forward status.
 */

/**
 * Handles forwarded message behavior
 */
export class ForwardHandler {
  constructor(options = {}) {
    // Reply probability for forwarded messages (lower than direct)
    this.forwardReplyProbability = options.forwardReplyProbability || 0.5;

    // Delay multiplier for forwarded messages
    this.forwardDelayMultiplier = options.forwardDelayMultiplier || 1.5;
  }

  /**
   * Check if a message is forwarded
   */
  isForwarded(message) {
    // Baileys message structure includes forward info
    return message?.message?.extendedTextMessage?.contextInfo?.isForwarded ||
           message?.message?.imageMessage?.contextInfo?.isForwarded ||
           message?.message?.videoMessage?.contextInfo?.isForwarded ||
           false;
  }

  /**
   * Get forward count (how many times forwarded)
   */
  getForwardCount(message) {
    return message?.message?.extendedTextMessage?.contextInfo?.forwardingScore ||
           message?.message?.imageMessage?.contextInfo?.forwardingScore ||
           0;
  }

  /**
   * Should we reply to this forwarded message?
   */
  shouldReplyToForward(message) {
    if (!this.isForwarded(message)) {
      return { shouldReply: true, isForward: false };
    }

    const forwardCount = this.getForwardCount(message);

    // Heavily forwarded content (viral) - lower reply probability
    let probability = this.forwardReplyProbability;
    if (forwardCount > 5) {
      probability *= 0.5; // Halve probability for viral content
    }

    return {
      shouldReply: Math.random() < probability,
      isForward: true,
      forwardCount,
      probability: Math.round(probability * 100),
    };
  }

  /**
   * Adjust delay for forwarded messages
   */
  adjustDelay(baseDelay, message) {
    if (this.isForwarded(message)) {
      return Math.floor(baseDelay * this.forwardDelayMultiplier);
    }
    return baseDelay;
  }
}

export default ForwardHandler;
