<script setup>
const props = defineProps({
  errorPages: Array
})

function formatPath(path) {
  return path.length > 40 ? path.substring(0, 37) + '...' : path
}
</script>

<template>
  <div class="error-pages">
    <h3>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="12" y1="8" x2="12" y2="12"/>
        <line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      404-Fehler
    </h3>

    <div v-if="errorPages && errorPages.length > 0" class="error-list">
      <div v-for="page in errorPages.slice(0, 10)" :key="page.path" class="error-row">
        <span class="error-path" :title="page.path">{{ formatPath(page.path) }}</span>
        <span class="error-count">{{ page.count }}x</span>
      </div>
    </div>

    <div v-else class="no-data">
      Keine 404-Fehler
    </div>
  </div>
</template>

<style scoped>
.error-pages {
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
h3 svg { width: 18px; height: 18px; color: var(--accent-red); }

.error-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-height: 250px;
  overflow-y: auto;
}

.error-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
  border-left: 3px solid var(--accent-red);
}

.error-path {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.error-count {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--accent-red);
  font-weight: 600;
  flex-shrink: 0;
}

.no-data {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
  padding: 2rem;
}
</style>
