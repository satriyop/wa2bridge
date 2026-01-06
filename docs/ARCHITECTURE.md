# WA2Bridge Architecture

This document provides an overview of the wa2bridge system architecture, explaining how components interact and data flows through the system.

## High-Level Architecture

```
                         Laravel Application
                         (whatsapp2app)
                               │
                         HTTP API Calls
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        WA2BRIDGE                                │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                      src/api.js                          │  │
│  │              Express Server + Middleware                  │  │
│  │         (CORS, Auth, Rate Limiting, SSE)                 │  │
│  └─────────────────────────┬────────────────────────────────┘  │
│                            │                                    │
│  ┌─────────────────────────┼────────────────────────────────┐  │
│  │                   src/routes/                             │  │
│  │  ┌────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │  │
│  │  │  core  │ │ anti-ban │ │ recovery │ │   analytics   │  │  │
│  │  └────────┘ └──────────┘ └──────────┘ └───────────────┘  │  │
│  │  ┌────────┐ ┌──────────┐ ┌──────────┐                    │  │
│  │  │security│ │automation│ │ webhooks │                    │  │
│  │  └────────┘ └──────────┘ └──────────┘                    │  │
│  └─────────────────────────┬────────────────────────────────┘  │
│                            │                                    │
│  ┌─────────────────────────┼────────────────────────────────┐  │
│  │               src/whatsapp/                               │  │
│  │                                                           │  │
│  │  ┌─────────────────────────────────────────────────────┐ │  │
│  │  │              WhatsAppClient (Facade)                 │ │  │
│  │  └──────────┬──────────────┬──────────────┬────────────┘ │  │
│  │             │              │              │               │  │
│  │  ┌──────────▼───┐  ┌───────▼──────┐  ┌───▼────────────┐ │  │
│  │  │ Connection   │  │  Message     │  │  AntiBan       │ │  │
│  │  │ Manager      │  │  Handler     │  │  Orchestrator  │ │  │
│  │  └──────────────┘  └──────────────┘  └────────────────┘ │  │
│  │                                              │            │  │
│  └──────────────────────────────────────────────┼────────────┘  │
│                                                 │               │
│  ┌──────────────────────────────────────────────▼────────────┐  │
│  │                    src/anti-ban/                          │  │
│  │                                                           │  │
│  │    40 specialized components organized into categories:   │  │
│  │                                                           │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │  │
│  │  │     core     │ │rate-limiting │ │   presence   │      │  │
│  │  │  (timing,    │ │  (message,   │ │  (manager,   │      │  │
│  │  │ fingerprint) │ │ reconnect)   │ │   typing)    │      │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘      │  │
│  │                                                           │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │  │
│  │  │  detection   │ │   message    │ │   patterns   │      │  │
│  │  │ (ban-warn,   │ │  (variator,  │ │  (group,     │      │  │
│  │  │  block)      │ │   emoji)     │ │  weekend)    │      │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘      │  │
│  │                                                           │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │  │
│  │  │   contact    │ │   tracking   │ │   session    │      │  │
│  │  │  (warmup,    │ │  (delivery,  │ │  (backup,    │      │  │
│  │  │  scoring)    │ │  reactions)  │ │  restore)    │      │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘      │  │
│  │                                                           │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │  │
│  │  │    queue     │ │   webhook    │ │   network    │      │  │
│  │  │ (persistent, │ │  (manager,   │ │   (geo,      │      │  │
│  │  │  scheduled)  │ │   retry)     │ │ fingerprint) │      │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘      │  │
│  │                                                           │  │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │  │
│  │  │  analytics   │ │   security   │ │  automation  │      │  │
│  │  │  (language,  │ │ (ip-whitelist│ │(auto-respond,│      │  │
│  │  │  sentiment)  │ │   audit)     │ │  templates)  │      │  │
│  │  └──────────────┘ └──────────────┘ └──────────────┘      │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    @whiskeysockets/baileys                │  │
│  │                  (WhatsApp Web Protocol)                  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                               │
                         WebSocket
                               ▼
                      WhatsApp Servers
```

## Module Responsibilities

### Core Modules

