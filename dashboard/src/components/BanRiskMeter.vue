<script setup>
import { computed } from 'vue'

const props = defineProps({
  riskScore: Number,
  isHibernating: Boolean,
  recommendation: String,
})

const riskLevel = computed(() => {
  if (props.riskScore >= 80) return { text: 'Critical', color: 'text-red-500', bg: 'bg-red-500' }
  if (props.riskScore >= 60) return { text: 'High', color: 'text-orange-500', bg: 'bg-orange-500' }
  if (props.riskScore >= 40) return { text: 'Medium', color: 'text-yellow-500', bg: 'bg-yellow-500' }
  if (props.riskScore >= 20) return { text: 'Low', color: 'text-blue-500', bg: 'bg-blue-500' }
  return { text: 'Safe', color: 'text-wa-green', bg: 'bg-wa-green' }
})

// Calculate gauge rotation (0 to 180 degrees)
const gaugeRotation = computed(() => {
  return (props.riskScore / 100) * 180
})
</script>

<template>
  <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
    <div class="flex items-center justify-between mb-3">
      <span class="text-gray-400 text-sm">Ban Risk</span>
      <span
        v-if="isHibernating"
        class="text-xs px-2 py-1 rounded-full bg-purple-500 text-white"
      >
        Hibernating
      </span>
    </div>

    <!-- Gauge -->
    <div class="relative w-32 h-16 mx-auto mb-4 overflow-hidden">
      <!-- Background arc -->
      <div class="absolute inset-0 border-8 border-gray-700 rounded-t-full"></div>

      <!-- Colored arc (using clip) -->
      <div
        class="absolute inset-0 border-8 rounded-t-full origin-bottom transition-transform duration-500"
        :class="riskLevel.bg.replace('bg-', 'border-')"
        :style="{
          clipPath: `polygon(0 100%, 50% 50%, 100% 100%)`,
          transform: `rotate(${gaugeRotation - 90}deg)`,
        }"
      ></div>

      <!-- Center text -->
      <div class="absolute bottom-0 left-1/2 transform -translate-x-1/2 text-center">
        <div class="text-2xl font-bold" :class="riskLevel.color">{{ riskScore }}%</div>
      </div>
    </div>

    <!-- Risk level text -->
    <div class="text-center mb-2">
      <span class="text-lg font-semibold" :class="riskLevel.color">
        {{ riskLevel.text }}
      </span>
    </div>

    <!-- Recommendation -->
    <div class="text-gray-500 text-xs text-center">
      {{ recommendation || 'Normal operation' }}
    </div>
  </div>
</template>
