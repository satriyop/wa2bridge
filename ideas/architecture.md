architecture.md

Complete Architecture

  ┌─────────────────────────────────────────────────────────────────────────┐
  │                         Laravel Application                             │
  │                                                                         │
  │  ┌─────────────────────────────────────────────────────────────────┐   │
  │  │                   WhatsAppBridgeInterface                        │   │
  │  │  • sendMessage()  • getStatus()  • getQrCode()  • isConnected() │   │
  │  └─────────────────────────────────────────────────────────────────┘   │
  │                              │                                          │
  │        ┌─────────────────────┼─────────────────────┐                   │
  │        ▼                     ▼                     ▼                   │
  │  ┌───────────┐       ┌─────────────┐       ┌─────────────┐            │
  │  │ Baileys   │       │ Evolution   │       │   WAHA      │            │
  │  │ Adapter   │       │ Adapter     │       │  Adapter    │            │
  │  └─────┬─────┘       └──────┬──────┘       └──────┬──────┘            │
  └────────┼────────────────────┼────────────────────┼──────────────────────┘
           │                    │                    │
           ▼                    ▼                    ▼
  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
  │   wa2bridge/    │  │  Evolution API  │  │      WAHA       │
  │   (Node.js)     │  │    (Docker)     │  │    (Docker)     │
  │                 │  │                 │  │                 │
  │ ┌─────────────┐ │  │  Uses Baileys   │  │ Uses ww-web.js  │
  │ │  Baileys    │ │  │  internally     │  │ internally      │
  │ │    OR       │ │  │                 │  │                 │
  │ │ ww-web.js   │ │  │                 │  │                 │
  │ └─────────────┘ │  │                 │  │                 │
  └─────────────────┘  └─────────────────┘  └─────────────────┘

  Driver Comparison

  | Driver    | Deployment    | Docker    | Cost                 | Best For                   |
  |-----------|---------------|-----------|----------------------|----------------------------|
  | baileys   | Node.js       | No        | Free                 | Development, simple setups |
  | evolution | Docker/Native | Preferred | Free                 | Production, multi-instance |
  | waha      | Docker        | Yes       | Core free, Plus paid | Production, enterprise     |

  Switching Drivers

  # .env - just change one line:

  # Development (our Node.js bridge)
  WA_BRIDGE_DRIVER=baileys

  # Production Option 1: Evolution API
  WA_BRIDGE_DRIVER=evolution

  # Production Option 2: WAHA
  WA_BRIDGE_DRIVER=waha




   Architecture Created

  ┌─────────────────────────────────────────────────────────┐
  │                    Laravel Application                  │
  │                                                         │
  │  Jobs/Controllers/Services                              │
  │         │                                               │
  │         ▼                                               │
  │  WhatsAppBridgeInterface  ◄─── Dependency Injection    │
  │         │                                               │
  └─────────┼───────────────────────────────────────────────┘
            │
            ▼ (resolved by ServiceProvider based on config)
  ┌─────────────────────┬──────────────────────────────────┐
  │  BaileysBridgeAdapter│  EvolutionApiBridgeAdapter      │
  │  (WA_BRIDGE_DRIVER=  │  (WA_BRIDGE_DRIVER=evolution)   │
  │   baileys)           │                                  │
  └─────────┬───────────┴──────────────┬───────────────────┘
            │                          │
            ▼                          ▼
      wa2bridge/               Evolution API
      (Node.js)                (Docker/Native)