| Module | File | Responsibility |
|--------|------|----------------|
| **API Server** | `src/api.js` | Express server, middleware, SSE, health endpoints |
| **WhatsApp Client** | `src/whatsapp/WhatsAppClient.js` | Public facade, backward-compatible getters |
| **Connection Manager** | `src/whatsapp/ConnectionManager.js` | Baileys socket lifecycle, reconnection |
| **Message Handler** | `src/whatsapp/MessageHandler.js` | Send/receive with anti-ban protection |
| **AntiBan Orchestrator** | `src/whatsapp/AntiBanOrchestrator.js` | Initialize and coordinate 40 components |
| **Status Aggregator** | `src/whatsapp/StatusAggregator.js` | Collect status from all components |
| **Configuration** | `src/config.js` | Centralized config with validation |

### Route Modules

| Module | File | Endpoints |
|--------|------|-----------|
| **Core** | `src/routes/core.js` | `/api/status`, `/api/send`, `/api/reconnect` |
| **Anti-Ban** | `src/routes/anti-ban.js` | Delivery, warmup, queue, spam detection |
| **Recovery** | `src/routes/recovery.js` | Block detection, session backup, health |
| **Analytics** | `src/routes/analytics.js` | Analytics, scoring, sentiment |
| **Security** | `src/routes/security.js` | IP whitelist, audit, rate limiting |
| **Automation** | `src/routes/automation.js` | Auto-responder, templates, scheduled |
| **Webhooks** | `src/routes/webhooks.js` | Webhook management, events, SSE |

### Anti-Ban Component Categories

| Category | Components | Purpose |
|----------|------------|---------|
| **core** | timing, fingerprint, safety | Human-like timing, browser rotation |
| **rate-limiting** | message-limiter, reconnection, activity | Enforce message limits by account age |
| **presence** | manager, typing | Typing indicators, online presence |
| **detection** | ban-warning, block, spam, health | Detect potential ban signals |
| **message** | variator, splitter, emoji | Natural message variations |
| **patterns** | group, forward, weekend, activity-ramp | Behavioral patterns |
| **contact** | warmup, conversation, scoring | Contact relationship tracking |
| **tracking** | delivery, reactions, status, profile | Message delivery monitoring |
| **session** | manager | Session backup/restore |
| **queue** | persistent, scheduler, scheduled | Message queuing with persistence |
| **webhook** | manager | Outbound webhook with retry |
| **network** | fingerprint, geo | Network identity rotation |
| **analytics** | language, messages, sentiment | Message analysis |
| **security** | ip-whitelist, audit, api-rate-limit | API security |
| **automation** | auto-responder, templates | Automated responses |

## Data Flow: Sending a Message

```
POST /api/send { to, message }
         │
         ▼
┌────────────────────────────┐
│   1. API Authentication    │  Bearer token validation
└────────────┬───────────────┘
             ▼
┌────────────────────────────┐
│   2. IP Rate Limiting      │  Per-IP request throttling
└────────────┬───────────────┘
             ▼
┌────────────────────────────┐
│   3. Ban Warning Check     │  Block if hibernation mode
└────────────┬───────────────┘
             ▼
┌────────────────────────────┐
│   4. Message Rate Limit    │  Check hourly/daily limits
└────────────┬───────────────┘
             ▼
┌────────────────────────────┐
│   5. Contact Warmup        │  Check new contact limits
└────────────┬───────────────┘
             ▼
┌────────────────────────────┐
│   6. Weekend/Holiday       │  Apply timing multipliers
│      Pattern Check         │
└────────────┬───────────────┘
             ▼
┌────────────────────────────┐
│   7. Message Variation     │  Add natural variations
└────────────┬───────────────┘
             ▼
┌────────────────────────────┐
│   8. Human Delay           │  Randomized timing (±40%)
└────────────┬───────────────┘
             ▼
┌────────────────────────────┐
│   9. Typing Indicator      │  Show "composing" status
└────────────┬───────────────┘
             ▼
┌────────────────────────────┐
│  10. Send via Baileys      │  WhatsApp Web protocol
└────────────┬───────────────┘
             ▼
┌────────────────────────────┐
│  11. Track Delivery        │  Monitor delivery status
└────────────┬───────────────┘
             ▼
┌────────────────────────────┐
│  12. Update Analytics      │  Record metrics
└────────────┬───────────────┘
             ▼
┌────────────────────────────┐
│  13. Emit Webhook          │  Notify Laravel app
└────────────────────────────┘
```

