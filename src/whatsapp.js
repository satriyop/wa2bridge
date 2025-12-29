import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  delay,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import qrcode from 'qrcode-terminal';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

class WhatsAppClient {
  constructor(options = {}) {
    this.socket = null;
    this.qrCode = null;
    this.isConnected = false;
    this.phoneNumber = null;
    this.userName = null;

    this.messageDelay = options.messageDelay || 1500;
    this.typingDelay = options.typingDelay || 500;
    this.webhookUrl = options.webhookUrl;
    this.onMessage = options.onMessage || (() => {});

    this.sessionsDir = join(__dirname, '..', 'sessions');

    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      startedAt: null,
    };

    this.logger = pino({ level: options.logLevel || 'info' });
  }

  async connect() {
    const { state, saveCreds } = await useMultiFileAuthState(this.sessionsDir);

    // Fetch latest WA Web version for compatibility
    let version;
    try {
      const versionInfo = await fetchLatestBaileysVersion();
      version = versionInfo.version;
      this.logger.info({ version }, 'Using WhatsApp Web version');
    } catch (err) {
      this.logger.warn('Could not fetch latest version, using default');
    }

    this.socket = makeWASocket({
      auth: state,
      logger: pino({ level: 'warn' }),
      browser: ['Ubuntu', 'Chrome', '124.0.6367.91'],
      syncFullHistory: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      markOnlineOnConnect: false,
      ...(version && { version }),
    });

    // Handle connection updates
    this.socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrCode = qr;
        this.logger.info('QR Code generated - scan with WhatsApp');
        console.log('\n📱 Scan this QR code with WhatsApp:\n');
        qrcode.generate(qr, { small: true });
        console.log('\nOr use GET /api/qr to get the QR code string\n');
      }

      if (connection === 'close') {
        this.isConnected = false;
        this.qrCode = null;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const errorMessage = lastDisconnect?.error?.message || 'Unknown error';

        this.logger.info({ statusCode, errorMessage }, 'Connection closed');

        if (statusCode === DisconnectReason.loggedOut) {
          this.logger.warn('Logged out from WhatsApp - clearing session');
          // Clear session handled externally, just reconnect
          setTimeout(() => this.connect(), 2000);
        } else if (statusCode === DisconnectReason.restartRequired) {
          this.logger.info('Restart required, reconnecting...');
          setTimeout(() => this.connect(), 1000);
        } else if (statusCode === DisconnectReason.connectionClosed || statusCode === DisconnectReason.connectionLost) {
          this.logger.info('Connection lost, reconnecting in 3 seconds...');
          setTimeout(() => this.connect(), 3000);
        } else {
          this.logger.info(`Reconnecting in 5 seconds (status: ${statusCode})...`);
          setTimeout(() => this.connect(), 5000);
        }
      }

      if (connection === 'open') {
        this.isConnected = true;
        this.qrCode = null;
        this.stats.startedAt = new Date();

        // Get profile info
        const user = this.socket.user;
        if (user) {
          this.phoneNumber = user.id.split(':')[0];
          this.userName = user.name || 'Unknown';
        }

        this.logger.info(`Connected as ${this.phoneNumber} (${this.userName})`);
      }
    });

    // Handle credentials update
    this.socket.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    this.socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const message of messages) {
        await this.handleIncomingMessage(message);
      }
    });

    return this;
  }

  async handleIncomingMessage(message) {
    // Ignore messages from self
    if (message.key.fromMe) return;

    // Ignore non-text messages for now
    const text = message.message?.conversation ||
                 message.message?.extendedTextMessage?.text;

    if (!text) return;

    this.stats.messagesReceived++;

    const from = message.key.remoteJid.replace('@s.whatsapp.net', '');
    const messageId = message.key.id;

    this.logger.info({ from, messageId }, 'Received message');

    // Call the message handler
    await this.onMessage({
      from: `+${from}`,
      message: text,
      messageId,
      timestamp: message.messageTimestamp,
    });
  }

  async sendMessage(to, text, replyToMessageId = null) {
    if (!this.isConnected) {
      throw new Error('WhatsApp not connected');
    }

    // Normalize phone number
    const jid = this.normalizeJid(to);

    // Show typing indicator
    await this.socket.presenceSubscribe(jid);
    await delay(100);
    await this.socket.sendPresenceUpdate('composing', jid);
    await delay(this.typingDelay);

    // Human-like delay before sending
    await delay(this.messageDelay);

    // Send message (try with reply, fall back to without if quote fails)
    let result;
    if (replyToMessageId) {
      try {
        const options = { quoted: { key: { id: replyToMessageId, remoteJid: jid } } };
        result = await this.socket.sendMessage(jid, { text }, options);
      } catch (quoteError) {
        // Quote failed (message not found), send without quote
        this.logger.warn({ replyToMessageId, error: quoteError.message }, 'Quote failed, sending without reply');
        result = await this.socket.sendMessage(jid, { text }, {});
      }
    } else {
      result = await this.socket.sendMessage(jid, { text }, {});
    }

    // Clear typing indicator
    await this.socket.sendPresenceUpdate('paused', jid);

    this.stats.messagesSent++;
    this.logger.info({ to, messageId: result.key.id }, 'Message sent');

    return result;
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

    return `${normalized}@s.whatsapp.net`;
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
    if (this.socket) {
      await this.socket.logout();
      this.isConnected = false;
    }
  }
}

export default WhatsAppClient;
