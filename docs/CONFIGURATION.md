# WA2Bridge Configuration

Complete reference for all environment variables and configuration options.

## Quick Start

Copy `.env.example` to `.env` and adjust values:

```bash
cp .env.example .env
```

## Environment Variables Reference

### Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `HOST` | `0.0.0.0` | Bind address |
| `CORS_ORIGIN` | `*` | Allowed CORS origins |
| `LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, `error` |

### Authentication

| Variable | Default | Description |
|----------|---------|-------------|
| `API_SECRET` | - | Bearer token for API authentication. **Required for production.** |

### Webhook

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBHOOK_URL` | - | URL to receive webhook events (Laravel endpoint) |

### Account & Rate Limits

| Variable | Default | Description |
|----------|---------|-------------|
| `ACCOUNT_AGE_WEEKS` | `4` | WhatsApp account age in weeks |
| `ACTIVE_HOURS_START` | `7` | Hour to start activity (0-23) |
| `ACTIVE_HOURS_END` | `23` | Hour to end activity (0-23) |

**Week 1 Rate Limits (New Account):**

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_WEEK1_HOURLY` | `5` | Max messages per hour |
| `RATE_LIMIT_WEEK1_DAILY` | `15` | Max messages per day |
| `RATE_LIMIT_WEEK1_INTERVAL` | `180000` | Min interval between messages (ms) |

**Week 2-4 Rate Limits (Warming Account):**

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_WARMING_HOURLY` | `15` | Max messages per hour |
| `RATE_LIMIT_WARMING_DAILY` | `40` | Max messages per day |
| `RATE_LIMIT_WARMING_INTERVAL` | `90000` | Min interval between messages (ms) |

**Month 2+ Rate Limits (Mature Account):**

| Variable | Default | Description |
|----------|---------|-------------|
| `RATE_LIMIT_MATURE_HOURLY` | `30` | Max messages per hour |
| `RATE_LIMIT_MATURE_DAILY` | `150` | Max messages per day |
| `RATE_LIMIT_MATURE_INTERVAL` | `30000` | Min interval between messages (ms) |

### Timing Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `MESSAGE_DELAY_MS` | `1500` | Base delay between messages (randomized ±40%) |
| `TYPING_DELAY_MS` | `500` | Base typing indicator delay |

### Reconnection

| Variable | Default | Description |
|----------|---------|-------------|
| `RECONNECT_MAX_ATTEMPTS` | `15` | Max reconnection attempts before giving up |

### API Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `IP_RATE_LIMIT` | `100` | Max requests per minute per IP |

### Behavioral Patterns

| Variable | Default | Description |
|----------|---------|-------------|
| `HOLIDAYS` | `01-01,12-25,12-31,08-17` | Holiday dates (MM-DD format, comma-separated) |
| `REACTION_PROBABILITY` | `0.15` | Probability of reacting to messages (0-1) |
| `EMOJI_PROBABILITY` | `0.20` | Probability of adding emoji to messages (0-1) |

---

## Configuration by Account Age

### Week 1: New Account (MAXIMUM PROTECTION)

```env
ACCOUNT_AGE_WEEKS=1
MESSAGE_DELAY_MS=3000
TYPING_DELAY_MS=1000
RATE_LIMIT_WEEK1_HOURLY=5
RATE_LIMIT_WEEK1_DAILY=15
RATE_LIMIT_WEEK1_INTERVAL=180000
```

**Recommendations:**
- Only respond to incoming messages
- No bulk/broadcast sending
- Keep response ratio above 70%
- Add profile photo and status
- Wait 48-72 hours before any automation

### Week 2-4: Warming Account (MODERATE PROTECTION)

```env
ACCOUNT_AGE_WEEKS=4
MESSAGE_DELAY_MS=1500
TYPING_DELAY_MS=500
RATE_LIMIT_WARMING_HOURLY=15
RATE_LIMIT_WARMING_DAILY=40
RATE_LIMIT_WARMING_INTERVAL=90000
```

