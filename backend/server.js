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

// Zürich (Schweiz) Zeitzone
const TIMEZONE = 'Europe/Zurich';

function getZurichDateString(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: TIMEZONE }); // 'YYYY-MM-DD'
}

function getZurichUtcOffsetMs(date) {
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  const zurichStr = date.toLocaleString('en-US', { timeZone: TIMEZONE });
  return new Date(zurichStr).getTime() - new Date(utcStr).getTime();
}

function zurichMidnight(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const utcMidnight = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const offset = getZurichUtcOffsetMs(utcMidnight);
  return new Date(utcMidnight.getTime() - offset);
}

// Heute 00:00 Zürich Zeit
function getStartOfTodayZurich() {
  return zurichMidnight(getZurichDateString());
}

// Montag 00:00 der aktuellen Woche, Zürich Zeit
function getStartOfWeekZurich() {
  const todayStr = getZurichDateString();
  const [y, m, d] = todayStr.split('-').map(Number);
  const tempDate = new Date(y, m - 1, d);
  const dow = tempDate.getDay(); // 0=So, 1=Mo, ...
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const mondayDate = new Date(y, m - 1, d - daysFromMonday);
  const mondayY = mondayDate.getFullYear();
  const mondayM = String(mondayDate.getMonth() + 1).padStart(2, '0');
  const mondayD = String(mondayDate.getDate()).padStart(2, '0');
  return zurichMidnight(`${mondayY}-${mondayM}-${mondayD}`);
}

// IPs die von der Statistik ausgeschlossen werden
// Vollständige IPs oder Präfixe (z.B. '31.10.151' matched alles in diesem Subnetz)
const EXCLUDED_IPS = [
  '2a02:aa14:c47e:a80',
  '31.10.151'
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
  // Alle .php-Anfragen sind Scanner (diese Seite nutzt kein PHP)
  /\.php$/i,
  /\.php\?/i,
  // Weitere Scanner/Exploit-Pfade
  /\/cgi-bin\//i,
  /\/\.well-known\/security/i,
  /\/\.ds_store/i,
  /\/\.htaccess/i,
  /\/\.htpasswd/i,
  /\/shell/i,
  /\/eval-stdin/i,
  /\/vendor\//i,
  /\/telescope\//i,
  /\/debug\//i,
  /\/console\//i,
  /\/config\.(json|yml|yaml|bak|old)/i,
  /\/backup/i,
  /\/db\//i,
  /\/database/i,
  /\/dump/i,
  /\/sql/i,
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

// Gibt die Stunde in Zürich Zeit zurück
function getZurichHour(date) {
  return parseInt(date.toLocaleString('en-US', { timeZone: TIMEZONE, hour: '2-digit', hour12: false }));
}

// Gibt das heutige Datum in Zürich zurück (YYYY-MM-DD)
function getZurichToday() {
  return getZurichDateString();
}

// Gibt die Datumsgrenzen der aktuellen Woche zurück (Mo-So, Zürich Zeit)
// Rückgabe: Set von YYYY-MM-DD Strings
function getZurichWeekDates() {
  const todayStr = getZurichToday();
  const [y, m, d] = todayStr.split('-').map(Number);
  const todayDate = new Date(y, m - 1, d);
  const dow = todayDate.getDay(); // 0=So, 1=Mo, ..., 6=Sa
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;

  const dates = new Set();
  for (let i = 0; i < 7; i++) {
    const date = new Date(y, m - 1, d - daysSinceMonday + i);
    dates.add(
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    );
  }
  return dates;
}

// Filtert Einträge für "heute" in Zürcher Zeit (00:00 - 24:00)
function filterEntriesToday(entries) {
  const todayStr = getZurichToday();
  return entries.filter(e => getZurichDateString(e.date) === todayStr);
}

// Filtert Einträge für die aktuelle Woche (Mo 00:00 - So 24:00, Zürcher Zeit)
function filterEntriesThisWeek(entries) {
  const weekDates = getZurichWeekDates();
  return entries.filter(e => weekDates.has(getZurichDateString(e.date)));
}

// Geräte-Typ aus User-Agent erkennen
function detectDevice(ua) {
  if (!ua) return 'Unknown';
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'Tablet';
  if (/mobile|iphone|ipod|android.*mobile|windows phone|blackberry/i.test(ua)) return 'Mobile';
  return 'Desktop';
}

// Browser aus User-Agent erkennen
function detectBrowser(ua) {
  if (!ua) return 'Unknown';
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/chrome/i.test(ua) && !/edg|opr/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua) && !/chrome|chromium/i.test(ua)) return 'Safari';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/msie|trident/i.test(ua)) return 'IE';
  return 'Other';
}

