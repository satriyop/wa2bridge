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
  hourly: { used: 0, limit: 30, remaining: 30 },
  daily: { used: 0, limit: 150, remaining: 150 },
})

const banWarning = ref({
  riskScore: 0,
  isHibernating: false,
  recommendation: 'Normal operation',
})

const analytics = ref({
  totalSent: 0,
  totalReceived: 0,
  peakHours: [],
})

const recentMessages = ref([])
const webhookEvents = ref([])
const loading = ref(true)
const error = ref(null)
const lastUpdate = ref(null)

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

// Fetch status from API
async function fetchStatus() {
  try {
    const data = await apiFetch('/api/status')
    status.value = data
    lastUpdate.value = new Date()
    error.value = null
  } catch (e) {
    error.value = e.message
  }
}

// Fetch rate limits
async function fetchRateLimits() {
  try {
    rateLimits.value = await apiFetch('/api/rate-limits')
  } catch (e) {
    console.error('Rate limits fetch error:', e)
  }
}

// Fetch ban warning
async function fetchBanWarning() {
  try {
    banWarning.value = await apiFetch('/api/ban-warning')
  } catch (e) {
    console.error('Ban warning fetch error:', e)
  }
}

// Fetch analytics
async function fetchAnalytics() {
  try {
    analytics.value = await apiFetch('/api/analytics')
  } catch (e) {
    console.error('Analytics fetch error:', e)
  }
}

// Fetch webhook events
async function fetchWebhookEvents() {
  try {
    const data = await apiFetch('/api/webhooks/history?limit=10')
    webhookEvents.value = data.events || []
  } catch (e) {
    console.error('Webhook events fetch error:', e)
  }
}

// Refresh all data
async function refreshAll() {
  loading.value = true
  await Promise.all([
    fetchStatus(),
    fetchRateLimits(),
    fetchBanWarning(),
    fetchAnalytics(),
    fetchWebhookEvents(),
  ])
  loading.value = false
}

// Polling interval
let pollInterval = null

onMounted(() => {
  refreshAll()
  // Poll every 5 seconds
  pollInterval = setInterval(refreshAll, 5000)
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
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
          <span v-if="lastUpdate" class="text-gray-500 text-sm">
            Updated: {{ lastUpdate.toLocaleTimeString() }}
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
          :value="formatUptime(status.uptime)"
          icon="⏱️"
          subtitle="Since last connect"
        />
        <StatusCard
          title="Messages Sent"
          :value="analytics.totalSent?.toString() || '0'"
          icon="📤"
          subtitle="Total outgoing"
        />
        <StatusCard
          title="Messages Received"
          :value="analytics.totalReceived?.toString() || '0'"
          icon="📥"
          subtitle="Total incoming"
        />
      </div>

      <!-- Rate Limits & Ban Risk Row -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <RateLimitGauge
          title="Hourly Limit"
          :used="rateLimits.hourly?.used || 0"
          :limit="rateLimits.hourly?.limit || 30"
        />
        <RateLimitGauge
          title="Daily Limit"
          :used="rateLimits.daily?.used || 0"
          :limit="rateLimits.daily?.limit || 150"
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
