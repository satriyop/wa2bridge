/**
 * Message Analytics
 *
 * Track message statistics and patterns.
 * Provides insights into messaging behavior and engagement.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { LRUMap } from '../../utils/lru-map.js';

export class MessageAnalytics {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.maxContacts = options.maxContacts || 1000;
    this.contacts = new LRUMap(this.maxContacts);
    this.hourlyStats = new Array(24).fill(0);
    this.dailyStats = new Map();
    this.responseTimeHistory = [];
    this.maxHistory = 100;

    this.loadState();
  }

  recordSent(contact, messageLength) {
    const now = new Date();
    const hour = now.getHours();
    const dateKey = now.toISOString().split('T')[0];

    this.hourlyStats[hour]++;

    this.dailyStats.set(dateKey, (this.dailyStats.get(dateKey) || 0) + 1);

    if (this.dailyStats.size > 30) {
      const oldestKey = [...this.dailyStats.keys()].sort()[0];
      this.dailyStats.delete(oldestKey);
    }

    const stats = this.getOrCreateContactStats(contact);
    stats.sent++;
    stats.totalCharsSent += messageLength;
    stats.lastSent = now.getTime();
    stats.sentByHour[hour] = (stats.sentByHour[hour] || 0) + 1;

    this.contacts.set(contact, stats);
    this.saveState();
  }

  recordReceived(contact, messageLength) {
    const now = new Date();
    const stats = this.getOrCreateContactStats(contact);

    stats.received++;
    stats.totalCharsReceived += messageLength;
    stats.lastReceived = now.getTime();

    if (stats.lastSent && !stats.lastResponseTime) {
      const responseTime = now.getTime() - stats.lastSent;
      stats.responseTimes.push(responseTime);
      if (stats.responseTimes.length > 20) {
        stats.responseTimes.shift();
      }

      this.responseTimeHistory.push({ contact, time: responseTime, at: now.getTime() });
      if (this.responseTimeHistory.length > this.maxHistory) {
        this.responseTimeHistory.shift();
      }
    }

    this.contacts.set(contact, stats);
    this.saveState();
  }

  getOrCreateContactStats(contact) {
    return this.contacts.get(contact) || {
      sent: 0,
      received: 0,
      totalCharsSent: 0,
      totalCharsReceived: 0,
      lastSent: null,
      lastReceived: null,
      responseTimes: [],
      sentByHour: {},
      firstContact: Date.now(),
    };
  }

  getContactStats(contact) {
    const stats = this.contacts.get(contact);
    if (!stats) return null;

    const avgResponseTime = stats.responseTimes.length > 0
      ? Math.round(stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length)
      : null;

    const peakHour = Object.entries(stats.sentByHour)
      .sort(([, a], [, b]) => b - a)[0];

    return {
      ...stats,
      avgResponseTime,
      avgResponseTimeFormatted: avgResponseTime ? this.formatDuration(avgResponseTime) : 'N/A',
      peakHour: peakHour ? parseInt(peakHour[0]) : null,
      engagementRate: stats.sent > 0 ? Math.round((stats.received / stats.sent) * 100) : 0,
      relationshipAge: Date.now() - stats.firstContact,
    };
  }

  getPeakHours() {
    const sorted = this.hourlyStats
      .map((count, hour) => ({ hour, count }))
      .sort((a, b) => b.count - a.count);

    return {
      peak: sorted[0],
      top3: sorted.slice(0, 3),
      quietest: sorted[sorted.length - 1],
      distribution: this.hourlyStats,
    };
  }

  getDailyTrends() {
    const entries = [...this.dailyStats.entries()].sort();
    const values = entries.map(([, v]) => v);

    return {
      days: entries.map(([k]) => k),
      counts: values,
      average: values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0,
      max: Math.max(...values, 0),
      min: Math.min(...values, Infinity) === Infinity ? 0 : Math.min(...values),
      total: values.reduce((a, b) => a + b, 0),
    };
  }

  getSummary() {
    let totalSent = 0;
    let totalReceived = 0;
    let activeContacts = 0;
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

    for (const stats of this.contacts.values()) {
      totalSent += stats.sent;
      totalReceived += stats.received;
      if (stats.lastSent > dayAgo || stats.lastReceived > dayAgo) {
        activeContacts++;
      }
    }

    return {
      totalContacts: this.contacts.size,
      activeContacts24h: activeContacts,
      totalMessagesSent: totalSent,
      totalMessagesReceived: totalReceived,
      overallEngagementRate: totalSent > 0 ? Math.round((totalReceived / totalSent) * 100) : 0,
      peakHours: this.getPeakHours(),
      dailyTrends: this.getDailyTrends(),
    };
  }

  formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    return `${Math.round(ms / 3600000)}h`;
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.analytics-state.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        // Populate LRUMap from saved data (respects maxContacts limit)
        for (const [contact, stats] of Object.entries(data.contacts || {})) {
          this.contacts.set(contact, stats);
        }
        this.hourlyStats = data.hourlyStats || new Array(24).fill(0);
        this.dailyStats = new Map(Object.entries(data.dailyStats || {}));
        this.responseTimeHistory = data.responseTimeHistory || [];
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.analytics-state.json');
    try {
      const contactsObj = {};
      for (const [k, v] of this.contacts) {
        contactsObj[k] = v;
      }
      const dailyObj = {};
      for (const [k, v] of this.dailyStats) {
        dailyObj[k] = v;
      }
      writeFileSync(stateFile, JSON.stringify({
        contacts: contactsObj,
        hourlyStats: this.hourlyStats,
        dailyStats: dailyObj,
        responseTimeHistory: this.responseTimeHistory,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

export default MessageAnalytics;
