/**
 * Auto Responder
 *
 * Rule-based auto-replies.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export class AutoResponder {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.enabled = options.enabled ?? false;
    this.rules = [];
    this.ruleStats = new Map();

    this.loadState();
  }

  addRule(rule) {
    const newRule = {
      id: this.generateId(),
      enabled: true,
      priority: rule.priority || 0,
      ...rule,
      createdAt: Date.now(),
    };

    if (!newRule.trigger || !newRule.response) {
      throw new Error('Rule must have trigger and response');
    }

    this.rules.push(newRule);
    this.rules.sort((a, b) => b.priority - a.priority);
    this.saveState();

    return newRule;
  }

  updateRule(ruleId, updates) {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index === -1) throw new Error('Rule not found');

    this.rules[index] = { ...this.rules[index], ...updates, updatedAt: Date.now() };
    this.rules.sort((a, b) => b.priority - a.priority);
    this.saveState();

    return this.rules[index];
  }

  deleteRule(ruleId) {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index === -1) return false;

    this.rules.splice(index, 1);
    this.saveState();
    return true;
  }

  checkMessage(message, context = {}) {
    if (!this.enabled) return null;

    const text = message.text?.toLowerCase() || '';
    const from = message.from;

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      if (rule.contacts && !rule.contacts.includes(from)) continue;
      if (rule.excludeContacts && rule.excludeContacts.includes(from)) continue;

      if (!this.isWithinSchedule(rule)) continue;

      if (this.matchesTrigger(text, rule.trigger)) {
        const stats = this.ruleStats.get(rule.id) || { triggered: 0 };
        stats.triggered++;
        stats.lastTriggered = Date.now();
        this.ruleStats.set(rule.id, stats);
        this.saveState();

        return {
          matched: true,
          rule,
          response: this.processResponse(rule.response, message, context),
        };
      }
    }

    return null;
  }

  matchesTrigger(text, trigger) {
    if (trigger.type === 'exact') {
      return text === trigger.value.toLowerCase();
    }

    if (trigger.type === 'contains') {
      return text.includes(trigger.value.toLowerCase());
    }

    if (trigger.type === 'startsWith') {
      return text.startsWith(trigger.value.toLowerCase());
    }

    if (trigger.type === 'regex') {
      try {
        const regex = new RegExp(trigger.value, 'i');
        return regex.test(text);
      } catch {
        return false;
      }
    }

    if (trigger.type === 'keywords') {
      const keywords = trigger.value.map(k => k.toLowerCase());
      return keywords.some(k => text.includes(k));
    }

    return false;
  }

  processResponse(response, message, context) {
    let text = response;

    text = text.replace(/\{from\}/g, message.from || '');
    text = text.replace(/\{name\}/g, context.name || 'there');
    text = text.replace(/\{time\}/g, new Date().toLocaleTimeString('id-ID'));
    text = text.replace(/\{date\}/g, new Date().toLocaleDateString('id-ID'));
    text = text.replace(/\{day\}/g, ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][new Date().getDay()]);

    return text;
  }

  isWithinSchedule(rule) {
    if (!rule.schedule) return true;

    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay();

    if (rule.schedule.days && !rule.schedule.days.includes(day)) {
      return false;
    }

    if (rule.schedule.startHour !== undefined && hour < rule.schedule.startHour) {
      return false;
    }
    if (rule.schedule.endHour !== undefined && hour >= rule.schedule.endHour) {
      return false;
    }

    return true;
  }

  getRules() {
    return this.rules.map(rule => ({
      ...rule,
      stats: this.ruleStats.get(rule.id) || { triggered: 0 },
    }));
  }

  getStats() {
    let totalTriggered = 0;
    for (const stats of this.ruleStats.values()) {
      totalTriggered += stats.triggered;
    }

    return {
      enabled: this.enabled,
      totalRules: this.rules.length,
      activeRules: this.rules.filter(r => r.enabled).length,
      totalTriggered,
    };
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.saveState();
  }

  generateId() {
    return 'rule_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.autoresponder-state.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        this.rules = data.rules || [];
        this.enabled = data.enabled ?? false;
        this.ruleStats = new Map(Object.entries(data.ruleStats || {}));
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.autoresponder-state.json');
    try {
      writeFileSync(stateFile, JSON.stringify({
        enabled: this.enabled,
        rules: this.rules,
        ruleStats: Object.fromEntries(this.ruleStats),
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

export default AutoResponder;
