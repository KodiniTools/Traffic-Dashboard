<script setup>
import { computed } from 'vue'

const props = defineProps({
  bots: Object
})

const botList = computed(() => {
  if (!props.bots) return []
  return Object.entries(props.bots).map(([name, count]) => ({ name, count }))
})

const totalBotRequests = computed(() => {
  return botList.value.reduce((sum, bot) => sum + bot.count, 0)
})

function getBotColor(name) {
  const colors = {
    googlebot: '#4285f4',
    bingbot: '#00897b',
    semrush: '#ff642d',
    ahrefs: '#2b7ce9',
    yandex: '#ff0000',
    baidu: '#2319dc',
    facebook: '#1877f2',
    twitter: '#1da1f2',
    telegram: '#0088cc',
    whatsapp: '#25d366'
  }
  return colors[name.toLowerCase()] || '#6b7280'
}

function getPercentage(count) {
  return totalBotRequests.value > 0 
    ? Math.round((count / totalBotRequests.value) * 100)
    : 0
}
</script>

<template>
  <div class="bot-stats">
    <h3>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="11" width="18" height="10" rx="2"/>
        <circle cx="12" cy="5" r="2"/>
        <path d="M12 7v4M8 16h0M16 16h0"/>
      </svg>
      Bot Aktivität
    </h3>
    
    <div class="bot-list">
      <div 
        v-for="bot in botList" 
        :key="bot.name" 
        class="bot-item"
      >
        <div class="bot-info">
          <span 
            class="bot-badge"
            :style="{ backgroundColor: getBotColor(bot.name) }"
          >
            {{ bot.name }}
          </span>
          <span class="bot-count">{{ bot.count.toLocaleString('de-DE') }}</span>
        </div>
        <div class="bot-bar-container">
          <div 
            class="bot-bar"
            :style="{ 
              width: `${getPercentage(bot.count)}%`,
              backgroundColor: getBotColor(bot.name)
            }"
          ></div>
        </div>
      </div>
    </div>
    
    <div v-if="botList.length === 0" class="no-data">
      Keine Bot-Aktivität erkannt
    </div>
  </div>
</template>

<style scoped>
.bot-stats {
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
  color: var(--accent-orange);
}

.bot-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 300px;
  overflow-y: auto;
}

.bot-item {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.bot-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.bot-badge {
  font-size: 0.75rem;
  font-weight: 500;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  color: white;
  text-transform: capitalize;
}

.bot-count {
  font-family: var(--font-mono);
  font-size: 0.85rem;
  color: var(--text-primary);
}

.bot-bar-container {
  height: 4px;
  background: var(--bg-tertiary);
  border-radius: 2px;
  overflow: hidden;
}

.bot-bar {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.no-data {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
  padding: 2rem;
}
</style>
