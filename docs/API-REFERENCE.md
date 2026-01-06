# WA2Bridge API Reference

Complete documentation for all API endpoints.

## Base URL

```
http://localhost:3001
```

## Authentication

Protected endpoints require Bearer token authentication:

```bash
Authorization: Bearer YOUR_API_SECRET
```

The `API_SECRET` environment variable must match between wa2bridge and the Laravel application.

## Response Format

All endpoints return JSON. Successful responses include relevant data. Error responses follow this format:

```json
{
  "error": "Error Type",
  "message": "Human-readable description",
  "code": "ERROR_CODE"
}
```

## HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Validation error (bad request) |
| 401 | Unauthorized (invalid/missing token) |
| 404 | Not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

## Health Endpoints

No authentication required.

### GET /health

Liveness probe - check if the service is running.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-06T10:00:00.000Z",
  "uptime": 3600.5,
  "memory": {
    "heapUsed": 45,
    "heapTotal": 60,
    "rss": 80
  }
}
```

### GET /health/ready

Readiness probe - check if the service is ready to handle requests.

**Response (Ready):**
```json
{
  "ready": true,
  "connected": true,
  "hibernating": false,
  "timestamp": "2025-01-06T10:00:00.000Z"
}
```

**Response (Not Ready - 503):**
```json
{
  "ready": false,
  "connected": false,
  "hibernating": false,
  "reason": "WhatsApp not connected",
  "timestamp": "2025-01-06T10:00:00.000Z"
}
```

---

## QR Code Endpoints

No authentication required (for easy pairing).

### GET /api/qr

Get QR code as JSON.

**Response (Waiting for scan):**
```json
{
  "status": "waiting_scan",
  "qr": "2@ABC123..."
}
```

**Response (Connected):**
```json
{
  "status": "connected",
  "qr": null,
  "phone": "6281234567890"
}
```

**Response (Initializing):**
```json
{
  "status": "initializing",
  "qr": null
}
```

### GET /qr

HTML page with QR code image for browser scanning.

---

## Real-Time Events

### GET /api/events

Server-Sent Events (SSE) stream for real-time updates.

**Events:**
- `connected` - SSE connection established
- `status` - Connection status changes
- `rate-limits` - Rate limit updates
- `ban-warning` - Ban risk changes
- `message-sent` - Message sent notification
- `message-received` - Incoming message notification

**Example (JavaScript):**
```javascript
const es = new EventSource('http://localhost:3001/api/events');
es.addEventListener('status', (e) => console.log(JSON.parse(e.data)));
```

---

## Core Endpoints

All require authentication.

### GET /api/status

Get comprehensive WhatsApp connection status.

**Response:**
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
    "accountAgeWeeks": 4
  },
  "activity": {
    "sent": 12,
    "received": 8,
    "responseRatio": "67%"
  },
  "reconnection": {
    "attempts": 0,
    "maxAttempts": 15
  },
  "banWarning": {
    "level": "normal",
    "hibernationMode": false
  }
}
```

### GET /api/rate-limits

Get current rate limit status.

**Response:**
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

### POST /api/send

Send a WhatsApp message with anti-ban protection.

**Request:**
```json
{
  "to": "+6281234567890",
  "message": "Hello!",
  "reply_to": "OPTIONAL_MESSAGE_ID"
}
```

**Response:**
```json
{
  "success": true,
  "messageId": "ABC123DEF456",
  "to": "+6281234567890"
}
```

**Errors:**
- `400` - Missing "to" or "message"
- `400` - Invalid phone number format
- `429` - Rate limit exceeded

### POST /api/reconnect

Disconnect and reconnect to WhatsApp.

**Response:**
```json
{
  "status": "reconnecting",
  "delayMs": 3200
}
```

### POST /api/account-age

Set account age (adjusts rate limits).

**Request:**
```json
{
  "weeks": 8
}
```

**Response:**
```json
{
  "success": true,
  "accountAgeWeeks": 8,
  "newLimits": {
    "hourly": 30,
    "daily": 150,
    "minIntervalMs": 30000
  }
}
```

### GET /api/ban-warning

Get ban warning status and metrics.

