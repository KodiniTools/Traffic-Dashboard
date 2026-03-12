<script setup>
import { computed } from 'vue'

const props = defineProps({
  sessionDuration: Object,
  engagement: Object,
  sessionDepth: Object,
  peakHoursHeatmap: Object
})

const durationBuckets = computed(() => {
  if (!props.sessionDuration?.buckets) return []
  const buckets = props.sessionDuration.buckets
  const total = Object.values(buckets).reduce((a, b) => a + b, 0)
  return Object.entries(buckets).map(([label, count]) => ({
    label,
    count,
    percent: total > 0 ? Math.round((count / total) * 100) : 0
  }))
})

const engagementData = computed(() => {
  if (!props.engagement?.scores) return []
  const labels = { low: 'Niedrig', medium: 'Mittel', high: 'Hoch', veryHigh: 'Sehr hoch' }
  const colors = { low: '#ef4444', medium: '#f59e0b', high: '#22c55e', veryHigh: '#3b82f6' }
  const total = props.engagement.totalSessions || 1
  return Object.entries(props.engagement.scores).map(([key, count]) => ({
    label: labels[key],
    color: colors[key],
    count,
    percent: Math.round((count / total) * 100)
  }))
})

const depthData = computed(() => {
  if (!props.sessionDepth) return []
  const total = Object.values(props.sessionDepth).reduce((a, b) => a + b, 0)
  const labels = { '1': '1 Seite', '2': '2 Seiten', '3-4': '3-4 Seiten', '5-9': '5-9 Seiten', '10+': '10+ Seiten' }
  return Object.entries(props.sessionDepth).map(([key, count]) => ({
    label: labels[key] || key,
    count,
    percent: total > 0 ? Math.round((count / total) * 100) : 0
  }))
})

// Heatmap
const dayLabels = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const hours = Array.from({ length: 24 }, (_, i) => i)

const heatmapMax = computed(() => {
  if (!props.peakHoursHeatmap) return 1
  let max = 0
  for (const dow of Object.values(props.peakHoursHeatmap)) {
    for (const val of Object.values(dow)) {
      if (val > max) max = val
    }
  }
  return max || 1
})

function heatColor(value) {
  if (value === 0) return 'rgba(59, 130, 246, 0.05)'
  const intensity = value / heatmapMax.value
  if (intensity < 0.25) return 'rgba(59, 130, 246, 0.15)'
  if (intensity < 0.5) return 'rgba(59, 130, 246, 0.35)'
  if (intensity < 0.75) return 'rgba(59, 130, 246, 0.6)'
  return 'rgba(59, 130, 246, 0.9)'
}

function getCellValue(dow, hour) {
  return props.peakHoursHeatmap?.[dow]?.[hour] || 0
}
</script>

