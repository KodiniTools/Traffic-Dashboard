const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const zlib = require('zlib');
const readline = require('readline');
const { createReadStream } = require('fs');
const { createGunzip } = require('zlib');

const execAsync = promisify(exec);
const app = express();
const PORT = process.env.PORT || 3847;

// Konfiguration
const CONFIG = {
  logPath: '/var/log/nginx/kodinitools.com.access.log',
  // API Key für einfache Authentifizierung (ändere diesen Wert!)
  apiKey: process.env.DASHBOARD_API_KEY || 'dein-geheimer-api-key-hier'
};

// IPs die von der Statistik ausgeschlossen werden
const EXCLUDED_IPS = [
  '2a02:aa14:c47e:a80:c55f:d185:f384:9745'
];

// Pfade die aus Top Pages ausgeschlossen werden (Scanner/Probes)
const EXCLUDED_PATH_PATTERNS = [
  /\/wp-admin\//i,
  /\/wp-login\.php/i,
  /\/wp-config\.php/i,
  /\/wordpress\//i,
  /\/wp-includes\//i,
  /\/wp-content\//i,
  /\/xmlrpc\.php/i,
  /\/\.env/i,
  /\/\.git/i,
  /\/phpmyadmin/i,
  /\/admin\//i,
  /\/setup-config\.php/i,
];

// Dateiendungen die keine echten Seitenbesuche sind (statische Assets)
const EXCLUDED_EXTENSIONS = [
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp', '.avif',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.css', '.js', '.map',
  '.xml', '.txt', '.json',
  '.pdf', '.zip', '.gz',
  '.mp4', '.webm', '.mp3', '.ogg',
];

