<script setup>
import { computed } from 'vue'

const props = defineProps({
  events: Array,
})

// Format timestamp
function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString()
}

// Get event icon/color based on type
function getEventStyle(eventType) {
  const prefix = eventType?.split('.')[0] || 'unknown'

  const styles = {
    message: { icon: '💬', color: 'bg-wa-green/20 text-wa-green' },
    presence: { icon: '👤', color: 'bg-blue-500/20 text-blue-400' },
    connection: { icon: '🔌', color: 'bg-purple-500/20 text-purple-400' },
    contact: { icon: '📇', color: 'bg-orange-500/20 text-orange-400' },
    antiban: { icon: '🛡️', color: 'bg-red-500/20 text-red-400' },
    webhook: { icon: '🔗', color: 'bg-gray-500/20 text-gray-400' },
  }

  return styles[prefix] || { icon: '📌', color: 'bg-gray-500/20 text-gray-400' }
}

// Format event type for display
function formatEventType(eventType) {
  return eventType?.replace('.', ' › ') || 'Unknown'
}
</script>

<template>
  <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
    <div class="flex items-center justify-between mb-4">
      <span class="text-gray-400 text-sm">Webhook Events</span>
      <span class="text-gray-500 text-xs">{{ events?.length || 0 }} events</span>
    </div>

    <div v-if="events && events.length > 0" class="space-y-2 max-h-64 overflow-y-auto">
      <div
        v-for="(event, index) in events"
        :key="index"
        class="flex items-start space-x-3 p-2 rounded-lg hover:bg-gray-700/50 transition-colors"
      >
        <!-- Event icon -->
        <div
          class="w-8 h-8 rounded-full flex items-center justify-center text-sm"
          :class="getEventStyle(event.event).color"
        >
          {{ getEventStyle(event.event).icon }}
        </div>

        <!-- Event content -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between">
            <span class="text-white text-sm font-medium">
              {{ formatEventType(event.event) }}
            </span>
            <span class="text-gray-500 text-xs">
              {{ formatTime(event.timestamp) }}
            </span>
          </div>
          <p class="text-gray-400 text-xs truncate">
            {{ JSON.stringify(event.data).slice(0, 50) }}...
          </p>
        </div>
      </div>
    </div>

    <div v-else class="text-center py-8 text-gray-500">
      <p>No webhook events</p>
      <p class="text-xs mt-1">Events will appear as webhooks are sent</p>
    </div>
  </div>
</template>