**Recommendations:**
- Gradually increase activity
- Can initiate some conversations
- Keep varied message content
- Maintain response ratio above 60%

### Month 2+: Mature Account (NORMAL PROTECTION)

```env
ACCOUNT_AGE_WEEKS=8
MESSAGE_DELAY_MS=1500
TYPING_DELAY_MS=500
RATE_LIMIT_MATURE_HOURLY=30
RATE_LIMIT_MATURE_DAILY=150
RATE_LIMIT_MATURE_INTERVAL=30000
```

**Recommendations:**
- Normal operation with all protections
- Still avoid bulk operations
- Monitor ban warning levels
- Regular activity patterns

---

## Holiday Configuration

Holidays reduce message activity to match natural human behavior.

### Default Holidays

```
01-01  New Year's Day
12-25  Christmas
12-31  New Year's Eve
08-17  Indonesia Independence Day
```

### Custom Holidays

```env
HOLIDAYS=01-01,01-02,02-14,05-01,12-25,12-26,12-31
```

Format: `MM-DD` (comma-separated, no spaces)

### Indonesia-Specific

```env
HOLIDAYS=01-01,01-22,03-11,03-29,04-10,04-11,04-21,05-01,05-09,05-23,06-01,06-17,06-18,07-17,08-17,12-25
```

---

## Production Configuration Example

```env
# Server
PORT=3001
HOST=0.0.0.0
CORS_ORIGIN=https://your-laravel-app.com
LOG_LEVEL=info

# Security
API_SECRET=your-very-secure-random-token-here
IP_RATE_LIMIT=60

# Webhook
WEBHOOK_URL=https://your-laravel-app.com/api/whatsapp/webhook

# Account (adjust to actual account age)
ACCOUNT_AGE_WEEKS=8
ACTIVE_HOURS_START=8
ACTIVE_HOURS_END=22

# Timing
MESSAGE_DELAY_MS=1500
TYPING_DELAY_MS=500

# Reconnection
RECONNECT_MAX_ATTEMPTS=20

# Holidays (Indonesian + International)
HOLIDAYS=01-01,03-11,04-10,04-21,05-01,06-01,08-17,12-25
```

---

## Development Configuration Example

```env
# Server
PORT=3001
HOST=0.0.0.0
CORS_ORIGIN=*
LOG_LEVEL=debug

# Security (no auth for local dev)
# API_SECRET=

# Webhook (local Laravel)
WEBHOOK_URL=http://localhost:8000/api/whatsapp/webhook

# Account
ACCOUNT_AGE_WEEKS=4

# Timing
MESSAGE_DELAY_MS=500
TYPING_DELAY_MS=200
```

---

## Laravel Integration Configuration

### Laravel `.env`

```env
# Must match wa2bridge API_SECRET
WA_BRIDGE_SECRET=your-very-secure-random-token-here

# wa2bridge server URL
WA_BRIDGE_URL=http://localhost:3001

# Webhook secret for validating incoming webhooks
WA_WEBHOOK_SECRET=another-random-token
```

### wa2bridge `.env`

```env
API_SECRET=your-very-secure-random-token-here
WEBHOOK_URL=http://your-laravel-app/api/whatsapp/webhook
```

---

## Internal Configuration

These values are configured in `src/config.js` and generally don't need environment overrides:

### Timing (Internal)

| Config Path | Value | Description |
|-------------|-------|-------------|
| `timing.variance` | `0.4` | Randomization variance (±40%) |
| `timing.msPerChar` | `50` | Typing speed per character |
| `timing.minTypingMs` | `1000` | Minimum typing duration |
| `timing.maxTypingMs` | `6000` | Maximum typing duration |
| `timing.readMsPerWord` | `250` | Reading time per word |
| `timing.minReadDelayMs` | `500` | Minimum read delay |
| `timing.maxReadDelayMs` | `5000` | Maximum read delay |
| `timing.hesitationDelayMs` | `300` | Hesitation before send |

