<script setup>
import { computed } from 'vue'

const props = defineProps({
  aiSourceStats: Object
})

const hasData = computed(() => props.aiSourceStats && props.aiSourceStats.totalVisits > 0)

const providers = computed(() => props.aiSourceStats?.providers || [])
const maxCount = computed(() => Math.max(...providers.value.map(p => p.count), 1))

// Sparkline-Pfad aus der Tagesreihe (byDay) erzeugen
const byDay = computed(() => props.aiSourceStats?.byDay || [])
const sparkline = computed(() => {
  const data = byDay.value
  if (data.length < 2) return null
  const w = 100, h = 28
  const max = Math.max(...data.map(d => d.count), 1)
  const step = w / (data.length - 1)
  const points = data.map((d, i) => {
    const x = i * step
    const y = h - (d.count / max) * (h - 2) - 1
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  return {
    line: 'M' + points.join(' L'),
    area: `M0,${h} L` + points.join(' L') + ` L${w},${h} Z`,
    w, h
  }
})

const peakDay = computed(() => {
  if (!byDay.value.length) return null
  return byDay.value.reduce((a, b) => (b.count > a.count ? b : a))
})

function formatDay(dateStr) {
  if (!dateStr) return ''
  const [, m, d] = dateStr.split('-')
  return `${d}.${m}.`
}
</script>

<template>
  <div class="ai-stats">
    <h3>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="4" y="8" width="16" height="12" rx="2"/>
        <path d="M12 8V4M8 4h8"/>
        <circle cx="9" cy="14" r="1" fill="currentColor" stroke="none"/>
        <circle cx="15" cy="14" r="1" fill="currentColor" stroke="none"/>
      </svg>
      KI-Quellen (LLM-Traffic)
      <span v-if="hasData" class="total-badge">{{ aiSourceStats.totalVisits }} Besuche</span>
    </h3>

    <div v-if="!hasData" class="no-data">
      Kein erkennbarer KI-/LLM-Traffic im gewählten Zeitraum
    </div>

    <template v-else>
      <!-- Kennzahlen -->
      <div class="ai-summary">
        <div class="ai-metric">
          <span class="ai-metric-value">{{ aiSourceStats.uniqueVisitors }}</span>
          <span class="ai-metric-label">Unique Besucher</span>
        </div>
        <div class="ai-metric">
          <span class="ai-metric-value">{{ aiSourceStats.shareOfPageViews }}%</span>
          <span class="ai-metric-label">Anteil an Seitenaufrufen</span>
        </div>
        <div class="ai-metric">
          <span class="ai-metric-value">{{ providers.length }}</span>
          <span class="ai-metric-label">Erkannte KI-Dienste</span>
        </div>
      </div>

      <!-- Trend -->
      <div v-if="sparkline" class="ai-trend">
        <div class="ai-trend-head">
          <span>Verlauf</span>
          <span v-if="peakDay" class="ai-trend-peak">Spitze: {{ peakDay.count }} am {{ formatDay(peakDay.date) }}</span>
        </div>
        <svg class="spark" :viewBox="`0 0 ${sparkline.w} ${sparkline.h}`" preserveAspectRatio="none">
          <path :d="sparkline.area" class="spark-area" />
          <path :d="sparkline.line" class="spark-line" />
        </svg>
      </div>

      <!-- Provider -->
      <div class="section">
        <h4>Nach KI-Dienst</h4>
        <div class="bar-list">
          <div v-for="p in providers" :key="p.name" class="bar-row">
            <span class="provider-icon">{{ p.icon }}</span>
            <span class="label" :title="p.name">{{ p.name }}</span>
            <div class="bar-wrap">
              <div class="bar" :style="{ width: `${(p.count / maxCount) * 100}%` }"></div>
            </div>
            <span class="count" :title="`${p.uniqueVisitors} unique Besucher`">{{ p.count }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ai-stats {
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
  margin-bottom: 1rem;
}
h3 svg { width: 18px; height: 18px; color: var(--accent-purple); }

.total-badge {
  margin-left: auto;
  font-size: 0.75rem;
  font-family: var(--font-mono);
  color: var(--accent-purple);
  background: rgba(168, 85, 247, 0.1);
  border: 1px solid rgba(168, 85, 247, 0.2);
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
}

.ai-summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.ai-metric {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.6rem 0.75rem;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.ai-metric-value {
  font-family: var(--font-mono);
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
}

.ai-metric-label {
  font-size: 0.68rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.ai-trend {
  margin-bottom: 1rem;
}

.ai-trend-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.35rem;
}

.ai-trend-head > span:first-child {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.ai-trend-peak {
  font-size: 0.72rem;
  font-family: var(--font-mono);
  color: var(--text-secondary);
}

.spark {
  width: 100%;
  height: 36px;
  display: block;
}

.spark-line {
  fill: none;
  stroke: var(--accent-purple);
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
}

.spark-area {
  fill: rgba(168, 85, 247, 0.12);
  stroke: none;
}

.section { margin-bottom: 0; }

h4 {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}

.bar-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
}

.provider-icon {
  font-size: 0.95rem;
  flex-shrink: 0;
  width: 18px;
  text-align: center;
}

.label {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--text-primary);
  width: 90px;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bar-wrap {
  flex: 1;
  height: 3px;
  background: var(--bg-card);
  border-radius: 2px;
  overflow: hidden;
}

.bar {
  height: 100%;
  border-radius: 2px;
  background: var(--accent-purple);
  transition: width 0.3s;
}

.count {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.no-data {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
  padding: 2rem;
}

@media (max-width: 500px) {
  .ai-summary { grid-template-columns: 1fr; }
}
</style>
