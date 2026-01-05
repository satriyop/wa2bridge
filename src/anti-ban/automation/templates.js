/**
 * Message Templates
 *
 * Templates with variable substitution.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export class MessageTemplates {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.templates = new Map();
    this.usageStats = new Map();

    this.loadState();
  }

  create(name, content, metadata = {}) {
    const template = {
      name,
      content,
      variables: this.extractVariables(content),
      category: metadata.category || 'general',
      language: metadata.language || 'id',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.templates.set(name, template);
    this.saveState();

    return template;
  }

  update(name, content, metadata = {}) {
    const existing = this.templates.get(name);
    if (!existing) throw new Error('Template not found');

    const updated = {
      ...existing,
      content,
      variables: this.extractVariables(content),
      ...metadata,
      updatedAt: Date.now(),
    };

    this.templates.set(name, updated);
    this.saveState();

    return updated;
  }

  delete(name) {
    const result = this.templates.delete(name);
    if (result) this.saveState();
    return result;
  }

  get(name) {
    return this.templates.get(name);
  }

  render(name, variables = {}) {
    const template = this.templates.get(name);
    if (!template) throw new Error('Template not found');

    let content = template.content;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      content = content.replace(regex, value);
    }

    content = content.replace(/\{time\}/g, new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }));
    content = content.replace(/\{date\}/g, new Date().toLocaleDateString('id-ID'));
    content = content.replace(/\{day\}/g, ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][new Date().getDay()]);
    content = content.replace(/\{greeting\}/g, this.getGreeting());

    const stats = this.usageStats.get(name) || { used: 0 };
    stats.used++;
    stats.lastUsed = Date.now();
    this.usageStats.set(name, stats);

    return content;
  }

  extractVariables(content) {
    const matches = content.match(/\{(\w+)\}/g) || [];
    const builtIn = ['time', 'date', 'day', 'greeting'];
    return [...new Set(matches.map(m => m.slice(1, -1)).filter(v => !builtIn.includes(v)))];
  }

  getGreeting() {
    const hour = new Date().getHours();
    if (hour < 11) return 'Selamat pagi';
    if (hour < 15) return 'Selamat siang';
    if (hour < 18) return 'Selamat sore';
    return 'Selamat malam';
  }

  list(category = null) {
    let templates = [...this.templates.values()];

    if (category) {
      templates = templates.filter(t => t.category === category);
    }

    return templates.map(t => ({
      ...t,
      stats: this.usageStats.get(t.name) || { used: 0 },
    }));
  }

  getCategories() {
    const categories = new Set();
    for (const template of this.templates.values()) {
      categories.add(template.category);
    }
    return [...categories];
  }

  getStats() {
    return {
      totalTemplates: this.templates.size,
      categories: this.getCategories(),
      mostUsed: [...this.usageStats.entries()]
        .sort(([, a], [, b]) => b.used - a.used)
        .slice(0, 5)
        .map(([name, stats]) => ({ name, ...stats })),
    };
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.templates-state.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        this.templates = new Map(Object.entries(data.templates || {}));
        this.usageStats = new Map(Object.entries(data.usageStats || {}));
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.templates-state.json');
    try {
      writeFileSync(stateFile, JSON.stringify({
        templates: Object.fromEntries(this.templates),
        usageStats: Object.fromEntries(this.usageStats),
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

export default MessageTemplates;
