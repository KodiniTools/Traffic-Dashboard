<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

// Laufende Uhr in Zürcher Zeit (Europe/Zurich), unabhängig von der Zeitzone
// des Browsers. Sommer-/Winterzeit (MESZ/MEZ) kommt direkt aus Intl.
const TIME_FORMAT = new Intl.DateTimeFormat('de-CH', {
  timeZone: 'Europe/Zurich',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'short'
})
const DATE_FORMAT = new Intl.DateTimeFormat('de-CH', {
  timeZone: 'Europe/Zurich',
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric'
})

const time = ref('')
const zone = ref('')
const date = ref('')
let timer = null

function update() {
  const now = new Date()
  const parts = Object.fromEntries(
    TIME_FORMAT.formatToParts(now).map(p => [p.type, p.value])
  )
  time.value = `${parts.hour}:${parts.minute}:${parts.second}`
  zone.value = parts.timeZoneName || ''
  date.value = DATE_FORMAT.format(now)
}

// Auf die nächste volle Sekunde ausrichten, damit die Anzeige nicht driftet
function schedule() {
  update()
  timer = setTimeout(schedule, 1000 - (Date.now() % 1000) + 5)
}

onMounted(schedule)
onUnmounted(() => clearTimeout(timer))
</script>

<template>
  <div class="zurich-clock" :title="`Zürcher Zeit (${zone}) – massgeblich für alle Tageswerte`">
    <span class="clock-time">{{ time }}</span>
    <span class="clock-meta">{{ date }} · Zürich {{ zone }}</span>
  </div>
</template>

<style scoped>
.zurich-clock {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.2;
  padding: 0.35rem 0.9rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  white-space: nowrap;
}

.clock-time {
  font-family: var(--font-mono);
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.clock-meta {
  font-size: 0.68rem;
  color: var(--text-muted);
}
</style>
