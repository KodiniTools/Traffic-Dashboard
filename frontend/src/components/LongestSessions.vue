<script setup>
import { computed } from 'vue'

const props = defineProps({
  data: Object,        // Antwort von /api/stats/longest-sessions
  date: String,        // gewähltes Datum (YYYY-MM-DD)
  maxDate: String,     // heute (Zürich)
  minDate: String,     // ältestes wählbares Datum
  loading: Boolean,
  error: String
})

const emit = defineEmits(['change-date'])

const sessions = computed(() => props.data?.sessions || [])
const maxDuration = computed(() => Math.max(...sessions.value.map(s => s.durationSeconds), 1))

function formatDuration(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`
  return `${sec}s`
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('de-CH', {
    timeZone: 'Europe/Zurich',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function toolsTitle(session) {
  return session.tools.map(t => `${t.name} (${t.views})`).join(', ')
}

function onDateInput(event) {
  const value = event.target.value
  if (value) emit('change-date', value)
}

function shiftDay(delta) {
  if (!props.date) return
  const [y, m, d] = props.date.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
  if ((props.minDate && next < props.minDate) || (props.maxDate && next > props.maxDate)) return
  emit('change-date', next)
}
</script>

<template>
  <div class="longest-sessions">
    <div class="header">
      <h3>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12,6 12,12 16,14"/>
        </svg>
        Längste Sessions des Tages
        <span v-if="data" class="subtle">Top {{ sessions.length }} von {{ data.totalSessions.toLocaleString('de-CH') }}</span>
      </h3>

      <div class="date-nav">
        <button class="nav-btn" :disabled="loading || !date || date <= minDate" @click="shiftDay(-1)" aria-label="Vorheriger Tag">‹</button>
        <input
          type="date"
          :value="date"
          :min="minDate"
          :max="maxDate"
          :disabled="loading"
          @change="onDateInput"
        />
        <button class="nav-btn" :disabled="loading || !date || date >= maxDate" @click="shiftDay(1)" aria-label="Nächster Tag">›</button>
        <button v-if="date !== maxDate" class="today-btn" :disabled="loading" @click="emit('change-date', maxDate)">Heute</button>
      </div>
    </div>

    <p v-if="error" class="state error">{{ error }}</p>
    <p v-else-if="loading && !data" class="state">Lade Sessions...</p>
    <p v-else-if="sessions.length === 0" class="state">Keine Sessions mit messbarer Dauer an diesem Tag.</p>

    <div v-else class="table-wrap" :class="{ dimmed: loading }">
      <table>
        <thead>
          <tr>
            <th class="rank">#</th>
            <th>Tool</th>
            <th class="num">Dauer</th>
            <th class="num hide-sm">Seiten</th>
            <th class="hide-sm">Zeitraum</th>
            <th class="hide-md">Gerät</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(s, i) in sessions" :key="s.start + s.ip">
            <td class="rank">{{ i + 1 }}</td>
            <td class="tool" :title="toolsTitle(s)">
              <span class="tool-name">{{ s.tool }}</span>
              <span v-if="s.tools.length > 1" class="tool-more">+{{ s.tools.length - 1 }}</span>
            </td>
            <td class="num">
              <div class="duration">
                <div class="bar-wrap">
                  <div class="bar" :style="{ width: `${(s.durationSeconds / maxDuration) * 100}%` }"></div>
                </div>
                <span>{{ formatDuration(s.durationSeconds) }}</span>
              </div>
            </td>
            <td class="num hide-sm">{{ s.pageViews }}</td>
            <td class="mono hide-sm">{{ formatTime(s.start) }} – {{ formatTime(s.end) }}</td>
            <td class="muted hide-md">{{ s.device }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.longest-sessions {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}

.header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

h3 {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-secondary);
}

h3 svg { width: 18px; height: 18px; color: var(--accent-purple); }

.subtle {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.date-nav {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.date-nav input,
.nav-btn,
.today-btn {
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 0.8rem;
  padding: 0.3rem 0.5rem;
  color-scheme: dark;
}

.nav-btn, .today-btn { cursor: pointer; }
.nav-btn:disabled, .today-btn:disabled { opacity: 0.4; cursor: default; }

.state {
  font-size: 0.85rem;
  color: var(--text-muted);
  padding: 1rem 0;
  text-align: center;
}

.state.error { color: var(--accent-red); }

.table-wrap { overflow-x: auto; transition: opacity 0.2s; }
.table-wrap.dimmed { opacity: 0.5; }

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

th {
  text-align: left;
  font-weight: 500;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--text-muted);
  padding: 0 0.5rem 0.5rem;
  border-bottom: 1px solid var(--border-color);
}

td {
  padding: 0.45rem 0.5rem;
  border-bottom: 1px solid var(--bg-tertiary);
  color: var(--text-primary);
  white-space: nowrap;
}

tr:last-child td { border-bottom: none; }

.rank { width: 2rem; color: var(--text-muted); font-family: var(--font-mono); }
.num { text-align: right; font-family: var(--font-mono); }
.mono { font-family: var(--font-mono); color: var(--text-secondary); }
.muted { color: var(--text-secondary); }

.tool {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-name { font-weight: 500; }

.tool-more {
  margin-left: 0.375rem;
  font-size: 0.7rem;
  font-family: var(--font-mono);
  color: var(--text-muted);
}

.duration {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.5rem;
  min-width: 150px;
}

.bar-wrap {
  flex: 1;
  height: 6px;
  background: var(--bg-tertiary);
  border-radius: 3px;
  overflow: hidden;
}

.bar {
  height: 100%;
  background: var(--accent-purple);
  border-radius: 3px;
}

@media (max-width: 900px) { .hide-md { display: none; } }
@media (max-width: 600px) { .hide-sm { display: none; } }
</style>
