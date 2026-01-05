/**
 * Contact Scoring
 *
 * Score contacts based on engagement.
 * Higher scores = more engaged/valuable contacts.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { LRUMap } from '../../utils/lru-map.js';

export class ContactScoring {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.maxContacts = options.maxContacts || 1000;
    this.weights = {
      replyRate: 30,
      responseSpeed: 20,
      messageLength: 10,
      frequency: 20,
      recency: 20,
    };
    this.scores = new LRUMap(this.maxContacts);
    this.contactData = new LRUMap(this.maxContacts);

    this.loadState();
  }

  recordInteraction(contact, type, data = {}) {
    const existing = this.contactData.get(contact) || {
      messagesSent: 0,
      messagesReceived: 0,
      totalResponseTime: 0,
      responseCount: 0,
      totalMessageLength: 0,
      lastInteraction: 0,
      firstInteraction: Date.now(),
    };

    if (type === 'sent') {
      existing.messagesSent++;
      existing.lastSentAt = Date.now();
    } else if (type === 'received') {
      existing.messagesReceived++;
      existing.totalMessageLength += data.length || 0;

      if (existing.lastSentAt) {
        const responseTime = Date.now() - existing.lastSentAt;
        existing.totalResponseTime += responseTime;
        existing.responseCount++;
        existing.lastSentAt = null;
      }
    }

    existing.lastInteraction = Date.now();
    this.contactData.set(contact, existing);

    this.calculateScore(contact);
    this.saveState();
  }

  calculateScore(contact) {
    const data = this.contactData.get(contact);
    if (!data) return 0;

    let score = 0;

    if (data.messagesSent > 0) {
      const replyRate = Math.min(data.messagesReceived / data.messagesSent, 1);
      score += replyRate * this.weights.replyRate;
    }

    if (data.responseCount > 0) {
      const avgResponseTime = data.totalResponseTime / data.responseCount;
      const speedScore = Math.max(0, 1 - (avgResponseTime / 3600000));
      score += speedScore * this.weights.responseSpeed;
    }

    if (data.messagesReceived > 0) {
      const avgLength = data.totalMessageLength / data.messagesReceived;
      const lengthScore = Math.min(avgLength / 100, 1);
      score += lengthScore * this.weights.messageLength;
    }

    const daysSinceFirst = Math.max(1, (Date.now() - data.firstInteraction) / (24 * 60 * 60 * 1000));
    const msgsPerDay = (data.messagesSent + data.messagesReceived) / daysSinceFirst;
    const frequencyScore = Math.min(msgsPerDay / 5, 1);
    score += frequencyScore * this.weights.frequency;

    const daysSinceLast = (Date.now() - data.lastInteraction) / (24 * 60 * 60 * 1000);
    const recencyScore = Math.max(0, 1 - (daysSinceLast / 7));
    score += recencyScore * this.weights.recency;

    this.scores.set(contact, Math.round(score));
    return Math.round(score);
  }

  getScore(contact) {
    return this.scores.get(contact) || 0;
  }

  getTier(contact) {
    const score = this.getScore(contact);
    if (score >= 80) return { tier: 'platinum', label: 'Highly Engaged', color: '#E5E4E2' };
    if (score >= 60) return { tier: 'gold', label: 'Engaged', color: '#FFD700' };
    if (score >= 40) return { tier: 'silver', label: 'Active', color: '#C0C0C0' };
    if (score >= 20) return { tier: 'bronze', label: 'Casual', color: '#CD7F32' };
    return { tier: 'new', label: 'New Contact', color: '#808080' };
  }

  getTopContacts(limit = 10) {
    return [...this.scores.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([contact, score]) => ({
        contact,
        score,
        tier: this.getTier(contact),
        data: this.contactData.get(contact),
      }));
  }

  getContactsNeedingAttention() {
    const results = [];
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const [contact, data] of this.contactData) {
      const score = this.getScore(contact);
      if (score >= 40 && data.lastInteraction < weekAgo) {
        results.push({
          contact,
          score,
          daysSinceContact: Math.round((Date.now() - data.lastInteraction) / (24 * 60 * 60 * 1000)),
          tier: this.getTier(contact),
        });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  getStats() {
    const tiers = { platinum: 0, gold: 0, silver: 0, bronze: 0, new: 0 };
    for (const contact of this.scores.keys()) {
      const tier = this.getTier(contact).tier;
      tiers[tier]++;
    }

    return {
      totalContacts: this.scores.size,
      tiers,
      topContacts: this.getTopContacts(5),
      needingAttention: this.getContactsNeedingAttention().length,
    };
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.scoring-state.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        // Populate LRUMaps from saved data (respects maxContacts limit)
        for (const [contact, score] of Object.entries(data.scores || {})) {
          this.scores.set(contact, score);
        }
        for (const [contact, contactData] of Object.entries(data.contactData || {})) {
          this.contactData.set(contact, contactData);
        }
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.scoring-state.json');
    try {
      const scoresObj = Object.fromEntries(this.scores);
      const dataObj = Object.fromEntries(this.contactData);
      writeFileSync(stateFile, JSON.stringify({
        scores: scoresObj,
        contactData: dataObj,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

export default ContactScoring;