**Response:**
```json
{
  "banWarning": {
    "level": "normal",
    "hibernationMode": false,
    "deliveryFailureRate": "5%",
    "rateLimitHits": 0,
    "connectionDrops": 0,
    "blockedByRecipients": 0
  },
  "presence": {
    "isOnline": true,
    "lastOnline": "2025-01-06T10:00:00.000Z"
  }
}
```

### POST /api/exit-hibernation

Exit hibernation mode (manual override - use with caution).

**Response:**
```json
{
  "success": true,
  "message": "Hibernation mode disabled. Proceed with caution.",
  "banWarning": { ... }
}
```

### POST /api/reset-ban-warning

Reset ban warning metrics after recovery.

**Response:**
```json
{
  "success": true,
  "message": "Ban warning metrics reset",
  "banWarning": { ... }
}
```

### POST /api/presence

Manually set online/offline status.

**Request:**
```json
{
  "status": "online"
}
```

**Response:**
```json
{
  "success": true,
  "presence": {
    "isOnline": true,
    "lastOnline": "2025-01-06T10:00:00.000Z"
  }
}
```

---

## Anti-Ban Endpoints

### GET /api/delivery-health

Get message delivery health metrics.

### GET /api/contact-warmup/:phone

Get warmup status for a specific contact.

**Response:**
```json
{
  "phone": "6281234567890",
  "warmupPhase": "normal",
  "messageCount": 15,
  "firstContact": "2025-01-01T00:00:00.000Z",
  "canMessage": true,
  "dailyRemaining": 18
}
```

### POST /api/queue

Queue a message for optimal timing.

**Request:**
```json
{
  "to": "+6281234567890",
  "message": "Hello!",
  "reply_to": "OPTIONAL_MESSAGE_ID",
  "priority": "normal"
}
```

Priority values: `low`, `normal`, `high`

**Response:**
```json
{
  "success": true,
  "queued": true,
  "queuedMessageId": "q_123456",
  "queueStatus": {
    "pending": 5,
    "processing": 1
  }
}
```

### GET /api/queue-status

Get message queue status.

### POST /api/queue-clear

Clear all queued messages.

### GET /api/weekend-patterns

Get weekend/holiday pattern status.

**Response:**
```json
{
  "isWeekend": false,
  "isHoliday": false,
  "activityMultiplier": 1.0,
  "delayMultiplier": 1.0
}
```

### GET /api/activity-ramp

Get activity ramp status (post-downtime).

### GET /api/network-health

Get network fingerprint health.

### GET /api/spam-detection

Get spam detection metrics.

### GET /api/geo-match

Get geo IP matching status.

### GET /api/conversation/:phone

Get conversation context for a contact.

**Response:**
```json
{
  "phone": "6281234567890",
  "messageCount": 15,
  "lastMessage": "2025-01-06T10:00:00.000Z",
  "messages": [
    { "direction": "incoming", "text": "Hi!", "timestamp": "..." },
    { "direction": "outgoing", "text": "Hello!", "timestamp": "..." }
  ]
}
```

### GET /api/conversations-active

Get all active conversations.

### GET /api/status-viewer

Get status viewer metrics.

### POST /api/reply-check

Check reply probability for a message.

**Request:**
```json
{
  "text": "Can you help me?",
  "from": "6281234567890"
}
```

**Response:**
```json
{
  "shouldReply": true,
  "probability": 0.85,
  "reasons": ["question_detected", "trusted_contact"]
}
```

---

## Recovery Endpoints

### GET /api/block-detection/:phone

Check if blocked by a contact.

### GET /api/session/info

Get session information.

### POST /api/session/backup

Create session backup.

### POST /api/session/restore

Restore from backup.

### GET /api/persistent-queue

Get persistent queue status.

### POST /api/persistent-queue

Add to persistent queue.

### DELETE /api/persistent-queue/:id

Remove from persistent queue.

### GET /api/health/metrics

Get health monitor metrics.

---

## Analytics Endpoints

### GET /api/analytics

Get overall analytics.

### GET /api/analytics/peak-hours

Get peak messaging hours.

### GET /api/analytics/:phone

Get analytics for a specific contact.

### GET /api/scoring

Get contact scores.

### GET /api/scoring/top

Get top contacts by score.

### GET /api/scoring/attention

