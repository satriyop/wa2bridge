/**
 * Centralized Configuration for WA2Bridge
 *
 * All configuration values are defined here with sensible defaults.
 * Environment variables can override specific values.
 *
 * @module config
 */

/**
 * Parse a comma-separated environment variable into an array
 */
const parseArray = (value, defaultArr) => {
  if (!value) return defaultArr;
  return value.split(',').map(s => s.trim()).filter(Boolean);
};

/**
 * Parse a numeric environment variable
 */
const parseNumber = (value, defaultNum) => {
  if (value === undefined || value === '') return defaultNum;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultNum : parsed;
};

/**
 * Parse a float environment variable
 */
const parseFloat = (value, defaultNum) => {
  if (value === undefined || value === '') return defaultNum;
  const parsed = Number.parseFloat(value);
  return isNaN(parsed) ? defaultNum : parsed;
};

/**
 * Main configuration object
 */
export const config = {
  // ==========================================================================
  // SERVER
  // ==========================================================================
  server: {
    port: parseNumber(process.env.PORT, 3000),
    host: process.env.HOST || '0.0.0.0',
    corsOrigin: process.env.CORS_ORIGIN || '*',
    logLevel: process.env.LOG_LEVEL || 'info',
  },

  // ==========================================================================
  // AUTHENTICATION
  // ==========================================================================
  auth: {
    apiSecret: process.env.API_SECRET,
  },

  // ==========================================================================
  // WEBHOOK
  // ==========================================================================
  webhook: {
    url: process.env.WEBHOOK_URL,
  },

  // ==========================================================================
  // MESSAGE RATE LIMITING (by account age)
  // ==========================================================================
  rateLimits: {
    // Week 1: New accounts - very conservative
    week1: {
      hourly: parseNumber(process.env.RATE_LIMIT_WEEK1_HOURLY, 5),
      daily: parseNumber(process.env.RATE_LIMIT_WEEK1_DAILY, 15),
      intervalMs: parseNumber(process.env.RATE_LIMIT_WEEK1_INTERVAL, 180000), // 3 min
    },
    // Week 2-4: Warming accounts
    week2to4: {
      hourly: parseNumber(process.env.RATE_LIMIT_WARMING_HOURLY, 15),
      daily: parseNumber(process.env.RATE_LIMIT_WARMING_DAILY, 40),
      intervalMs: parseNumber(process.env.RATE_LIMIT_WARMING_INTERVAL, 90000), // 90 sec
    },
    // Month 2+: Mature accounts
    mature: {
      hourly: parseNumber(process.env.RATE_LIMIT_MATURE_HOURLY, 30),
      daily: parseNumber(process.env.RATE_LIMIT_MATURE_DAILY, 150),
      intervalMs: parseNumber(process.env.RATE_LIMIT_MATURE_INTERVAL, 30000), // 30 sec
    },
    // Reset intervals (in ms)
    hourlyResetMs: 3600000,  // 1 hour
    dailyResetMs: 86400000,  // 24 hours
  },

  // ==========================================================================
  // TIMING & DELAYS
  // ==========================================================================
  timing: {
    // Base message delay (randomized ±40%)
    messageDelayMs: parseNumber(process.env.MESSAGE_DELAY_MS, 1500),
    // Base typing indicator delay
    typingDelayMs: parseNumber(process.env.TYPING_DELAY_MS, 500),
    // Typing speed calculation
    msPerChar: 50,
    variance: 0.4, // ±40% variance
    // Typing duration bounds
    minTypingMs: 1000,
    maxTypingMs: 6000,
    // Read delay calculation
    readMsPerWord: 250, // ~5 chars per word
    minReadDelayMs: 500,
    maxReadDelayMs: 5000,
    // Hesitation before sending
    hesitationDelayMs: 300,
    // Auto-reply delay range
    autoReplyMinMs: 2000,
    autoReplyMaxMs: 5000,
  },

  // ==========================================================================
  // PROBABILITIES
  // ==========================================================================
  probabilities: {
    // Reaction to messages
    reaction: parseFloat(process.env.REACTION_PROBABILITY, 0.15),
    // Add emoji to outgoing
    emoji: parseFloat(process.env.EMOJI_PROBABILITY, 0.20),
    // Typing correction simulation
    correction: 0.15,
    // View status updates
    statusView: 0.6,
    // View sender profile
    profileView: 0.1,
    // Reply to forwarded messages
    forwardReply: 0.5,
    // Base reply rate
    baseReply: 0.9,
    // Group response rate
    groupResponse: 0.7,
  },

  // ==========================================================================
  // RECONNECTION
  // ==========================================================================
  reconnection: {
    baseDelayMs: 1000,
    maxDelayMs: 300000, // 5 minutes
    maxAttempts: parseNumber(process.env.RECONNECT_MAX_ATTEMPTS, 15),
    jitterMin: 0.3,
    jitterMax: 0.5,
  },

  // ==========================================================================
  // NETWORK
  // ==========================================================================
  network: {
    connectTimeoutMs: 60000,
    queryTimeoutMs: 60000,
    networkCheckIntervalMs: 300000, // 5 minutes
    geoCheckTimeoutMs: 5000,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  },

  // ==========================================================================
  // API RATE LIMITING (per endpoint)
  // ==========================================================================
  apiRateLimits: {
    default: { windowMs: 60000, max: 100 },
    send: { windowMs: 60000, max: 30 },
    queue: { windowMs: 60000, max: 50 },
    persistentQueue: { windowMs: 60000, max: 50 },
    // IP-based rate limiting
    ip: {
      windowMs: 60000,
      max: parseNumber(process.env.IP_RATE_LIMIT, 100),
      maxTracked: 1000, // LRU size
      cleanupIntervalMs: 60000,
    },
  },

  // ==========================================================================
  // SSE (Server-Sent Events)
  // ==========================================================================
  sse: {
    keepAliveIntervalMs: 30000,
    broadcastIntervalMs: 2000,
  },

  // ==========================================================================
  // WEEKEND & HOLIDAY PATTERNS
  // ==========================================================================
  patterns: {
    // Weekend days (0=Sunday, 6=Saturday)
    weekendDays: [0, 6],
    weekendMultiplier: 0.6,  // 60% activity on weekends
    holidayMultiplier: 0.4,  // 40% activity on holidays
    weekendDelayMultiplier: 1.5,  // 50% longer delays
    holidayDelayMultiplier: 2.0,  // Double delays
    // Holiday dates (MM-DD format)
    holidays: parseArray(process.env.HOLIDAYS, ['01-01', '12-25', '12-31', '08-17']),
    // Late night hours (reduced activity)
    lateNightStart: 23,
    lateNightEnd: 6,
    lateNightReplyRate: 0.7,
  },

  // ==========================================================================
  // CONTACT WARMUP
  // ==========================================================================
  warmup: {
    periodMs: 604800000, // 7 days
    initialDailyLimit: 2,
    warmupDailyLimit: 5,
    normalDailyLimit: 20,
    checkIntervalMs: 86400000, // 24 hours
  },

  // ==========================================================================
  // ACTIVITY RAMPING (after downtime)
  // ==========================================================================
  activityRamp: {
    downtimeThresholdMs: 3600000, // 1 hour
    rampUpPeriodMs: 1800000, // 30 minutes
    minMultiplier: 0.25, // Start at 25% speed
    baseExtraDelayMs: 30000,
    rampUpThreshold: 0.9,
  },

  // ==========================================================================
  // MESSAGE SPLITTING
  // ==========================================================================
  messageSplit: {
    maxLength: 500,
    splitThreshold: 300,
    minDelayMs: 1500,
    maxDelayMs: 4000,
    splitPointMin: 0.3,
    splitPointMax: 0.7,
  },

  // ==========================================================================
  // TYPING SIMULATION
  // ==========================================================================
  typingSimulation: {
    correctionPauseMinMs: 500,
    correctionPauseMaxMs: 2000,
    splitPointMin: 0.3,
    splitPointMax: 0.7,
  },

  // ==========================================================================
  // GROUP BEHAVIOR
  // ==========================================================================
  groups: {
    delayMultiplier: 2.0, // 2x slower in groups
    responseRate: 0.7,    // 70% response rate
  },

  // ==========================================================================
  // FORWARD MESSAGES
  // ==========================================================================
  forwards: {
    replyProbability: 0.5,
    delayMultiplier: 1.5,
    viralReductionFactor: 0.5,
  },

  // ==========================================================================
  // RAPID FIRE DETECTION
  // ==========================================================================
  rapidFire: {
    thresholdMs: 30000, // 30 seconds between messages
    replyRate: 0.5,
  },

  // ==========================================================================
  // BAN WARNING THRESHOLDS
  // ==========================================================================
  banWarning: {
    deliveryFailureRate: 0.2, // 20% failures triggers warning
    rateLimitHitsPerHour: 3,
    connectionDropsPerHour: 5,
    blockedThreshold: 2, // 2 blocks in a day
  },

  // ==========================================================================
  // CONVERSATION MEMORY
  // ==========================================================================
  conversationMemory: {
    maxMessages: 20,
  },

  // ==========================================================================
  // SESSION MANAGEMENT
  // ==========================================================================
  session: {
    maxBackups: 5,
  },

  // ==========================================================================
  // ACCOUNT AGE
  // ==========================================================================
  account: {
    ageWeeks: parseNumber(process.env.ACCOUNT_AGE_WEEKS, 4),
    activeHoursStart: parseNumber(process.env.ACTIVE_HOURS_START, 7),
    activeHoursEnd: parseNumber(process.env.ACTIVE_HOURS_END, 23),
  },
};

/**
 * Validate configuration at startup
 * @throws {Error} If configuration is invalid
 */
export function validateConfig() {
  const errors = [];

  // Rate limit validation
  if (config.rateLimits.week1.hourly > config.rateLimits.mature.hourly) {
    errors.push('Week 1 hourly limit should be less than mature limit');
  }

  // Timing validation
  if (config.timing.minTypingMs > config.timing.maxTypingMs) {
    errors.push('Min typing must be less than max typing');
  }

  if (config.timing.minReadDelayMs > config.timing.maxReadDelayMs) {
    errors.push('Min read delay must be less than max read delay');
  }

  // Message split validation
  if (config.messageSplit.splitThreshold > config.messageSplit.maxLength) {
    errors.push('Split threshold must be less than max length');
  }

  // Active hours validation
  if (config.account.activeHoursStart >= config.account.activeHoursEnd) {
    errors.push('Active hours start must be before end');
  }

  // Probability validation
  for (const [key, value] of Object.entries(config.probabilities)) {
    if (value < 0 || value > 1) {
      errors.push(`Probability ${key} must be between 0 and 1`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Config validation failed:\n  - ${errors.join('\n  - ')}`);
  }

  return true;
}

// Validate on import
validateConfig();

export default config;
