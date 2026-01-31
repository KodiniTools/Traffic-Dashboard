<script setup>
import { computed } from 'vue'

const props = defineProps({
  pages: Object
})

const pageList = computed(() => {
  if (!props.pages) return []
  return Object.entries(props.pages)
    .map(([path, count]) => ({ path, count }))
    .slice(0, 15)
})

const maxCount = computed(() => {
  return Math.max(...pageList.value.map(p => p.count), 1)
})

function formatPath(path) {
  if (path === '/') return '/ (Homepage)'
  if (path.length > 40) {
    return path.substring(0, 37) + '...'
  }
  return path
}
</script>

<template>
  <div class="top-pages">
    <h3>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14,2 14,8 20,8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10,9 9,9 8,9"/>
      </svg>
      Top Seiten
    </h3>
    
    <div class="page-list">
      <div 
        v-for="(page, index) in pageList" 
        :key="page.path" 
        class="page-item"
      >
        <div class="page-rank">{{ index + 1 }}</div>
        <div class="page-info">
          <span class="page-path" :title="page.path">{{ formatPath(page.path) }}</span>
          <div class="page-bar-container">
            <div 
              class="page-bar"
              :style="{ width: `${(page.count / maxCount) * 100}%` }"
            ></div>
          </div>
        </div>
        <span class="page-count">{{ page.count.toLocaleString('de-DE') }}</span>
      </div>
    </div>
    
    <div v-if="pageList.length === 0" class="no-data">
      Keine Seitendaten verfügbar
    </div>
  </div>
</template>

<style scoped>
.top-pages {
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

h3 svg {
  width: 18px;
  height: 18px;
  color: var(--accent-blue);
}

.page-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 300px;
  overflow-y: auto;
}

.page-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  background: var(--bg-tertiary);
  border-radius: 6px;
}

.page-rank {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-card);
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  flex-shrink: 0;
}

.page-item:nth-child(1) .page-rank { background: var(--accent-blue); color: white; }
.page-item:nth-child(2) .page-rank { background: var(--accent-green); color: white; }
.page-item:nth-child(3) .page-rank { background: var(--accent-orange); color: white; }

.page-info {
  flex: 1;
  min-width: 0;
}

.page-path {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 0.375rem;
}

.page-bar-container {
  height: 3px;
  background: var(--bg-card);
  border-radius: 2px;
  overflow: hidden;
}

.page-bar {
  height: 100%;
  background: var(--accent-blue);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.page-count {
  font-family: var(--font-mono);
  font-size: 0.85rem;
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
