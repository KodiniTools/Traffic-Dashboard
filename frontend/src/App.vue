<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import StatsCard from './components/StatsCard.vue'
import TrafficChart from './components/TrafficChart.vue'
import BotStats from './components/BotStats.vue'
import TopPages from './components/TopPages.vue'
import LiveFeed from './components/LiveFeed.vue'
import ReferrerStats from './components/ReferrerStats.vue'
import SessionStats from './components/SessionStats.vue'
import EntryExitPages from './components/EntryExitPages.vue'
import DeviceStats from './components/DeviceStats.vue'
import ErrorPages from './components/ErrorPages.vue'

// API Key - wird aus localStorage geladen oder muss eingegeben werden
const apiKey = ref(localStorage.getItem('dashboard_api_key') || '')
const isAuthenticated = ref(false)
const authError = ref('')

// Daten
const stats = ref(null)
const liveStats = ref(null)
const todayOverview = ref(null)
const loading = ref(false)
const error = ref(null)
const selectedPeriod = ref('week')

// Auto-Refresh
let refreshInterval = null
let liveInterval = null

const periods = [
  { value: 'today', label: 'Heute' },
  { value: 'week', label: 'Diese Woche' },
  { value: 'twoweeks', label: '14 Tage' },
  { value: 'month', label: '30 Tage' },
  { value: 'quarter', label: '3 Monate' },
  { value: 'halfyear', label: '6 Monate' },
  { value: 'year', label: '1 Jahr' }
]

// API Fetch Helper
async function fetchApi(endpoint) {
 const response = await fetch(`/traffic-dashboard/api${endpoint}`, {
    headers: {
      'X-API-Key': apiKey.value
    }
  })
  
  if (response.status === 401) {
    isAuthenticated.value = false
    throw new Error('Unauthorized')
  }
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  
  return response.json()
}

// Login
async function login() {
  try {
    authError.value = ''
    await fetchApi('/stats/today')
    localStorage.setItem('dashboard_api_key', apiKey.value)
    isAuthenticated.value = true
    loadStats()
    startAutoRefresh()
  } catch (err) {
    authError.value = 'Ungültiger API-Key'
    isAuthenticated.value = false
  }
}

// Statistiken laden
async function loadStats() {
  loading.value = true
  error.value = null
  
  try {
    stats.value = await fetchApi(`/stats/${selectedPeriod.value}`)
  } catch (err) {
    error.value = err.message
  } finally {
    loading.value = false
  }
}

// Heute-Übersicht laden
async function loadTodayOverview() {
  try {
    todayOverview.value = await fetchApi('/stats/today-overview')
  } catch (err) {
    console.error('Heute-Übersicht Fehler:', err)
  }
}

// Live-Daten laden
async function loadLive() {
  try {
    liveStats.value = await fetchApi('/stats/live')
  } catch (err) {
    console.error('Live-Daten Fehler:', err)
  }
}

// Auto-Refresh starten
function startAutoRefresh() {
  // Hauptdaten alle 5 Minuten
  refreshInterval = setInterval(() => { loadStats(); loadTodayOverview() }, 5 * 60 * 1000)
  // Live-Daten alle 30 Sekunden
  liveInterval = setInterval(loadLive, 30 * 1000)
  loadLive()
  loadTodayOverview()
}

// Zeitraum wechseln
function changePeriod(period) {
  selectedPeriod.value = period
  loadStats()
  loadTodayOverview()
}

// Logout
function logout() {
  localStorage.removeItem('dashboard_api_key')
  apiKey.value = ''
  isAuthenticated.value = false
  stats.value = null
  liveStats.value = null
  todayOverview.value = null
  clearInterval(refreshInterval)
  clearInterval(liveInterval)
}

// Beim Start prüfen ob API-Key vorhanden
onMounted(async () => {
  if (apiKey.value) {
    try {
      await fetchApi('/stats/today')
      isAuthenticated.value = true
      loadStats()
      startAutoRefresh()
    } catch {
      isAuthenticated.value = false
    }
  }
})

onUnmounted(() => {
  clearInterval(refreshInterval)
  clearInterval(liveInterval)
})

// Hilfsfunktion: Zürcher Datum formatieren
function formatZurichDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-')
  const weekdays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
  const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
  return `${weekdays[date.getDay()]}, ${d}.${m}.${y}`
}

