/**
 * Spam Report Detector
 *
 * Detects patterns that suggest you've been reported for spam.
 * Warning signs: sudden delivery failures, blocks, rate limits.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

export class SpamReportDetector {
  constructor(options = {}) {
    this.sessionsDir = options.sessionsDir;
    this.onSpamWarning = options.onSpamWarning || (() => {});

    this.metrics = {
      recentDeliveryFailures: [],
      recentBlocks: [],
      recentRateLimits: [],
      suddenDrops: [],
    };

    this.thresholds = {
      deliveryFailuresPerHour: 3,
      blocksPerDay: 2,
      rateLimitsPerHour: 2,
      suddenDropThreshold: 0.5,
    };

    this.historicalDeliveryRate = 0.95;

    this.loadMetrics();
  }

  recordDeliveryFailure(to, reason) {
    this.metrics.recentDeliveryFailures.push({
      to,
      reason,
      timestamp: Date.now(),
    });
    this.cleanOldMetrics();
    this.analyzePatterns();
    this.saveMetrics();
  }

  recordBlock(by) {
    this.metrics.recentBlocks.push({
      by,
      timestamp: Date.now(),
    });
    this.cleanOldMetrics();
    this.analyzePatterns();
    this.saveMetrics();
  }

  recordRateLimit() {
    this.metrics.recentRateLimits.push({
      timestamp: Date.now(),
    });
    this.cleanOldMetrics();
    this.analyzePatterns();
    this.saveMetrics();
  }

  recordDeliveryRate(rate) {
    if (rate < this.historicalDeliveryRate * this.thresholds.suddenDropThreshold) {
      this.metrics.suddenDrops.push({
        rate,
        expected: this.historicalDeliveryRate,
        timestamp: Date.now(),
      });
      this.analyzePatterns();
    }

    this.historicalDeliveryRate = 0.9 * this.historicalDeliveryRate + 0.1 * rate;
    this.saveMetrics();
  }

  cleanOldMetrics() {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    this.metrics.recentDeliveryFailures = this.metrics.recentDeliveryFailures
      .filter(m => m.timestamp > oneHourAgo);
    this.metrics.recentBlocks = this.metrics.recentBlocks
      .filter(m => m.timestamp > oneDayAgo);
    this.metrics.recentRateLimits = this.metrics.recentRateLimits
      .filter(m => m.timestamp > oneHourAgo);
    this.metrics.suddenDrops = this.metrics.suddenDrops
      .filter(m => m.timestamp > oneDayAgo);
  }

  analyzePatterns() {
    const warnings = [];
    let riskLevel = 'normal';

    if (this.metrics.recentDeliveryFailures.length >= this.thresholds.deliveryFailuresPerHour) {
      warnings.push({
        type: 'delivery_failures',
        count: this.metrics.recentDeliveryFailures.length,
        message: `${this.metrics.recentDeliveryFailures.length} delivery failures in last hour`,
      });
      riskLevel = 'elevated';
    }

    if (this.metrics.recentBlocks.length >= this.thresholds.blocksPerDay) {
      warnings.push({
        type: 'blocks',
        count: this.metrics.recentBlocks.length,
        message: `Blocked by ${this.metrics.recentBlocks.length} users in last 24h`,
      });
      riskLevel = 'high';
    }

    if (this.metrics.recentRateLimits.length >= this.thresholds.rateLimitsPerHour) {
      warnings.push({
        type: 'rate_limits',
        count: this.metrics.recentRateLimits.length,
        message: `Hit rate limit ${this.metrics.recentRateLimits.length} times in last hour`,
      });
      riskLevel = riskLevel === 'high' ? 'critical' : 'high';
    }

    if (this.metrics.suddenDrops.length > 0) {
      warnings.push({
        type: 'delivery_drop',
        message: 'Sudden drop in delivery rate detected',
      });
      riskLevel = 'critical';
    }

    if (warnings.length > 0) {
      this.onSpamWarning({
        riskLevel,
        warnings,
        recommendation: this.getRecommendation(riskLevel),
        timestamp: Date.now(),
      });
    }

    return { riskLevel, warnings };
  }

  getRecommendation(riskLevel) {
    switch (riskLevel) {
      case 'critical':
        return 'STOP all messaging immediately. You may have been reported. Wait 24-48 hours.';
      case 'high':
        return 'Reduce messaging significantly. Only respond to incoming messages.';
      case 'elevated':
        return 'Monitor closely. Reduce outbound messaging by 50%.';
      default:
        return 'Continue normal operation.';
    }
  }

  getMetrics() {
    return {
      recentDeliveryFailures: this.metrics.recentDeliveryFailures.length,
      recentBlocks: this.metrics.recentBlocks.length,
      recentRateLimits: this.metrics.recentRateLimits.length,
      suddenDrops: this.metrics.suddenDrops.length,
      historicalDeliveryRate: (this.historicalDeliveryRate * 100).toFixed(1) + '%',
      analysis: this.analyzePatterns(),
    };
  }

  loadMetrics() {
    if (!this.sessionsDir) return;
    const metricsFile = join(this.sessionsDir, '.spam-detection-metrics.json');
    try {
      if (existsSync(metricsFile)) {
        const data = JSON.parse(readFileSync(metricsFile, 'utf-8'));
        if (data.date === new Date().toDateString()) {
          this.metrics = data.metrics || this.metrics;
          this.historicalDeliveryRate = data.historicalDeliveryRate || 0.95;
        }
      }
    } catch (err) {}
  }

  saveMetrics() {
    if (!this.sessionsDir) return;
    const metricsFile = join(this.sessionsDir, '.spam-detection-metrics.json');
    try {
      writeFileSync(metricsFile, JSON.stringify({
        date: new Date().toDateString(),
        metrics: this.metrics,
        historicalDeliveryRate: this.historicalDeliveryRate,
        savedAt: Date.now(),
      }, null, 2));
    } catch (err) {}
  }
}

export default SpamReportDetector;
