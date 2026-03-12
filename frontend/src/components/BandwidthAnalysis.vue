<script setup>
import { computed } from 'vue'

const props = defineProps({
  bandwidthByPage: Array,
  trafficByHour: Object,
  totalBytesFormatted: String,
  totalBytes: Number
})

const maxBandwidth = computed(() => {
  if (!props.bandwidthByPage?.length) return 1
  return props.bandwidthByPage[0].bytes || 1
})

const hourlyData = computed(() => {
  if (!props.trafficByHour) return []
  const data = []
  let maxTotal = 0
  for (let h = 0; h < 24; h++) {
    const item = props.trafficByHour[h] || { human: 0, bot: 0, total: 0 }
    if (item.total > maxTotal) maxTotal = item.total
    data.push({ hour: h, ...item })
  }
  return data.map(d => ({
    ...d,
    humanFormatted: formatBytes(d.human),
    botFormatted: formatBytes(d.bot),
    totalFormatted: formatBytes(d.total),
    heightPercent: maxTotal > 0 ? Math.round((d.total / maxTotal) * 100) : 0,
    humanPercent: maxTotal > 0 ? Math.round((d.human / maxTotal) * 100) : 0,
    botPercent: maxTotal > 0 ? Math.round((d.bot / maxTotal) * 100) : 0
  }))
})

function formatBytes(bytes) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
</script>

<template>
  <div class="bandwidth-analysis">
    <h3>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
        <polyline points="7,10 12,15 17,10"/>
        <line x1="12" y1="15" x2="12" y2="3"/>
      </svg>
      Bandwidth-Analyse
      <span class="total-badge" v-if="totalBytesFormatted">{{ totalBytesFormatted }} gesamt</span>
    </h3>

    <!-- Traffic pro Stunde (Balkendiagramm) -->
    <div class="section">
      <span class="section-title">Traffic pro Stunde (Zürich)</span>
      <div class="hourly-chart">
        <div
          v-for="h in hourlyData"
          :key="h.hour"
          class="hour-bar-wrapper"
          :title="`${h.hour}:00 — ${h.totalFormatted} (Human: ${h.humanFormatted}, Bot: ${h.botFormatted})`"
        >
          <div class="hour-bar">
            <div class="hour-bar-bot" :style="{ height: h.botPercent + '%' }"></div>
            <div class="hour-bar-human" :style="{ height: h.humanPercent + '%' }"></div>
          </div>
          <span class="hour-label">{{ h.hour }}</span>
        </div>
      </div>
      <div class="chart-legend">
        <span class="legend-item"><span class="dot human"></span> Mensch</span>
        <span class="legend-item"><span class="dot bot"></span> Bot</span>
      </div>
    </div>

    <!-- Bandwidth pro Seite -->
    <div class="section" v-if="bandwidthByPage?.length">
      <span class="section-title">Traffic pro Seite (Top 15)</span>
      <div class="page-list">
        <div v-for="(page, i) in bandwidthByPage" :key="page.path" class="page-item">
          <span class="page-rank">{{ i + 1 }}</span>
          <div class="page-info">
            <span class="page-path">{{ page.path }}</span>
            <div class="page-bar-track">
              <div
                class="page-bar-fill"
                :style="{ width: Math.round((page.bytes / maxBandwidth) * 100) + '%' }"
              ></div>
            </div>
          </div>
          <div class="page-stats">
            <span class="page-bytes">{{ page.bytesFormatted }}</span>
            <span class="page-meta">{{ page.requests }} Req · Ø {{ page.avgBytesFormatted }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bandwidth-analysis {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.25rem;
}

h3 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 1.25rem;
}

h3 svg { width: 18px; height: 18px; color: var(--accent-purple); }

.total-badge {
  margin-left: auto;
  font-size: 0.75rem;
  font-family: var(--font-mono);
  background: rgba(168, 85, 247, 0.15);
  color: var(--accent-purple);
  padding: 0.2rem 0.6rem;
  border-radius: 12px;
}

.section {
  margin-bottom: 1.25rem;
}

.section:last-child { margin-bottom: 0; }

.section-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  display: block;
  margin-bottom: 0.75rem;
}

/* Hourly Chart */
.hourly-chart {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 120px;
  padding: 0 2px;
}

.hour-bar-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
}

.hour-bar {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  gap: 1px;
}

.hour-bar-human {
  background: var(--accent-blue);
  border-radius: 2px 2px 0 0;
  min-height: 0;
  transition: height 0.3s ease;
}

.hour-bar-bot {
  background: rgba(245, 158, 11, 0.6);
  border-radius: 2px 2px 0 0;
  min-height: 0;
  transition: height 0.3s ease;
}

.hour-label {
  font-size: 0.5rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
  margin-top: 2px;
}

.chart-legend {
  display: flex;
  gap: 1rem;
  margin-top: 0.5rem;
  justify-content: flex-end;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.7rem;
  color: var(--text-muted);
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.dot.human { background: var(--accent-blue); }
.dot.bot { background: rgba(245, 158, 11, 0.6); }

/* Page List */
.page-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.page-item {
  display: grid;
  grid-template-columns: 24px 1fr auto;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  background: var(--bg-tertiary);
  border-radius: 6px;
}

.page-rank {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
  text-align: center;
}

.page-info {
  min-width: 0;
}

.page-path {
  font-size: 0.75rem;
  color: var(--text-primary);
  font-family: var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.page-bar-track {
  height: 3px;
  background: var(--bg-card);
  border-radius: 2px;
  margin-top: 3px;
  overflow: hidden;
}

.page-bar-fill {
  height: 100%;
  background: var(--accent-purple);
  border-radius: 2px;
  transition: width 0.4s ease;
}

.page-stats {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  min-width: 80px;
}

.page-bytes {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.page-meta {
  font-size: 0.6rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}
</style>
