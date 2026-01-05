/**
 * Group Behavior Patterns
 *
 * Different behavior for group chats vs direct messages.
 * Humans behave differently in groups - bots often don't.
 */

/**
 * Handles group-specific behavior adjustments
 */
export class GroupBehavior {
  constructor(options = {}) {
    // Group detection
    this.groupSuffix = '@g.us';

    // Group-specific settings
    this.groupDelayMultiplier = options.groupDelayMultiplier || 2.0;   // 2x slower in groups
    this.groupResponseProbability = options.groupResponseProbability || 0.7; // 70% response rate in groups
    this.groupTypingMultiplier = options.groupTypingMultiplier || 1.3;  // Slightly longer typing
  }

  /**
   * Check if JID is a group
   */
  isGroup(jid) {
    return jid && jid.endsWith(this.groupSuffix);
  }

  /**
   * Should we respond to this group message?
   */
  shouldRespondInGroup() {
    return Math.random() < this.groupResponseProbability;
  }

  /**
   * Adjust delay for group context
   */
  adjustDelay(baseDelay, jid) {
    if (this.isGroup(jid)) {
      return Math.floor(baseDelay * this.groupDelayMultiplier);
    }
    return baseDelay;
  }

  /**
   * Adjust typing duration for group context
   */
  adjustTypingDuration(baseDuration, jid) {
    if (this.isGroup(jid)) {
      return Math.floor(baseDuration * this.groupTypingMultiplier);
    }
    return baseDuration;
  }

  getConfig(jid) {
    const isGroup = this.isGroup(jid);
    return {
      isGroup,
      delayMultiplier: isGroup ? this.groupDelayMultiplier : 1.0,
      typingMultiplier: isGroup ? this.groupTypingMultiplier : 1.0,
      responseProbability: isGroup ? this.groupResponseProbability : 1.0,
    };
  }
}

export default GroupBehavior;
