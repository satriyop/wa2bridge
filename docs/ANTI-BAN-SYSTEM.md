# WA2Bridge Anti-Ban System

This document explains the comprehensive anti-ban protection system that helps prevent WhatsApp account restrictions.

## Why Anti-Ban Protection Matters

WhatsApp uses sophisticated ML-based detection to identify automated accounts:
- **87% of new accounts** get restricted in the first 72 hours
- **75%+ of bans** come from ML detection, not user reports
- **2M+ accounts** banned monthly for automation

The wa2bridge anti-ban system counters this through 6 phases of protection.

## The 6 Phases of Protection

```
Phase 1: FOUNDATION          Phase 2: BEHAVIORAL          Phase 3: CONTEXT
┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
│ - Human timing  │          │ - Contact warmup│          │ - Conversation  │
│ - Rate limiting │    →     │ - Delivery track│    →     │   memory        │
│ - Browser rotate│          │ - Weekend adjust│          │ - Spam detection│
│ - Activity track│          │ - Activity ramp │          │ - Geo matching  │
└─────────────────┘          └─────────────────┘          └─────────────────┘
         │                            │                            │
         └────────────────────────────┼────────────────────────────┘
                                      ▼
Phase 4: RECOVERY            Phase 5: INTELLIGENCE       Phase 6: INTEGRATION
┌─────────────────┐          ┌─────────────────┐          ┌─────────────────┐
│ - Block detect  │          │ - Analytics     │          │ - Webhook events│
│ - Session backup│    ←     │ - Sentiment     │    ←     │ - Health monitor│
│ - Persistent Q  │          │ - Auto-responder│          │ - IP security   │
│ - Health monitor│          │ - Templates     │          │ - Audit logging │
└─────────────────┘          └─────────────────┘          └─────────────────┘
```

---

## Phase 1: Foundation

Core components that establish human-like baseline behavior.

### 1.1 Human-Like Timing

Every delay is randomized with ±40% variance to avoid detectable patterns.

```
Fixed delay (BANNED):     1500ms, 1500ms, 1500ms, 1500ms
Human delay (SAFE):       1050ms, 1890ms, 1230ms, 1650ms
```

| Timing Type | Base Value | Variance | Actual Range |
|-------------|------------|----------|--------------|
| Message delay | 1500ms | ±40% | 900-2100ms |
| Typing indicator | Dynamic | Per char | 1000-6000ms |
| Read receipt | Per word | ~250ms/word | 500-5000ms |
| Reconnection | Exponential | +30-50% jitter | 1s-5min |

**Component**: `src/anti-ban/core/timing.js`

### 1.2 Message Rate Limiting

Limits based on account age prevent new accounts from triggering velocity detection.

| Account Age | Hourly Max | Daily Max | Min Interval |
|-------------|------------|-----------|--------------|
| Week 1 (new) | 5 | 15 | 3 minutes |
| Week 2-4 | 15 | 40 | 90 seconds |
| Month 2+ | 30 | 150 | 30 seconds |

**Component**: `src/anti-ban/rate-limiting/message-limiter.js`

### 1.3 Browser Fingerprint Rotation

Rotates device fingerprint every 24-48 hours to prevent device-based tracking.

```
Rotation pool:
├── Windows + Chrome 131.0.6778.139
├── Windows + Edge 131.0.2903.86
├── macOS + Chrome 131.0.6778.139
└── macOS + Safari 18.1.1
```

**Component**: `src/anti-ban/core/fingerprint.js`

### 1.4 Activity Tracking

Monitors sent/received ratio to ensure healthy conversation patterns.

| Metric | Warning Threshold | Target |
|--------|-------------------|--------|
| Response ratio | <50% | >70% |
| Unique recipients | Tracked | Varied |
| Unique senders | Tracked | Growing |

**Component**: `src/anti-ban/rate-limiting/activity.js`

---

## Phase 2: Behavioral Patterns

Components that simulate natural human messaging behavior.

### 2.1 Contact Warmup

New contacts receive gradual message increases over 7 days.

```
Day 1-3:   ████░░░░░░  2 msgs/day max
Day 4-7:   ██████░░░░  5 msgs/day max
Day 8+:    ██████████  20 msgs/day max
```

**Component**: `src/anti-ban/contact/warmup.js`

### 2.2 Delivery Tracking

Monitors message delivery status to detect potential issues early.

| Status | Recorded | Action |
|--------|----------|--------|
| Delivered | Yes | Normal |
| Read | Yes | Positive signal |
| Failed | Yes | Increments risk score |
| Pending (>1h) | Yes | Warning flag |