// Betriebssystem aus User-Agent erkennen
function detectOS(ua) {
  if (!ua) return 'Unknown';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/android/i.test(ua)) return 'Android';
  if (/windows/i.test(ua)) return 'Windows';
  if (/macintosh|mac os/i.test(ua)) return 'macOS';
  if (/linux/i.test(ua)) return 'Linux';
  if (/chromeos/i.test(ua)) return 'ChromeOS';
  return 'Other';
}

// Sessions aus Einträgen aufbauen (30 Min Timeout)
function buildSessions(entries) {
  const SESSION_TIMEOUT = 30 * 60 * 1000;
  const humanEntries = entries.filter(e => e.isPageView);
  if (humanEntries.length === 0) return [];

  const byIp = {};
  for (const entry of humanEntries) {
    if (!byIp[entry.ip]) byIp[entry.ip] = [];
    byIp[entry.ip].push(entry);
  }

  const sessions = [];
  for (const ipEntries of Object.values(byIp)) {
    ipEntries.sort((a, b) => a.date - b.date);
    let session = [ipEntries[0]];
    for (let i = 1; i < ipEntries.length; i++) {
      if (ipEntries[i].date - ipEntries[i - 1].date > SESSION_TIMEOUT) {
        sessions.push(session);
        session = [ipEntries[i]];
      } else {
        session.push(ipEntries[i]);
      }
    }
    sessions.push(session);
  }
  return sessions;
}

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

// Bot-Patterns (erweitert: Scanner, AI-Crawler, CLI-Tools, Monitoring, SEO-Tools)
const BOT_PATTERNS = /bot|crawler|spider|googlebot|bingbot|semrush|ahrefs|yandex|baidu|facebook|twitter|telegram|whatsapp|slurp|duckduck|sogou|exabot|facebot|ia_archiver|curl|wget|python-requests|python-urllib|httpie|postman|axios|node-fetch|go-http-client|java\/|libwww-perl|ruby|php\/|scrapy|puppeteer|headlesschrome|phantomjs|selenium|playwright|lighthouse|pagespeed|uptimerobot|pingdom|datadog|newrelic|statuspage|monitoring|scanner|scraper|nutch|mj12bot|dotbot|rogerbot|bytespider|bytedance|petalbot|amazonbot|claudebot|chatgpt-user|gptbot|anthropic-ai|cohere-ai|applebot|archive\.org|webzip|httrack|offline.explorer|sitechecker|nessus|nikto|sqlmap|masscan|zgrab|censys|shodan/i;

const KNOWN_BOTS = [
  'googlebot', 'bingbot', 'semrush', 'ahrefs', 'yandex', 'baidu',
  'facebook', 'twitter', 'telegram', 'whatsapp', 'duckduckbot',
  'slurp', 'sogou', 'exabot', 'facebot', 'applebot',
  'bytespider', 'petalbot', 'amazonbot', 'mj12bot', 'dotbot',
  'gptbot', 'chatgpt-user', 'claudebot', 'anthropic-ai', 'cohere-ai',
  'uptimerobot', 'pingdom', 'datadog', 'newrelic',
  'curl', 'wget', 'python', 'scrapy', 'puppeteer', 'lighthouse',
  'nikto', 'sqlmap', 'nessus', 'zgrab', 'censys', 'shodan',
  'bot', 'crawler', 'spider'
];

