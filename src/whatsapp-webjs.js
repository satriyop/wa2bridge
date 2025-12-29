/**
 * WhatsApp Client using whatsapp-web.js
 *
 * Alternative implementation to whatsapp.js (Baileys).
 * Exposes the same interface so the API layer works unchanged.
 *
 * To use this instead of Baileys:
 * 1. npm install whatsapp-web.js qrcode-terminal
 * 2. In index.js, change: import WhatsAppClient from './whatsapp-webjs.js'
 *
 * @see https://github.com/pedroslopez/whatsapp-web.js
 */

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

class WhatsAppClient {
  constructor(options = {}) {
    this.client = null;
    this.qrCode = null;
    this.isConnected = false;
    this.phoneNumber = null;
    this.userName = null;

    this.messageDelay = options.messageDelay || 1500;
    this.typingDelay = options.typingDelay || 500;
    this.webhookUrl = options.webhookUrl;
    this.onMessage = options.onMessage || (() => {});

    this.sessionsDir = join(__dirname, '..', 'sessions-webjs');

    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      startedAt: null,
    };

    this.logger = {
      info: (...args) => console.log('[INFO]', ...args),
      warn: (...args) => console.warn('[WARN]', ...args),
      error: (...args) => console.error('[ERROR]', ...args),
    };
  }

  async connect() {
    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: this.sessionsDir,
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
        ],
      },
    });

    // QR Code event
    this.client.on('qr', (qr) => {
      this.qrCode = qr;
      this.logger.info('QR Code generated - scan with WhatsApp');
      console.log('\n📱 Scan this QR code with WhatsApp:\n');
      qrcode.generate(qr, { small: true });
      console.log('\nOr use GET /api/qr to get the QR code string\n');
    });

    // Ready event
    this.client.on('ready', async () => {
      this.isConnected = true;
      this.qrCode = null;
      this.stats.startedAt = new Date();

      // Get profile info
      const info = this.client.info;
      if (info) {
        this.phoneNumber = info.wid.user;
        this.userName = info.pushname || 'Unknown';
      }

      this.logger.info(`Connected as ${this.phoneNumber} (${this.userName})`);
    });

    // Disconnected event
    this.client.on('disconnected', (reason) => {
      this.isConnected = false;
      this.qrCode = null;
      this.logger.warn('Disconnected:', reason);

      // Reconnect after delay
      setTimeout(() => {
        this.logger.info('Reconnecting...');
        this.client.initialize();
      }, 5000);
    });

    // Authentication failure
    this.client.on('auth_failure', (msg) => {
      this.logger.error('Authentication failed:', msg);
    });

    // Incoming message
    this.client.on('message', async (message) => {
      await this.handleIncomingMessage(message);
    });

    // Initialize client
    await this.client.initialize();

    return this;
  }

  async handleIncomingMessage(message) {
    // Ignore messages from self
    if (message.fromMe) return;

    // Get text content
    const text = message.body;
    if (!text) return;

    this.stats.messagesReceived++;

    const from = message.from.replace('@c.us', '');
    const messageId = message.id._serialized;

    this.logger.info({ from, messageId }, 'Received message');

    // Call the message handler
    await this.onMessage({
      from: `+${from}`,
      message: text,
      messageId,
      timestamp: message.timestamp,
    });
  }

  async sendMessage(to, text, replyToMessageId = null) {
    if (!this.isConnected) {
      throw new Error('WhatsApp not connected');
    }

    // Normalize phone number
    const chatId = this.normalizeJid(to);

    // Simulate typing
    const chat = await this.client.getChatById(chatId);
    await chat.sendStateTyping();

    // Human-like delay
    await this.delay(this.typingDelay);
    await this.delay(this.messageDelay);

    // Send message
    const options = {};
    if (replyToMessageId) {
      // Note: whatsapp-web.js quote format differs
      options.quotedMessageId = replyToMessageId;
    }

    const result = await this.client.sendMessage(chatId, text, options);

    // Clear typing
    await chat.clearState();

    this.stats.messagesSent++;
    this.logger.info({ to, messageId: result.id._serialized }, 'Message sent');

    return {
      key: {
        id: result.id._serialized,
      },
    };
  }

  normalizeJid(phone) {
    // Remove all non-numeric characters
    let normalized = phone.replace(/\D/g, '');

    // Handle Indonesian numbers
    if (normalized.startsWith('0')) {
      normalized = '62' + normalized.slice(1);
    }

    // Remove leading + if present
    if (normalized.startsWith('+')) {
      normalized = normalized.slice(1);
    }

    return `${normalized}@c.us`;
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  getStatus() {
    return {
      connected: this.isConnected,
      phone: this.phoneNumber,
      name: this.userName,
      qr: this.qrCode,
      stats: {
        messagesSent: this.stats.messagesSent,
        messagesReceived: this.stats.messagesReceived,
        uptime: this.stats.startedAt
          ? Math.floor((Date.now() - this.stats.startedAt) / 1000)
          : 0,
      },
    };
  }

  async disconnect() {
    if (this.client) {
      await this.client.logout();
      this.isConnected = false;
    }
  }
}

export default WhatsAppClient;
