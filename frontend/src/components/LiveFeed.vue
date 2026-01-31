<script setup>
import { computed } from 'vue'

const props = defineProps({
  requests: Array
})

function formatTime(isoString) {
  const date = new Date(isoString)
  return date.toLocaleTimeString('de-DE', { 
    hour: '2-digit', 
    minute: '2-digit',
    second: '2-digit'
  })
}

function getStatusColor(status) {
  if (status >= 200 && status < 300) return 'status-success'
  if (status >= 300 && status < 400) return 'status-redirect'
  if (status >= 400 && status < 500) return 'status-client-error'
  if (status >= 500) return 'status-server-error'
  return ''
}

function formatPath(path) {
  if (!path || path === '-') return '-'
  if (path.length > 50) {
    return path.substring(0, 47) + '...'
  }
  return path
}
</script>

<template>
  <div class="live-feed">
    <h3>
      <span class="live-dot"></span>
      Live Request Feed
      <span class="feed-count">{{ requests?.length || 0 }} letzte Requests</span>
    </h3>
    
    <div class="feed-table-container">
      <table class="feed-table">
        <thead>
          <tr>
            <th>Zeit</th>
            <th>IP</th>
            <th>Pfad</th>
            <th>Status</th>
            <th>Typ</th>
          </tr>
        </thead>
        <tbody>
          <tr 
            v-for="(req, index) in requests" 
            :key="index"
            :class="{ 'is-bot': req.isBot }"
          >
            <td class="col-time">{{ formatTime(req.time) }}</td>
            <td class="col-ip">{{ req.ip }}</td>
            <td class="col-path" :title="req.path">{{ formatPath(req.path) }}</td>
            <td class="col-status">
              <span :class="['status-badge', getStatusColor(req.status)]">
                {{ req.status }}
              </span>
            </td>
            <td class="col-type">
              <span :class="['type-badge', req.isBot ? 'bot' : 'human']">
                {{ req.isBot ? 'Bot' : 'Human' }}
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    
    <div v-if="!requests || requests.length === 0" class="no-data">
      Keine aktuellen Requests
    </div>
  </div>
</template>

<style scoped>
.live-feed {
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

.live-dot {
  width: 8px;
  height: 8px;
  background: var(--accent-green);
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.feed-count {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--text-muted);
  font-weight: 400;
}

.feed-table-container {
  overflow-x: auto;
  max-height: 350px;
  overflow-y: auto;
}

.feed-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
}

.feed-table th {
  text-align: left;
  padding: 0.625rem 0.75rem;
  background: var(--bg-tertiary);
  color: var(--text-muted);
  font-weight: 500;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  position: sticky;
  top: 0;
}

.feed-table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-secondary);
}

.feed-table tr:hover {
  background: var(--bg-tertiary);
}

.feed-table tr.is-bot {
  opacity: 0.7;
}

.col-time {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  white-space: nowrap;
}

.col-ip {
  font-family: var(--font-mono);
  font-size: 0.75rem;
}

.col-path {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-status {
  white-space: nowrap;
}

.status-badge {
  display: inline-block;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 600;
}

.status-success { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
.status-redirect { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
.status-client-error { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }
.status-server-error { background: rgba(239, 68, 68, 0.2); color: #ef4444; }

.type-badge {
  display: inline-block;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 500;
}

.type-badge.human { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
.type-badge.bot { background: rgba(245, 158, 11, 0.2); color: #f59e0b; }

.no-data {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.85rem;
  padding: 2rem;
}
</style>
