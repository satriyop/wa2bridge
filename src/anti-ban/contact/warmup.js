/**
 * Contact Warmup Tracking
 *
 * Tracks new contacts and enforces warmup period.
 * Don't blast new contacts immediately after adding them.
 */

import { PersistenceBase } from '../shared/persistence.js';

/**
 * Enforces contact warmup periods to avoid ban
 */
export class ContactWarmup extends PersistenceBase {
  constructor(options = {}) {
    super(options.sessionsDir, '.contact-warmup.json');

    this.contacts = new Map(); // phone -> { firstContact, messageCount, lastMessage }

    // Warmup settings
    this.warmupPeriod = options.warmupPeriod || 7 * 24 * 60 * 60 * 1000;  // 7 days
    this.initialDailyLimit = options.initialDailyLimit || 2;               // 2 msgs/day for new contacts
    this.warmupDailyLimit = options.warmupDailyLimit || 5;                // 5 msgs/day during warmup
    this.normalDailyLimit = options.normalDailyLimit || 20;               // 20 msgs/day after warmup

    this.loadState();
  }

  /**
   * Record contact interaction
   */
  recordContact(phone) {
    const now = Date.now();
    const existing = this.contacts.get(phone);

    if (!existing) {
      this.contacts.set(phone, {
        firstContact: now,
        messageCount: 1,
        messagesThisPeriod: 1,
        periodStart: now,
        lastMessage: now,
      });
    } else {
      existing.messageCount++;
      existing.lastMessage = now;

      // Reset period counter if new day
      const oneDayAgo = now - 24 * 60 * 60 * 1000;
      if (existing.periodStart < oneDayAgo) {
        existing.messagesThisPeriod = 1;
        existing.periodStart = now;
      } else {
        existing.messagesThisPeriod++;
      }

      this.contacts.set(phone, existing);
    }

    this.saveState();
  }

  /**
   * Check if we can message this contact
   */
  canMessage(phone) {
    const contact = this.contacts.get(phone);
    const now = Date.now();

    if (!contact) {
      // New contact - allow but will be tracked
      return { allowed: true, isNew: true, dailyLimit: this.initialDailyLimit };
    }

    const contactAge = now - contact.firstContact;
    let dailyLimit;

    if (contactAge < 24 * 60 * 60 * 1000) {
      // First day - very limited
      dailyLimit = this.initialDailyLimit;
    } else if (contactAge < this.warmupPeriod) {
      // Warmup period
      dailyLimit = this.warmupDailyLimit;
    } else {
      // Warmed up
      dailyLimit = this.normalDailyLimit;
    }

    if (contact.messagesThisPeriod >= dailyLimit) {
      return {
        allowed: false,
        reason: `Daily limit for this contact reached (${dailyLimit}/day during warmup)`,
        contactAge: Math.floor(contactAge / (24 * 60 * 60 * 1000)),
      };
    }

    return { allowed: true, dailyLimit, remaining: dailyLimit - contact.messagesThisPeriod };
  }

  /**
   * Get contact warmup status
   */
  getContactStatus(phone) {
    const contact = this.contacts.get(phone);
    if (!contact) {
      return { status: 'new', warmupDaysRemaining: 7 };
    }

    const now = Date.now();
    const contactAge = now - contact.firstContact;
    const warmupDaysRemaining = Math.max(0, Math.ceil((this.warmupPeriod - contactAge) / (24 * 60 * 60 * 1000)));

    return {
      status: warmupDaysRemaining > 0 ? 'warming' : 'warmed',
      firstContact: contact.firstContact,
      messageCount: contact.messageCount,
      messagesThisPeriod: contact.messagesThisPeriod,
      warmupDaysRemaining,
    };
  }

  // PersistenceBase overrides
  getStateData() {
    const obj = {};
    for (const [k, v] of this.contacts) {
      obj[k] = v;
    }
    return { contacts: obj };
  }

  restoreState(data) {
    this.contacts = new Map(Object.entries(data.contacts || {}));
  }
}

export default ContactWarmup;
