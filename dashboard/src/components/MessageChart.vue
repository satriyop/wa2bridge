<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const props = defineProps({
  analytics: Object,
})

const chartData = computed(() => {
  const hours = Array.from({ length: 24 }, (_, i) => `${i}:00`)
  const peakData = props.analytics?.peakHours || new Array(24).fill(0)

  return {
    labels: hours,
    datasets: [
      {
        label: 'Messages',
        data: peakData,
        borderColor: '#25D366',
        backgroundColor: 'rgba(37, 211, 102, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 5,
      },
    ],
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      backgroundColor: '#1f2937',
      titleColor: '#fff',
      bodyColor: '#9ca3af',
      borderColor: '#374151',
      borderWidth: 1,
    },
  },
  scales: {
    x: {
      grid: {
        color: '#374151',
      },
      ticks: {
        color: '#9ca3af',
        maxTicksLimit: 12,
      },
    },
    y: {
      grid: {
        color: '#374151',
      },
      ticks: {
        color: '#9ca3af',
      },
      beginAtZero: true,
    },
  },
}
</script>

<template>
  <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
    <div class="flex items-center justify-between mb-4">
      <span class="text-gray-400 text-sm">Message Activity (24h)</span>
      <div class="flex items-center space-x-4 text-xs">
        <span class="flex items-center">
          <span class="w-3 h-3 bg-wa-green rounded-full mr-1"></span>
          Messages
        </span>
      </div>
    </div>

    <div class="h-48">
      <Line :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>
