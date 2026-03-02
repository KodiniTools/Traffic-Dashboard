<script setup>
import { computed } from 'vue'

const props = defineProps({
  devices: Array,
  browsers: Array,
  osSystems: Array
})

function total(arr) {
  return (arr || []).reduce((sum, i) => sum + i.count, 0)
}

function pct(count, arr) {
  const t = total(arr)
  return t > 0 ? Math.round((count / t) * 100) : 0
}

const deviceColors = { Desktop: 'var(--accent-blue)', Mobile: 'var(--accent-green)', Tablet: 'var(--accent-orange)', Unknown: 'var(--text-muted)' }
const browserColors = { Chrome: '#4285F4', Safari: '#000', Firefox: '#FF7139', Edge: '#0078D7', Opera: '#FF1B2D', IE: '#0076D6', Other: 'var(--text-muted)' }

const deviceTotal = computed(() => total(props.devices))
</script>

<template>
  <div class="device-stats">
    <h3>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
        <line x1="8" y1="21" x2="16" y2="21"/>
        <line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
      Technologie
    </h3>

    <!-- Geräte -->
    <div class="section">
      <h4>Geräte</h4>
      <div class="device-bar">
        <div
          v-for="d in (devices || [])"
          :key="d.name"
          class="device-segment"
          :style="{ width: pct(d.count, devices) + '%', background: deviceColors[d.name] || 'var(--text-muted)' }"
          :title="`${d.name}: ${d.count} (${pct(d.count, devices)}%)`"
        ></div>
      </div>
      <div class="legend-row">
        <span v-for="d in (devices || [])" :key="d.name" class="legend-item">
          <span class="legend-dot" :style="{ background: deviceColors[d.name] }"></span>
          {{ d.name }} {{ pct(d.count, devices) }}%
        </span>
      </div>
    </div>

    <!-- Browser -->
    <div class="section">
      <h4>Browser</h4>
      <div class="list">
        <div v-for="b in (browsers || []).slice(0, 5)" :key="b.name" class="list-row">
          <span class="list-name">{{ b.name }}</span>
          <div class="list-bar-wrap">
            <div class="list-bar" :style="{ width: pct(b.count, browsers) + '%', background: browserColors[b.name] || 'var(--accent-blue)' }"></div>
          </div>
          <span class="list-pct">{{ pct(b.count, browsers) }}%</span>
        </div>
      </div>
    </div>

    <!-- Betriebssystem -->
    <div class="section">
      <h4>Betriebssystem</h4>
      <div class="list">
        <div v-for="o in (osSystems || []).slice(0, 5)" :key="o.name" class="list-row">
          <span class="list-name">{{ o.name }}</span>
          <div class="list-bar-wrap">
            <div class="list-bar" :style="{ width: pct(o.count, osSystems) + '%' }"></div>
          </div>
          <span class="list-pct">{{ pct(o.count, osSystems) }}%</span>
        </div>
      </div>
    </div>

    <div v-if="!devices || devices.length === 0" class="no-data">Keine Gerätedaten verfügbar</div>
  </div>
</template>

<style scoped>
.device-stats {
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
h3 svg { width: 18px; height: 18px; color: var(--accent-green); }

.section { margin-bottom: 1rem; }
.section:last-child { margin-bottom: 0; }

h4 {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.5rem;
}

.device-bar {
  display: flex;
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  background: var(--bg-card);
  margin-bottom: 0.5rem;
}

.device-segment { transition: width 0.4s; min-width: 2px; }

.legend-row {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.7rem;
  font-family: var(--font-mono);
  color: var(--text-secondary);
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.list-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.list-name {
  width: 70px;
  font-size: 0.75rem;
  font-family: var(--font-mono);
  color: var(--text-primary);
  flex-shrink: 0;
}

.list-bar-wrap {
  flex: 1;
  height: 6px;
  background: var(--bg-card);
  border-radius: 3px;
  overflow: hidden;
}

.list-bar {
  height: 100%;
  border-radius: 3px;
  background: var(--accent-blue);
  transition: width 0.3s;
}

.list-pct {
  width: 32px;
  font-size: 0.7rem;
  font-family: var(--font-mono);
  color: var(--text-muted);
  text-align: right;
  flex-shrink: 0;
}

.no-data {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
  padding: 2rem;
}
</style>
