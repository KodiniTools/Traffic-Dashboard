<script setup>
import { computed } from 'vue'

// Daten von /api/stats/coverage (heute). Heartbeat = Beleg für echten Menschen.
const props = defineProps({
  data: Object
})

const REASONS = {
  spike: 'als Spike gefiltert',
  cloaked: 'als getarnter Crawler gefiltert',
  'kein-request': 'Seite aus Browser-Cache',
  'kein-seitenaufruf': 'nur Weiterleitung/Fehlerseite'
}

function reasonLabel(reason) {
  if (REASONS[reason]) return REASONS[reason]
  if (reason.startsWith('bot:')) return `als Bot erkannt (${reason.slice(4)})`
  return reason
}

function fmt(n) {
  return (n || 0).toLocaleString('de-CH')
}

const confirmed = computed(() => props.data?.heartbeatVisitors ?? 0)
const counted = computed(() => props.data?.counted?.visitors ?? 0)
const unconfirmed = computed(() => props.data?.counted?.withoutHeartbeat ?? 0)
const missed = computed(() => props.data?.missed?.total ?? 0)
const reasons = computed(() => Object.entries(props.data?.missed?.byReason || {}))
const confirmedPercent = computed(() =>
  counted.value > 0 ? Math.round(((props.data?.counted?.withHeartbeat ?? 0) / counted.value) * 100) : 0
)
</script>

<template>
  <div v-if="data" class="visitor-check">
    <div class="vc-header">
      <h3>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
          <polyline points="22,4 12,14.01 9,11.01"/>
        </svg>
        Echte Besucher heute
      </h3>
      <span class="vc-sub">geprüft per Heartbeat · eigene IPs ausgeschlossen</span>
    </div>

    <p v-if="!data.heartbeatActive" class="vc-empty">
      Heute noch keine Heartbeats empfangen – die Prüfung startet mit dem ersten aktiven Besucher.
    </p>

    <div v-else class="vc-grid">
      <div class="vc-stat confirmed" title="Besucher, deren Browser aktiv genutzt wurde (Heartbeat empfangen). Sicher echte Menschen.">
        <span class="vc-value">{{ fmt(confirmed) }}</span>
        <span class="vc-label">Sicher echt</span>
        <span class="vc-hint">aktiver Browser bestätigt</span>
      </div>

      <div class="vc-stat" title="So viele Besucher zählt das Dashboard heute (Kachel „Besucher“ oben).">
        <span class="vc-value">{{ fmt(counted) }}</span>
        <span class="vc-label">Im Dashboard gezählt</span>
        <span class="vc-hint">{{ confirmedPercent }} % davon bestätigt</span>
      </div>

      <div class="vc-stat unconfirmed" title="Gezählt, aber ohne Heartbeat: Werbeblocker, JavaScript aus, Seite sofort geschlossen – oder Bots mit Browser-Kennung.">
        <span class="vc-value">{{ fmt(unconfirmed) }}</span>
        <span class="vc-label">Gezählt, unbestätigt</span>
        <span class="vc-hint">Blocker, sofort weg oder Bot</span>
      </div>

      <div class="vc-stat" :class="missed > 0 ? 'missed' : 'ok'" title="Echte Besucher (Heartbeat empfangen), die das Dashboard NICHT als Besucher zählt.">
        <span class="vc-value">{{ fmt(missed) }}</span>
        <span class="vc-label">Übersehen</span>
        <span class="vc-hint">{{ missed > 0 ? 'echt, aber nicht gezählt' : 'keiner – Erkennung korrekt' }}</span>
      </div>
    </div>

    <div v-if="data.heartbeatActive && reasons.length" class="vc-reasons">
      <span class="vc-reasons-title">Warum übersehen:</span>
      <span v-for="[reason, n] in reasons" :key="reason" class="vc-reason">
        {{ n }}× {{ reasonLabel(reason) }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.visitor-check {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}

.vc-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

h3 {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-secondary);
}

h3 svg { width: 18px; height: 18px; color: var(--accent-green); }

.vc-sub {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.vc-empty {
  font-size: 0.85rem;
  color: var(--text-muted);
  text-align: center;
  padding: 0.75rem 0;
}

.vc-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
}

.vc-stat {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.75rem 1rem;
  background: var(--bg-tertiary);
  border-radius: 8px;
  border-left: 3px solid var(--border-color);
}

.vc-stat.confirmed { border-left-color: var(--accent-green); }
.vc-stat.unconfirmed { border-left-color: var(--accent-orange); }
.vc-stat.missed { border-left-color: var(--accent-red); }
.vc-stat.ok { border-left-color: var(--accent-green); }

.vc-value {
  font-family: var(--font-mono);
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
}

.vc-stat.confirmed .vc-value { color: var(--accent-green); }

.vc-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.vc-hint {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.vc-reasons {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.75rem;
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.vc-reasons-title { color: var(--text-muted); }

.vc-reason {
  font-family: var(--font-mono);
  background: var(--bg-tertiary);
  border-radius: 4px;
  padding: 0.1rem 0.4rem;
}

@media (max-width: 900px) {
  .vc-grid { grid-template-columns: repeat(2, 1fr); }
}
</style>
