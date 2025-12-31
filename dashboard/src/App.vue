<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import StatusCard from './components/StatusCard.vue'
import RateLimitGauge from './components/RateLimitGauge.vue'
import MessageChart from './components/MessageChart.vue'
import RecentMessages from './components/RecentMessages.vue'
import QRCodeDisplay from './components/QRCodeDisplay.vue'
import BanRiskMeter from './components/BanRiskMeter.vue'
import WebhookEvents from './components/WebhookEvents.vue'

// Reactive state
const status = ref({
  connected: false,
  phone: null,
  name: null,
  qr: null,
  uptime: 0,
})

const rateLimits = ref({
  hourlyCount: 0,
  hourlyLimit: 30,
  dailyCount: 0,
  dailyLimit: 150,
})

const banWarning = ref({
  riskScore: 0,
  isHibernating: false,
  recommendation: 'Normal operation',
})

const analytics = ref({
  totalMessagesSent: 0,
  totalMessagesReceived: 0,
  peakHours: {},
})

const recentMessages = ref([])
const webhookEvents = ref([])
const loading = ref(true)
const error = ref(null)
const lastUpdate = ref(null)
const sseConnected = ref(false)

// API base URL (empty for proxy, or full URL for direct)
const API_BASE = ''
// API token from environment or default (for dev)
const API_TOKEN = import.meta.env.VITE_API_TOKEN || 'wa2bridge-secret-key-2024'

// Helper for authenticated fetch
async function apiFetch(endpoint) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`API error: ${res.status}`)
  return res.json()
}

// Process ban warning data (shared between SSE and fetch)
function processBanWarning(bw) {
  const levelScores = { normal: 10, elevated: 40, high: 70, critical: 95 }
  const riskScore = levelScores[bw.currentLevel] || 0
  const recommendations = {
    normal: 'Normal operation',
    elevated: 'Reduce message frequency',
    high: 'Pause sending, wait 1-2 hours',
    critical: 'Stop immediately, risk of ban',
  }
  return {
    riskScore,
    isHibernating: bw.hibernationMode || false,
    recommendation: recommendations[bw.currentLevel] || 'Normal operation',
    currentLevel: bw.currentLevel,
    metrics: bw,
  }
}

// Fetch analytics (not streamed via SSE)
async function fetchAnalytics() {
  try {
    analytics.value = await apiFetch('/api/analytics')
  } catch (e) {
    console.error('Analytics fetch error:', e)
  }
}

// Fetch webhook events history (initial load only)
async function fetchWebhookEvents() {
  try {
    const data = await apiFetch('/api/webhooks/history?limit=10')
    webhookEvents.value = data.events || []
  } catch (e) {
    console.error('Webhook events fetch error:', e)
  }
}

// Refresh all data (manual refresh or fallback)
async function refreshAll() {
  loading.value = true
  try {
    const [statusData, rateLimitsData, banWarningData, analyticsData, webhookData] = await Promise.all([
      apiFetch('/api/status'),
      apiFetch('/api/rate-limits'),
      apiFetch('/api/ban-warning'),
      apiFetch('/api/analytics'),
      apiFetch('/api/webhooks/history?limit=10'),
    ])
    status.value = statusData
    rateLimits.value = rateLimitsData.rateLimits || rateLimitsData
    banWarning.value = processBanWarning(banWarningData.banWarning || banWarningData)
    analytics.value = analyticsData
    webhookEvents.value = webhookData.events || []
    lastUpdate.value = new Date()
    error.value = null
  } catch (e) {
    error.value = e.message
  }
  loading.value = false
}

// ==========================================================================
// Server-Sent Events (Real-Time Updates)
// ==========================================================================
let eventSource = null
let reconnectTimeout = null
let analyticsInterval = null

function connectSSE() {
  if (eventSource) {
    eventSource.close()
  }

  eventSource = new EventSource(`${API_BASE}/api/events`)

  eventSource.onopen = () => {
    console.log('[SSE] Connected')
    sseConnected.value = true
    error.value = null
  }

  eventSource.onerror = (e) => {
    console.error('[SSE] Connection error:', e)
    sseConnected.value = false
    eventSource.close()

    // Reconnect after 3 seconds
    reconnectTimeout = setTimeout(() => {
      console.log('[SSE] Reconnecting...')
      connectSSE()
    }, 3000)
  }

  // Handle status updates
  eventSource.addEventListener('status', (e) => {
    try {
      status.value = JSON.parse(e.data)
      lastUpdate.value = new Date()
    } catch (err) {
      console.error('[SSE] Failed to parse status:', err)
    }
  })

  // Handle rate limits updates
  eventSource.addEventListener('rate-limits', (e) => {
    try {
      const data = JSON.parse(e.data)
      rateLimits.value = data.rateLimits || data
    } catch (err) {
      console.error('[SSE] Failed to parse rate-limits:', err)
    }
  })

  // Handle ban warning updates
  eventSource.addEventListener('ban-warning', (e) => {
    try {
      const data = JSON.parse(e.data)
      banWarning.value = processBanWarning(data.banWarning || data)
    } catch (err) {
      console.error('[SSE] Failed to parse ban-warning:', err)
    }
  })

  // Handle webhook events (prepend to list)
  eventSource.addEventListener('webhook-event', (e) => {
    try {
      const event = JSON.parse(e.data)
      webhookEvents.value = [event, ...webhookEvents.value.slice(0, 9)]
    } catch (err) {
      console.error('[SSE] Failed to parse webhook-event:', err)
    }
  })

  // Handle message events
  eventSource.addEventListener('message-sent', (e) => {
    try {
      const msg = JSON.parse(e.data)
      recentMessages.value = [{ ...msg, direction: 'out' }, ...recentMessages.value.slice(0, 19)]
    } catch (err) {
      console.error('[SSE] Failed to parse message-sent:', err)
    }
  })

  eventSource.addEventListener('message-received', (e) => {
    try {
      const msg = JSON.parse(e.data)
      recentMessages.value = [{ ...msg, direction: 'in' }, ...recentMessages.value.slice(0, 19)]
    } catch (err) {
      console.error('[SSE] Failed to parse message-received:', err)
    }
  })
}

