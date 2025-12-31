import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
// Configure wa2bridge backend URL (match your .env PORT)
const WA2BRIDGE_URL = process.env.WA2BRIDGE_URL || 'http://localhost:3005'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      // SSE endpoint needs special handling (no buffering)
      '/api/events': {
        target: WA2BRIDGE_URL,
        changeOrigin: true,
        // Critical for SSE: disable response buffering
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            // Prevent buffering for SSE
            proxyRes.headers['cache-control'] = 'no-cache'
            proxyRes.headers['x-accel-buffering'] = 'no'
          })
        },
      },
      // Proxy API calls to wa2bridge backend
      '/api': {
        target: WA2BRIDGE_URL,
        changeOrigin: true,
      },
      '/health': {
        target: WA2BRIDGE_URL,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // Output to wa2bridge for serving
    emptyOutDir: true,
  },
})
