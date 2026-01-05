/**
 * Typing Simulator
 *
 * Simulates human typing with occasional "corrections".
 * Shows typing → pause → typing again (like fixing a typo).
 */

/**
 * Simulates realistic typing behavior
 */
export class TypingSimulator {
  constructor(options = {}) {
    // Probability of "correction" pause during typing
    this.correctionProbability = options.correctionProbability || 0.15; // 15% chance
    this.correctionPauseMin = options.correctionPauseMin || 500;         // 0.5 sec
    this.correctionPauseMax = options.correctionPauseMax || 2000;        // 2 sec
  }

  /**
   * Generate a typing sequence with possible corrections
   * @param {number} baseDuration - Base typing duration
   * @returns {Array<{action: string, duration: number}>} Sequence of actions
   */
  generateTypingSequence(baseDuration) {
    const sequence = [];

    // Should we add a correction?
    if (Math.random() < this.correctionProbability && baseDuration > 2000) {
      // Split typing into two parts with a pause
      const splitPoint = 0.3 + Math.random() * 0.4; // 30-70% through

      const firstPart = Math.floor(baseDuration * splitPoint);
      const pauseDuration = this.correctionPauseMin +
        Math.floor(Math.random() * (this.correctionPauseMax - this.correctionPauseMin));
      const secondPart = baseDuration - firstPart;

      sequence.push({ action: 'composing', duration: firstPart });
      sequence.push({ action: 'paused', duration: pauseDuration });  // "Thinking" or "correcting"
      sequence.push({ action: 'composing', duration: secondPart });
    } else {
      // Normal typing
      sequence.push({ action: 'composing', duration: baseDuration });
    }

    return sequence;
  }

  /**
   * Execute typing sequence on socket
   */
  async executeSequence(socket, jid, sequence) {
    const { delay } = await import('@whiskeysockets/baileys');

    for (const step of sequence) {
      await socket.sendPresenceUpdate(step.action, jid);
      await delay(step.duration);
    }
  }
}

export default TypingSimulator;