// Computed
const humanPercentage = computed(() => {
  if (!stats.value) return 0
  const total = stats.value.humanRequests + stats.value.botRequests
  return total > 0 ? Math.round((stats.value.humanRequests / total) * 100) : 0
})

const lastUpdated = computed(() => {
  return new Date().toLocaleTimeString('de-DE')
})
</script>

<template>
  <!-- Login Screen -->
  <div v-if="!isAuthenticated" class="login-container">
    <div class="login-box">
      <div class="login-header">
        <div class="logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <h1>Traffic Dashboard</h1>
        <p>KodiniTools Analytics</p>
      </div>
      
      <form @submit.prevent="login" class="login-form">
        <div class="input-group">
          <label for="apiKey">API Key</label>
          <input 
            type="password" 
            id="apiKey" 
            v-model="apiKey" 
            placeholder="Dein geheimer API-Key"
            autocomplete="current-password"
          />
        </div>
        <p v-if="authError" class="error-text">{{ authError }}</p>
        <button type="submit" class="btn-login">
          <span>Dashboard öffnen</span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
      </form>
    </div>
  </div>

  <!-- Dashboard -->
  <div v-else class="dashboard">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <div class="logo-small">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div>
          <h1>Traffic Dashboard</h1>
          <p class="subtitle">kodinitools.com</p>
        </div>
      </div>
      
      <div class="header-right">
        <div class="period-selector">
          <button 
            v-for="p in periods" 
            :key="p.value"
            :class="['period-btn', { active: selectedPeriod === p.value }]"
            @click="changePeriod(p.value)"
          >
            {{ p.label }}
          </button>
        </div>
        
        <button @click="loadStats" class="btn-refresh" :disabled="loading">
          <svg :class="{ spinning: loading }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
          </svg>
        </button>
        
        <button @click="logout" class="btn-logout">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16,17 21,12 16,7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- Main Content -->
    <main class="main-content">
      <!-- Loading -->
      <div v-if="loading && !stats" class="loading-state">
        <div class="loader"></div>
        <p>Lade Statistiken...</p>
      </div>

      <!-- Error -->
      <div v-else-if="error" class="error-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>{{ error }}</p>
        <button @click="loadStats" class="btn-retry">Erneut versuchen</button>
      </div>

      <!-- Stats Content -->
      <template v-else-if="stats">
        <!-- Heute Übersicht (immer sichtbar, Zürcher Zeit 00:00-24:00) -->
        <div v-if="todayOverview" class="today-overview">
          <div class="today-header">
            <div class="today-title">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12,6 12,12 16,14"/>
              </svg>
              <h2>Heute</h2>
              <span class="today-date">{{ formatZurichDate(todayOverview.zurichDate) }}</span>
            </div>
            <span class="today-timezone">Zürich (MEZ/MESZ)</span>
          </div>
          <div class="today-stats">
            <div class="today-stat">
              <span class="today-stat-value">{{ todayOverview.visitors.toLocaleString('de-CH') }}</span>
              <span class="today-stat-label">Besucher</span>
            </div>
            <div class="today-stat">
              <span class="today-stat-value">{{ todayOverview.pageViews.toLocaleString('de-CH') }}</span>
              <span class="today-stat-label">Seitenaufrufe</span>
            </div>
            <div class="today-stat">
              <span class="today-stat-value">{{ todayOverview.botRequests.toLocaleString('de-CH') }}</span>
              <span class="today-stat-label">Bot Requests</span>
            </div>
            <div class="today-stat">
              <span class="today-stat-value">{{ todayOverview.totalBytesFormatted }}</span>
              <span class="today-stat-label">Traffic</span>
            </div>
          </div>
        </div>

        <!-- Stats Cards -->
        <div class="stats-grid">
          <StatsCard 
            title="Besucher"
            :value="stats.uniqueVisitors.toLocaleString('de-DE')"
            icon="users"
            color="blue"
          />
          <StatsCard
            title="Seitenaufrufe"
            :value="(stats.humanPageViews || 0).toLocaleString('de-DE')"
            :subtitle="`${stats.humanRequests.toLocaleString('de-DE')} Requests gesamt`"
            icon="activity"
            color="green"
          />
          <StatsCard 
            title="Bot Requests"
            :value="stats.botRequests.toLocaleString('de-DE')"
            :subtitle="`${stats.totalBots} unique Bots`"
            icon="bot"
            color="orange"
          />
          <StatsCard 
            title="Traffic"
            :value="stats.totalBytesFormatted"
            icon="download"
            color="purple"
          />
        </div>

        <!-- Live Stats Bar -->
        <div v-if="liveStats" class="live-bar">
          <div class="live-indicator">
            <span class="pulse"></span>
            LIVE
          </div>
          <div class="live-stats">
            <span><strong>{{ liveStats.lastHour.pageViews || 0 }}</strong> Seitenaufrufe</span>
            <span><strong>{{ liveStats.lastHour.uniqueVisitors }}</strong> Besucher</span>
            <span><strong>{{ liveStats.lastHour.bots }}</strong> Bots</span>
            <span><strong>{{ liveStats.lastHour.bytesFormatted }}</strong> Traffic</span>
          </div>
          <span class="last-updated">Letzte Stunde</span>
        </div>

        <!-- Charts Row -->
        <div class="charts-row">
          <div class="chart-card wide">
            <h3>Traffic Verlauf</h3>
            <TrafficChart :data="stats.requestsByDay" />
          </div>
        </div>

        <!-- Session & Besucher-Analyse -->
        <div class="analytics-row">
          <SessionStats
            :sessionStats="stats.sessionStats"
            :visitorTypes="stats.visitorTypes"
          />
          <DeviceStats
            :devices="stats.devices"
            :browsers="stats.browsers"
            :osSystems="stats.osSystems"
          />
        </div>

        <!-- Data Grids -->
        <div class="data-grid">
          <TopPages :pages="stats.topPages" :pagesDetailed="stats.topPagesDetailed" />
          <EntryExitPages
            :entryPages="stats.entryPages"
            :exitPages="stats.exitPages"
            :visitorFlow="stats.visitorFlow"
          />
        </div>

        <div class="data-grid">
          <BotStats :bots="stats.botStats" />
          <ReferrerStats :referrers="stats.topReferrers" />
          <ErrorPages :errorPages="stats.errorPages" />
        </div>

        <!-- Live Feed -->
        <LiveFeed v-if="liveStats" :requests="liveStats.recentRequests" />
      </template>
    </main>

    <!-- Footer -->
    <footer class="footer">
      <p>Zuletzt aktualisiert: {{ lastUpdated }}</p>
    </footer>
  </div>
