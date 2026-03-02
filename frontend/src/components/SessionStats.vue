<script setup>
import { computed } from 'vue'

const props = defineProps({
  sessionStats: Object,
  visitorTypes: Object
})

const bounceRate = computed(() => props.sessionStats?.bounceRate ?? 0)
const avgPages = computed(() => props.sessionStats?.avgPagesPerSession ?? 0)
const totalSessions = computed(() => props.sessionStats?.totalSessions ?? 0)
</script>

<template>
  <div class="session-stats">
    <h3>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 00-3-3.87"/>
        <path d="M16 3.13a4 4 0 010 7.75"/>
      </svg>
      Besucher-Analyse
    </h3>

    <div class="metrics-grid">
      <!-- Bounce Rate -->
      <div class="metric-card">
        <div class="metric-ring" :style="{ '--pct': bounceRate }">
          <svg viewBox="0 0 36 36">
            <path class="ring-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
            <path class="ring-fill bounce" :stroke-dasharray="`${bounceRate}, 100`" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"/>
          </svg>
          <span class="ring-text">{{ bounceRate }}%</span>
        </div>
        <span class="metric-label">Bounce Rate</span>
      </div>

      <!-- Seiten/Session -->
      <div class="metric-card">
        <span class="metric-big">{{ avgPages }}</span>
        <span class="metric-label">Seiten / Session</span>
      </div>

      <!-- Sessions -->
      <div class="metric-card">
        <span class="metric-big">{{ totalSessions.toLocaleString('de-CH') }}</span>
        <span class="metric-label">Sessions</span>
      </div>

      <!-- Neue vs. Wiederkehrend -->
      <div v-if="visitorTypes" class="metric-card visitor-split">
        <div class="split-bar">
          <div class="split-new" :style="{ width: visitorTypes.newPercent + '%' }"></div>
          <div class="split-returning" :style="{ width: visitorTypes.returningPercent + '%' }"></div>
        </div>
        <div class="split-legend">
          <span class="legend-new">{{ visitorTypes.newVisitors }} Neu ({{ visitorTypes.newPercent }}%)</span>
          <span class="legend-returning">{{ visitorTypes.returningVisitors }} Wiederk. ({{ visitorTypes.returningPercent }}%)</span>
        </div>
        <span class="metric-label">Besucher-Typ</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.session-stats {
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

h3 svg { width: 18px; height: 18px; color: var(--accent-cyan); }

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
}

.metric-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem;
  background: var(--bg-tertiary);
  border-radius: 8px;
}

.metric-ring {
  position: relative;
  width: 64px;
  height: 64px;
}

.metric-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
.ring-bg { fill: none; stroke: var(--bg-card); stroke-width: 3; }
.ring-fill { fill: none; stroke-width: 3; stroke-linecap: round; transition: stroke-dasharray 0.6s ease; }
.ring-fill.bounce { stroke: var(--accent-orange); }
.ring-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text-primary);
}

.metric-big {
  font-family: var(--font-mono);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
}

.metric-label {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  text-align: center;
}

.visitor-split { gap: 0.375rem; }

.split-bar {
  display: flex;
  width: 100%;
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
  background: var(--bg-card);
}

.split-new { background: var(--accent-green); transition: width 0.4s; }
.split-returning { background: var(--accent-blue); transition: width 0.4s; }

.split-legend {
  display: flex;
  justify-content: space-between;
  width: 100%;
  font-size: 0.7rem;
  font-family: var(--font-mono);
}

.legend-new { color: var(--accent-green); }
.legend-returning { color: var(--accent-blue); }
</style>