// Nginx Combined Log Format Parser
function parseLogLine(line) {
  // Combined Log Format: IP - - [timestamp] "request" status bytes "referrer" "user-agent"
  const regex = /^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d+) (\d+|-) "([^"]*)" "([^"]*)"/;
  const match = line.match(regex);

  if (!match) return null;

  const [, ip, timestamp, request, status, bytes, referrer, userAgent] = match;

  // IP-Ausschluss prüfen
  if (EXCLUDED_IPS.some(excludedIp => ip.startsWith(excludedIp))) {
    return null;
  }
  
  // Parse timestamp: 31/Jan/2025:10:30:45 +0100
  const dateParts = timestamp.match(/(\d+)\/(\w+)\/(\d+):(\d+):(\d+):(\d+) ([+-]\d{4})/);
  if (!dateParts) return null;

  const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

  // Zeitzone aus dem Log-Eintrag korrekt verarbeiten
  const tzOffset = dateParts[7]; // z.B. "+0100"
  const tzSign = tzOffset[0] === '+' ? 1 : -1;
  const tzHours = parseInt(tzOffset.slice(1, 3));
  const tzMinutes = parseInt(tzOffset.slice(3, 5));
  const tzOffsetMs = tzSign * (tzHours * 60 + tzMinutes) * 60 * 1000;

  // UTC-Datum erstellen und Zeitzone korrekt berücksichtigen
  const utcMs = Date.UTC(
    parseInt(dateParts[3]),
    months[dateParts[2]],
    parseInt(dateParts[1]),
    parseInt(dateParts[4]),
    parseInt(dateParts[5]),
    parseInt(dateParts[6])
  ) - tzOffsetMs;
  const date = new Date(utcMs);
  
  // Request parsen
  const requestParts = request.split(' ');
  const method = requestParts[0] || '-';
  const path = requestParts[1] || '-';
  
  // Bot erkennen (erweitert)
  let isBot = BOT_PATTERNS.test(userAgent);
  let botName = null;

  // Leerer oder fehlender User-Agent = fast immer Bot/Script
  if (!userAgent || userAgent === '-' || userAgent.trim() === '') {
    isBot = true;
    botName = 'empty-ua';
  }

  // Scanner-Probe-Erkennung: Requests auf verdächtige Pfade sind Bots,
  // auch wenn der User-Agent gefälscht ist
  if (!isBot && EXCLUDED_PATH_PATTERNS.some(pattern => pattern.test(path))) {
    isBot = true;
    botName = 'scanner';
  }

  // Bot-Name aus User-Agent extrahieren
  if (isBot && !botName) {
    const lowerUA = userAgent.toLowerCase();
    for (const bot of KNOWN_BOTS) {
      if (lowerUA.includes(bot)) {
        botName = bot;
        break;
      }
    }
    if (!botName) botName = 'other';
  }

  const statusCode = parseInt(status);

  return {
    ip,
    date,
    method,
    path,
    status: statusCode,
    bytes: bytes === '-' ? 0 : parseInt(bytes),
    referrer,
    userAgent,
    isBot,
    botName,
    // Echte Seitenanfrage: GET + nicht-Bot + kein statisches Asset
    isPageView: method === 'GET' && !isBot && !isExcludedFromTopPages(path) && path !== '-'
  };
}

// Log-Dateien lesen (mit gzip Unterstützung)
// Akzeptiert entweder Anzahl Tage (Number) oder ein Start-Datum (Date) als Cutoff
async function readLogFiles(daysBackOrSinceDate = 1) {
  const entries = [];
  let cutoffDate;
  let daysBack;

  if (daysBackOrSinceDate instanceof Date) {
    cutoffDate = daysBackOrSinceDate;
    daysBack = Math.ceil((Date.now() - cutoffDate.getTime()) / 86400000) + 1;
  } else {
    daysBack = daysBackOrSinceDate;
    cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  }
  
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
    uniqueVisitors: new Set(entries.filter(e => e.isPageView).map(e => e.ip)).size,
    totalBots: new Set(entries.filter(e => e.isBot).map(e => e.ip)).size,
    totalBytes: entries.reduce((sum, e) => sum + e.bytes, 0),
    humanRequests: entries.filter(e => !e.isBot).length,
    humanPageViews: entries.filter(e => e.isPageView).length,
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
    
    // Top Referrers (nur von echten Seitenbesuchen, keine Bots)
    if (!entry.isBot && entry.referrer && entry.referrer !== '-' && !entry.referrer.includes('kodinitools.com')) {
      try {
        const refUrl = new URL(entry.referrer);
        const refDomain = refUrl.hostname;
        stats.topReferrers[refDomain] = (stats.topReferrers[refDomain] || 0) + 1;
      } catch (e) {
        // Ungültige URL ignorieren
      }
    }

    // Requests pro Stunde (Zürcher Zeit, nur menschliche Seitenaufrufe)
    if (entry.isPageView) {
      const hour = getZurichHour(entry.date);
      stats.requestsByHour[hour] = (stats.requestsByHour[hour] || 0) + 1;
    }

    // Requests pro Tag (Zürich Zeit)
    const day = getZurichDateString(entry.date);
    if (!stats.requestsByDay[day]) {
      stats.requestsByDay[day] = { total: 0, human: 0, bot: 0, pageViews: 0, uniqueIps: new Set() };
    }
    stats.requestsByDay[day].total++;
    if (entry.isBot) {
      stats.requestsByDay[day].bot++;
    } else {
      stats.requestsByDay[day].human++;
      if (entry.isPageView) {
        stats.requestsByDay[day].pageViews++;
        stats.requestsByDay[day].uniqueIps.add(entry.ip);
      }
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

  // --- Erweiterte Analysen ---

  // 1. Top Pages mit Unique Visitors
  const pageIps = {};
  for (const entry of entries) {
    if (entry.isPageView) {
      const cleanPath = entry.path.split('?')[0];
      if (!isExcludedFromTopPages(cleanPath)) {
        if (!pageIps[cleanPath]) pageIps[cleanPath] = new Set();
        pageIps[cleanPath].add(entry.ip);
      }
    }
  }
  stats.topPagesDetailed = Object.entries(stats.topPages)
    .map(([path, views]) => ({
      path,
      views,
      uniqueVisitors: pageIps[path] ? pageIps[path].size : 0
    }));

  // 2. Session-Analyse
  const sessions = buildSessions(entries);
  const totalSessions = sessions.length;
  const bounceSessions = sessions.filter(s => s.length === 1).length;
  const totalPagesInSessions = sessions.reduce((sum, s) => sum + s.length, 0);

  stats.sessionStats = {
    totalSessions,
    bounceRate: totalSessions > 0 ? Math.round((bounceSessions / totalSessions) * 100) : 0,
    avgPagesPerSession: totalSessions > 0 ? parseFloat((totalPagesInSessions / totalSessions).toFixed(1)) : 0
  };

  // 3. Einstiegsseiten (Entry Pages)
  const entryPages = {};
  for (const session of sessions) {
    const entryPath = session[0].path.split('?')[0];
    entryPages[entryPath] = (entryPages[entryPath] || 0) + 1;
  }
  stats.entryPages = Object.entries(entryPages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }));

  // 4. Ausstiegsseiten (Exit Pages)
  const exitPages = {};
  for (const session of sessions) {
    const exitPath = session[session.length - 1].path.split('?')[0];
    exitPages[exitPath] = (exitPages[exitPath] || 0) + 1;
  }
  stats.exitPages = Object.entries(exitPages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }));

  // 5. Besucher-Flow (häufigste Seitenübergänge)
  const transitions = {};
  for (const session of sessions) {
    for (let i = 0; i < session.length - 1; i++) {
      const from = session[i].path.split('?')[0];
      const to = session[i + 1].path.split('?')[0];
      if (from !== to) {
        const key = `${from} → ${to}`;
        transitions[key] = (transitions[key] || 0) + 1;
      }
    }
  }
  stats.visitorFlow = Object.entries(transitions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([transition, count]) => ({ transition, count }));

  // 6. Neue vs. wiederkehrende Besucher (innerhalb des Zeitraums)
  const ipSessionCounts = {};
  for (const session of sessions) {
    const ip = session[0].ip;
    ipSessionCounts[ip] = (ipSessionCounts[ip] || 0) + 1;
  }
  const singleVisitIps = Object.values(ipSessionCounts).filter(c => c === 1).length;
  const returningIps = Object.values(ipSessionCounts).filter(c => c > 1).length;
  const totalUniqueIps = Object.keys(ipSessionCounts).length;
  stats.visitorTypes = {
    newVisitors: singleVisitIps,
    returningVisitors: returningIps,
    newPercent: totalUniqueIps > 0 ? Math.round((singleVisitIps / totalUniqueIps) * 100) : 0,
    returningPercent: totalUniqueIps > 0 ? Math.round((returningIps / totalUniqueIps) * 100) : 0
  };

  // 7. Geräte-Typen
  const devices = {};
  const browsers = {};
  const osSystems = {};
  const humanEntries = entries.filter(e => e.isPageView);
  const uniqueHumanIps = new Set();
  for (const entry of humanEntries) {
    if (uniqueHumanIps.has(entry.ip)) continue;
    uniqueHumanIps.add(entry.ip);
    const device = detectDevice(entry.userAgent);
    const browser = detectBrowser(entry.userAgent);
    const os = detectOS(entry.userAgent);
    devices[device] = (devices[device] || 0) + 1;
    browsers[browser] = (browsers[browser] || 0) + 1;
    osSystems[os] = (osSystems[os] || 0) + 1;
  }

  const sortObj = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  stats.devices = sortObj(devices);
  stats.browsers = sortObj(browsers);
  stats.osSystems = sortObj(osSystems);

  // 8. HTTP-Fehler (404s)
  const errorPages = {};
  for (const entry of entries) {
    if (entry.status === 404 && !entry.isBot) {
      const cleanPath = entry.path.split('?')[0];
      errorPages[cleanPath] = (errorPages[cleanPath] || 0) + 1;
    }
  }
  stats.errorPages = Object.entries(errorPages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([path, count]) => ({ path, count }));

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