</template>

<style>
/* Reset & Base */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --bg-primary: #0a0e14;
  --bg-secondary: #12171f;
  --bg-tertiary: #1a2028;
  --bg-card: #151b24;
  --border-color: #2a3444;
  --text-primary: #e8ecf0;
  --text-secondary: #8b95a5;
  --text-muted: #5a6578;
  --accent-blue: #3b82f6;
  --accent-green: #22c55e;
  --accent-orange: #f59e0b;
  --accent-purple: #a855f7;
  --accent-red: #ef4444;
  --accent-cyan: #06b6d4;
  --font-display: 'Space Grotesk', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}

body {
  font-family: var(--font-display);
  background: var(--bg-primary);
  color: var(--text-primary);
  line-height: 1.6;
  min-height: 100vh;
}

/* Login Screen */
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: 
    radial-gradient(ellipse at 20% 50%, rgba(59, 130, 246, 0.08) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 50%, rgba(168, 85, 247, 0.08) 0%, transparent 50%),
    var(--bg-primary);
  padding: 1rem;
}

.login-box {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  padding: 3rem;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
}

.login-header {
  text-align: center;
  margin-bottom: 2rem;
}

.logo {
  width: 64px;
  height: 64px;
  margin: 0 auto 1rem;
  color: var(--accent-blue);
}

