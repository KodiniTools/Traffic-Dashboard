<script setup>
defineProps({
  title: String,
  value: [String, Number],
  subtitle: String,
  icon: String,
  color: {
    type: String,
    default: 'blue'
  }
})

const icons = {
  users: `<path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>`,
  activity: `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`,
  bot: `<rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="12" cy="5" r="2"/><path d="M12 7v4M8 16h0M16 16h0"/>`,
  download: `<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>`
}
</script>

<template>
  <div :class="['stats-card', `color-${color}`]">
    <div class="card-header">
      <span class="card-title">{{ title }}</span>
      <div class="card-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" v-html="icons[icon]" />
      </div>
    </div>
    <div class="card-value">{{ value }}</div>
    <div v-if="subtitle" class="card-subtitle">{{ subtitle }}</div>
  </div>
</template>

<style scoped>
.stats-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.25rem;
  position: relative;
  overflow: hidden;
}

.stats-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
}

.color-blue::before { background: var(--accent-blue); }
.color-green::before { background: var(--accent-green); }
.color-orange::before { background: var(--accent-orange); }
.color-purple::before { background: var(--accent-purple); }

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}

.card-title {
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.card-icon {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: var(--bg-tertiary);
}

.color-blue .card-icon { color: var(--accent-blue); }
.color-green .card-icon { color: var(--accent-green); }
.color-orange .card-icon { color: var(--accent-orange); }
.color-purple .card-icon { color: var(--accent-purple); }

.card-icon svg {
  width: 20px;
  height: 20px;
}

.card-value {
  font-size: 2rem;
  font-weight: 700;
  font-family: var(--font-mono);
  letter-spacing: -0.02em;
}

.card-subtitle {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 0.25rem;
}
</style>
