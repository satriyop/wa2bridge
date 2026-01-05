/**
 * Audit Logger
 *
 * Log all API calls and actions for security tracking.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export class AuditLogger {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.maxLogs = options.maxLogs || 1000;
    this.logs = [];
    this.enabled = options.enabled ?? true;

    this.loadState();
  }

  log(event) {
    if (!this.enabled) return;

    const entry = {
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      ...event,
    };

    this.logs.push(entry);

    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    this.saveState();
    return entry;
  }

  logAPICall(req, result) {
    return this.log({
      type: 'api_call',
      method: req.method,
      path: req.path,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers?.['user-agent'],
      statusCode: result.statusCode,
      duration: result.duration,
    });
  }

  logAuth(type, ip, success, details = {}) {
    return this.log({
      type: 'auth',
      authType: type,
      ip,
      success,
      ...details,
    });
  }

  logMessage(type, to, messageId, details = {}) {
    return this.log({
      type: 'message',
      messageType: type,
      to,
      messageId,
      ...details,
    });
  }

  logSecurity(event, ip, details = {}) {
    return this.log({
      type: 'security',
      event,
      ip,
      severity: details.severity || 'medium',
      ...details,
    });
  }

  logSystem(event, details = {}) {
    return this.log({
      type: 'system',
      event,
      ...details,
    });
  }

  getLogs(filter = {}) {
    let results = [...this.logs];

    if (filter.type) {
      results = results.filter(l => l.type === filter.type);
    }

    if (filter.since) {
      const since = new Date(filter.since).getTime();
      results = results.filter(l => new Date(l.timestamp).getTime() >= since);
    }

    if (filter.ip) {
      results = results.filter(l => l.ip === filter.ip);
    }

    if (filter.limit) {
      results = results.slice(-filter.limit);
    }

    return results.reverse();
  }

  getSecurityEvents(hours = 24) {
    const since = Date.now() - hours * 60 * 60 * 1000;
    return this.getLogs({ type: 'security', since });
  }

  getFailedAuths(hours = 24) {
    const since = Date.now() - hours * 60 * 60 * 1000;
    return this.getLogs({ type: 'auth', since })
      .filter(l => !l.success);
  }

  getStats(hours = 24) {
    const since = Date.now() - hours * 60 * 60 * 1000;
    const recent = this.logs.filter(l => new Date(l.timestamp).getTime() >= since);

    const byType = {};
    for (const log of recent) {
      byType[log.type] = (byType[log.type] || 0) + 1;
    }

    const failedAuths = recent.filter(l => l.type === 'auth' && !l.success).length;
    const securityEvents = recent.filter(l => l.type === 'security').length;

    return {
      total: recent.length,
      byType,
      failedAuths,
      securityEvents,
      period: `${hours}h`,
    };
  }

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  }

  loadState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.audit-logs.json');
    try {
      if (existsSync(stateFile)) {
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        this.logs = data.logs || [];
      }
    } catch (err) {}
  }

  saveState() {
    if (!this.sessionsDir) return;
    const stateFile = join(this.sessionsDir, '.audit-logs.json');
    try {
      writeFileSync(stateFile, JSON.stringify({
        logs: this.logs,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

export default AuditLogger;
