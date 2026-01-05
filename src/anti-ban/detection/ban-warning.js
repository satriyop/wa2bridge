/**
 * Ban Warning System
 *
 * Monitors various metrics to detect potential ban risk
 * and triggers appropriate responses including hibernation mode.
 */

import { DailyPersistenceBase } from '../shared/persistence.js';

/**
 * Multi-level ban risk detection system
 */
export class BanWarningSystem extends DailyPersistenceBase {
  constructor(options = {}) {
    super(options.sessionsDir, '.ban-warning-metrics.json');

    this.onWarning = options.onWarning || ((warning) => console.warn('[BAN WARNING]', warning));
    this.onCritical = options.onCritical || ((warning) => console.error('[BAN CRITICAL]', warning));

    // Tracking metrics
    this.metrics = {
      deliveryFailures: 0,
      deliverySuccesses: 0,
      rateLimitHits: 0,
      connectionDrops: 0,
      blockedByRecipients: 0,
      lastReset: Date.now(),
    };

    // Thresholds for warnings
    this.thresholds = {
      deliveryFailureRate: 0.2,       // 20% failure rate triggers warning
      rateLimitHitsPerHour: 3,        // 3 rate limit hits per hour
      connectionDropsPerHour: 5,      // 5 connection drops per hour
      blockedThreshold: 2,            // 2 blocks in a day
    };

    // Warning levels
    this.WARNING_LEVELS = {
      NORMAL: 'normal',
      ELEVATED: 'elevated',
      HIGH: 'high',
      CRITICAL: 'critical',
    };

    this.currentLevel = this.WARNING_LEVELS.NORMAL;
    this.hibernationMode = false;

    this.loadState();
  }

  /**
   * Record a successful message delivery
   */
  recordDeliverySuccess() {
    this.metrics.deliverySuccesses++;
    this.saveState();
    this.evaluateRisk();
  }

  /**
   * Record a failed message delivery
   */
  recordDeliveryFailure(reason) {
    this.metrics.deliveryFailures++;
    this.saveState();

    console.warn(`[Ban Warning] Delivery failure: ${reason}`);
    this.evaluateRisk();
  }

  /**
   * Record a rate limit hit
   */
  recordRateLimitHit() {
    this.metrics.rateLimitHits++;
    this.saveState();

    console.warn('[Ban Warning] Rate limit hit');
    this.evaluateRisk();
  }

  /**
   * Record a connection drop
   */
  recordConnectionDrop() {
    this.metrics.connectionDrops++;
    this.saveState();
    this.evaluateRisk();
  }

  /**
   * Record being blocked by a recipient
   */
  recordBlocked() {
    this.metrics.blockedByRecipients++;
    this.saveState();

    console.warn('[Ban Warning] Blocked by recipient');
    this.evaluateRisk();
  }

  /**
   * Get current delivery failure rate
   */
  getDeliveryFailureRate() {
    const total = this.metrics.deliverySuccesses + this.metrics.deliveryFailures;
    if (total === 0) return 0;
    return this.metrics.deliveryFailures / total;
  }

