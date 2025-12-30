# WA2Bridge Dashboard

Vue 3 + Vite dashboard for monitoring WA2Bridge WhatsApp bridge.

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
# Opens at http://localhost:5173
```

The dev server proxies `/api/*` calls to wa2bridge backend (default: `http://localhost:3005`).

## Production Build

```bash
npm run build
```

Output in `dist/` folder.

## Configuration

To change the wa2bridge backend URL, edit `vite.config.js`:

```js
const WA2BRIDGE_URL = 'http://localhost:3005'
```

## Features

- Real-time connection status
- QR code display for pairing
- Rate limit gauges
- Ban risk meter
- Message statistics
- Webhook event log

## Tech Stack

- Vue 3 (Composition API)
- Vite
- Tailwind CSS v4
