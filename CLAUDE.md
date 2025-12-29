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
GET  /api/status          - Connection status (auth required)
GET  /api/qr              - QR code for pairing (no auth)
GET  /qr                  - HTML page with QR code (no auth)
POST /api/send            - Send message (auth required)
POST /api/reconnect       - Reconnect WhatsApp (auth required)
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
MESSAGE_DELAY_MS=1500        # Human-like delay
TYPING_DELAY_MS=500          # Typing indicator duration
LOG_LEVEL=info               # Logging verbosity
```

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
