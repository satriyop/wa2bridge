# WA2Bridge - WhatsApp Bridge Service

## Overview

This is a Node.js WhatsApp bridge service that provides HTTP API for the **whatsapp2app** Laravel application. It wraps WhatsApp Web protocol libraries and exposes a simple REST API.

## Architecture Pattern

```
┌─────────────────────────────────────────────────────────┐
│              Laravel (whatsapp2app)                     │
│         WhatsAppBridgeInterface (Adapter Pattern)       │
│                        │                                │
│              BaileysBridgeAdapter                       │
└────────────────────────┼────────────────────────────────┘
                         │ HTTP API
                         ▼
┌─────────────────────────────────────────────────────────┐
│                 THIS PROJECT (wa2bridge)                │
│                                                         │
│   ┌─────────────┐      ┌─────────────────────────┐     │
│   │   api.js    │ ◄─── │  HTTP Endpoints          │     │
│   └──────┬──────┘      └─────────────────────────┘     │
│          │                                              │
│          ▼                                              │
│   ┌─────────────────────────────────────────────┐      │
│   │         WhatsApp Client Wrapper             │      │
│   │  ┌─────────────┐   ┌──────────────────┐    │      │
│   │  │ whatsapp.js │ OR│ whatsapp-webjs.js│    │      │
│   │  │  (Baileys)  │   │(whatsapp-web.js) │    │      │
│   │  └─────────────┘   └──────────────────┘    │      │
│   └─────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

## Critical: HTTP API Contract

The Laravel application depends on these exact endpoints. **DO NOT change the API structure** without updating the Laravel `BaileysBridgeAdapter`.

### Required Endpoints

```
GET  /health              - Health check (no auth)
GET  /api/status          - Connection status + rate limits (auth required)
GET  /api/qr              - QR code for pairing (no auth)
GET  /qr                  - HTML page with QR code (no auth)
POST /api/send            - Send message (rate limited, auth required)
POST /api/reconnect       - Reconnect WhatsApp (auth required)
GET  /api/rate-limits     - Current rate limit status (auth required)
POST /api/account-age     - Set account age for limits (auth required)
```

### Response Formats

**GET /api/status**
```json
{
  "connected": true,
  "phone": "6281234567890",
  "name": "User Name",
  "qr": null,
  "stats": {
    "messagesSent": 10,
    "messagesReceived": 5,
    "uptime": 3600
  },
  "rateLimits": {
    "hourlyCount": 5,
    "hourlyLimit": 15,
    "dailyCount": 12,
    "dailyLimit": 40,
    "minIntervalMs": 90000,
    "accountAgeWeeks": 4,
    "limitDescription": "Warming account (Week 2-4)"
  },
  "activity": {
    "sent": 12,
    "received": 8,
    "responseRatio": "67%",
    "uniqueRecipients": 3,
    "uniqueSenders": 2
  },
  "reconnection": {
    "attempts": 0,
    "maxAttempts": 15,
    "willGiveUp": false
  }
}
```

**GET /api/rate-limits**
```json
{
  "rateLimits": {
    "hourlyCount": 5,
    "hourlyLimit": 15,
    "dailyCount": 12,
    "dailyLimit": 40,
    "hourlyResetIn": 2400000,
    "dailyResetIn": 43200000
  },
  "activity": {
    "sent": 12,
    "received": 8,
    "responseRatio": "67%"
  }
}
```

**POST /api/account-age** (Request)
```json
{
  "weeks": 8
}
```

**POST /api/account-age** (Response)
```json
{
  "success": true,
  "accountAgeWeeks": 8,
  "newLimits": {
    "hourly": 30,
    "daily": 150,
    "minIntervalMs": 30000,
    "description": "Mature account (Month 2+)"
  }
}
```

**POST /api/send** (Request)
```json
{
  "to": "+6281234567890",
  "message": "Hello!",
  "reply_to": "optional-message-id"
}
```

**POST /api/send** (Response)
```json
{
  "success": true,
  "messageId": "ABC123",
  "to": "+6281234567890"
}
```

### Authentication

Protected endpoints require Bearer token:
```
Authorization: Bearer {WA_BRIDGE_SECRET}
```

## Library Options

### Option 1: Baileys (Default)
- File: `src/whatsapp.js`
- Library: `@whiskeysockets/baileys`
- Pros: Lightweight, active development
- Cons: Breaking changes between versions

### Option 2: whatsapp-web.js
- File: `src/whatsapp-webjs.js`
- Library: `whatsapp-web.js`
- Pros: Stable API, well documented
- Cons: Requires Puppeteer/Chrome

To switch, edit `src/index.js`:
```javascript
// Current (Baileys)
import WhatsAppClient from './whatsapp.js';

