/**
 * API Rate Limiter
 *
 * Rate limit API calls per IP/token.
 */

export class APIRateLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60 * 1000;
    this.maxRequests = options.maxRequests || 60;
    this.clients = new Map();
    this.enabled = options.enabled ?? true;

    this.endpointLimits = {
      '/api/send': { windowMs: 60000, max: 30 },
      '/api/queue': { windowMs: 60000, max: 50 },
      '/api/persistent-queue': { windowMs: 60000, max: 50 },
      'default': { windowMs: 60000, max: 100 },
    };

    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  checkLimit(identifier, endpoint = 'default') {
    if (!this.enabled) return { allowed: true };

    const limits = this.endpointLimits[endpoint] || this.endpointLimits.default;
    const key = `${identifier}:${endpoint}`;
    const now = Date.now();

    let client = this.clients.get(key);

    if (!client || now > client.resetTime) {
      client = {
        count: 0,
        resetTime: now + limits.windowMs,
      };
    }

    client.count++;
    this.clients.set(key, client);

    if (client.count > limits.max) {
      return {
        allowed: false,
        reason: 'Rate limit exceeded',
        retryAfter: Math.ceil((client.resetTime - now) / 1000),
        limit: limits.max,
        remaining: 0,
        resetTime: client.resetTime,
      };
    }

    return {
      allowed: true,
      limit: limits.max,
      remaining: limits.max - client.count,
      resetTime: client.resetTime,
    };
  }

  setEndpointLimit(endpoint, windowMs, max) {
    this.endpointLimits[endpoint] = { windowMs, max };
  }

  cleanup() {
    const now = Date.now();
    for (const [key, client] of this.clients) {
      if (now > client.resetTime) {
        this.clients.delete(key);
      }
    }
  }

  getStats() {
    return {
      enabled: this.enabled,
      activeClients: this.clients.size,
      endpointLimits: this.endpointLimits,
    };
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

export default APIRateLimiter;
