application_overview.md

 WA2Bridge Application Overview

  ┌────────────────────────────────────────────────────────────────────────────┐
  │                              EXTERNAL                                      │
  │  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐        │
  │  │   Laravel    │         │   Dashboard  │         │   WhatsApp   │        │
  │  │ whatsapp2app │         │  (Vue 3)     │         │   Servers    │        │
  │  └──────┬───────┘         └──────┬───────┘         └──────┬───────┘        │
  └─────────┼────────────────────────┼────────────────────────┼────────────────┘
            │                        │                        │
            │ HTTP POST              │ HTTP GET               │ WebSocket
            │ /api/send              │ /api/status            │ (Baileys)
            ▼                        ▼                        ▼
  ┌─────────────────────────────────────────────────────────────────────────────┐
  │                         WA2BRIDGE (Node.js)                                 │
  │                                                                             │
  │  ┌───────────────────────────────────────────────────────────────────-──┐   │
  │  │                        src/index.js                                  │   │
  │  │                     (Entry Point)                                    │   │
  │  │  • Loads environment config                                          │   │
  │  │  • Creates WhatsAppClient                                            │   │
  │  │  • Creates API server                                                │   │
  │  │  • Handles graceful shutdown                                         │   │
  │  └──────────────────────────────────────────────────────────────────-───┘   │
  │                    │                           │                            │
  │                    ▼                           ▼                            │
  │  ┌─────────────────────────────┐  ┌─────────────────────────────────────┐   │
  │  │     src/whatsapp.js         │  │         src/api.js                  │   │
  │  │   (WhatsApp Client)         │  │       (HTTP API Server)             │   │
  │  │                             │  │                                     │   │
  │  │  • Connect to WhatsApp      │  │  • /health, /health/ready           │   │
  │  │  • Send/receive messages    │  │  • /api/send, /api/status           │   │
  │  │  • QR code generation       │  │  • /api/qr, /api/reconnect          │   │
  │  │  • Session management       │  │  • Rate limit endpoints             │   │
  │  │  • 6 phases of anti-ban     │  │  • Webhook endpoints                │   │
  │  └──────────────┬──────────────┘  │  • Analytics endpoints              │   │
  │                 │                 └─────────────────────────────────────┘   │
  │                 ▼                                                           │
  │  ┌──────────────────────────────────────────────────────────────────-───┐   │
  │  │                     src/anti-ban.js (6508 lines)                     │   │
  │  │                   (Anti-Ban Protection System)                       │   │
  │  │                                                                      │   │
  │  │  Phase 1: Rate limiting, human delays, fingerprint rotation          │   │
  │  │  Phase 2: Delivery tracking, weekend patterns, contact warmup        │   │
  │  │  Phase 3: Reactions, conversation memory, spam detection             │   │
  │  │  Phase 4: Block detection, session backup, persistent queue          │   │
  │  │  Phase 5: Analytics, sentiment, auto-responder, templates            │   │
  │  │  Phase 6: Enhanced webhooks (src/webhook-events.js)                  │   │
  │  └───────────────────────────────────────────────────────────────-──────┘   │
  │                                                                             │
  │  ┌───────────────────────────────────────────────────────────────-──────┐   │
  │  │                         /sessions                                    │   │
  │  │              (Persistent storage - survives restart)                 │   │
  │  │  • WhatsApp auth credentials                                         │   │
  │  │  • Rate limit counters                                               │   │
  │  │  • Contact warmup data                                               │   │
  │  │  • Analytics data                                                    │   │
  │  └───────────────────────────────────────────────────────────────-──────┘   │
  └─────────────────────────────────────────────────────────────────────────────┘

  ---
  Key Flows

  1. Sending a Message (Laravel → WhatsApp)

  Laravel POST /api/send { to, message }
           ↓
      Auth middleware (Bearer token)
           ↓
      Phone validation
           ↓
      WhatsAppClient.sendMessage()
           ↓
      Anti-ban checks (rate limit, warmup, ban warning)
           ↓
      Human-like delays + typing indicator
           ↓
      Baileys sends to WhatsApp
           ↓
      webhookEmitter.messageSent()
           ↓
      Return { success, messageId }

  2. Receiving a Message (WhatsApp → Laravel)

  WhatsApp message arrives
           ↓
      Baileys 'messages.upsert' event
           ↓
      handleIncomingMessage()
           ↓
      Anti-ban processing (analytics, sentiment, auto-reply check)
           ↓
      webhookEmitter.messageReceived()
           ↓
      onMessage callback → webhookManager.send()
           ↓
      HTTP POST to Laravel WEBHOOK_URL

  ---
  Deep Dive Suggestions

  | #   | Area           | File                    | Why                                                         |
  |-----|----------------|-------------------------|-------------------------------------------------------------|
  | 1   | Message Flow   | src/whatsapp.js:735-966 | Understand how sendMessage() works with all anti-ban layers |
  | 2   | API Endpoints  | src/api.js              | See all available endpoints and their handlers              |
  | 3   | Anti-Ban Logic | src/anti-ban.js         | Understand rate limiting, warmup, ban detection             |
  | 4   | Webhook System | src/webhook-events.js   | How events are emitted to Laravel                           |
  | 5   | Dashboard Data | dashboard/src/App.vue   | How frontend fetches and displays data                      |