# WA2Bridge

Enterprise WhatsApp Bridge with Anti-Ban Protection for WhatsApp2App Laravel application.

## Features

- **Anti-Ban Protection** - Human-like delays, rate limiting, presence simulation
- **REST API** - Simple HTTP endpoints for sending messages
- **Webhook Events** - 17+ event types for incoming messages, status changes
- **Vue Dashboard** - Real-time monitoring UI
- **Interactive CLI** - Terminal-based debugging and testing
- **Swagger Docs** - OpenAPI documentation at `/api-docs`

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Start the server
npm start
```

## Configuration

Create `.env` file (see `.env.example`):

```env
# Server
PORT=3005                    # API server port
HOST=0.0.0.0

# Authentication
API_SECRET=your-secret-key   # Must match Laravel's WA_BRIDGE_SECRET

# Laravel Webhook
WEBHOOK_URL=http://your-laravel-app/api/webhook/whatsapp

# Anti-Ban Settings
ACCOUNT_AGE_WEEKS=4          # Your WhatsApp account age (affects rate limits)
MESSAGE_DELAY_MS=1500        # Base delay between messages
ACTIVE_HOURS_START=7         # Presence simulation start (24h)
ACTIVE_HOURS_END=23          # Presence simulation end (24h)
```

### Rate Limits by Account Age

| Account Age | Hourly Limit | Daily Limit |
|-------------|--------------|-------------|
| Week 1 (new) | 5 msgs | 15 msgs |
| Week 2-4 | 15 msgs | 40 msgs |
| Month 2+ | 30 msgs | 150 msgs |

## Running

### API Server

```bash
npm start          # Production
npm run dev        # Development (auto-reload)
```

### CLI Tool

```bash
npm run cli
```

Available commands:
- `status` - Connection status
- `qr` - Display QR code for pairing
- `send <phone> <message>` - Send test message
- `limits` - Show rate limit status
- `ban` - Show ban risk metrics
- `health` - Health check

### Dashboard

```bash
cd dashboard
npm install
npm run dev        # Development at http://localhost:5173
npm run build      # Production build
```

## API Endpoints

### Public (No Auth)

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /api/qr` | Get QR code for pairing |
| `GET /qr` | QR code HTML page |

### Protected (Bearer Token)

| Endpoint | Description |
|----------|-------------|
| `GET /api/status` | Connection status |
| `POST /api/send` | Send message |
| `POST /api/reconnect` | Reconnect WhatsApp |
| `GET /api/rate-limits` | Rate limit status |
| `GET /api/ban-warning` | Ban risk metrics |
| `GET /api/webhooks` | Webhook configuration |

### Send Message

```bash
curl -X POST http://localhost:3005/api/send \
  -H "Authorization: Bearer your-secret-key" \
  -H "Content-Type: application/json" \
  -d '{"to": "+6281234567890", "message": "Hello!"}'
```

Response:
```json
{
  "success": true,
  "messageId": "ABC123",
  "to": "+6281234567890"
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Laravel (whatsapp2app)                     │
│              WA_BRIDGE_URL environment                  │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP API
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    WA2Bridge                            │
│                                                         │
│   ┌──────────┐  ┌──────────┐  ┌──────────────────┐     │
│   │ Express  │  │ Anti-Ban │  │ Baileys WhatsApp │     │
│   │   API    │  │  Engine  │  │     Client       │     │
│   └──────────┘  └──────────┘  └──────────────────┘     │
│                                                         │
│   ┌──────────┐  ┌──────────┐  ┌──────────────────┐     │
│   │ Webhooks │  │   CLI    │  │ Vue Dashboard    │     │
│   └──────────┘  └──────────┘  └──────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

## Session Management

Sessions are stored in `sessions/` folder:
- `creds.json` - WhatsApp credentials
- `session-*.json` - Conversation encryption keys

**First time setup:**
1. Start the server: `npm start`
2. Open QR page: `http://localhost:3005/qr`
3. Scan with WhatsApp (Linked Devices)

**Session persists** across restarts. Only re-scan if:
- `sessions/` folder deleted
- Logged out from phone
- Session revoked by WhatsApp

## Anti-Ban Features

1. **Human-like Delays** - Randomized timing (±30-40%)
2. **Typing Indicators** - Shows "typing..." before sending
3. **Rate Limiting** - Hourly/daily limits based on account age
4. **Presence Simulation** - Online/offline during active hours
5. **Message Queue** - Prevents burst sending
6. **Ban Risk Monitoring** - Real-time risk score calculation
7. **Hibernation Mode** - Auto-pause when risk is high

## Testing

```bash
npm test              # Run tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

## Laravel Integration

In your Laravel `.env`:
```env
WA_BRIDGE_URL=http://localhost:3005
WA_BRIDGE_SECRET=your-secret-key
```

Use the `BaileysBridgeAdapter` in `app/Services/WhatsApp/`.

## Troubleshooting

### QR Code Not Showing
```bash
rm -rf sessions/*
npm start
```

### "Can't link new devices"
- Wait 15-30 minutes (WhatsApp rate limiting)
- Check if phone has max linked devices (4)

### Connection Loops
```bash
rm -rf sessions/*
npm start
```

### Port Already in Use
Change `PORT` in `.env`:
```env
PORT=3005
```

Update Laravel's `WA_BRIDGE_URL` accordingly.

## License

MIT
