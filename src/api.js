import express from 'express';
import QRCode from 'qrcode';

export function createApiServer(whatsappClient, options = {}) {
  const app = express();
  const apiSecret = options.apiSecret;

  app.use(express.json());

  // Auth middleware
  const authenticate = (req, res, next) => {
    if (!apiSecret) {
      return next(); // No auth if no secret configured
    }

    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = auth.slice(7);
    if (token !== apiSecret) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    next();
  };

  // Health check (no auth required)
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Get WhatsApp status
  app.get('/api/status', authenticate, (req, res) => {
    const status = whatsappClient.getStatus();
    res.json(status);
  });

  // Get QR code as JSON (no auth - for easy browser access during pairing)
  app.get('/api/qr', (req, res) => {
    const status = whatsappClient.getStatus();

    if (status.connected) {
      return res.json({ status: 'connected', qr: null, phone: status.phone });
    }

    if (status.qr) {
      return res.json({ status: 'waiting_scan', qr: status.qr });
    }

    res.json({ status: 'initializing', qr: null });
  });

  // QR code as HTML page (for easy scanning in browser)
  app.get('/qr', async (req, res) => {
    const status = whatsappClient.getStatus();

    if (status.connected) {
      return res.send(`
        <html>
          <head><title>WA2Bridge - Connected</title></head>
          <body style="font-family: sans-serif; text-align: center; padding: 50px;">
            <h1>✅ WhatsApp Connected</h1>
            <p>Phone: ${status.phone || 'Unknown'}</p>
            <p>Name: ${status.name || 'Unknown'}</p>
          </body>
        </html>
      `);
    }

    if (status.qr) {
      try {
        const qrDataUrl = await QRCode.toDataURL(status.qr, { width: 300, margin: 2 });
        return res.send(`
          <html>
            <head><title>WA2Bridge - Scan QR</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h1>📱 Scan with WhatsApp</h1>
              <p>Open WhatsApp → Settings → Linked Devices → Link a Device</p>
              <img src="${qrDataUrl}" alt="QR Code" style="margin: 20px auto; display: block;" />
              <p style="color: #666; margin-top: 20px;">QR refreshes automatically. Reload if expired.</p>
            </body>
          </html>
        `);
      } catch (err) {
        console.error('QR generation error:', err);
      }
    }

    res.send(`
      <html>
        <head><title>WA2Bridge - Loading</title><meta http-equiv="refresh" content="2"></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1>⏳ Initializing...</h1>
          <p>Please wait, generating QR code...</p>
        </body>
      </html>
    `);
  });

  // Send message
  app.post('/api/send', authenticate, async (req, res) => {
    try {
      const { to, message, reply_to } = req.body;

      if (!to || !message) {
        return res.status(400).json({ error: 'Missing "to" or "message"' });
      }

      const result = await whatsappClient.sendMessage(to, message, reply_to);

      res.json({
        success: true,
        messageId: result.key.id,
        to,
      });
    } catch (error) {
      console.error('Send error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });

  // Reconnect (logout and reconnect)
  app.post('/api/reconnect', authenticate, async (req, res) => {
    try {
      await whatsappClient.disconnect();

      // Give it a moment then reconnect
      setTimeout(() => whatsappClient.connect(), 2000);

      res.json({ status: 'reconnecting' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return app;
}
