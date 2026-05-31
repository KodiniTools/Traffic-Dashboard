<script setup>
import { computed } from 'vue'

const props = defineProps({
  utmStats: Object
})

const hasData = computed(() => props.utmStats && props.utmStats.totalUtmVisits > 0)

const maxSource = computed(() => Math.max(...(props.utmStats?.sources || []).map(s => s.count), 1))
const maxMedium = computed(() => Math.max(...(props.utmStats?.mediums || []).map(s => s.count), 1))
const maxCampaign = computed(() => Math.max(...(props.utmStats?.campaigns || []).map(s => s.count), 1))
</script>

<template>
  <div class="utm-stats">
    <h3>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
      </svg>
      UTM-Kampagnen
      <span v-if="hasData" class="total-badge">{{ utmStats.totalUtmVisits }} Besuche</span>
    </h3>

    <div v-if="!hasData" class="no-data">
      Keine UTM-Parameter im gewählten Zeitraum
    </div>

    <template v-else>
      <!-- Quellen -->
      <div class="section">
        <h4>Quellen (utm_source)</h4>
        <div class="bar-list">
          <div v-for="item in (utmStats.sources || []).slice(0, 6)" :key="'s-' + item.name" class="bar-row">
            <span class="label" :title="item.name">{{ item.name }}</span>
            <div class="bar-wrap">
              <div class="bar source-bar" :style="{ width: `${(item.count / maxSource) * 100}%` }"></div>
            </div>
            <span class="count">{{ item.count }}</span>
          </div>
        </div>
      </div>

      <!-- Medien -->
      <div v-if="utmStats.mediums && utmStats.mediums.length > 0" class="section">
        <h4>Kanäle (utm_medium)</h4>
        <div class="bar-list">
          <div v-for="item in (utmStats.mediums || []).slice(0, 5)" :key="'m-' + item.name" class="bar-row">
            <span class="label" :title="item.name">{{ item.name }}</span>
            <div class="bar-wrap">
              <div class="bar medium-bar" :style="{ width: `${(item.count / maxMedium) * 100}%` }"></div>
            </div>
            <span class="count">{{ item.count }}</span>
          </div>
        </div>
      </div>

      <!-- Kampagnen -->
      <div v-if="utmStats.campaigns && utmStats.campaigns.length > 0" class="section">
        <h4>Kampagnen (utm_campaign)</h4>
        <div class="bar-list">
          <div v-for="item in (utmStats.campaigns || []).slice(0, 5)" :key="'c-' + item.name" class="bar-row">
            <span class="label" :title="item.name">{{ item.name }}</span>
            <div class="bar-wrap">
              <div class="bar campaign-bar" :style="{ width: `${(item.count / maxCampaign) * 100}%` }"></div>
            </div>
            <span class="count">{{ item.count }}</span>
          </div>
        </div>
      </div>

      <!-- Kombinationen -->
      <div v-if="utmStats.combinations && utmStats.combinations.length > 0" class="section">
        <h4>Top-Kombinationen</h4>
        <div class="combo-list">
          <div v-for="(item, i) in utmStats.combinations.slice(0, 5)" :key="'combo-' + i" class="combo-row">
            <span class="rank">{{ i + 1 }}</span>
            <span class="combo-label" :title="item.combo">{{ item.combo }}</span>
            <span class="count">{{ item.count }}x</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.utm-stats {
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

.total-badge {
  margin-left: auto;
  font-size: 0.75rem;
  font-family: var(--font-mono);
  color: var(--accent-cyan);
  background: rgba(6, 182, 212, 0.1);
  border: 1px solid rgba(6, 182, 212, 0.2);
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
}

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

.bar-list, .combo-list {
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

.label {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--text-primary);
  width: 100px;
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

.bar { height: 100%; border-radius: 2px; transition: width 0.3s; }
.source-bar { background: var(--accent-cyan); }
.medium-bar { background: var(--accent-purple); }
.campaign-bar { background: var(--accent-green); }

.count {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.combo-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  background: var(--bg-tertiary);
  border-radius: 4px;
}

.rank {
  font-size: 0.7rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
  width: 16px;
  flex-shrink: 0;
  text-align: center;
}

.combo-label {
  flex: 1;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.no-data {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
  padding: 2rem;
}
</style>