onMounted(() => {
  // Initial data fetch
  refreshAll()

  // Connect to SSE for real-time updates
  connectSSE()

  // Analytics don't stream via SSE, poll every 30 seconds
  analyticsInterval = setInterval(fetchAnalytics, 30000)
})

onUnmounted(() => {
  if (eventSource) {
    eventSource.close()
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
  }
  if (analyticsInterval) {
    clearInterval(analyticsInterval)
  }
})

// Format uptime
function formatUptime(ms) {
  if (!ms) return '0s'
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}
</script>

<template>
  <div class="min-h-screen bg-gray-900 text-white">
    <!-- Header -->
    <header class="bg-gray-800 border-b border-gray-700 px-6 py-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center space-x-4">
          <div class="flex items-center space-x-2">
            <div
              class="w-3 h-3 rounded-full"
              :class="status.connected ? 'bg-wa-green pulse-green' : 'bg-red-500 pulse-red'"
            ></div>
            <h1 class="text-xl font-bold">WA2Bridge Dashboard</h1>
          </div>
          <span class="text-gray-400 text-sm">
            {{ status.connected ? `Connected: ${status.phone}` : 'Disconnected' }}
          </span>
        </div>

        <div class="flex items-center space-x-4">
          <!-- SSE Connection Indicator -->
          <span
            class="flex items-center space-x-1 text-xs px-2 py-1 rounded"
            :class="sseConnected ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'"
          >
            <span class="w-2 h-2 rounded-full" :class="sseConnected ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'"></span>
            <span>{{ sseConnected ? 'Live' : 'Connecting...' }}</span>
          </span>
          <span v-if="lastUpdate" class="text-gray-500 text-sm">
            {{ lastUpdate.toLocaleTimeString() }}
          </span>
          <button
            @click="refreshAll"
            class="px-4 py-2 bg-wa-dark hover:bg-wa-light rounded-lg transition-colors"
            :disabled="loading"
          >
            {{ loading ? 'Refreshing...' : 'Refresh' }}
          </button>
        </div>
      </div>
    </header>

    <!-- Error Banner -->
    <div v-if="error" class="bg-red-900 border-l-4 border-red-500 px-6 py-3">
      <p class="text-red-200">{{ error }}</p>
    </div>

    <!-- Main Content -->
    <main class="p-6">
      <!-- QR Code Display (when not connected) -->
      <div v-if="!status.connected && status.qr" class="mb-6">
        <QRCodeDisplay :qr="status.qr" />
      </div>

      <!-- Status Cards Row -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatusCard
          title="Connection"
          :value="status.connected ? 'Online' : 'Offline'"
          :icon="status.connected ? '🟢' : '🔴'"
          :subtitle="status.name || 'Not connected'"
        />
        <StatusCard
          title="Uptime"
          :value="formatUptime(status.stats?.uptime * 1000)"
          icon="⏱️"
          subtitle="Since last connect"
        />
        <StatusCard
          title="Messages Sent"
          :value="analytics.totalMessagesSent?.toString() || '0'"
          icon="📤"
          subtitle="Total outgoing"
        />
        <StatusCard
          title="Messages Received"
          :value="analytics.totalMessagesReceived?.toString() || '0'"
          icon="📥"
          subtitle="Total incoming"
        />
      </div>

      <!-- Rate Limits & Ban Risk Row -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <RateLimitGauge
          title="Hourly Limit"
          :used="rateLimits.hourlyCount || 0"
          :limit="rateLimits.hourlyLimit || 30"
        />
        <RateLimitGauge
          title="Daily Limit"
          :used="rateLimits.dailyCount || 0"
          :limit="rateLimits.dailyLimit || 150"
        />
        <BanRiskMeter
          :riskScore="banWarning.riskScore || 0"
          :isHibernating="banWarning.isHibernating"
          :recommendation="banWarning.recommendation"
        />
      </div>

      <!-- Charts Row -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <MessageChart :analytics="analytics" />
        <WebhookEvents :events="webhookEvents" />
      </div>

      <!-- Recent Messages -->
      <RecentMessages :messages="recentMessages" />
    </main>

    <!-- Footer -->
    <footer class="bg-gray-800 border-t border-gray-700 px-6 py-4 text-center text-gray-500 text-sm">
      WA2Bridge v2.0.0 • Anti-Ban Protection Active •
      <a href="/api-docs" target="_blank" class="text-wa-green hover:underline">API Docs</a>
    </footer>
  </div>
</template>
