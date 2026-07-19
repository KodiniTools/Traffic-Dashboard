<script setup>
import { computed } from 'vue'
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
  Filler
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
  data: Object
})

const chartData = computed(() => {
  if (!props.data) return { labels: [], datasets: [] }
  
  // Daten sortieren nach Datum
  const sortedEntries = Object.entries(props.data)
    .sort((a, b) => new Date(a[0]) - new Date(b[0]))
  
  const labels = sortedEntries.map(([date]) => {
    const d = new Date(date)
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
  })
  
  return {
    labels,
    datasets: [
      {
        label: 'Besucher',
        data: sortedEntries.map(([, stats]) => stats.uniqueVisitors ?? 0),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6
      },
      {
        label: 'Seitenaufrufe',
        data: sortedEntries.map(([, stats]) => stats.pageViews ?? 0),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6
      },
      {
        label: 'Human Requests',
        data: sortedEntries.map(([, stats]) => stats.human ?? 0),
        borderColor: '#a855f7',
        backgroundColor: 'rgba(168, 85, 247, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6
      },
      {
        label: 'Bot Requests',
        data: sortedEntries.map(([, stats]) => stats.bot ?? 0),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6
      }
    ]
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: {
    intersect: false,
    mode: 'index'
  },
  plugins: {
    legend: {
      position: 'top',
      align: 'end',
      labels: {
        color: '#8b95a5',
        usePointStyle: true,
        pointStyle: 'circle',
        padding: 20,
        font: {
          family: "'Space Grotesk', sans-serif",
          size: 12
        }
      }
    },
    tooltip: {
      backgroundColor: '#1a2028',
      titleColor: '#e8ecf0',
      bodyColor: '#8b95a5',
      borderColor: '#2a3444',
      borderWidth: 1,
      padding: 12,
      titleFont: {
        family: "'Space Grotesk', sans-serif",
        size: 13,
        weight: 600
      },
      bodyFont: {
        family: "'JetBrains Mono', monospace",
        size: 12
      },
      displayColors: true,
      boxPadding: 4
    }
  },
  scales: {
    x: {
      grid: {
        color: 'rgba(42, 52, 68, 0.5)',
        drawBorder: false
      },
      ticks: {
        color: '#5a6578',
        font: {
          family: "'JetBrains Mono', monospace",
          size: 11
        }
      }
    },
    y: {
      grid: {
        color: 'rgba(42, 52, 68, 0.5)',
        drawBorder: false
      },
      ticks: {
        color: '#5a6578',
        font: {
          family: "'JetBrains Mono', monospace",
          size: 11
        }
      }
    }
  }
}
</script>

<template>
  <div class="chart-container">
    <Line :data="chartData" :options="chartOptions" />
  </div>
</template>

<style scoped>
.chart-container {
  height: 300px;
  position: relative;
}
</style>
