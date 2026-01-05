/**
 * Health Monitor
 *
 * Monitors system health and sends alerts.
 * Proactive detection of issues before they cause bans.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export class HealthMonitor {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.logger = options.logger || console;
    this.onAlert = options.onAlert || (() => {});

    this.metrics = {
      connectionDrops: [],
      deliveryFailures: [],
      rateLimitHits: [],
      errors: [],
      lastHealthCheck: null,
    };

    this.thresholds = {
      connectionDropsPerHour: 3,
      deliveryFailuresPerHour: 5,
      rateLimitHitsPerHour: 3,
      errorsPerHour: 10,
    };

    this.checkInterval = options.checkInterval || 5 * 60 * 1000;
    this.checkTimer = null;
    this.healthStatus = 'healthy';

    this.loadMetrics();
  }

  start() {
    if (this.checkTimer) return;

    this.checkTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.checkInterval);

    setTimeout(() => this.performHealthCheck(), 60000);
  }

  stop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  recordConnectionDrop() {
    this.metrics.connectionDrops.push(Date.now());
    this.cleanOldMetrics();
    this.performHealthCheck();
    this.saveMetrics();
  }

  recordDeliveryFailure(reason) {
    this.metrics.deliveryFailures.push({ timestamp: Date.now(), reason });
    this.cleanOldMetrics();
    this.saveMetrics();
  }

  recordRateLimitHit() {
    this.metrics.rateLimitHits.push(Date.now());
    this.cleanOldMetrics();
    this.saveMetrics();
  }

  recordError(error) {
    this.metrics.errors.push({ timestamp: Date.now(), error: error.message || error });
    this.cleanOldMetrics();
    this.saveMetrics();
  }

  cleanOldMetrics() {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    this.metrics.connectionDrops = this.metrics.connectionDrops.filter(t => t > oneHourAgo);
    this.metrics.deliveryFailures = this.metrics.deliveryFailures.filter(m => m.timestamp > oneHourAgo);
    this.metrics.rateLimitHits = this.metrics.rateLimitHits.filter(t => t > oneHourAgo);
    this.metrics.errors = this.metrics.errors.filter(m => m.timestamp > oneHourAgo);
  }

  performHealthCheck() {
    this.cleanOldMetrics();
    this.metrics.lastHealthCheck = Date.now();

    const alerts = [];
    let status = 'healthy';

    if (this.metrics.connectionDrops.length >= this.thresholds.connectionDropsPerHour) {
      alerts.push({
        type: 'connection_instability',
        count: this.metrics.connectionDrops.length,
        message: `${this.metrics.connectionDrops.length} connection drops in last hour`,
        severity: 'warning',
      });
      status = 'degraded';
    }

    if (this.metrics.deliveryFailures.length >= this.thresholds.deliveryFailuresPerHour) {
      alerts.push({
        type: 'delivery_issues',
        count: this.metrics.deliveryFailures.length,
        message: `${this.metrics.deliveryFailures.length} delivery failures in last hour`,
        severity: 'warning',
      });
      status = 'degraded';
    }

    if (this.metrics.rateLimitHits.length >= this.thresholds.rateLimitHitsPerHour) {
      alerts.push({
        type: 'rate_limit_pressure',
        count: this.metrics.rateLimitHits.length,
        message: `Hit rate limit ${this.metrics.rateLimitHits.length} times in last hour`,
        severity: 'critical',
      });
      status = 'critical';
    }

    if (this.metrics.errors.length >= this.thresholds.errorsPerHour) {
      alerts.push({
        type: 'high_error_rate',
        count: this.metrics.errors.length,
        message: `${this.metrics.errors.length} errors in last hour`,
        severity: 'warning',
      });
      if (status !== 'critical') status = 'degraded';
    }

    this.healthStatus = status;

    if (alerts.length > 0) {
      this.onAlert({
        status,
        alerts,
        timestamp: Date.now(),
        recommendation: this.getRecommendation(status),
      });
    }

    this.saveMetrics();

    return { status, alerts };
  }

  getRecommendation(status) {
    switch (status) {
      case 'critical':
        return 'REDUCE or STOP messaging. System is under stress. Wait for recovery.';
      case 'degraded':
        return 'Monitor closely. Consider reducing message volume by 50%.';
      default:
        return 'System is healthy. Continue normal operation.';
    }
  }

  getStatus() {
    return {
      health: this.healthStatus,
      lastCheck: this.metrics.lastHealthCheck,
      metrics: {
        connectionDrops: this.metrics.connectionDrops.length,
        deliveryFailures: this.metrics.deliveryFailures.length,
        rateLimitHits: this.metrics.rateLimitHits.length,
        errors: this.metrics.errors.length,
      },
      monitoring: this.checkTimer !== null,
    };
  }

  loadMetrics() {
    if (!this.sessionsDir) return;
    const metricsFile = join(this.sessionsDir, '.health-metrics.json');
    try {
      if (existsSync(metricsFile)) {
        const data = JSON.parse(readFileSync(metricsFile, 'utf-8'));
        if (data.savedAt > Date.now() - 60 * 60 * 1000) {
          this.metrics = { ...this.metrics, ...data.metrics };
        }
      }
    } catch (err) {}
  }

  saveMetrics() {
    if (!this.sessionsDir) return;
    const metricsFile = join(this.sessionsDir, '.health-metrics.json');
    try {
      writeFileSync(metricsFile, JSON.stringify({
        metrics: this.metrics,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

export default HealthMonitor;