// Prüft ob ein Pfad aus Top Pages ausgeschlossen werden soll
function isExcludedFromTopPages(path) {
  // Scanner/Probe-Pfade ausschließen
  if (EXCLUDED_PATH_PATTERNS.some(pattern => pattern.test(path))) {
    return true;
  }
  // Statische Assets ausschließen (Dateiendung prüfen)
  const lowerPath = path.toLowerCase().split('?')[0];
  if (EXCLUDED_EXTENSIONS.some(ext => lowerPath.endsWith(ext))) {
    return true;
  }
  return false;
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Einfache API-Key Authentifizierung
const authenticate = (req, res, next) => {
  const apiKey = req.headers['x-api-key'] || req.query.apiKey;
  if (apiKey !== CONFIG.apiKey) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Alle API-Routen authentifizieren
app.use('/api', authenticate);

// Bot-Patterns
const BOT_PATTERNS = /bot|crawler|spider|googlebot|bingbot|semrush|ahrefs|yandex|baidu|facebook|twitter|telegram|whatsapp|slurp|duckduck|sogou|exabot|facebot|ia_archiver/i;

const KNOWN_BOTS = [
  'googlebot', 'bingbot', 'semrush', 'ahrefs', 'yandex', 'baidu',
  'facebook', 'twitter', 'telegram', 'whatsapp', 'duckduckbot',
  'slurp', 'sogou', 'exabot', 'facebot', 'applebot', 'bot', 'crawler', 'spider'
];

// Nginx Combined Log Format Parser
function parseLogLine(line) {
  // Combined Log Format: IP - - [timestamp] "request" status bytes "referrer" "user-agent"
  const regex = /^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d+) (\d+|-) "([^"]*)" "([^"]*)"/;
  const match = line.match(regex);

  if (!match) return null;

  const [, ip, timestamp, request, status, bytes, referrer, userAgent] = match;

  // IP-Ausschluss prüfen
  if (EXCLUDED_IPS.some(excludedIp => ip.startsWith(excludedIp.split(':').slice(0, 4).join(':')) || ip === excludedIp)) {
    return null;
  }
  
  // Parse timestamp: 31/Jan/2025:10:30:45 +0100
  const dateParts = timestamp.match(/(\d+)\/(\w+)\/(\d+):(\d+):(\d+):(\d+)/);
  if (!dateParts) return null;
  
  const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const date = new Date(
    parseInt(dateParts[3]),
    months[dateParts[2]],
    parseInt(dateParts[1]),
    parseInt(dateParts[4]),
    parseInt(dateParts[5]),
    parseInt(dateParts[6])
  );
  
  // Request parsen
  const requestParts = request.split(' ');
  const method = requestParts[0] || '-';
  const path = requestParts[1] || '-';
  
  // Bot erkennen
  const isBot = BOT_PATTERNS.test(userAgent);
  let botName = null;
  if (isBot) {
    for (const bot of KNOWN_BOTS) {
      if (userAgent.toLowerCase().includes(bot)) {
        botName = bot;
        break;
      }
    }
    if (!botName) botName = 'other';
  }
  
  return {
    ip,
    date,
    method,
    path,
    status: parseInt(status),
    bytes: bytes === '-' ? 0 : parseInt(bytes),
    referrer,
    userAgent,
    isBot,
    botName
  };
}

// Log-Dateien lesen (mit gzip Unterstützung)
async function readLogFiles(daysBack = 1) {
  const entries = [];
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  
  // Aktuelle Log-Datei
  try {
    const content = await fs.readFile(CONFIG.logPath, 'utf-8');
    for (const line of content.split('\n')) {
      const parsed = parseLogLine(line);
      if (parsed && parsed.date >= cutoffDate) {
        entries.push(parsed);
      }
    }
  } catch (err) {
    console.error('Fehler beim Lesen der aktuellen Log-Datei:', err.message);
  }
  
  // Rotierte Log-Dateien (.1 und .gz) - unterstützt bis zu 365 Tage
  for (let i = 1; i <= Math.min(daysBack, 365); i++) {
    try {
      const logFile = i === 1 
        ? `${CONFIG.logPath}.1`
        : `${CONFIG.logPath}.${i}.gz`;
      
      let content;
      if (logFile.endsWith('.gz')) {
        try {
          const compressed = await fs.readFile(logFile);
          content = zlib.gunzipSync(compressed).toString('utf-8');
        } catch (err) {
          continue; // Datei existiert möglicherweise nicht
        }
      } else {
        try {
          content = await fs.readFile(logFile, 'utf-8');
        } catch (err) {
          continue;
        }
      }
      
      for (const line of content.split('\n')) {
        const parsed = parseLogLine(line);
        if (parsed && parsed.date >= cutoffDate) {
          entries.push(parsed);
        }
      }
    } catch (err) {
      // Datei existiert nicht, weiter
    }
  }
  
  return entries;
}

// Statistiken aggregieren
function aggregateStats(entries) {
  const stats = {
    totalRequests: entries.length,
    uniqueVisitors: new Set(entries.filter(e => !e.isBot).map(e => e.ip)).size,
    totalBots: new Set(entries.filter(e => e.isBot).map(e => e.ip)).size,
    totalBytes: entries.reduce((sum, e) => sum + e.bytes, 0),
    humanRequests: entries.filter(e => !e.isBot).length,
    botRequests: entries.filter(e => e.isBot).length,
    statusCodes: {},
    topPages: {},
    topReferrers: {},
    requestsByHour: {},
    requestsByDay: {},
    botStats: {}
  };
  
  for (const entry of entries) {
    // Status Codes
    const statusGroup = `${Math.floor(entry.status / 100)}xx`;
    stats.statusCodes[statusGroup] = (stats.statusCodes[statusGroup] || 0) + 1;
    
    // Top Pages (nur echte Seitenbesuche von Menschen)
    if (!entry.isBot && entry.path !== '-') {
      const cleanPath = entry.path.split('?')[0]; // Query-Parameter entfernen
      if (!isExcludedFromTopPages(cleanPath)) {
        stats.topPages[cleanPath] = (stats.topPages[cleanPath] || 0) + 1;
      }
    }
    
    // Top Referrers
    if (entry.referrer && entry.referrer !== '-' && !entry.referrer.includes('kodinitools.com')) {
      try {
        const refUrl = new URL(entry.referrer);
        const refDomain = refUrl.hostname;
        stats.topReferrers[refDomain] = (stats.topReferrers[refDomain] || 0) + 1;
      } catch (e) {
        // Ungültige URL ignorieren
      }
    }
    
    // Requests pro Stunde
    const hour = entry.date.getHours();
    stats.requestsByHour[hour] = (stats.requestsByHour[hour] || 0) + 1;
    
    // Requests pro Tag
    const day = entry.date.toISOString().split('T')[0];
    if (!stats.requestsByDay[day]) {
      stats.requestsByDay[day] = { total: 0, human: 0, bot: 0, uniqueIps: new Set() };
    }
    stats.requestsByDay[day].total++;
    stats.requestsByDay[day].uniqueIps.add(entry.ip);
    if (entry.isBot) {
      stats.requestsByDay[day].bot++;
    } else {
      stats.requestsByDay[day].human++;
    }
    
    // Bot Statistiken
    if (entry.isBot && entry.botName) {
      stats.botStats[entry.botName] = (stats.botStats[entry.botName] || 0) + 1;
    }
  }
  
  // Sets zu Zahlen konvertieren für JSON
  for (const day in stats.requestsByDay) {
    stats.requestsByDay[day].uniqueVisitors = stats.requestsByDay[day].uniqueIps.size;
    delete stats.requestsByDay[day].uniqueIps;
  }
  
  // Top Listen sortieren und limitieren
  stats.topPages = Object.entries(stats.topPages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {});
  
  stats.topReferrers = Object.entries(stats.topReferrers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {});
  
  stats.botStats = Object.entries(stats.botStats)
    .sort((a, b) => b[1] - a[1])
    .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {});
  
  // Bytes formatieren
  stats.totalBytesFormatted = formatBytes(stats.totalBytes);
  
  return stats;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// API Endpunkte

// Heute
app.get('/api/stats/today', async (req, res) => {
  try {
    const entries = await readLogFiles(1);
    const stats = aggregateStats(entries);
    stats.period = 'today';
    res.json(stats);
  } catch (error) {
    console.error('Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Letzte 7 Tage
app.get('/api/stats/week', async (req, res) => {
  try {
    const entries = await readLogFiles(7);
    const stats = aggregateStats(entries);
    stats.period = 'week';
    res.json(stats);
  } catch (error) {
    console.error('Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Letzte 14 Tage
app.get('/api/stats/twoweeks', async (req, res) => {
  try {
    const entries = await readLogFiles(14);
    const stats = aggregateStats(entries);
    stats.period = 'twoweeks';
    res.json(stats);
  } catch (error) {
    console.error('Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Letzte 30 Tage
app.get('/api/stats/month', async (req, res) => {
  try {
    const entries = await readLogFiles(30);
    const stats = aggregateStats(entries);
    stats.period = 'month';
    res.json(stats);
  } catch (error) {
    console.error('Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Letzte 3 Monate (90 Tage)
app.get('/api/stats/quarter', async (req, res) => {
  try {
    const entries = await readLogFiles(90);
    const stats = aggregateStats(entries);
    stats.period = 'quarter';
    res.json(stats);
  } catch (error) {
    console.error('Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Letzte 6 Monate (180 Tage)
app.get('/api/stats/halfyear', async (req, res) => {
  try {
    const entries = await readLogFiles(180);
    const stats = aggregateStats(entries);
    stats.period = 'halfyear';
    res.json(stats);
  } catch (error) {
    console.error('Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Letztes Jahr (365 Tage)
app.get('/api/stats/year', async (req, res) => {
  try {
    const entries = await readLogFiles(365);
    const stats = aggregateStats(entries);
    stats.period = 'year';
    res.json(stats);
  } catch (error) {
    console.error('Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Benutzerdefinierter Zeitraum (max 365 Tage)
app.get('/api/stats/custom/:days', async (req, res) => {
  try {
    const days = Math.min(parseInt(req.params.days) || 1, 365);
    const entries = await readLogFiles(days);
    const stats = aggregateStats(entries);
    stats.period = `${days} days`;
    res.json(stats);
  } catch (error) {
    console.error('Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Live-Daten (letzte Stunde)
app.get('/api/stats/live', async (req, res) => {
  try {
    const entries = await readLogFiles(1);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentEntries = entries.filter(e => e.date >= oneHourAgo);
    
    const stats = {
      lastHour: {
        requests: recentEntries.length,
        uniqueVisitors: new Set(recentEntries.filter(e => !e.isBot).map(e => e.ip)).size,
        bots: recentEntries.filter(e => e.isBot).length,
        bytes: recentEntries.reduce((sum, e) => sum + e.bytes, 0)
      },
      recentRequests: recentEntries.slice(-50).reverse().map(e => ({
        time: e.date.toISOString(),
        ip: e.ip.replace(/\.\d+$/, '.xxx'), // IP teilweise anonymisieren
        path: e.path,
        status: e.status,
        isBot: e.isBot
      }))
    };
    
    stats.lastHour.bytesFormatted = formatBytes(stats.lastHour.bytes);
    res.json(stats);
  } catch (error) {
    console.error('Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Server starten
app.listen(PORT, () => {
  console.log(`Traffic Dashboard API läuft auf Port ${PORT}`);
  console.log(`Health Check: http://localhost:${PORT}/health`);
});
