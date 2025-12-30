import 'dotenv/config';
import WhatsAppClient from './whatsapp.js';
import { createApiServer } from './api.js';

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const API_SECRET = process.env.API_SECRET;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const MESSAGE_DELAY = parseInt(process.env.MESSAGE_DELAY_MS || '1500', 10);
const TYPING_DELAY = parseInt(process.env.TYPING_DELAY_MS || '500', 10);
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

// Anti-ban configuration
// Account age affects rate limits:
// - Week 1 (new): 5/hour, 15/day - very conservative
// - Week 2-4: 15/hour, 40/day - warming up
// - Month 2+ (8+ weeks): 30/hour, 150/day - mature account
const ACCOUNT_AGE_WEEKS = parseInt(process.env.ACCOUNT_AGE_WEEKS || '4', 10);

// Active hours for presence simulation (24-hour format)
const ACTIVE_HOURS_START = parseInt(process.env.ACTIVE_HOURS_START || '7', 10);
const ACTIVE_HOURS_END = parseInt(process.env.ACTIVE_HOURS_END || '23', 10);

console.log('='.repeat(50));
console.log('WA2Bridge - WhatsApp Bridge for WhatsApp2App');
console.log('='.repeat(50));
console.log('');
console.log('Anti-Ban Protection: ENABLED');
console.log(`Account Age: ${ACCOUNT_AGE_WEEKS} weeks`);
console.log(`Active Hours: ${ACTIVE_HOURS_START}:00 - ${ACTIVE_HOURS_END}:00`);
console.log('');

// Create WhatsApp client with anti-ban settings
const whatsapp = new WhatsAppClient({
  messageDelay: MESSAGE_DELAY,
  typingDelay: TYPING_DELAY,
  webhookUrl: WEBHOOK_URL,
  logLevel: LOG_LEVEL,
  accountAgeWeeks: ACCOUNT_AGE_WEEKS,  // For rate limiting
  activeHoursStart: ACTIVE_HOURS_START,  // For presence simulation
  activeHoursEnd: ACTIVE_HOURS_END,
  apiSecret: API_SECRET,  // For WebhookManager
  onMessage: async (message) => {
    // Forward to Laravel webhook using WebhookManager (with retry)
    if (!WEBHOOK_URL) {
      console.log('No webhook URL configured, message not forwarded');
      return;
    }

    // Use webhookManager for reliable delivery with retries
    try {
      await whatsapp.webhookManager.send({
        from: message.from,
        message: message.message,
        message_id: message.messageId,
        timestamp: message.timestamp,
        type: 'text',
        // Phase 3 context
        should_reply: message.shouldReply,
        reply_probability: message.replyProbability,
        is_forward: message.isForward,
        forward_count: message.forwardCount,
        conversation_context: message.conversationContext,
      });
      console.log(`Message forwarded to webhook: ${message.from}`);
    } catch (error) {
      // WebhookManager will queue failed requests for retry
      console.error('Webhook error (queued for retry):', error.message);
    }
  },
});

// Create API server
const app = createApiServer(whatsapp, { apiSecret: API_SECRET });

// Server reference for graceful shutdown
let server = null;
let isShuttingDown = false;