**Component**: `src/anti-ban/tracking/delivery.js`

### 2.3 Weekend & Holiday Patterns

Reduces activity during off-peak times to match human behavior.

| Period | Activity Level | Delay Multiplier |
|--------|----------------|------------------|
| Weekday | 100% | 1.0x |
| Weekend | 60% | 1.5x |
| Holiday | 40% | 2.0x |
| Late night (11PM-6AM) | 70% | 1.3x |

**Component**: `src/anti-ban/patterns/weekend.js`

### 2.4 Activity Ramping

After downtime, gradually increases activity instead of sudden burst.

```
Reconnect after 1+ hour:
  Minute 0-5:    25% speed (ramping up)
  Minute 5-15:   50% speed
  Minute 15-30:  75% speed
  Minute 30+:    100% speed
```

**Component**: `src/anti-ban/patterns/activity-ramp.js`

---

## Phase 3: Context Awareness

Components that understand conversation context.

### 3.1 Conversation Memory

Stores last 20 messages per contact for context-aware responses.

**Component**: `src/anti-ban/contact/conversation.js`

### 3.2 Spam Detection

Identifies incoming spam to avoid responding to suspicious messages.

| Signal | Weight | Action |
|--------|--------|--------|
| Links in message | High | Flag as potential spam |
| Forwarded tag | Medium | Reduce reply probability |
| Repeated content | High | Block auto-response |

**Component**: `src/anti-ban/detection/spam.js`

### 3.3 Geo Matching

Matches response timing to recipient's timezone.

**Component**: `src/anti-ban/network/geo.js`

---

## Phase 4: Recovery & Persistence

Components for handling issues and maintaining state.

### 4.1 Block Detection

Detects when recipients block the account.

| Signal | Indicates |
|--------|-----------|
| Single checkmark (persistent) | Possible block |
| Profile unavailable | Likely block |
| Status "unavailable" | Confirmed block |

**Component**: `src/anti-ban/detection/block.js`

### 4.2 Session Backup

Automatic session backup/restore to prevent loss.

```
sessions/
├── session.json          # Active session
├── session.backup.1.json # Backup 1
├── session.backup.2.json # Backup 2
└── ... (up to 5 backups)
```

**Component**: `src/anti-ban/session/manager.js`

### 4.3 Persistent Queue

Messages survive restarts with file-based persistence.

**Component**: `src/anti-ban/queue/persistent.js`

### 4.4 Health Monitor

Monitors system health metrics.

| Metric | Tracked |
|--------|---------|
| Memory usage | Yes |
| Connection uptime | Yes |
| Queue depth | Yes |
| Error rate | Yes |

**Component**: `src/anti-ban/detection/health.js`

---

## Phase 5: Intelligence

Advanced features for smarter messaging.

### 5.1 Message Analytics

Tracks messaging patterns and statistics.

**Component**: `src/anti-ban/analytics/messages.js`

### 5.2 Sentiment Detection

Basic sentiment analysis of incoming messages.

| Sentiment | Response Adjustment |
|-----------|---------------------|
| Positive | Normal speed |
| Neutral | Normal speed |
| Negative | Slower, more careful |
| Urgent | Faster response |

**Component**: `src/anti-ban/analytics/sentiment.js`

### 5.3 Auto-Responder

Configurable automatic responses for common patterns.

**Component**: `src/anti-ban/automation/auto-responder.js`

### 5.4 Message Templates

Pre-defined response templates with variation.

**Component**: `src/anti-ban/automation/templates.js`

---

## Phase 6: Integration

Components for external system integration.

### 6.1 Webhook Events

Events sent to Laravel application:

| Event | Trigger |
|-------|---------|
| `connection.open` | WhatsApp connected |
| `connection.close` | Disconnected |
| `message.received` | Incoming message |
| `message.sent` | Outgoing message sent |
| `qr.update` | New QR code generated |

**Component**: `src/anti-ban/webhook/manager.js`

### 6.2 IP Whitelist

Restricts API access to trusted IPs.

**Component**: `src/anti-ban/security/ip-whitelist.js`

### 6.3 Audit Logging

Records all API actions for security review.

**Component**: `src/anti-ban/security/audit.js`

---

## Ban Warning System

The central risk monitoring component that ties everything together.

### Warning Levels

| Level | Risk Score | Behavior |
|-------|------------|----------|
| **NORMAL** | 0 | All systems go |
| **ELEVATED** | 1-2 | Monitor closely |
| **HIGH** | 3-4 | Reduce activity, warn operator |
| **CRITICAL** | 5+ | Auto-hibernation, only respond to incoming |