  /**
   * Evaluate current risk level based on metrics
   */
  evaluateRisk() {
    const hoursSinceReset = (Date.now() - this.metrics.lastReset) / 3600000;
    const failureRate = this.getDeliveryFailureRate();
    const rateLimitRate = this.metrics.rateLimitHits / Math.max(hoursSinceReset, 1);
    const connectionDropRate = this.metrics.connectionDrops / Math.max(hoursSinceReset, 1);

    let riskScore = 0;
    const warnings = [];

    // Check delivery failure rate
    if (failureRate > this.thresholds.deliveryFailureRate) {
      riskScore += 2;
      warnings.push(`High delivery failure rate: ${(failureRate * 100).toFixed(1)}%`);
    }

    // Check rate limit hits
    if (rateLimitRate > this.thresholds.rateLimitHitsPerHour) {
      riskScore += 2;
      warnings.push(`Frequent rate limits: ${this.metrics.rateLimitHits} hits`);
    }

    // Check connection drops
    if (connectionDropRate > this.thresholds.connectionDropsPerHour) {
      riskScore += 1;
      warnings.push(`Connection unstable: ${this.metrics.connectionDrops} drops`);
    }

    // Check blocks
    if (this.metrics.blockedByRecipients >= this.thresholds.blockedThreshold) {
      riskScore += 3;
      warnings.push(`Multiple blocks: ${this.metrics.blockedByRecipients} users blocked you`);
    }

    // Determine warning level
    let newLevel = this.WARNING_LEVELS.NORMAL;
    if (riskScore >= 5) {
      newLevel = this.WARNING_LEVELS.CRITICAL;
    } else if (riskScore >= 3) {
      newLevel = this.WARNING_LEVELS.HIGH;
    } else if (riskScore >= 1) {
      newLevel = this.WARNING_LEVELS.ELEVATED;
    }

    // Trigger callbacks if level changed
    if (newLevel !== this.currentLevel) {
      this.currentLevel = newLevel;

      if (newLevel === this.WARNING_LEVELS.CRITICAL) {
        this.onCritical({
          level: newLevel,
          warnings,
          recommendation: 'STOP ALL AUTOMATION. Enter hibernation mode immediately.',
          metrics: this.getMetrics(),
        });
        this.hibernationMode = true;
      } else if (newLevel === this.WARNING_LEVELS.HIGH) {
        this.onWarning({
          level: newLevel,
          warnings,
          recommendation: 'Reduce message frequency significantly. Only respond to incoming messages.',
          metrics: this.getMetrics(),
        });
      } else if (newLevel === this.WARNING_LEVELS.ELEVATED) {
        this.onWarning({
          level: newLevel,
          warnings,
          recommendation: 'Monitor closely. Consider reducing activity.',
          metrics: this.getMetrics(),
        });
      }
    }

    return { level: this.currentLevel, riskScore, warnings };
  }

  /**
   * Check if safe to send (respects hibernation mode)
   */
  canSend() {
    if (this.hibernationMode) {
      return {
        allowed: false,
        reason: 'Hibernation mode active due to ban risk. Only respond to incoming messages.',
      };
    }

    if (this.currentLevel === this.WARNING_LEVELS.CRITICAL) {
      return {
        allowed: false,
        reason: 'Critical ban risk detected. Sending blocked.',
      };
    }

    return { allowed: true };
  }

  /**
   * Exit hibernation mode (manual override)
   */
  exitHibernation() {
    this.hibernationMode = false;
    console.log('[Ban Warning] Hibernation mode disabled');
  }

  /**
   * Reset metrics (call daily or after recovery period)
   */
  resetMetrics() {
    this.metrics = {
      deliveryFailures: 0,
      deliverySuccesses: 0,
      rateLimitHits: 0,
      connectionDrops: 0,
      blockedByRecipients: 0,
      lastReset: Date.now(),
    };
    this.currentLevel = this.WARNING_LEVELS.NORMAL;
    this.saveState();
  }

  getMetrics() {
    return {
      ...this.metrics,
      deliveryFailureRate: (this.getDeliveryFailureRate() * 100).toFixed(1) + '%',
      currentLevel: this.currentLevel,
      hibernationMode: this.hibernationMode,
      hoursSinceReset: ((Date.now() - this.metrics.lastReset) / 3600000).toFixed(1),
    };
  }

  // PersistenceBase overrides
  getStateData() {
    return {
      metrics: this.metrics,
      currentLevel: this.currentLevel,
      hibernationMode: this.hibernationMode,
    };
  }

  restoreState(data) {
    this.metrics = data.metrics || this.metrics;
    this.currentLevel = data.currentLevel || this.WARNING_LEVELS.NORMAL;
    this.hibernationMode = data.hibernationMode || false;
  }
}

export default BanWarningSystem;