Get contacts needing attention.

### GET /api/scoring/:phone

Get score for a specific contact.

### POST /api/sentiment/analyze

Analyze sentiment of text.

**Request:**
```json
{
  "text": "Thank you so much!"
}
```

**Response:**
```json
{
  "sentiment": "positive",
  "score": 0.85,
  "keywords": ["thank", "you"]
}
```

### GET /api/sentiment/:phone

Get sentiment history for a contact.

---

## Security Endpoints

### GET /api/security/ip-whitelist

Get IP whitelist status.

### POST /api/security/ip-whitelist

Add IP to whitelist.

**Request:**
```json
{
  "ip": "192.168.1.100",
  "description": "Office server"
}
```

### DELETE /api/security/ip-whitelist/:ip

Remove IP from whitelist.

### GET /api/security/audit

Get audit logs.

### GET /api/security/rate-limiter

Get API rate limiter status.

---

## Automation Endpoints

### GET /api/auto-responder

Get auto-responder status and rules.

### POST /api/auto-responder/toggle

Enable/disable auto-responder.

**Request:**
```json
{
  "enabled": true
}
```

### POST /api/auto-responder/rules

Add auto-responder rule.

**Request:**
```json
{
  "trigger": "keyword",
  "pattern": "hello",
  "response": "Hi! How can I help you?",
  "active": true
}
```

### PUT /api/auto-responder/rules/:id

Update auto-responder rule.

### DELETE /api/auto-responder/rules/:id

Delete auto-responder rule.

### GET /api/templates

Get message templates.

### POST /api/templates

Create message template.

**Request:**
```json
{
  "name": "greeting",
  "content": "Hello {{name}}, welcome to our service!",
  "category": "welcome",
  "language": "id"
}
```

### POST /api/templates/render

Render template with variables.

**Request:**
```json
{
  "name": "greeting",
  "variables": {
    "name": "John"
  }
}
```

**Response:**
```json
{
  "success": true,
  "rendered": "Hello John, welcome to our service!"
}
```

### DELETE /api/templates/:name

Delete template.

### GET /api/scheduled

Get scheduled messages.

### GET /api/scheduled/stats

Get scheduled messages stats.

### POST /api/scheduled

Schedule a message.

**Request:**
```json
{
  "to": "+6281234567890",
  "message": "Happy birthday!",
  "sendAt": "2025-01-15T08:00:00.000Z",
  "repeat": "yearly"
}
```

### DELETE /api/scheduled/:id

Cancel scheduled message.

---

## Webhook Endpoints

### GET /api/webhooks

Get webhook status.

### GET /api/webhooks/history

Get webhook event history.

### GET /api/webhooks/events

Get available webhook event types.

**Response:**
```json
{
  "events": {
    "message": ["message.received", "message.sent", "message.delivered", "message.read", "message.failed"],
    "presence": ["presence.online", "presence.offline", "presence.typing", "presence.recording"],
    "connection": ["connection.open", "connection.close", "connection.qr_update", "connection.logged_out"],
    "contact": ["contact.profile_update", "contact.blocked", "contact.unblocked"],
    "status": ["status.view", "status.reaction"],
    "antiban": ["antiban.warning", "antiban.hibernation", "antiban.rate_limit"]
  }
}
```

### POST /api/webhooks/subscribe

Subscribe to webhook events.

**Request:**
```json
{
  "events": ["message.received", "message.sent"]
}
```

### POST /api/webhooks/unsubscribe

Unsubscribe from webhook events.

### POST /api/webhooks/toggle

Enable/disable webhooks.

**Request:**
```json
{
  "enabled": true
}
```

### GET /api/webhooks/retries

Get pending webhook retries.

### POST /api/webhooks/retries

Process pending webhook retries.

### POST /api/webhooks/test

Send test webhook event.

---

## Swagger Documentation

Interactive API documentation is available at:

```
http://localhost:3001/api-docs
```

---

## Related Documentation

- [Architecture](./ARCHITECTURE.md) - System overview
- [Anti-Ban System](./ANTI-BAN-SYSTEM.md) - Protection details
- [Configuration](./CONFIGURATION.md) - Environment variables
- [Developer Guide](./DEVELOPER-GUIDE.md) - Extending the API
