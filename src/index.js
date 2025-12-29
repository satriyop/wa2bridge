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

console.log('='.repeat(50));
console.log('WA2Bridge - WhatsApp Bridge for WhatsApp2App');
console.log('='.repeat(50));

// Create WhatsApp client
const whatsapp = new WhatsAppClient({
  messageDelay: MESSAGE_DELAY,
  typingDelay: TYPING_DELAY,
  webhookUrl: WEBHOOK_URL,
  logLevel: LOG_LEVEL,
  onMessage: async (message) => {
    // Forward to Laravel webhook
    if (!WEBHOOK_URL) {
      console.log('No webhook URL configured, message not forwarded');
      return;
    }

    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_SECRET}`,
        },
        body: JSON.stringify({
          from: message.from,
          message: message.message,
          message_id: message.messageId,
          timestamp: message.timestamp,
          type: 'text',
        }),
      });

      if (!response.ok) {
        console.error(`Webhook failed: ${response.status} ${response.statusText}`);
      } else {
        console.log(`Message forwarded to webhook: ${message.from}`);
      }
    } catch (error) {
      console.error('Webhook error:', error.message);
    }
  },
});

// Create API server
const app = createApiServer(whatsapp, { apiSecret: API_SECRET });

// Start everything
async function start() {
  try {
    // Connect to WhatsApp
    console.log('Connecting to WhatsApp...');
    await whatsapp.connect();

    // Start HTTP server
    app.listen(PORT, HOST, () => {
      console.log(`API server running at http://${HOST}:${PORT}`);
      console.log('');
      console.log('Endpoints:');
      console.log(`  GET  /health      - Health check`);
      console.log(`  GET  /api/status  - WhatsApp connection status`);
      console.log(`  GET  /api/qr      - Get QR code for scanning`);
      console.log(`  POST /api/send    - Send a message`);
      console.log(`  POST /api/reconnect - Reconnect WhatsApp`);
      console.log('');

      if (WEBHOOK_URL) {
        console.log(`Webhook: ${WEBHOOK_URL}`);
      } else {
        console.log('Warning: No WEBHOOK_URL configured');
      }

      console.log('='.repeat(50));
    });
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await whatsapp.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  await whatsapp.disconnect();
  process.exit(0);
});

start();
