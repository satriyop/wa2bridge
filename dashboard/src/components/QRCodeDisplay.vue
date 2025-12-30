<script setup>
import { ref, watch, onMounted } from 'vue'

const props = defineProps({
  qr: String,
})

const qrImage = ref(null)

// Generate QR code image from string
// The QR prop is already a data URL or base64 from the API
watch(() => props.qr, (newQr) => {
  if (newQr) {
    // If it's already a data URL, use directly
    if (newQr.startsWith('data:')) {
      qrImage.value = newQr
    } else {
      // Otherwise treat as base64
      qrImage.value = `data:image/png;base64,${newQr}`
    }
  }
}, { immediate: true })
</script>

<template>
  <div class="bg-gray-800 rounded-lg p-6 border border-gray-700 text-center">
    <h2 class="text-xl font-bold mb-4">Scan QR Code to Connect</h2>

    <div class="bg-white p-4 rounded-lg inline-block mb-4">
      <img
        v-if="qrImage"
        :src="qrImage"
        alt="WhatsApp QR Code"
        class="w-64 h-64"
      />
      <div v-else class="w-64 h-64 flex items-center justify-center text-gray-500">
        Loading QR...
      </div>
    </div>

    <div class="text-gray-400 text-sm space-y-2">
      <p>1. Open WhatsApp on your phone</p>
      <p>2. Tap Menu or Settings and select Linked Devices</p>
      <p>3. Point your phone at this screen to scan the code</p>
    </div>

    <div class="mt-4 text-yellow-500 text-xs">
      QR code expires in 60 seconds. Page will auto-refresh.
    </div>
  </div>
</template>
