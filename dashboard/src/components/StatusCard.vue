<script setup>
defineProps({
  title: String,
  value: String,
  icon: String,
  subtitle: String,
})
</script>

<template>
  <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
    <div class="flex items-center justify-between mb-2">
      <span class="text-gray-400 text-sm">{{ title }}</span>
      <span class="text-2xl">{{ icon }}</span>
    </div>
    <div class="text-2xl font-bold text-white mb-1">{{ value }}</div>
    <div class="text-gray-500 text-sm">{{ subtitle }}</div>
  </div>
</template>