## Key Design Patterns

### Facade Pattern
`WhatsAppClient` provides a simple public interface while delegating to specialized internal modules:
- `ConnectionManager` - handles Baileys socket
- `MessageHandler` - handles message flow
- `AntiBanOrchestrator` - manages 40 components

### Dependency Injection
Components receive dependencies through constructor options rather than importing directly, enabling:
- Easy testing with mocks
- Flexible configuration
- Loose coupling

### LRU Eviction
In-memory caches use LRU (Least Recently Used) eviction to prevent unbounded memory growth:
- `src/utils/lru-map.js` - Map with size limits
- Applied to: IP rate limits, conversation memory, analytics

### Timer Registry
Centralized timer management ensures proper cleanup:
- `src/utils/timer-registry.js` - tracks all setInterval/setTimeout
- Called during `disconnect()` to prevent memory leaks

## File Organization

```
src/
├── index.js              # Entry point, starts Express server
├── api.js                # Express app, middleware, infrastructure
├── config.js             # Centralized configuration
├── errors.js             # Custom error classes
├── whatsapp.js           # Re-export for backward compatibility
│
├── whatsapp/             # WhatsApp client module
│   ├── index.js          # Barrel exports
│   ├── WhatsAppClient.js # Public facade
│   ├── ConnectionManager.js
│   ├── MessageHandler.js
│   ├── AntiBanOrchestrator.js
│   └── StatusAggregator.js
│
├── routes/               # API route modules
│   ├── index.js          # Barrel exports
│   ├── core.js           # /api/status, /api/send
│   ├── anti-ban.js       # /api/delivery, /api/warmup
│   ├── recovery.js       # /api/block, /api/session
│   ├── analytics.js      # /api/analytics, /api/scoring
│   ├── security.js       # /api/ip-whitelist, /api/audit
│   ├── automation.js     # /api/auto-responder, /api/templates
│   └── webhooks.js       # /api/webhook, /events
│
├── anti-ban/             # 40 anti-ban components
│   ├── index.js          # Barrel exports
│   ├── core/             # timing.js, fingerprint.js, safety.js
│   ├── rate-limiting/    # message-limiter.js, reconnection.js
│   ├── presence/         # manager.js, typing.js
│   ├── detection/        # ban-warning.js, block.js, spam.js
│   ├── message/          # variator.js, splitter.js, emoji.js
│   ├── patterns/         # group.js, forward.js, weekend.js
│   ├── contact/          # warmup.js, conversation.js, scoring.js
│   ├── tracking/         # delivery.js, reactions.js, status.js
│   ├── session/          # manager.js
│   ├── queue/            # persistent.js, scheduler.js, scheduled.js
│   ├── webhook/          # manager.js
│   ├── network/          # fingerprint.js, geo.js
│   ├── analytics/        # language.js, messages.js, sentiment.js
│   ├── security/         # ip-whitelist.js, audit.js, api-rate-limit.js
│   └── automation/       # auto-responder.js, templates.js
│
├── middleware/           # Express middleware
│   ├── errors.js         # Error handling middleware
│   └── handler.js        # wrapHandler pattern
│
└── utils/                # Utility modules
    ├── timer-registry.js # Centralized timer management
    └── lru-map.js        # Map with LRU eviction
```

## Integration with Laravel

The Laravel application (`whatsapp2app`) connects via HTTP:

```
Laravel                          wa2bridge
───────                          ─────────
BaileysBridgeAdapter  ────────►  GET  /api/status
                      ────────►  POST /api/send
                      ────────►  POST /api/reconnect
                      ◄────────  Webhook events
```

Required environment variables must match:
- Laravel: `WA_BRIDGE_SECRET` = wa2bridge: `API_SECRET`
- Laravel: `WA_BRIDGE_URL` = wa2bridge: host:port

## Related Documentation

- [Anti-Ban System](./ANTI-BAN-SYSTEM.md) - Detailed explanation of 6-phase protection
- [API Reference](./API-REFERENCE.md) - Complete endpoint documentation
- [Configuration](./CONFIGURATION.md) - Environment variables and tuning
- [Developer Guide](./DEVELOPER-GUIDE.md) - How to extend the system