<template>
  <div class="user-behavior">
    <h3>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M22 21v-2a4 4 0 00-3-3.87"/>
        <path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>
      Nutzerverhalten
    </h3>

    <!-- Session-Dauer -->
    <div class="section">
      <div class="section-header">
        <span class="section-title">Session-Dauer</span>
        <div class="duration-summary">
          <span class="duration-value">{{ sessionDuration?.avgFormatted || '0s' }}</span>
          <span class="duration-label">Durchschnitt</span>
        </div>
        <div class="duration-summary">
          <span class="duration-value active">{{ sessionDuration?.avgActiveFormatted || '0s' }}</span>
          <span class="duration-label">Aktive Sessions</span>
        </div>
      </div>
      <div class="bar-list">
        <div v-for="b in durationBuckets" :key="b.label" class="bar-item">
          <span class="bar-label">{{ b.label }}</span>
          <div class="bar-track">
            <div class="bar-fill duration" :style="{ width: b.percent + '%' }"></div>
          </div>
          <span class="bar-value">{{ b.count }} <span class="bar-pct">({{ b.percent }}%)</span></span>
        </div>
      </div>
    </div>

    <!-- Engagement -->
    <div class="section">
      <span class="section-title">Engagement</span>
      <div class="engagement-grid">
        <div v-for="e in engagementData" :key="e.label" class="engagement-card" :style="{ '--eng-color': e.color }">
          <span class="eng-value">{{ e.count }}</span>
          <span class="eng-pct">{{ e.percent }}%</span>
          <span class="eng-label">{{ e.label }}</span>
        </div>
      </div>
    </div>

    <!-- Session-Tiefe -->
    <div class="section">
      <span class="section-title">Session-Tiefe</span>
      <div class="bar-list">
        <div v-for="d in depthData" :key="d.label" class="bar-item">
          <span class="bar-label">{{ d.label }}</span>
          <div class="bar-track">
            <div class="bar-fill depth" :style="{ width: d.percent + '%' }"></div>
          </div>
          <span class="bar-value">{{ d.count }} <span class="bar-pct">({{ d.percent }}%)</span></span>
        </div>
      </div>
    </div>

    <!-- Peak Hours Heatmap -->
    <div class="section" v-if="peakHoursHeatmap">
      <span class="section-title">Aktivitäts-Heatmap (Wochentag × Stunde)</span>
      <div class="heatmap-wrapper">
        <div class="heatmap">
          <div class="heatmap-header">
            <span class="heatmap-corner"></span>
            <span v-for="h in hours" :key="h" class="heatmap-hour">{{ h }}</span>
          </div>
          <div v-for="(dayLabel, idx) in dayLabels" :key="idx" class="heatmap-row">
            <span class="heatmap-day">{{ dayLabel }}</span>
            <span
              v-for="h in hours"
              :key="h"
              class="heatmap-cell"
              :style="{ background: heatColor(getCellValue(idx, h)) }"
              :title="`${dayLabel} ${h}:00 - ${getCellValue(idx, h)} Aufrufe`"
            ></span>
          </div>
        </div>
        <div class="heatmap-legend">
          <span>Wenig</span>
          <span class="legend-gradient"></span>
          <span>Viel</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.user-behavior {
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

.section-header {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  margin-bottom: 0.75rem;
}

.duration-summary {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.duration-value {
  font-family: var(--font-mono);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--accent-cyan);
}

.duration-value.active { color: var(--accent-green); }

.duration-label {
  font-size: 0.7rem;
  color: var(--text-muted);
}

/* Bar list */
.bar-list { display: flex; flex-direction: column; gap: 0.4rem; }

.bar-item {
  display: grid;
  grid-template-columns: 70px 1fr 90px;
  align-items: center;
  gap: 0.5rem;
}

.bar-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-family: var(--font-mono);
}

.bar-track {
  height: 6px;
  background: var(--bg-card);
  border-radius: 3px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.4s ease;
}

.bar-fill.duration { background: var(--accent-cyan); }
.bar-fill.depth { background: var(--accent-purple); }

.bar-value {
  font-size: 0.75rem;
  color: var(--text-primary);
  font-family: var(--font-mono);
  text-align: right;
}

.bar-pct { color: var(--text-muted); font-size: 0.65rem; }

/* Engagement */
.engagement-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.5rem;
}

.engagement-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.6rem 0.4rem;
  background: var(--bg-tertiary);
  border-radius: 8px;
  border-left: 3px solid var(--eng-color);
}

.eng-value {
  font-family: var(--font-mono);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
}

.eng-pct {
  font-size: 0.7rem;
  color: var(--eng-color);
  font-family: var(--font-mono);
}

.eng-label {
  font-size: 0.65rem;
  color: var(--text-muted);
  text-transform: uppercase;
}

/* Heatmap */
.heatmap-wrapper {
  overflow-x: auto;
}

.heatmap {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 500px;
}

.heatmap-header, .heatmap-row {
  display: flex;
  gap: 2px;
}

.heatmap-corner {
  width: 28px;
  flex-shrink: 0;
}

.heatmap-hour {
  flex: 1;
  font-size: 0.55rem;
  color: var(--text-muted);
  text-align: center;
  font-family: var(--font-mono);
}

.heatmap-day {
  width: 28px;
  flex-shrink: 0;
  font-size: 0.65rem;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  display: flex;
  align-items: center;
}

.heatmap-cell {
  flex: 1;
  aspect-ratio: 1;
  border-radius: 2px;
  min-width: 14px;
  min-height: 14px;
  cursor: default;
}

.heatmap-legend {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  justify-content: flex-end;
  font-size: 0.65rem;
  color: var(--text-muted);
}

.legend-gradient {
  width: 80px;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(to right,
    rgba(59, 130, 246, 0.05),
    rgba(59, 130, 246, 0.15),
    rgba(59, 130, 246, 0.35),
    rgba(59, 130, 246, 0.6),
    rgba(59, 130, 246, 0.9)
  );
}

@media (max-width: 768px) {
  .engagement-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .section-header {
    flex-wrap: wrap;
  }
  .bar-item {
    grid-template-columns: 60px 1fr 70px;
  }
}
</style>