// Start everything
async function start() {
  try {
    // Connect to WhatsApp
    console.log('Connecting to WhatsApp...');
    await whatsapp.connect();

    // Start HTTP server
    server = app.listen(PORT, HOST, () => {
      console.log(`API server running at http://${HOST}:${PORT}`);
      console.log('');
      console.log('Endpoints:');
      console.log(`  GET  /health              - Liveness probe (process alive)`);
      console.log(`  GET  /health/ready        - Readiness probe (ready for traffic)`);
      console.log(`  GET  /api/status          - Full status + all metrics`);
      console.log(`  GET  /api/qr              - Get QR code for scanning`);
      console.log(`  POST /api/send            - Send message (protected)`);
      console.log(`  POST /api/reconnect       - Reconnect WhatsApp`);
      console.log(`  GET  /api/rate-limits     - Rate limit status`);
      console.log(`  POST /api/account-age     - Set account age`);
      console.log(`  GET  /api/ban-warning     - Ban warning metrics`);
      console.log(`  POST /api/exit-hibernation - Exit hibernation mode`);
      console.log(`  POST /api/reset-ban-warning - Reset warning metrics`);
      console.log(`  POST /api/presence        - Set online/offline`);
      console.log('');
      console.log('Phase 2 Endpoints:');
      console.log(`  GET  /api/delivery-health - Delivery status health`);
      console.log(`  GET  /api/contact-warmup/:phone - Contact warmup status`);
      console.log(`  POST /api/queue           - Queue message for optimal timing`);
      console.log(`  GET  /api/queue-status    - Message queue status`);
      console.log(`  POST /api/queue-clear     - Clear message queue`);
      console.log(`  GET  /api/weekend-patterns - Weekend/holiday patterns`);
      console.log(`  GET  /api/activity-ramp   - Post-downtime ramp status`);
      console.log(`  GET  /api/network-health  - Network fingerprint health`);
      console.log('');
      console.log('Phase 3 Endpoints:');
      console.log(`  GET  /api/spam-detection  - Spam report detection metrics`);
      console.log(`  GET  /api/geo-match       - Geographic IP matching`);
      console.log(`  GET  /api/conversation/:phone - Conversation context`);
      console.log(`  GET  /api/conversations-active - Active conversations`);
      console.log(`  GET  /api/status-viewer   - Status viewing status`);
      console.log(`  POST /api/reply-check     - Check reply probability`);
      console.log('');
      console.log('Phase 4 Endpoints:');
      console.log(`  GET  /api/block-detection - Block detection stats`);
      console.log(`  GET  /api/block-detection/:phone - Check if blocked`);
      console.log(`  GET  /api/session-backup  - Session backup info`);
      console.log(`  POST /api/session-backup  - Trigger manual backup`);
      console.log(`  POST /api/session-restore - Restore from backup`);
      console.log(`  GET  /api/persistent-queue - Persistent queue status`);
      console.log(`  POST /api/persistent-queue - Queue to persistent queue`);
      console.log(`  POST /api/persistent-queue/process - Process queue`);
      console.log(`  GET  /api/webhook-retry   - Webhook retry queue`);
      console.log(`  POST /api/webhook-retry   - Retry failed webhooks`);
      console.log(`  GET  /api/health-monitor  - Health monitor status`);
      console.log(`  GET  /api/health-report   - Full health report`);
      console.log(`  GET  /api/language/:phone - Detected language`);
      console.log(`  GET  /api/languages       - All detected languages`);
      console.log('');
      console.log('Phase 5A Endpoints (Analytics):');
      console.log(`  GET  /api/analytics       - Analytics summary`);
      console.log(`  GET  /api/analytics/:phone - Contact analytics`);
      console.log(`  GET  /api/analytics/peak-hours - Peak messaging hours`);
      console.log(`  GET  /api/scoring         - Contact scoring stats`);
      console.log(`  GET  /api/scoring/:phone  - Contact score & tier`);
      console.log(`  GET  /api/scoring/top/:limit - Top contacts`);
      console.log(`  GET  /api/scoring/attention - Contacts needing attention`);
      console.log(`  POST /api/sentiment/analyze - Analyze text sentiment`);
      console.log(`  GET  /api/sentiment/:phone - Contact sentiment`);
      console.log('');
      console.log('Phase 5B Endpoints (Security):');
      console.log(`  GET  /api/security/ip-whitelist - IP whitelist status`);
      console.log(`  POST /api/security/ip-whitelist/toggle - Enable/disable`);
      console.log(`  POST /api/security/ip-whitelist/add - Add to whitelist`);
      console.log(`  POST /api/security/ip-blacklist/add - Add to blacklist`);
      console.log(`  GET  /api/security/audit-logs - Audit logs`);
      console.log(`  GET  /api/security/audit-stats - Audit stats`);
      console.log(`  GET  /api/security/events  - Security events`);
      console.log(`  GET  /api/security/rate-limiter - Rate limiter stats`);
      console.log('');
      console.log('Phase 5C Endpoints (Automation):');
      console.log(`  GET  /api/auto-responder  - Auto-responder status`);
      console.log(`  POST /api/auto-responder/toggle - Enable/disable`);
      console.log(`  POST /api/auto-responder/rules - Add rule`);
      console.log(`  PUT  /api/auto-responder/rules/:id - Update rule`);
      console.log(`  DEL  /api/auto-responder/rules/:id - Delete rule`);
      console.log(`  GET  /api/templates       - Message templates`);
      console.log(`  POST /api/templates       - Create template`);
      console.log(`  POST /api/templates/render - Render template`);
      console.log(`  DEL  /api/templates/:name - Delete template`);
      console.log(`  GET  /api/scheduled       - Scheduled messages`);
      console.log(`  POST /api/scheduled       - Schedule message`);
      console.log(`  DEL  /api/scheduled/:id   - Cancel scheduled`);
      console.log(`  GET  /api/scheduled/stats - Scheduled stats`);
      console.log('');
      console.log('Phase 6 Endpoints (Enhanced Webhooks):');
      console.log(`  GET  /api/webhooks        - Webhook status & stats`);
      console.log(`  GET  /api/webhooks/events - Available event types`);
      console.log(`  GET  /api/webhooks/history - Recent event history`);
      console.log(`  POST /api/webhooks/subscribe - Subscribe to events`);
      console.log(`  POST /api/webhooks/unsubscribe - Unsubscribe`);
      console.log(`  POST /api/webhooks/toggle - Enable/disable webhooks`);
      console.log(`  GET  /api/webhooks/retries - Pending retries`);
      console.log(`  POST /api/webhooks/retries - Process retries`);
      console.log(`  POST /api/webhooks/test   - Send test webhook`);
      console.log('');

      if (WEBHOOK_URL) {
        console.log(`Webhook: ${WEBHOOK_URL}`);
      } else {
        console.log('Warning: No WEBHOOK_URL configured');
      }

      console.log('');
      console.log('Anti-Ban Features Active:');
      console.log('  Phase 1:');
      console.log('  - Randomized delays (human-like timing)');
      console.log('  - Typing indicators before messages');
      console.log('  - Rate limiting (hourly/daily)');
      console.log('  - Browser fingerprint rotation (24-48h)');
      console.log('  - Exponential backoff on reconnection');
      console.log('  - Activity tracking (response ratio)');
      console.log('  - Online/offline presence cycling');
      console.log('  - Ban early warning system');
      console.log('  - Message content variation');
      console.log('  - Read receipts + read delay');
      console.log('');
      console.log('  Phase 2:');
      console.log('  - Smart message queueing');
      console.log('  - Delivery status tracking');
      console.log('  - Gradual ramp after downtime');
      console.log('  - Weekend/holiday patterns');
      console.log('  - Typing with corrections simulation');
      console.log('  - Context-based emoji enhancement');
      console.log('  - Contact warmup tracking (7-day)');
      console.log('  - Group vs DM behavior differentiation');
      console.log('  - Network fingerprint consistency');
      console.log('');
      console.log('  Phase 3:');
      console.log('  - Reaction usage (15% of messages)');
      console.log('  - Reply probability (90% reply rate)');
      console.log('  - Long message splitting (max 500 chars)');
      console.log('  - Status/story viewing simulation');
      console.log('  - Spam report detection');
      console.log('  - Geographic IP matching');
      console.log('  - Profile picture viewing');
      console.log('  - Forward message detection');
      console.log('  - Conversation memory tracking');
      console.log('');
      console.log('  Phase 4:');
      console.log('  - Block detection (delivery + profile check)');
      console.log('  - Session backup/restore (auto every 6h)');
      console.log('  - Persistent message queue (survives restart)');
      console.log('  - Webhook retry with exponential backoff');
      console.log('  - Health monitoring with alerts');
      console.log('  - Language detection (Indonesian/English)');
      console.log('');
      console.log('  Phase 5A (Analytics):');
      console.log('  - Message analytics (hourly/daily trends)');
      console.log('  - Contact engagement scoring (tier system)');
      console.log('  - Sentiment analysis (positive/negative/neutral)');
      console.log('');
      console.log('  Phase 5B (Security):');
      console.log('  - IP whitelist/blacklist');
      console.log('  - Audit logging (API calls, messages, security)');
      console.log('  - API rate limiting per endpoint');
      console.log('');
      console.log('  Phase 5C (Automation):');
      console.log('  - Auto-responder with rules');
      console.log('  - Message templates with variables');
      console.log('  - Scheduled messages (one-time, daily, weekly)');
      console.log('='.repeat(50));
    });
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

// Graceful shutdown handler
async function gracefulShutdown(signal) {
  if (isShuttingDown) {
    console.log('Shutdown already in progress...');
    return;
  }
  isShuttingDown = true;

  console.log(`\n${signal} received, shutting down gracefully...`);

  // 1. Stop accepting new HTTP connections
  if (server) {
    console.log('Closing HTTP server...');
    server.close(() => {
      console.log('HTTP server closed');
    });
  }

  // 2. Drain persistent queue (max 30s timeout)
  if (whatsapp.persistentQueue) {
    console.log('Draining message queue...');
    try {
      await Promise.race([
        whatsapp.persistentQueue.processQueue(),
        new Promise((resolve) => setTimeout(resolve, 30000)),
      ]);
      console.log('Queue drained');
    } catch (error) {
      console.error('Queue drain error:', error.message);
    }
  }

  // 3. Drain webhook retry queue
  if (whatsapp.webhookManager) {
    console.log('Processing pending webhooks...');
    try {
      await Promise.race([
        whatsapp.webhookManager.processRetryQueue(),
        new Promise((resolve) => setTimeout(resolve, 10000)),
      ]);
      console.log('Webhooks processed');
    } catch (error) {
      console.error('Webhook process error:', error.message);
    }
  }

  // 4. Disconnect WhatsApp
  console.log('Disconnecting WhatsApp...');
  await whatsapp.disconnect();

  console.log('Shutdown complete');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

start();
