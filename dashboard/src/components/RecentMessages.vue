<script setup>
import { computed } from 'vue'

const props = defineProps({
  messages: Array,
})

// Format timestamp
function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  return date.toLocaleTimeString()
}

// Truncate long messages
function truncate(text, length = 50) {
  if (!text) return ''
  return text.length > length ? text.slice(0, length) + '...' : text
}
</script>

<template>
  <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
    <div class="flex items-center justify-between mb-4">
      <span class="text-gray-400 text-sm">Recent Messages</span>
      <span class="text-gray-500 text-xs">{{ messages?.length || 0 }} messages</span>
    </div>

    <div v-if="messages && messages.length > 0" class="space-y-2 max-h-64 overflow-y-auto">
      <div
        v-for="(msg, index) in messages"
        :key="index"
        class="flex items-start space-x-3 p-2 rounded-lg hover:bg-gray-700/50 transition-colors"
      >
        <!-- Direction indicator -->
        <div
          class="w-8 h-8 rounded-full flex items-center justify-center text-sm"
          :class="msg.direction === 'out' ? 'bg-wa-green/20 text-wa-green' : 'bg-blue-500/20 text-blue-400'"
        >
          {{ msg.direction === 'out' ? '↑' : '↓' }}
        </div>

        <!-- Message content -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between">
            <span class="text-white text-sm font-medium truncate">
              {{ msg.phone || msg.from || msg.to || 'Unknown' }}
            </span>
            <span class="text-gray-500 text-xs">
              {{ formatTime(msg.timestamp) }}
            </span>
          </div>
          <p class="text-gray-400 text-sm truncate">
            {{ truncate(msg.message || msg.text, 60) }}
          </p>
        </div>

        <!-- Status -->
        <div v-if="msg.status" class="text-xs">
          <span
            class="px-2 py-1 rounded-full"
            :class="{
              'bg-green-500/20 text-green-400': msg.status === 'delivered' || msg.status === 'read',
              'bg-yellow-500/20 text-yellow-400': msg.status === 'sent' || msg.status === 'pending',
              'bg-red-500/20 text-red-400': msg.status === 'failed',
            }"
          >
            {{ msg.status }}
          </span>
        </div>
      </div>
    </div>

    <div v-else class="text-center py-8 text-gray-500">
      <p>No recent messages</p>
      <p class="text-xs mt-1">Messages will appear here when sent/received</p>
    </div>
  </div>
</template>
