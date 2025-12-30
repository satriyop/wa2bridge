<script setup>
import { computed } from 'vue'

const props = defineProps({
  title: String,
  used: Number,
  limit: Number,
})

const percentage = computed(() => {
  if (!props.limit) return 0
  return Math.min((props.used / props.limit) * 100, 100)
})

const remaining = computed(() => {
  return Math.max(props.limit - props.used, 0)
})

const statusColor = computed(() => {
  if (percentage.value >= 90) return 'bg-red-500'
  if (percentage.value >= 70) return 'bg-yellow-500'
  return 'bg-wa-green'
})

const statusText = computed(() => {
  if (percentage.value >= 90) return 'Critical'
  if (percentage.value >= 70) return 'Warning'
  return 'OK'
})
</script>

<template>
  <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
    <div class="flex items-center justify-between mb-3">
      <span class="text-gray-400 text-sm">{{ title }}</span>
      <span
        class="text-xs px-2 py-1 rounded-full"
        :class="[statusColor, 'text-white']"
      >
        {{ statusText }}
      </span>
    </div>

    <!-- Progress bar -->
    <div class="w-full bg-gray-700 rounded-full h-3 mb-2">
      <div
        class="h-3 rounded-full transition-all duration-300"
        :class="statusColor"
        :style="{ width: `${percentage}%` }"
      ></div>
    </div>

    <div class="flex justify-between text-sm">
      <span class="text-gray-400">{{ used }} / {{ limit }}</span>
      <span class="text-gray-500">{{ remaining }} remaining</span>
    </div>
  </div>
</template>
