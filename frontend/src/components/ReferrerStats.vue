<script setup>
import { computed } from 'vue'

const props = defineProps({
  referrers: Object
})

const referrerList = computed(() => {
  if (!props.referrers) return []
  return Object.entries(props.referrers)
    .map(([domain, count]) => ({ domain, count }))
    .slice(0, 10)
})

const maxCount = computed(() => {
  return Math.max(...referrerList.value.map(r => r.count), 1)
})

function getSourceIcon(domain) {
  if (domain.includes('google')) return '🔍'
  if (domain.includes('bing')) return '🔎'
  if (domain.includes('facebook') || domain.includes('fb.')) return '📘'
  if (domain.includes('twitter') || domain.includes('t.co')) return '🐦'
  if (domain.includes('linkedin')) return '💼'
  if (domain.includes('reddit')) return '🤖'
  if (domain.includes('youtube')) return '▶️'
  if (domain.includes('instagram')) return '📷'
  if (domain.includes('github')) return '🐙'
  return '🔗'
}
</script>

<template>
  <div class="referrer-stats">
    <h3>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
        <polyline points="15,3 21,3 21,9"/>
        <line x1="10" y1="14" x2="21" y2="3"/>
      </svg>
      Traffic-Quellen
    </h3>
    
    <div class="referrer-list">
      <div 
        v-for="ref in referrerList" 
        :key="ref.domain" 
        class="referrer-item"
      >
        <span class="referrer-icon">{{ getSourceIcon(ref.domain) }}</span>
        <div class="referrer-info">
          <span class="referrer-domain">{{ ref.domain }}</span>
          <div class="referrer-bar-container">
            <div 
              class="referrer-bar"
              :style="{ width: `${(ref.count / maxCount) * 100}%` }"
            ></div>
          </div>
        </div>
        <span class="referrer-count">{{ ref.count.toLocaleString('de-DE') }}</span>
      </div>
    </div>
    
    <div v-if="referrerList.length === 0" class="no-data">
      Keine Referrer-Daten
    </div>
  </div>
</template>

<style scoped>
.referrer-stats {
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
  color: var(--accent-cyan);
}

.referrer-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 300px;
  overflow-y: auto;
}

.referrer-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  background: var(--bg-tertiary);
  border-radius: 6px;
}

.referrer-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
}

.referrer-info {
  flex: 1;
  min-width: 0;
}

.referrer-domain {
  display: block;
  font-size: 0.85rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 0.375rem;
}

.referrer-bar-container {
  height: 3px;
  background: var(--bg-card);
  border-radius: 2px;
  overflow: hidden;
}

.referrer-bar {
  height: 100%;
  background: var(--accent-cyan);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.referrer-count {
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