### Reconnection (Internal)

| Config Path | Value | Description |
|-------------|-------|-------------|
| `reconnection.baseDelayMs` | `1000` | Initial reconnect delay |
| `reconnection.maxDelayMs` | `300000` | Max delay (5 minutes) |
| `reconnection.jitterMin` | `0.3` | Minimum jitter (30%) |
| `reconnection.jitterMax` | `0.5` | Maximum jitter (50%) |

### Network (Internal)

| Config Path | Value | Description |
|-------------|-------|-------------|
| `network.connectTimeoutMs` | `60000` | Connection timeout |
| `network.queryTimeoutMs` | `60000` | Query timeout |
| `network.networkCheckIntervalMs` | `300000` | Network health check interval |

### Patterns (Internal)

| Config Path | Value | Description |
|-------------|-------|-------------|
| `patterns.weekendDays` | `[0, 6]` | Weekend days (Sun, Sat) |
| `patterns.weekendMultiplier` | `0.6` | Activity reduction on weekends |
| `patterns.holidayMultiplier` | `0.4` | Activity reduction on holidays |
| `patterns.weekendDelayMultiplier` | `1.5` | Delay increase on weekends |
| `patterns.holidayDelayMultiplier` | `2.0` | Delay increase on holidays |
| `patterns.lateNightStart` | `23` | Late night starts at 11 PM |
| `patterns.lateNightEnd` | `6` | Late night ends at 6 AM |
| `patterns.lateNightReplyRate` | `0.7` | Reply rate during late night |

### Warmup (Internal)

| Config Path | Value | Description |
|-------------|-------|-------------|
| `warmup.periodMs` | `604800000` | Warmup period (7 days) |
| `warmup.initialDailyLimit` | `2` | Messages/day in warmup |
| `warmup.warmupDailyLimit` | `5` | Messages/day after initial |
| `warmup.normalDailyLimit` | `20` | Messages/day when warmed |

### Ban Warning (Internal)

| Config Path | Value | Description |
|-------------|-------|-------------|
| `banWarning.deliveryFailureRate` | `0.2` | Failure rate for warning |
| `banWarning.rateLimitHitsPerHour` | `3` | Rate limit hits trigger |
| `banWarning.connectionDropsPerHour` | `5` | Connection drops trigger |
| `banWarning.blockedThreshold` | `2` | Blocks per day trigger |

---

## Troubleshooting

### QR Code Not Generating

1. Delete sessions folder: `rm -rf sessions/*`
2. Restart the service
3. Wait up to 30 seconds for QR

### Connection Drops Frequently

```env
# Increase reconnection attempts
RECONNECT_MAX_ATTEMPTS=25

# Use more conservative rate limits
RATE_LIMIT_MATURE_HOURLY=20
RATE_LIMIT_MATURE_DAILY=100
```

### Messages Sending Too Fast

```env
# Increase base delays
MESSAGE_DELAY_MS=2000
TYPING_DELAY_MS=800

# Lower rate limits
RATE_LIMIT_MATURE_HOURLY=15
RATE_LIMIT_MATURE_INTERVAL=60000
```

### High Memory Usage

The system uses LRU caches with limits. If still high:

1. Check for memory leaks in custom code
2. Restart service periodically
3. Reduce cache sizes in `config.js`

### Authentication Failures

1. Verify `API_SECRET` matches between services
2. Check for whitespace in the token
3. Ensure `Authorization: Bearer TOKEN` format
4. Check CORS settings if using browser

---

## Related Documentation

- [Architecture](./ARCHITECTURE.md) - System overview
- [Anti-Ban System](./ANTI-BAN-SYSTEM.md) - Protection details
- [API Reference](./API-REFERENCE.md) - Endpoint documentation
- [Developer Guide](./DEVELOPER-GUIDE.md) - Extending the system