### Risk Score Calculation

| Factor | Points | Threshold |
|--------|--------|-----------|
| Delivery failure rate | +2 | >20% failures |
| Rate limit hits | +2 | >3 per hour |
| Connection drops | +1 | >5 per hour |
| Blocked by users | +3 | 2+ blocks per day |

### Decision Flow

```
Outgoing Message Request
         │
         ▼
┌────────────────────────┐
│  Hibernation Mode?     │──── Yes ───► BLOCKED
└───────────┬────────────┘              "Only respond to incoming"
            │ No
            ▼
┌────────────────────────┐
│  Warning Level         │──── CRITICAL ───► BLOCKED
│  CRITICAL?             │                   "Ban risk too high"
└───────────┬────────────┘
            │ No
            ▼
┌────────────────────────┐
│  Hourly Limit?         │──── Exceeded ───► BLOCKED
│                        │                   "Try later"
└───────────┬────────────┘
            │ OK
            ▼
┌────────────────────────┐
│  Daily Limit?          │──── Exceeded ───► BLOCKED
│                        │                   "Daily limit reached"
└───────────┬────────────┘
            │ OK
            ▼
┌────────────────────────┐
│  Contact Warmup?       │──── New contact ───► Apply warmup limits
│                        │
└───────────┬────────────┘
            │
            ▼
      PROCEED WITH SEND
      (with typing simulation)
```

---

## Configuration Tuning Matrix

Match settings to your account age for optimal protection.

### Week 1 (New Account) - MAXIMUM PROTECTION

```env
ACCOUNT_AGE_WEEKS=1
MESSAGE_DELAY_MS=3000
TYPING_DELAY_MS=1000
```

| Setting | Value | Reason |
|---------|-------|--------|
| Hourly limit | 5 | ML flags high velocity new accounts |
| Daily limit | 15 | Stay well under detection threshold |
| Min interval | 3 min | Long gaps look human |
| Message delay | 3000ms | Slower is safer |

**Behavior**: Only respond to incoming messages. No outbound campaigns.

### Week 2-4 (Warming Account) - MODERATE PROTECTION

```env
ACCOUNT_AGE_WEEKS=4
MESSAGE_DELAY_MS=1500
TYPING_DELAY_MS=500
```

| Setting | Value | Reason |
|---------|-------|--------|
| Hourly limit | 15 | Account building history |
| Daily limit | 40 | Gradual increase |
| Min interval | 90 sec | More responsive |

**Behavior**: Can initiate some conversations, maintain >70% response ratio.

### Month 2+ (Mature Account) - NORMAL PROTECTION

```env
ACCOUNT_AGE_WEEKS=8
MESSAGE_DELAY_MS=1500
TYPING_DELAY_MS=500
```

| Setting | Value | Reason |
|---------|-------|--------|
| Hourly limit | 30 | Account has trust |
| Daily limit | 150 | Normal business usage |
| Min interval | 30 sec | Quick responses OK |

**Behavior**: Normal operation with all protections active.

---

## Emergency Procedures

### If Warning Level Reaches HIGH

1. Reduce message frequency immediately
2. Only respond to incoming messages
3. Wait 4-6 hours before resuming normal activity
4. Monitor delivery success rate

### If Warning Level Reaches CRITICAL

1. System auto-enters hibernation mode
2. NO outbound messages sent
3. Only responds to incoming messages
4. Wait 24-48 hours with minimal activity
5. Use `POST /api/exit-hibernation` to manually resume (risky)
6. Use `POST /api/reset-ban-warning` after recovery period

### If Account Gets Banned

1. DO NOT clear sessions immediately
2. Wait 90+ days before reusing phone number
3. Use different device/IP/carrier for new account
4. Start with Week 1 settings

---

## Monitoring Commands

```bash
# Check current ban warning status
curl -H "Authorization: Bearer $SECRET" http://localhost:3001/api/ban-warning

# Check rate limit status
curl -H "Authorization: Bearer $SECRET" http://localhost:3001/api/rate-limits

# Check full status
curl -H "Authorization: Bearer $SECRET" http://localhost:3001/api/status

# View health metrics
curl -H "Authorization: Bearer $SECRET" http://localhost:3001/api/health/metrics
```

---

## Related Documentation

- [Architecture](./ARCHITECTURE.md) - System overview
- [Configuration](./CONFIGURATION.md) - All environment variables
- [API Reference](./API-REFERENCE.md) - Endpoint documentation
- [Developer Guide](./DEVELOPER-GUIDE.md) - Extending the system
