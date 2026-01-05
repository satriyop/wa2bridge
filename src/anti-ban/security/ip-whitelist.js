/**
 * IP Whitelist
 *
 * Restrict API access to specific IPs.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export class IPWhitelist {
  constructor(options = {}) {
    this.enabled = options.enabled ?? false;
    this.whitelist = new Set(options.whitelist || []);
    this.blacklist = new Set(options.blacklist || []);
    this.failedAttempts = new Map();
    this.maxFailedAttempts = options.maxFailedAttempts || 5;
    this.blockDuration = options.blockDuration || 15 * 60 * 1000;
    this.sessionsDir = options.sessionsDir;

    this.whitelist.add('127.0.0.1');
    this.whitelist.add('::1');
    this.whitelist.add('localhost');

    this.loadState();
  }

  isAllowed(ip) {
    const normalizedIP = this.normalizeIP(ip);

    if (this.blacklist.has(normalizedIP)) {
      return { allowed: false, reason: 'IP is blacklisted' };
    }

    const blocked = this.isTemporarilyBlocked(normalizedIP);
    if (blocked) {
      return { allowed: false, reason: `Temporarily blocked (${blocked.remainingMinutes}m remaining)` };
    }

    if (this.enabled && this.whitelist.size > 0) {
      if (!this.whitelist.has(normalizedIP) && !this.matchesCIDR(normalizedIP)) {
        return { allowed: false, reason: 'IP not in whitelist' };
      }
    }

    return { allowed: true };
  }

  recordFailedAttempt(ip) {
    const normalizedIP = this.normalizeIP(ip);
    const existing = this.failedAttempts.get(normalizedIP) || { count: 0, lastAttempt: 0 };

    if (Date.now() - existing.lastAttempt > this.blockDuration) {
      existing.count = 0;
    }

    existing.count++;
    existing.lastAttempt = Date.now();
    this.failedAttempts.set(normalizedIP, existing);

    if (existing.count >= this.maxFailedAttempts) {
      this.blacklist.add(normalizedIP);
      this.saveState();
      return { blocked: true, reason: 'Too many failed attempts - IP blacklisted' };
    }

    this.saveState();
    return { blocked: false, remainingAttempts: this.maxFailedAttempts - existing.count };
  }

  recordSuccess(ip) {
    const normalizedIP = this.normalizeIP(ip);
    this.failedAttempts.delete(normalizedIP);
  }

  isTemporarilyBlocked(ip) {
    const normalizedIP = this.normalizeIP(ip);
    const attempts = this.failedAttempts.get(normalizedIP);

    if (!attempts || attempts.count < this.maxFailedAttempts) {
      return null;
    }

    const elapsed = Date.now() - attempts.lastAttempt;
    if (elapsed > this.blockDuration) {
      this.failedAttempts.delete(normalizedIP);
      return null;
    }

    return {
      blocked: true,
      remainingMinutes: Math.ceil((this.blockDuration - elapsed) / 60000),
    };
  }

  addToWhitelist(ip) {
    this.whitelist.add(this.normalizeIP(ip));
    this.blacklist.delete(this.normalizeIP(ip));
    this.saveState();
  }

  removeFromWhitelist(ip) {
    this.whitelist.delete(this.normalizeIP(ip));
    this.saveState();
  }

  addToBlacklist(ip) {
    this.blacklist.add(this.normalizeIP(ip));
    this.whitelist.delete(this.normalizeIP(ip));
    this.saveState();
  }

  normalizeIP(ip) {
    if (ip.startsWith('::ffff:')) {
      return ip.substring(7);
    }
    return ip;
  }

  matchesCIDR(ip) {
    for (const entry of this.whitelist) {
      if (entry.includes('/')) {
        const [network, bits] = entry.split('/');
        if (this.ipInCIDR(ip, network, parseInt(bits))) {
          return true;
        }
      }
    }
    return false;
  }

  ipInCIDR(ip, network, bits) {
    const ipParts = ip.split('.').map(Number);
    const networkParts = network.split('.').map(Number);

    if (ipParts.length !== 4 || networkParts.length !== 4) {
      return false;
    }

    const mask = bits >= 8 ? Math.floor(bits / 8) : 0;
    for (let i = 0; i < mask; i++) {
      if (ipParts[i] !== networkParts[i]) {
        return false;
      }
    }
    return true;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.saveState();
  }

  getStatus() {
    return {
      enabled: this.enabled,
      whitelistCount: this.whitelist.size,
      blacklistCount: this.blacklist.size,
      blockedIPs: [...this.blacklist],
      whitelist: [...this.whitelist],
    };
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.ipwhitelist-state.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        if (data.whitelist) this.whitelist = new Set([...this.whitelist, ...data.whitelist]);
        if (data.blacklist) this.blacklist = new Set(data.blacklist);
        if (data.enabled !== undefined) this.enabled = data.enabled;
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.ipwhitelist-state.json');
    try {
      writeFileSync(stateFile, JSON.stringify({
        enabled: this.enabled,
        whitelist: [...this.whitelist],
        blacklist: [...this.blacklist],
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

export default IPWhitelist;