// Heute (00:00 - 24:00 Zürich Zeit)
app.get('/api/stats/today', async (req, res) => {
  try {
    const todayStart = getStartOfTodayZurich();
    const entries = await readLogFiles(todayStart);
    const stats = aggregateStats(entries);
    stats.period = 'today';
    stats.zurichDate = getZurichToday();
    res.json(stats);
  } catch (error) {
    console.error('Fehler:', error);
    res.status(500).json({ error: error.message });
  }
});

// Diese Woche (Montag 00:00 - Sonntag 24:00, Zürich Zeit)
app.get('/api/stats/week', async (req, res) => {
  try {
    const weekStart = getStartOfWeekZurich();
    const entries = await readLogFiles(weekStart);
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

// Heute-Übersicht (immer Zürich Zeit, 00:00 - 24:00)
app.get('/api/stats/today-overview', async (req, res) => {
  try {
    const todayStart = getStartOfTodayZurich();
    const todayEntries = await readLogFiles(todayStart);

    // Sessions berechnen
    const sessions = buildSessions(todayEntries);
    const ipSessionCounts = {};
    for (const session of sessions) {
      const ip = session[0].ip;
      ipSessionCounts[ip] = (ipSessionCounts[ip] || 0) + 1;
    }
    const totalUniqueIps = Object.keys(ipSessionCounts).length;
    const singleVisitIps = Object.values(ipSessionCounts).filter(c => c === 1).length;
    const returningIps = Object.values(ipSessionCounts).filter(c => c > 1).length;

    // Einstiegs- und Ausstiegsseiten
    const entryPages = {};
    const exitPages = {};
    for (const session of sessions) {
      const entryPath = session[0].path.split('?')[0];
      entryPages[entryPath] = (entryPages[entryPath] || 0) + 1;
      const exitPath = session[session.length - 1].path.split('?')[0];
      exitPages[exitPath] = (exitPages[exitPath] || 0) + 1;
    }

    const stats = {
      zurichDate: getZurichToday(),
      visitors: new Set(todayEntries.filter(e => e.isPageView).map(e => e.ip)).size,
      pageViews: todayEntries.filter(e => e.isPageView).length,
      humanRequests: todayEntries.filter(e => !e.isBot).length,
      botRequests: todayEntries.filter(e => e.isBot).length,
      totalBytes: todayEntries.reduce((sum, e) => sum + e.bytes, 0),
      totalBytesFormatted: formatBytes(todayEntries.reduce((sum, e) => sum + e.bytes, 0)),
      sessions: sessions.length,
      newVisitors: singleVisitIps,
      returningVisitors: returningIps,
      topEntryPage: Object.entries(entryPages).sort((a, b) => b[1] - a[1])[0]?.[0] || '-',
      topExitPage: Object.entries(exitPages).sort((a, b) => b[1] - a[1])[0]?.[0] || '-',
      requestsByHour: {}
    };

    // Stündliche Aufschlüsselung (Zürcher Zeit)
    for (const entry of todayEntries) {
      if (entry.isPageView) {
        const hour = getZurichHour(entry.date);
        stats.requestsByHour[hour] = (stats.requestsByHour[hour] || 0) + 1;
      }
    }

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
        uniqueVisitors: new Set(recentEntries.filter(e => e.isPageView).map(e => e.ip)).size,
        pageViews: recentEntries.filter(e => e.isPageView).length,
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
