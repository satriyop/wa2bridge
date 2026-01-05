/**
 * Connection Manager
 *
 * Handles Baileys socket creation, connection lifecycle,
 * and event handling for WhatsApp Web protocol.
 */

import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from '@whiskeysockets/baileys';
import pino from 'pino';

import { getBrowserFingerprint } from '../anti-ban/index.js';
import { TimerRegistry } from '../utils/timer-registry.js';
import { getDisconnectReasonName } from '../whatsapp-utilities.js';
import { config } from '../config.js';

/**
 * @typedef {Object} ConnectionCallbacks
 * @property {Function} onQrCode - Called when QR code is generated
 * @property {Function} onConnected - Called when connection is established
 * @property {Function} onDisconnected - Called when connection is closed
 * @property {Function} onMessage - Called when message is received
 * @property {Function} onMessageUpdate - Called when message status changes
 * @property {Function} onCredentialsUpdate - Called when credentials are updated
 */

/**
 * @typedef {Object} ConnectionManagerOptions
 * @property {string} sessionsDir - Path to sessions directory
 * @property {Object} orchestrator - AntiBanOrchestrator instance
 * @property {Object} logger - Pino logger instance
 * @property {ConnectionCallbacks} callbacks - Event callbacks
 */

/**
 * Manages WhatsApp Web connection via Baileys.
 *
 * Responsibilities:
 * - Socket creation with rotating fingerprint
 * - Connection state machine (disconnected → connecting → connected)
 * - Event routing to callbacks
 * - Reconnection with exponential backoff
 */
export class ConnectionManager {
  /**
   * @param {ConnectionManagerOptions} options
   */
  constructor(options) {
    this.sessionsDir = options.sessionsDir;
    this.orchestrator = options.orchestrator;
    this.logger = options.logger;
    this.callbacks = options.callbacks || {};

    // Connection state
    this.socket = null;
    this.isConnected = false;
    this.qrCode = null;
    this.phoneNumber = null;
    this.userName = null;

    // Timer management
    this.timers = new TimerRegistry('ConnectionManager');
    this.networkCheckInterval = null;
  }

  /**
   * Establish connection to WhatsApp Web.
   *
   * @returns {Promise<Object>} The Baileys socket instance
   */
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

    // Get rotating browser fingerprint
    const browserFingerprint = getBrowserFingerprint(this.sessionsDir);
    this.logger.info({ browser: browserFingerprint }, 'Using browser fingerprint');

    this.socket = makeWASocket({
      auth: state,
      logger: pino({ level: 'warn' }),
      browser: browserFingerprint,
      syncFullHistory: config.network.syncFullHistory,
      connectTimeoutMs: config.network.connectTimeoutMs,
      defaultQueryTimeoutMs: config.network.queryTimeoutMs,
      markOnlineOnConnect: config.network.markOnlineOnConnect,
      ...(version && { version }),
    });

    // Setup event handlers
    this._setupConnectionHandler(saveCreds);
    this._setupMessageHandlers();
    this._setupNetworkCheck();