// Alternative (whatsapp-web.js)
import WhatsAppClient from './whatsapp-webjs.js';
```

## Important: WhatsApp Client Interface

Both `whatsapp.js` and `whatsapp-webjs.js` MUST implement this interface:

```javascript
class WhatsAppClient {
  constructor(options)           // { messageDelay, webhookUrl, onMessage }
  async connect()                // Initialize and connect
  async sendMessage(to, text, replyToMessageId)  // Send message
  getStatus()                    // Return status object
  async disconnect()             // Logout and disconnect
}
```

## Related Project

- **Laravel Backend**: `/Users/satriyo/dev/laravel-project/whatsapp2app`
- **Adapter Location**: `app/Services/WhatsApp/BaileysBridgeAdapter.php`

When modifying this bridge, ensure the Laravel adapter still works.

## Environment Variables

```env
PORT=3001                    # API server port
HOST=0.0.0.0                 # Bind address
API_SECRET=your-secret       # Auth token (must match Laravel's WA_BRIDGE_SECRET)
WEBHOOK_URL=http://...       # Laravel webhook endpoint
MESSAGE_DELAY_MS=1500        # Base message delay (randomized ±40%)
TYPING_DELAY_MS=500          # Base typing delay (randomized)
LOG_LEVEL=info               # Logging verbosity