.login-header h1 {
  font-size: 1.75rem;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.login-header p {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.input-group label {
  display: block;
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.input-group input {
  width: 100%;
  padding: 0.875rem 1rem;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-primary);
  font-family: var(--font-mono);
  font-size: 0.95rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.input-group input:focus {
  outline: none;
  border-color: var(--accent-blue);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
}

.error-text {
  color: var(--accent-red);
  font-size: 0.85rem;
  text-align: center;
}

.btn-login {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.875rem 1.5rem;
  background: var(--accent-blue);
  border: none;
  border-radius: 8px;
  color: white;
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s, transform 0.1s;
}

.btn-login:hover {
  background: #2563eb;
}

.btn-login:active {
  transform: scale(0.98);
}

.btn-login svg {
  width: 20px;
  height: 20px;
}

/* Dashboard */
.dashboard {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Header */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.logo-small {
  width: 36px;
  height: 36px;
  color: var(--accent-blue);
}

.header-left h1 {
  font-size: 1.25rem;
  font-weight: 600;
}

.subtitle {
  font-size: 0.8rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.period-selector {
  display: flex;
  background: var(--bg-tertiary);
  border-radius: 8px;
  padding: 3px;
}

.period-btn {
  padding: 0.5rem 1rem;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-secondary);
  font-family: var(--font-display);
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.period-btn:hover {
  color: var(--text-primary);
}

.period-btn.active {
  background: var(--accent-blue);
  color: white;
}

.btn-refresh, .btn-logout {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.btn-refresh:hover, .btn-logout:hover {
  background: var(--bg-card);
  color: var(--text-primary);
}

.btn-refresh svg, .btn-logout svg {
  width: 20px;
  height: 20px;
}

.btn-refresh svg.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Main Content */
.main-content {
  flex: 1;
  padding: 1.5rem;
  max-width: 1600px;
  margin: 0 auto;
  width: 100%;
}

/* Loading & Error States */
.loading-state, .error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  gap: 1rem;
  color: var(--text-secondary);
}

.loader {
  width: 48px;
  height: 48px;
  border: 3px solid var(--border-color);
  border-top-color: var(--accent-blue);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.error-state svg {
  width: 48px;
  height: 48px;
  color: var(--accent-red);
}

.btn-retry {
  padding: 0.75rem 1.5rem;
  background: var(--accent-blue);
  border: none;
  border-radius: 8px;
  color: white;
  font-family: var(--font-display);
  cursor: pointer;
}

/* Heute Übersicht */
.today-overview {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(6, 182, 212, 0.08) 100%);
  border: 1px solid rgba(59, 130, 246, 0.25);
  border-radius: 12px;
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.5rem;
}

.today-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.today-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.today-title svg {
  width: 22px;
  height: 22px;
  color: var(--accent-blue);
}

.today-title h2 {
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-primary);
}

.today-date {
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  margin-left: 0.25rem;
}

.today-timezone {
  font-size: 0.75rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.today-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.5rem;
}

.today-stat {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.today-stat-value {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.today-stat-label {
  font-size: 0.8rem;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

/* Stats Grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

/* Live Bar */
.live-bar {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  padding: 0.875rem 1.25rem;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  margin-bottom: 1.5rem;
}

.live-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent-green);
  letter-spacing: 0.05em;
}

.pulse {
  width: 8px;
  height: 8px;
  background: var(--accent-green);
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.2); }
}

.live-stats {
  display: flex;
  gap: 2rem;
  flex: 1;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.live-stats strong {
  color: var(--text-primary);
  font-weight: 600;
}

.last-updated {
  font-size: 0.8rem;
  color: var(--text-muted);
}

/* Charts */
.charts-row {
  display: grid;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.chart-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.25rem;
}

.chart-card h3 {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

.chart-card.wide {
  grid-column: 1 / -1;
}

/* Analytics Row */
.analytics-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

/* Data Grid */
.data-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

/* Footer */
.footer {
  padding: 1rem;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.8rem;
  border-top: 1px solid var(--border-color);
}

/* Responsive */
@media (max-width: 768px) {
  .header {
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
  }
  
  .header-right {
    width: 100%;
    justify-content: space-between;
  }
  
  .period-selector {
    flex: 1;
  }
  
  .period-btn {
    flex: 1;
    padding: 0.5rem;
    font-size: 0.75rem;
  }
  
  .live-bar {
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .live-stats {
    gap: 1rem;
    font-size: 0.8rem;
    flex-wrap: wrap;
  }

  .today-stats {
    grid-template-columns: repeat(2, 1fr);
    gap: 1rem;
  }

  .today-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.25rem;
  }

  .today-stat-value {
    font-size: 1.25rem;
  }
}
</style>
