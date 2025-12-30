#!/usr/bin/env node
/**
 * WA2Bridge CLI - Interactive command-line interface
 *
 * Provides commands for:
 * - Status checking
 * - Sending test messages
 * - QR code display
 * - Metrics viewing
 * - Webhook testing
 *
 * Usage: npm run cli
 */

import readline from 'readline';
import qrcode from 'qrcode-terminal';

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

const API_BASE = process.env.API_URL || 'http://localhost:3000';
const API_SECRET = process.env.API_SECRET || '';

class WA2BridgeCLI {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    this.commands = {
      help: { desc: 'Show available commands', fn: () => this.showHelp() },
      status: { desc: 'Show connection status', fn: () => this.showStatus() },
      qr: { desc: 'Display QR code for pairing', fn: () => this.showQR() },
      send: { desc: 'Send a message: send <phone> <message>', fn: (args) => this.sendMessage(args) },
      limits: { desc: 'Show rate limit status', fn: () => this.showLimits() },
      ban: { desc: 'Show ban warning metrics', fn: () => this.showBanWarning() },
      analytics: { desc: 'Show message analytics', fn: () => this.showAnalytics() },
      webhooks: { desc: 'Show webhook status', fn: () => this.showWebhooks() },
      'webhook-test': { desc: 'Send test webhook', fn: () => this.testWebhook() },
      health: { desc: 'Health check', fn: () => this.healthCheck() },
      reconnect: { desc: 'Reconnect WhatsApp', fn: () => this.reconnect() },
      clear: { desc: 'Clear screen', fn: () => this.clearScreen() },
      exit: { desc: 'Exit CLI', fn: () => this.exit() },
      quit: { desc: 'Exit CLI', fn: () => this.exit() },
    };
  }

  async fetch(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(API_SECRET ? { Authorization: `Bearer ${API_SECRET}` } : {}),
    };

    try {
      const response = await fetch(url, { ...options, headers });
      return await response.json();
    } catch (error) {
      throw new Error(`API Error: ${error.message}`);
    }
  }

  print(text, color = 'reset') {
    console.log(`${COLORS[color]}${text}${COLORS.reset}`);
  }

  printHeader(text) {
    console.log('');
    this.print(`═══ ${text} ${'═'.repeat(50 - text.length)}`, 'cyan');
  }

  printKeyValue(key, value, valueColor = 'white') {
    console.log(`  ${COLORS.dim}${key}:${COLORS.reset} ${COLORS[valueColor]}${value}${COLORS.reset}`);
  }

  async start() {
    this.clearScreen();
    this.print('╔════════════════════════════════════════════════════════╗', 'green');
    this.print('║         WA2Bridge CLI - Interactive Console            ║', 'green');
    this.print('║         Type "help" for available commands             ║', 'green');
    this.print('╚════════════════════════════════════════════════════════╝', 'green');
    console.log('');
    this.print(`Connected to: ${API_BASE}`, 'dim');
    console.log('');

    this.prompt();
  }

  prompt() {
    this.rl.question(`${COLORS.green}wa2bridge>${COLORS.reset} `, async (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        this.prompt();
        return;
      }

      const [cmd, ...args] = trimmed.split(' ');
      const command = this.commands[cmd.toLowerCase()];

      if (command) {
        try {
          await command.fn(args);
        } catch (error) {
          this.print(`Error: ${error.message}`, 'red');
        }
      } else {
        this.print(`Unknown command: ${cmd}. Type "help" for available commands.`, 'yellow');
      }

      this.prompt();
    });
  }

  showHelp() {
    this.printHeader('Available Commands');
    for (const [name, { desc }] of Object.entries(this.commands)) {
      console.log(`  ${COLORS.cyan}${name.padEnd(15)}${COLORS.reset} ${desc}`);
    }
    console.log('');
  }

  async showStatus() {
    this.printHeader('Connection Status');

    try {
      const status = await this.fetch('/api/status');

      const connStatus = status.connected ? '🟢 Connected' : '🔴 Disconnected';
      this.printKeyValue('Status', connStatus, status.connected ? 'green' : 'red');

      if (status.connected) {
        this.printKeyValue('Phone', status.phone || 'N/A');
        this.printKeyValue('Name', status.name || 'N/A');
        this.printKeyValue('Uptime', this.formatUptime(status.uptime));
      }

      if (status.stats) {
        console.log('');
        this.print('  Statistics:', 'dim');
        this.printKeyValue('  Messages Sent', status.stats.messagesSent || 0);
        this.printKeyValue('  Messages Received', status.stats.messagesReceived || 0);
      }

      console.log('');
    } catch (error) {
      this.print(`Failed to fetch status: ${error.message}`, 'red');
    }
  }

  async showQR() {
    this.printHeader('QR Code');

    try {
      const data = await this.fetch('/api/qr');

      if (data.status === 'connected') {
        this.print('Already connected! No QR code needed.', 'green');
        this.printKeyValue('Phone', data.phone);
      } else if (data.qr) {
        this.print('Scan this QR code with WhatsApp:', 'yellow');
        console.log('');
        qrcode.generate(data.qr, { small: true });
        console.log('');
        this.print('QR expires in ~60 seconds. Run "qr" again if needed.', 'dim');
      } else {
        this.print('Waiting for QR code... Please wait and try again.', 'yellow');
      }

      console.log('');
    } catch (error) {
      this.print(`Failed to fetch QR: ${error.message}`, 'red');
    }
  }

  async sendMessage(args) {
    if (args.length < 2) {
      this.print('Usage: send <phone> <message>', 'yellow');
      this.print('Example: send +6281234567890 Hello world!', 'dim');
      return;
    }

    const [phone, ...messageParts] = args;
    const message = messageParts.join(' ');

    this.printHeader('Sending Message');
    this.printKeyValue('To', phone);
    this.printKeyValue('Message', message);
    console.log('');

    try {
      const result = await this.fetch('/api/send', {
        method: 'POST',
        body: JSON.stringify({ to: phone, message }),
      });

      if (result.success) {
        this.print('✓ Message sent successfully!', 'green');
        this.printKeyValue('Message ID', result.messageId);
      } else {
        this.print(`✗ Failed: ${result.error}`, 'red');
        if (result.waitMs) {
          this.printKeyValue('Rate limited, wait', `${Math.ceil(result.waitMs / 1000)}s`);
        }
      }

      console.log('');
    } catch (error) {
      this.print(`Failed to send: ${error.message}`, 'red');
    }
  }

  async showLimits() {
    this.printHeader('Rate Limits');

    try {
      const limits = await this.fetch('/api/rate-limits');

      if (limits.hourly) {
        console.log('');
        this.print('  Hourly:', 'cyan');
        this.printProgressBar(limits.hourly.used, limits.hourly.limit);
        this.printKeyValue('  Used', `${limits.hourly.used} / ${limits.hourly.limit}`);
        this.printKeyValue('  Remaining', limits.hourly.remaining);
      }

      if (limits.daily) {
        console.log('');
        this.print('  Daily:', 'cyan');
        this.printProgressBar(limits.daily.used, limits.daily.limit);
        this.printKeyValue('  Used', `${limits.daily.used} / ${limits.daily.limit}`);
        this.printKeyValue('  Remaining', limits.daily.remaining);
      }

      if (limits.accountAge) {
        console.log('');
        this.printKeyValue('Account Age', limits.accountAge);
      }

      console.log('');
    } catch (error) {
      this.print(`Failed to fetch limits: ${error.message}`, 'red');
    }
  }

  async showBanWarning() {
    this.printHeader('Ban Warning Status');

    try {
      const warning = await this.fetch('/api/ban-warning');

      const riskScore = warning.riskScore || 0;
      let riskColor = 'green';
      let riskText = 'Safe';

      if (riskScore >= 80) {
        riskColor = 'red';
        riskText = 'Critical';
      } else if (riskScore >= 60) {
        riskColor = 'red';
        riskText = 'High';
      } else if (riskScore >= 40) {
        riskColor = 'yellow';
        riskText = 'Medium';
      } else if (riskScore >= 20) {
        riskColor = 'yellow';
        riskText = 'Low';
      }

      console.log('');
      this.print(`  Risk Score: ${riskScore}% (${riskText})`, riskColor);
      this.printProgressBar(riskScore, 100, riskColor);

      if (warning.isHibernating) {
        console.log('');
        this.print('  ⚠️  HIBERNATION MODE ACTIVE', 'magenta');
      }

      if (warning.recommendation) {
        console.log('');
        this.printKeyValue('Recommendation', warning.recommendation);
      }

      if (warning.recentEvents && warning.recentEvents.length > 0) {
        console.log('');
        this.print('  Recent Events:', 'dim');
        for (const event of warning.recentEvents.slice(0, 5)) {
          console.log(`    - ${event.type} (${new Date(event.timestamp).toLocaleTimeString()})`);
        }
      }

      console.log('');
    } catch (error) {
      this.print(`Failed to fetch ban warning: ${error.message}`, 'red');
    }
  }

  async showAnalytics() {
    this.printHeader('Message Analytics');

    try {
      const analytics = await this.fetch('/api/analytics');

      this.printKeyValue('Total Sent', analytics.totalSent || 0);
      this.printKeyValue('Total Received', analytics.totalReceived || 0);

      if (analytics.peakHours && analytics.peakHours.length > 0) {
        console.log('');
        this.print('  Peak Hours:', 'dim');
        const maxVal = Math.max(...analytics.peakHours, 1);
        for (let i = 0; i < 24; i++) {
          const val = analytics.peakHours[i] || 0;
          const bar = '█'.repeat(Math.ceil((val / maxVal) * 20));
          console.log(`    ${String(i).padStart(2, '0')}:00 ${COLORS.green}${bar}${COLORS.reset} ${val}`);
        }
      }

      console.log('');
    } catch (error) {
      this.print(`Failed to fetch analytics: ${error.message}`, 'red');
    }
  }

  async showWebhooks() {
    this.printHeader('Webhook Status');

    try {
      const webhooks = await this.fetch('/api/webhooks');

      this.printKeyValue('Enabled', webhooks.enabled ? 'Yes' : 'No', webhooks.enabled ? 'green' : 'red');
      this.printKeyValue('Total Events', webhooks.totalEvents || 0);
      this.printKeyValue('Errors', webhooks.errors || 0, webhooks.errors > 0 ? 'red' : 'green');

      if (webhooks.subscriptions && webhooks.subscriptions.length > 0) {
        console.log('');
        this.print('  Subscriptions:', 'dim');
        for (const sub of webhooks.subscriptions.slice(0, 10)) {
          console.log(`    - ${sub}`);
        }
        if (webhooks.subscriptions.length > 10) {
          console.log(`    ... and ${webhooks.subscriptions.length - 10} more`);
        }
      }

      console.log('');
    } catch (error) {
      this.print(`Failed to fetch webhooks: ${error.message}`, 'red');
    }
  }

  async testWebhook() {
    this.printHeader('Testing Webhook');

    try {
      const result = await this.fetch('/api/webhooks/test', { method: 'POST' });

      if (result.sent) {
        this.print('✓ Test webhook sent successfully!', 'green');
      } else {
        this.print(`✗ Webhook not sent: ${result.reason}`, 'yellow');
      }

      console.log('');
    } catch (error) {
      this.print(`Failed to test webhook: ${error.message}`, 'red');
    }
  }

  async healthCheck() {
    this.printHeader('Health Check');

    try {
      const start = Date.now();
      const health = await this.fetch('/health');
      const latency = Date.now() - start;

      this.print(`✓ API is healthy (${latency}ms)`, 'green');
      this.printKeyValue('Status', health.status);
      this.printKeyValue('Timestamp', health.timestamp);

      console.log('');
    } catch (error) {
      this.print(`✗ Health check failed: ${error.message}`, 'red');
    }
  }

  async reconnect() {
    this.printHeader('Reconnecting');

    try {
      this.print('Sending reconnect request...', 'yellow');
      const result = await this.fetch('/api/reconnect', { method: 'POST' });

      if (result.success) {
        this.print('✓ Reconnect initiated. Check "qr" or "status" in a moment.', 'green');
      } else {
        this.print(`✗ Reconnect failed: ${result.error}`, 'red');
      }

      console.log('');
    } catch (error) {
      this.print(`Failed to reconnect: ${error.message}`, 'red');
    }
  }

  clearScreen() {
    console.clear();
  }

  exit() {
    this.print('\nGoodbye! 👋', 'cyan');
    this.rl.close();
    process.exit(0);
  }

  // Utility functions
  formatUptime(ms) {
    if (!ms) return '0s';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h ${minutes % 60}m`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  printProgressBar(value, max, color = 'green') {
    const percentage = Math.min((value / max) * 100, 100);
    const filled = Math.ceil(percentage / 5);
    const empty = 20 - filled;

    let barColor = 'green';
    if (percentage >= 90) barColor = 'red';
    else if (percentage >= 70) barColor = 'yellow';

    const bar = `${COLORS[color || barColor]}${'█'.repeat(filled)}${COLORS.dim}${'░'.repeat(empty)}${COLORS.reset}`;
    console.log(`  ${bar} ${percentage.toFixed(0)}%`);
  }
}

// Run CLI
const cli = new WA2BridgeCLI();
cli.start();