# Anti-Ban Configuration
ACCOUNT_AGE_WEEKS=4          # Account age for rate limits (see below)
```

### Account Age Rate Limits

| Account Age | Hourly Limit | Daily Limit | Min Interval |
|-------------|--------------|-------------|--------------|
| Week 1 (new) | 5 messages | 15 messages | 3 minutes |
| Week 2-4 | 15 messages | 40 messages | 90 seconds |
| Month 2+ (8+ weeks) | 30 messages | 150 messages | 30 seconds |

**WARNING**: Setting `ACCOUNT_AGE_WEEKS` higher than actual account age increases ban risk!

## Common Issues

### QR Code Not Generating
- Clear `sessions/` folder and restart
- Check Baileys version compatibility
- Use `fetchLatestBaileysVersion()` for version matching

### "Can't link new devices"
- WhatsApp rate limiting - wait 15-30 minutes
- Check if account has max linked devices (4)
- Try different WhatsApp account

### Connection Loops
- Usually corrupted session data
- Solution: `rm -rf sessions/*` and restart

---

## CRITICAL: WhatsApp Ban Prevention Guidelines

> **FIRST RULE**: Every code change MUST be evaluated for ban risk. WhatsApp bans accounts using ML-based behavioral analysis, device fingerprinting, and pattern detection. This section is MANDATORY reading before generating any code.

### How WhatsApp Detects Unofficial APIs

WhatsApp employs a multi-layered detection system:

```
┌─────────────────────────────────────────────────────────────────┐
│              WhatsApp Detection Layers                          │
├─────────────────────────────────────────────────────────────────┤
│  1. REGISTRATION (20% of bans happen here)                      │
│     - IP reputation scoring                                     │
│     - SIM card origin verification                              │
│     - Phone number pattern analysis                             │
│     - Device fingerprint on first connect                       │
├─────────────────────────────────────────────────────────────────┤
│  2. BEHAVIORAL ML (Real-time monitoring)                        │
│     - Message timing regularity (CRITICAL!)                     │
│     - Typing indicator presence/absence                         │
│     - Response rate ratios                                      │
│     - Content similarity scoring                                │
│     - Group creation frequency                                  │
├─────────────────────────────────────────────────────────────────┤
│  3. DEVICE FINGERPRINTING                                       │
│     - Browser/OS combination tracking                           │
│     - Device ID persistence patterns                            │
│     - Multi-device usage anomalies                              │
│     - "Trusted device" status (180+ days = safe)                │
├─────────────────────────────────────────────────────────────────┤
│  4. USER FEEDBACK LOOP                                          │
│     - Block/report actions weighted heavily                     │
│     - <50% response rate = spam classification                  │
│     - Mutual contact relationships analyzed                     │
└─────────────────────────────────────────────────────────────────┘
```

### Ban Statistics (2024-2025)

| Metric | Value |
|--------|-------|
| New accounts restricted in first 72 hours | 87% |
| Bans from ML detection (not user reports) | 75%+ |
| Accounts banned monthly for automation | 2M+ |
| Message velocity trigger | 100 msgs in 5 min |
| Mass forward flag threshold | Same content >10x |
| Device change tolerance | Max 2 per year |

---

## MANDATORY Implementation Rules

### Rule 1: ALWAYS Randomize Delays (CRITICAL)

**WHY**: Fixed delays create detectable patterns. ML systems identify regularity.

```javascript
// ❌ BANNED PATTERN - Fixed delays
await delay(1500);  // NEVER do this
await delay(500);   // Perfect regularity = bot signature

// ✅ REQUIRED PATTERN - Randomized delays
function humanDelay(baseMs, variancePercent = 0.3) {
  const variance = baseMs * variancePercent;
  const min = baseMs - variance;
  const max = baseMs + variance;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Usage: 1500ms ± 30% = 1050-1950ms
await delay(humanDelay(1500, 0.3));
```

**Required variance**: ±25-50% on ALL delays

### Rule 2: ALWAYS Use Typing Indicators

**WHY**: Instant messages without "composing" status = obvious bot.

```javascript
// ❌ BANNED PATTERN - No typing indicator
await socket.sendMessage(jid, { text: message });

// ✅ REQUIRED PATTERN - Full human simulation
async function sendMessageHumanLike(socket, jid, text) {
  // 1. Subscribe to presence
  await socket.presenceSubscribe(jid);
  await delay(humanDelay(100, 0.5));

  // 2. Show "composing" - duration based on message length
  const typingDuration = Math.min(
    text.length * humanDelay(50, 0.4),  // ~50ms per char
    5000  // Cap at 5 seconds
  );
  await socket.sendPresenceUpdate('composing', jid);
  await delay(typingDuration);

  // 3. Brief pause before send (human hesitation)
  await delay(humanDelay(300, 0.5));

  // 4. Send message
  const result = await socket.sendMessage(jid, { text });

  // 5. Clear typing with slight delay
  await delay(humanDelay(200, 0.3));
  await socket.sendPresenceUpdate('paused', jid);

  return result;
}
```

### Rule 3: Enforce Rate Limits

**WHY**: High velocity = instant ban. WhatsApp tracks messages per minute/hour/day.

| Account Age | Max Messages/Day | Max Messages/Hour | Min Interval |
|-------------|------------------|-------------------|--------------|
| Week 1 (new) | 10-20 | 5 | 3-5 minutes |
| Week 2-4 | 30-50 | 15 | 90-120 seconds |
| Month 2+ | 100-200 | 30 | 30-60 seconds |
| **NEVER exceed** | 250 | 50 | 20 seconds |

```javascript
// Required: In-memory rate limiter
class MessageRateLimiter {
  constructor() {
    this.hourlyCount = 0;
    this.dailyCount = 0;
    this.lastReset = { hour: Date.now(), day: Date.now() };
    this.lastMessageTime = 0;
  }

  async canSend(accountAgeWeeks = 1) {
    const limits = this.getLimits(accountAgeWeeks);

    // Reset counters
    if (Date.now() - this.lastReset.hour > 3600000) {
      this.hourlyCount = 0;
      this.lastReset.hour = Date.now();
    }
    if (Date.now() - this.lastReset.day > 86400000) {
      this.dailyCount = 0;
      this.lastReset.day = Date.now();
    }

    // Check limits
    if (this.hourlyCount >= limits.hourly) return false;
    if (this.dailyCount >= limits.daily) return false;

    // Check minimum interval
    const elapsed = Date.now() - this.lastMessageTime;
    if (elapsed < limits.minIntervalMs) {
      await delay(limits.minIntervalMs - elapsed + humanDelay(1000, 0.5));
    }

    return true;
  }

  recordSend() {
    this.hourlyCount++;
    this.dailyCount++;
    this.lastMessageTime = Date.now();
  }

  getLimits(weeks) {
    if (weeks <= 1) return { hourly: 5, daily: 15, minIntervalMs: 180000 };
    if (weeks <= 4) return { hourly: 15, daily: 40, minIntervalMs: 90000 };
    return { hourly: 30, daily: 150, minIntervalMs: 30000 };
  }
}
```

### Rule 4: Rotate Browser Fingerprint

**WHY**: Static browser string links all messages to one "fake device".

```javascript
// ❌ BANNED PATTERN - Hardcoded browser
browser: ['Ubuntu', 'Chrome', '124.0.6367.91']  // NEVER hardcode

// ✅ REQUIRED PATTERN - Rotate fingerprint
function getBrowserFingerprint() {
  const browsers = [
    ['Windows', 'Chrome', '131.0.6778.139'],
    ['Windows', 'Edge', '131.0.2903.86'],
    ['macOS', 'Chrome', '131.0.6778.139'],
    ['macOS', 'Safari', '18.1.1'],
  ];

  // Store in session file, rotate every 24-48 hours
  const stored = loadStoredFingerprint();
  if (stored && Date.now() - stored.timestamp < 86400000) {
    return stored.browser;
  }

  const newBrowser = browsers[Math.floor(Math.random() * browsers.length)];
  saveFingerprint({ browser: newBrowser, timestamp: Date.now() });
  return newBrowser;
}

// In makeWASocket config:
browser: getBrowserFingerprint()
```

### Rule 5: Randomize Reconnection

**WHY**: Predictable reconnection patterns = automation fingerprint.

```javascript
// ❌ BANNED PATTERN - Fixed reconnection delays
setTimeout(() => this.connect(), 2000);  // Predictable
setTimeout(() => this.connect(), 3000);
setTimeout(() => this.connect(), 5000);

// ✅ REQUIRED PATTERN - Exponential backoff with jitter
class ReconnectionManager {
  constructor() {
    this.attempts = 0;
    this.maxDelay = 300000;  // 5 minutes max
  }

  getNextDelay() {
    const baseDelay = Math.min(
      1000 * Math.pow(2, this.attempts),  // Exponential: 1s, 2s, 4s, 8s...
      this.maxDelay
    );

    // Add 30-50% jitter
    const jitter = baseDelay * (0.3 + Math.random() * 0.2);
    this.attempts++;

    return Math.floor(baseDelay + jitter);
  }

  reset() {
    this.attempts = 0;
  }
}

// Usage
if (connection === 'close') {
  const delay = reconnectionManager.getNextDelay();
  setTimeout(() => this.connect(), delay);
}
```

### Rule 6: Account Warming Protocol

**WHY**: 87% of new accounts get restricted in first 72 hours.

```
Day 1-2:   PASSIVE MODE
           - Just stay connected
           - NO outbound messages
           - Add profile photo, status
           - Add 3-5 contacts manually

Day 3-5:   MINIMAL ACTIVITY
           - 2-3 messages per day MAX
           - Only reply to incoming messages
           - Join 1 group (with permission)

Day 6-10:  GRADUAL RAMP
           - 5-10 messages per day
           - 5 new contacts max
           - Natural conversation patterns

Week 2+:   NORMAL OPERATION
           - Follow rate limits above
           - Maintain >50% response rate
           - Never bulk forward
```

### Rule 7: Session Stability

**WHY**: Frequent session/device changes trigger "device abuse" detection.

| Action | Risk Level | Recommendation |
|--------|------------|----------------|
| Clear sessions | HIGH | Only when banned/corrupted |
| Switch phone number | VERY HIGH | Wait 90+ days between |
| Use VPN | MEDIUM | Keep same region always |
| Change IP frequently | HIGH | Maintain for 24+ hours |
| Multiple linked devices | LOW | Max 4, use consistently |

```javascript
// Session file check before clearing
async function shouldClearSession(statusCode) {
  const SAFE_TO_CLEAR = [
    DisconnectReason.loggedOut,
    DisconnectReason.badSession,
  ];

  // Only clear on definitive logout, NEVER on temp errors
  return SAFE_TO_CLEAR.includes(statusCode);
}
```

---

## Code Generation Rules

When generating code for this project, ALWAYS:

### ✅ DO:

1. **Add randomization to ALL timing**
   ```javascript
   // Every delay() call MUST use variance
   await delay(humanDelay(baseMs, 0.3));
   ```

2. **Include typing indicators for every message**
   ```javascript
   await socket.sendPresenceUpdate('composing', jid);
   // ... wait based on message length
   ```

3. **Check rate limits before sending**
   ```javascript
   if (!await rateLimiter.canSend()) {
     throw new Error('Rate limit exceeded, try later');
   }
   ```

4. **Log all activities for debugging ban causes**
   ```javascript
   logger.info({ jid, msgLength, delay, hourlyCount }, 'Message sent');
   ```

5. **Handle errors gracefully without rapid retries**
   ```javascript
   // Use exponential backoff, not immediate retry
   ```

### ❌ NEVER:

1. **Use fixed delay values**
   ```javascript
   await delay(1500);  // FORBIDDEN
   ```

2. **Send messages without typing simulation**
   ```javascript
   await socket.sendMessage(jid, { text });  // FORBIDDEN without composing
   ```

3. **Hardcode browser fingerprints**
   ```javascript
   browser: ['Ubuntu', 'Chrome', '124.0']  // FORBIDDEN
   ```

4. **Implement bulk/broadcast sending**
   ```javascript
   for (const user of users) {  // FORBIDDEN - triggers ML detection
     await sendMessage(user, sameContent);
   }
   ```

5. **Skip rate limiting checks**
   - ALWAYS enforce hourly/daily limits

6. **Use predictable reconnection**
   ```javascript
   setTimeout(reconnect, 5000);  // FORBIDDEN - use jitter
   ```

---

## Quick Reference: Safe Operating Parameters

| Parameter | Minimum | Recommended | Maximum |
|-----------|---------|-------------|---------|
| Typing duration | 1 sec | 2-4 sec | 8 sec |
| Message interval | 30 sec | 60-120 sec | - |
| Delay variance | ±20% | ±30-40% | ±50% |
| Messages/hour (new) | - | 5 | 10 |
| Messages/hour (mature) | - | 20 | 30 |
| Messages/day | - | 100 | 200 |
| Response rate target | 50% | 70%+ | - |
| Session age for trust | 30 days | 180 days | - |

---

## Emergency: If Account Gets Flagged

1. **STOP all automation immediately**
2. **Enter "hibernation mode"** - only respond to incoming messages
3. **Wait 48-72 hours** with minimal activity
4. **Use casual, human language only**
5. **Contact only existing/trusted contacts**
6. **DO NOT clear sessions** (makes it worse)
7. **DO NOT try to create new linked device**

If permanently banned:
- Wait 90+ days before using same phone number
- Use completely different device
- Different IP/network
- Fresh SIM card from different carrier

---

## References

- [WhatsApp Terms of Service](https://www.whatsapp.com/legal/terms-of-service)
- [Baileys GitHub Issues on Bans](https://github.com/WhiskeySockets/Baileys/issues/1869)
- [WhatsApp Anti-Spam Detection Methods](https://techcrunch.com/2017/02/02/how-whatsapp-is-fighting-spam-after-its-encryption-rollout/)
- [Device Fingerprinting Research](https://medium.com/@TalBeerySec/i-know-which-device-you-used-last-summer-fingerprinting-whatsapp-users-devices-71b21ac8dc70)
- [Account Warming Best Practices](https://whatsnap.ai/blog/warmup-whatsapp-without-getting-banned)