    return this.socket;
  }

  /**
   * Setup connection update handler.
   * @private
   */
  _setupConnectionHandler(saveCreds) {
    this.socket.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrCode = qr;
        this.logger.info('QR Code generated - scan with WhatsApp');
        this.callbacks.onQrCode?.(qr);
      }

      if (connection === 'close') {
        await this._handleConnectionClose(lastDisconnect);
      }

      if (connection === 'open') {
        await this._handleConnectionOpen();
      }
    });

    // Handle credentials update
    this.socket.ev.on('creds.update', saveCreds);
  }

  /**
   * Handle connection close event.
   * @private
   */
  async _handleConnectionClose(lastDisconnect) {
    this.isConnected = false;
    this.qrCode = null;

    const statusCode = lastDisconnect?.error?.output?.statusCode;
    const errorMessage = lastDisconnect?.error?.message || 'Unknown error';

    this.logger.info({ statusCode, errorMessage }, 'Connection closed');

    // Notify orchestrator
    this.orchestrator.stopServices();
    this.orchestrator.recordConnectionDrop();

    // Notify callback
    this.callbacks.onDisconnected?.(errorMessage, statusCode);

    // Handle logout - don't auto-reconnect
    if (statusCode === DisconnectReason.loggedOut) {
      this.logger.warn('Logged out from WhatsApp - session may be invalid');
      this.orchestrator.reconnectionManager.reset();
      return;
    }

    // Schedule reconnection with backoff
    const { delay: reconnectDelay, attempt, shouldGiveUp } =
      this.orchestrator.reconnectionManager.getNextDelay();

    if (shouldGiveUp) {
      this.logger.error(
        { attempts: attempt },
        'Max reconnection attempts reached. Manual intervention required.'
      );
      return;
    }

    this.logger.info(
      {
        attempt,
        delayMs: reconnectDelay,
        reason: getDisconnectReasonName(statusCode),
      },
      'Scheduling reconnection with backoff'
    );

    this.timers.setTimeout(() => this.connect(), reconnectDelay);
  }

  /**
   * Handle connection open event.
   * @private
   */
  async _handleConnectionOpen() {
    this.isConnected = true;
    this.qrCode = null;

    // Reset reconnection counter
    this.orchestrator.reconnectionManager.reset();

    // Initialize socket-dependent components
    this.orchestrator.setSocket(this.socket);

    // Start background services
    this.orchestrator.startServices();

    // Log system event
    this.orchestrator.auditLogger.logSystem('whatsapp_connected', {
      phone: this.phoneNumber,
    });

    // Get profile info
    const user = this.socket.user;
    if (user) {
      this.phoneNumber = user.id.split(':')[0];
      this.userName = user.name || 'Unknown';
    }

    this.logger.info(`Connected as ${this.phoneNumber} (${this.userName})`);
    this.logger.info('Presence cycling started');

    // Notify callback
    this.callbacks.onConnected?.(this.phoneNumber, this.userName);
  }

  /**
   * Setup message event handlers.
   * @private
   */
  _setupMessageHandlers() {
    // Handle incoming messages
    this.socket.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const message of messages) {
        this.callbacks.onMessage?.(message);
      }
    });

    // Handle message status updates
    this.socket.ev.on('messages.update', (updates) => {
      for (const update of updates) {
        this.callbacks.onMessageUpdate?.(update);
      }
    });
  }

  /**
   * Setup periodic network fingerprint check.
   * @private
   */
  _setupNetworkCheck() {
    this.networkCheckInterval = setInterval(() => {
      this.orchestrator.networkFingerprint.recordIP().catch(() => {});
    }, config.network.networkCheckIntervalMs);
  }

  /**
   * Disconnect from WhatsApp Web.
   */
  async disconnect() {
    this.logger.info('Disconnecting...');

    // Clear timers
    this.timers.clearAll();

    // Clear network check interval
    if (this.networkCheckInterval) {
      clearInterval(this.networkCheckInterval);
      this.networkCheckInterval = null;
    }

    // Log system event
    this.orchestrator.auditLogger.logSystem('whatsapp_disconnected', {
      phone: this.phoneNumber,
    });

    // Stop services before logout
    this.orchestrator.stopServices();

    // Logout from WhatsApp
    if (this.socket) {
      await this.socket.logout();
      this.isConnected = false;
    }

    this.logger.info('Disconnected');
  }

  /**
   * Get current connection state.
   *
   * @returns {Object} Connection state
   */
  getState() {
    return {
      isConnected: this.isConnected,
      phoneNumber: this.phoneNumber,
      userName: this.userName,
      qrCode: this.qrCode,
    };
  }

  /**
   * Get the Baileys socket instance.
   *
   * @returns {Object|null} Socket instance or null if not connected
   */
  getSocket() {
    return this.socket;
  }
}

export default ConnectionManager;
