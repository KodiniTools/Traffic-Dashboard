<script setup>
import { computed } from 'vue'

const props = defineProps({
  entryPages: Array,
  exitPages: Array,
  visitorFlow: Array
})

function formatPath(path) {
  if (path === '/') return '/ (Homepage)'
  return path.length > 30 ? path.substring(0, 27) + '...' : path
}

const maxEntry = computed(() => Math.max(...(props.entryPages || []).map(p => p.count), 1))
const maxExit = computed(() => Math.max(...(props.exitPages || []).map(p => p.count), 1))
</script>

<template>
  <div class="entry-exit">
    <h3>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15,3 21,3 21,9"/>
        <polyline points="9,21 3,21 3,15"/>
        <line x1="21" y1="3" x2="14" y2="10"/>
        <line x1="3" y1="21" x2="10" y2="14"/>
      </svg>
      Ein- &amp; Ausstiegsseiten
    </h3>

    <!-- Einstiegsseiten -->
    <div class="section">
      <h4>Einstiegsseiten</h4>
      <div class="page-list">
        <div v-for="page in (entryPages || []).slice(0, 5)" :key="'e-' + page.path" class="page-row">
          <span class="path" :title="page.path">{{ formatPath(page.path) }}</span>
          <div class="bar-wrap">
            <div class="bar entry-bar" :style="{ width: `${(page.count / maxEntry) * 100}%` }"></div>
          </div>
          <span class="count">{{ page.count }}</span>
        </div>
      </div>
    </div>

    <!-- Ausstiegsseiten -->
    <div class="section">
      <h4>Ausstiegsseiten</h4>
      <div class="page-list">
        <div v-for="page in (exitPages || []).slice(0, 5)" :key="'x-' + page.path" class="page-row">
          <span class="path" :title="page.path">{{ formatPath(page.path) }}</span>
          <div class="bar-wrap">
            <div class="bar exit-bar" :style="{ width: `${(page.count / maxExit) * 100}%` }"></div>
          </div>
          <span class="count">{{ page.count }}</span>
        </div>
      </div>
    </div>

    <!-- Besucher-Flow -->
    <div v-if="visitorFlow && visitorFlow.length > 0" class="section">
      <h4>Navigation-Pfade</h4>
      <div class="flow-list">
        <div v-for="flow in visitorFlow.slice(0, 5)" :key="flow.transition" class="flow-row">
          <span class="flow-path">{{ flow.transition }}</span>
          <span class="count">{{ flow.count }}x</span>
        </div>
      </div>
    </div>

    <div v-if="!entryPages || entryPages.length === 0" class="no-data">
      Keine Session-Daten verfügbar
    </div>
  </div>
</template>

<style scoped>
.entry-exit {
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

.page-list, .flow-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.page-row, .flow-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
}

.path, .flow-path {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.path { width: 120px; flex-shrink: 0; }
.flow-path { flex: 1; }

.bar-wrap {
  flex: 1;
  height: 3px;
  background: var(--bg-card);
  border-radius: 2px;
  overflow: hidden;
}

.bar { height: 100%; border-radius: 2px; transition: width 0.3s; }
.entry-bar { background: var(--accent-green); }
.exit-bar { background: var(--accent-red); }

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
</style>
