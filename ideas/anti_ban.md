  Implementation Complete

  All files have been updated with comprehensive anti-ban protection. Here's what was changed:

  Files Modified/Created

  | File            | Changes                                   |
  |-----------------|-------------------------------------------|
  | src/anti-ban.js | NEW - Core anti-ban utilities module      |
  | src/whatsapp.js | Complete rewrite with human-like behavior |
  | src/api.js      | Added rate limit endpoints                |
  | src/index.js    | Added anti-ban config & startup info      |
  | .env.example    | Added ACCOUNT_AGE_WEEKS config            |
  | CLAUDE.md       | Updated API docs                          |

  Anti-Ban Features Implemented

  | Feature    | Before                      | After                              |
  |------------|-----------------------------|------------------------------------|
  | Delays     | Fixed 1500ms                | Randomized 1050-1950ms (±30%)      |
  | Typing     | Fixed 500ms                 | Dynamic based on message length    |
  | Browser    | Hardcoded Ubuntu/Chrome/124 | Rotates every 24-48 hours          |
  | Reconnect  | Fixed 1s, 2s, 3s, 5s        | Exponential backoff with jitter    |
  | Rate Limit | None                        | Hourly/Daily limits by account age |
  | Activity   | None                        | Response ratio tracking            |

  New API Endpoints

  GET  /api/rate-limits    - Check current rate limit status
  POST /api/account-age    - Adjust limits based on account age

  Usage

  1. Set your account age in .env:
  ACCOUNT_AGE_WEEKS=4  # Adjust based on your actual account age
  2. Rate limits auto-apply:
    - Week 1: 5/hour, 15/day (new account)
    - Week 2-4: 15/hour, 40/day (warming)
    - Month 2+: 30/hour, 150/day (mature)
  3. Monitor via API:
  curl -H "Authorization: Bearer $SECRET" http://localhost:3001/api/rate-limits




    New Features Added

  | Feature                   | What It Does                                                                                                       |
  |---------------------------|--------------------------------------------------------------------------------------------------------------------|
  | Online Presence Patterns  | Cycles online/offline (5-45min on, 2-15min off). Stays offline during sleep hours (11PM-7AM default).              |
  | Ban Early Warning System  | Tracks delivery failures, rate limits, connection drops, blocks. Auto-enters "hibernation mode" at CRITICAL level. |
  | Message Variation         | Varies punctuation, greetings, Indonesian casual words. Prevents content-based detection.                          |
  | Read Receipt + Read Delay | Marks messages as "read" after realistic delay (~300ms/word). Simulates thinking before typing.                    |

  New API Endpoints

  GET  /api/ban-warning        - View ban warning metrics & risk level
  POST /api/exit-hibernation   - Exit hibernation mode (manual override)
  POST /api/reset-ban-warning  - Reset warning metrics after recovery
  POST /api/presence           - Manually set online/offline status

  New Environment Variables

  ACTIVE_HOURS_START=7    # Bot appears "online" starting 7 AM
  ACTIVE_HOURS_END=23     # Bot goes "offline" at 11 PM

  Ban Warning Levels

  | Level    | Risk Score | Action                                       |
  |----------|------------|----------------------------------------------|
  | NORMAL   | 0          | All systems go                               |
  | ELEVATED | 1-2        | Monitor closely                              |
  | HIGH     | 3-4        | Reduce activity                              |
  | CRITICAL | 5+         | Auto-hibernation - only responds to incoming |

  Message Flow (with all protections)

  Incoming Message
      ↓
  [Mark as "read" after read delay (1-8 sec)]
      ↓
  [Webhook to Laravel]
      ↓
  Response Ready
      ↓
  [Check ban warning level]
      ↓
  [Check rate limits]
      ↓
  [Apply message variation]
      ↓
  [Go online if needed]
      ↓
  [Simulate read + think time]
      ↓
  [Show "composing" indicator]
      ↓
  [Type for duration based on length]
      ↓
  [Send varied message]
      ↓
  [Record metrics for ban warning]
      ↓
  [Return to offline cycle]


    Anti-Ban Components Overview

  1. Rate Limiter (src/anti-ban.js)

  ┌─────────────────────────────────────────────────────┐
  │                   Rate Limiter                       │
  ├─────────────────────────────────────────────────────┤
  │  Hourly Window    │  Max 30 msgs/hour (configurable)│
  │  Daily Window     │  Max 150 msgs/day               │
  │  Cooldown         │  Auto-pause when approaching    │
  │  Window Reset     │  Sliding window, not fixed      │
  └─────────────────────────────────────────────────────┘

  Key Logic: Uses timestamps array, filters to window, counts against limit.

  2. Ban Warning System (src/anti-ban.js)

  Risk Levels:
    normal   → riskScore < 30  → Green light
    elevated → riskScore 30-60 → Slow down
    high     → riskScore 60-80 → Pause recommended
    critical → riskScore > 80  → Auto-hibernate

  Factors: Message velocity, error rate, rate limit hits, time since last warning.

  3. Typing Simulator (src/anti-ban.js)

  Simulates human typing:
    1. composing presence (shows "typing...")
    2. Variable delay based on message length
    3. Random hesitation pauses
    4. Occasional "paused" state (thinking)

  4. Contact Warmup (src/anti-ban.js)

  New Contact Flow:
    Day 1-3:  Max 3 messages, long delays
    Day 4-7:  Max 10 messages, medium delays
    Day 8+:   Normal limits

  Purpose: WhatsApp flags accounts that blast new contacts immediately.

