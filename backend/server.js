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

// Verhaltensbasierte Spike-/Swarm-Erkennung
// Erkennt plötzliche Anfrage-Wellen, die sich als echte Besucher tarnen
// (normaler Browser-User-Agent, unverdächtiger Pfad), aber in Wirklichkeit
// automatisierte Skripte/Scraper/Bot-Netze sind.
//
// Signatur eines solchen Spikes: Sehr viele VERSCHIEDENE IPs, die in kurzer
// Zeit je nur EINEN flachen Treffer (Single-Page, sofort weg) auf DIESELBE
// Seite machen und dabei NIE ein statisches Asset (CSS/JS/Bild) nachladen –
// echte Browser laden diese Assets immer mit.
const SPIKE_DETECTION = {
  enabled: true,
  windowMinutes: 10,     // Länge des gleitenden Zeitfensters
  minHitsInWindow: 30,   // So viele flache Treffer auf eine Seite im Fenster = Spike
  minUniqueIps: 15,      // ...verteilt auf mind. so viele verschiedene IPs (schützt vor Einzel-IP)
  shallowMaxHits: 2,     // Eine IP gilt als "flach", wenn sie höchstens so viele Seitenaufrufe hatte
  shallowMaxSeconds: 10, // ...innerhalb dieser Zeitspanne (Hit-and-run)
  requireNoAssets: true, // ...und dabei kein statisches Asset geladen hat (echte Browser tun das)

  // Zusatz-Signal: Ein einzelner exakter User-Agent-String, der auffällig viele
  // Seitenaufrufe (ohne Asset-Loads) auf DIESELBE Seite macht, verrät ein Bot-Netz –
  // echte Besucher streuen über viele Browser-/OS-Versionen. Ab diesem Schwellwert
  // gilt die Seite als "unter Beschuss".
  uaConcentrationThreshold: 40,

  // Auf einer "unter Beschuss" stehenden Seite ALLE Seitenaufrufe von IPs ohne
  // Asset-Loads filtern – egal ob im Peak oder im Tröpfeln, egal wie viele Treffer.
  // Fängt langsame/verteilte Bots, die dem Zeitfenster entgehen. Echte Browser laden
  // Assets und bleiben verschont. Bei Asset-CDN ggf. auf false setzen.
  extendToNoAssetHits: true
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

// Pfad-Präfixe, die KOMPLETT aus jeder Statistik ausgeschlossen werden.
// Vor allem das Dashboard selbst: dessen Seitenaufrufe, Assets und vor allem
// das ständige API-Polling (/traffic-dashboard/api/stats/...) sind eigene
// Zugriffe und dürfen die Statistik der eigentlichen Website nicht verfälschen.
// Solche Anfragen werden gar nicht erst eingelesen (weder Mensch noch Bot).
const EXCLUDED_PATH_PREFIXES = [
  '/traffic-dashboard'
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
  // Chrome Private Prefetch Proxy probt diese Datei automatisch ab.
  // Fehlt sie, entsteht ein 404 – aber es ist kein echter Besucher-Fehler,
  // sondern eine automatische Infrastruktur-Anfrage (siehe nginx.conf für den
  // Fix an der Quelle). Aus der 404-/Seiten-Statistik ausschließen.
  /\/\.well-known\/traffic-advice/i,
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

// Verhaltensbasierte Bot-Erkennung (Post-Processing über die geladenen Einträge).
//
// WICHTIG: Läuft PRO ZÜRICH-KALENDERTAG getrennt. Sonst würde ein Tag je nach
// geladenem Zeitraum unterschiedlich eingestuft (z.B. "Heute" vs. der Heute-Wert
// im 14-Tage-Chart), weil Schwellwerte wie die UA-Konzentration über das gesamte
// Fenster akkumulieren. Pro-Tag-Erkennung macht jeden Tag deterministisch:
// dieselbe Zahl in jeder Ansicht.
//
// Verändert die übergebenen Einträge in-place. Gibt eine Zusammenfassung zurück.
function detectBehavioralBots(entries) {
  const summary = { flaggedRequests: 0, flaggedIps: 0, paths: [] };
  if (!SPIKE_DETECTION.enabled || entries.length === 0) return summary;

  // Einträge nach Zürich-Kalendertag gruppieren
  const byDay = {};
  for (const e of entries) {
    const day = getZurichDateString(e.date);
    (byDay[day] || (byDay[day] = [])).push(e);
  }

  const flaggedIps = new Set();
  const perPath = {};
  for (const day in byDay) {
    summary.flaggedRequests += detectSpikesInWindow(byDay[day], flaggedIps, perPath);
  }

  summary.flaggedIps = flaggedIps.size;
  summary.paths = Object.entries(perPath)
    .map(([path, requests]) => ({ path, requests }))
    .sort((a, b) => b.requests - a.requests);
  if (summary.flaggedRequests > 0) {
    console.log(`[Spike-Erkennung] ${summary.flaggedRequests} verdächtige Anfragen von ${summary.flaggedIps} IPs als Bot markiert (Pfade: ${summary.paths.map(p => p.path).join(', ')})`);
  }
  return summary;
}

// Kern der Erkennung innerhalb EINES Zeitfensters (typischerweise ein Kalendertag).
// Markiert erkannte Spike-Anfragen in-place (isBot=true, botName='spike',
// isPageView=false), sammelt betroffene IPs/Pfade in den übergebenen Containern
// und gibt die Anzahl markierter Anfragen zurück.
function detectSpikesInWindow(entries, flaggedIpsOut, perPathOut) {
  if (entries.length === 0) return 0;

  const {
    windowMinutes, minHitsInWindow, minUniqueIps,
    shallowMaxHits, shallowMaxSeconds, requireNoAssets,
    uaConcentrationThreshold, extendToNoAssetHits
  } = SPIKE_DETECTION;
  const windowMs = windowMinutes * 60 * 1000;

  // 1. Profil pro IP (Seitenaufrufe, Assets, Zeitspanne)
  const ipProfile = {};
  for (const e of entries) {
    let p = ipProfile[e.ip];
    if (!p) p = ipProfile[e.ip] = { pageViews: 0, paths: new Set(), assets: 0, first: Infinity, last: -Infinity };
    const t = e.date.getTime();
    if (t < p.first) p.first = t;
    if (t > p.last) p.last = t;
    if (e.isPageView) {
      p.pageViews++;
      p.paths.add(e.path.split('?')[0]);
    } else if (e.method === 'GET' && isStaticAsset(e.path)) {
      p.assets++;
    }
  }
  // Eine IP verhält sich "bot-artig", wenn sie kein einziges Asset geladen hat.
  // (Ohne Asset-Info als Kriterium – z.B. bei CDN – Rückfall auf flaches Hit-and-run.)
  const isBotlikeIp = (ip) => {
    const p = ipProfile[ip];
    if (!p) return false;
    if (requireNoAssets) return p.assets === 0;
    const spanSec = (p.last - p.first) / 1000;
    return p.pageViews <= shallowMaxHits && p.paths.size <= 1 && spanSec <= shallowMaxSeconds;
  };

  // 2. "Flache" IPs bestimmen: Hit-and-run auf eine einzige Seite, ohne Asset-Loads
  const shallowIps = new Set();
  for (const ip in ipProfile) {
    const p = ipProfile[ip];
    const spanSec = (p.last - p.first) / 1000;
    if (
      p.pageViews >= 1 &&
      p.pageViews <= shallowMaxHits &&
      p.paths.size <= 1 &&
      spanSec <= shallowMaxSeconds &&
      (!requireNoAssets || p.assets === 0)
    ) {
      shallowIps.add(ip);
    }
  }

  // 3. Angriffs-Pfade bestimmen ("unter Beschuss").
  const attackedPaths = new Set();

  // 3a. Burst-Signal: viele flache Treffer auf eine Seite in kurzer Zeit,
  //     verteilt auf genügend verschiedene IPs (gleitendes Fenster, Zwei-Zeiger).
  if (shallowIps.size >= minUniqueIps) {
    const byPath = {};
    for (const e of entries) {
      if (e.isPageView && shallowIps.has(e.ip)) {
        const cp = e.path.split('?')[0];
        (byPath[cp] || (byPath[cp] = [])).push(e);
      }
    }
    for (const path in byPath) {
      const list = byPath[path];
      list.sort((a, b) => a.date - b.date);
      let start = 0;
      for (let end = 0; end < list.length; end++) {
        while (list[end].date - list[start].date > windowMs) start++;
        if (end - start + 1 >= minHitsInWindow) {
          const ips = new Set();
          for (let k = start; k <= end; k++) ips.add(list[k].ip);
          if (ips.size >= minUniqueIps) { attackedPaths.add(path); break; }
        }
      }
    }
  }

  // 3b. UA-Konzentrations-Signal: ein einzelner exakter User-Agent, der viele
  //     Asset-lose Seitenaufrufe auf DIESELBE Seite macht = getarntes Bot-Netz.
  if (uaConcentrationThreshold > 0) {
    const uaPathCounts = {}; // "path\x00ua" -> Anzahl Asset-loser Seitenaufrufe
    for (const e of entries) {
      if (e.isPageView && isBotlikeIp(e.ip)) {
        const key = e.path.split('?')[0] + '\x00' + e.userAgent;
        uaPathCounts[key] = (uaPathCounts[key] || 0) + 1;
      }
    }
    for (const key in uaPathCounts) {
      if (uaPathCounts[key] >= uaConcentrationThreshold) {
        attackedPaths.add(key.split('\x00')[0]);
      }
    }
  }

  if (attackedPaths.size === 0) return 0;

  // 4. Auf allen Angriffs-Pfaden ALLE Asset-losen Seitenaufrufe als Bot markieren.
  //    Fängt Peak UND Tröpfeln sowie IPs mit mehreren Treffern. Echte Browser laden
  //    Assets und bleiben verschont. (Ohne extendToNoAssetHits nur exakt flache IPs.)
  let flaggedCount = 0;
  for (const e of entries) {
    if (!e.isPageView) continue;
    const cp = e.path.split('?')[0];
    if (!attackedPaths.has(cp)) continue;
    const flagIt = extendToNoAssetHits ? isBotlikeIp(e.ip) : shallowIps.has(e.ip);
    if (!flagIt) continue;
    e.isBot = true;
    e.botName = 'spike';
    e.isPageView = false;
    flaggedIpsOut.add(e.ip);
    perPathOut[cp] = (perPathOut[cp] || 0) + 1;
    flaggedCount++;
  }

  return flaggedCount;
}

// Prüft ob ein Pfad ein statisches Asset ist (CSS/JS/Bild/Font/...)
function isStaticAsset(path) {
  const lowerPath = path.toLowerCase().split('?')[0];
  return EXCLUDED_EXTENSIONS.some(ext => lowerPath.endsWith(ext));
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

  // Dashboard-eigene Zugriffe komplett ausschließen (eigenes Polling/Besuche)
  if (EXCLUDED_PATH_PREFIXES.some(prefix =>
    path === prefix || path.startsWith(prefix + '/') || path.startsWith(prefix + '?')
  )) {
    return null;
  }

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

  // UTM-Parameter aus Query-String extrahieren
  let utmSource = null, utmMedium = null, utmCampaign = null, utmTerm = null, utmContent = null;
  if (path.includes('?')) {
    try {
      const qs = path.split('?').slice(1).join('?');
      const params = new URLSearchParams(qs);
      utmSource = params.get('utm_source') || null;
      utmMedium = params.get('utm_medium') || null;
      utmCampaign = params.get('utm_campaign') || null;
      utmTerm = params.get('utm_term') || null;
      utmContent = params.get('utm_content') || null;
    } catch (e) { /* ungültige Query-Strings ignorieren */ }
  }

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
    utmSource,
    utmMedium,
    utmCampaign,
    utmTerm,
    utmContent,
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

  // Verhaltensbasierte Nacherkennung über das gesamte geladene Zeitfenster.
  // Markiert getarnte Spike-/Swarm-Anfragen als Bot, bevor irgendeine
  // Auswertung sie als echte Besucher zählt.
  entries.spikeDetection = detectBehavioralBots(entries);

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
    // Zusammenfassung der verhaltensbasierten Spike-Erkennung (falls vorhanden)
    spikeDetection: entries.spikeDetection || { flaggedRequests: 0, flaggedIps: 0, paths: [] },
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

  // 9. Session-Dauer Analyse
  const sessionDurations = [];
  const durationBuckets = { 'bounce': 0, '0-30s': 0, '30s-2m': 0, '2-5m': 0, '5-15m': 0, '15m+': 0 };
  for (const session of sessions) {
    if (session.length === 1) {
      sessionDurations.push(0);
      durationBuckets['bounce']++;
    } else {
      const duration = (session[session.length - 1].date - session[0].date) / 1000; // Sekunden
      sessionDurations.push(duration);
      if (duration <= 30) durationBuckets['0-30s']++;
      else if (duration <= 120) durationBuckets['30s-2m']++;
      else if (duration <= 300) durationBuckets['2-5m']++;
      else if (duration <= 900) durationBuckets['5-15m']++;
      else durationBuckets['15m+']++;
    }
  }
  const avgDuration = sessionDurations.length > 0
    ? Math.round(sessionDurations.reduce((a, b) => a + b, 0) / sessionDurations.length)
    : 0;
  const nonBounceDurations = sessionDurations.filter(d => d > 0);
  const avgActiveDuration = nonBounceDurations.length > 0
    ? Math.round(nonBounceDurations.reduce((a, b) => a + b, 0) / nonBounceDurations.length)
    : 0;
  stats.sessionDuration = {
    avgSeconds: avgDuration,
    avgActiveSeconds: avgActiveDuration,
    avgFormatted: formatDuration(avgDuration),
    avgActiveFormatted: formatDuration(avgActiveDuration),
    buckets: durationBuckets
  };

  // 10. Peak Hours Heatmap (Wochentag × Stunde)
  const heatmap = {};
  for (let d = 0; d < 7; d++) {
    heatmap[d] = {};
    for (let h = 0; h < 24; h++) {
      heatmap[d][h] = 0;
    }
  }
  for (const entry of humanEntries) {
    const zurichDate = new Date(entry.date.toLocaleString('en-US', { timeZone: TIMEZONE }));
    const dow = zurichDate.getDay(); // 0=So
    const hour = zurichDate.getHours();
    heatmap[dow][hour]++;
  }
  stats.peakHoursHeatmap = heatmap;

  // 11. Bandwidth pro Seite (Top 15)
  const pageBandwidth = {};
  for (const entry of entries) {
    if (!entry.isBot && entry.bytes > 0) {
      const cleanPath = entry.path.split('?')[0];
      if (!isExcludedFromTopPages(cleanPath) && cleanPath !== '-') {
        if (!pageBandwidth[cleanPath]) pageBandwidth[cleanPath] = { bytes: 0, requests: 0 };
        pageBandwidth[cleanPath].bytes += entry.bytes;
        pageBandwidth[cleanPath].requests++;
      }
    }
  }
  stats.bandwidthByPage = Object.entries(pageBandwidth)
    .sort((a, b) => b[1].bytes - a[1].bytes)
    .slice(0, 15)
    .map(([path, data]) => ({
      path,
      bytes: data.bytes,
      bytesFormatted: formatBytes(data.bytes),
      requests: data.requests,
      avgBytes: Math.round(data.bytes / data.requests),
      avgBytesFormatted: formatBytes(Math.round(data.bytes / data.requests))
    }));

  // 12. Traffic pro Stunde (Bytes)
  const trafficByHour = {};
  for (let h = 0; h < 24; h++) trafficByHour[h] = { human: 0, bot: 0, total: 0 };
  for (const entry of entries) {
    const hour = getZurichHour(entry.date);
    if (entry.isBot) {
      trafficByHour[hour].bot += entry.bytes;
    } else {
      trafficByHour[hour].human += entry.bytes;
    }
    trafficByHour[hour].total += entry.bytes;
  }
  stats.trafficByHour = trafficByHour;

  // 13. Engagement Score
  const engagementScores = { low: 0, medium: 0, high: 0, veryHigh: 0 };
  for (const session of sessions) {
    const pageCount = session.length;
    const duration = session.length > 1
      ? (session[session.length - 1].date - session[0].date) / 1000
      : 0;
    // Score: Seiten * 2 + Dauer(min) * 3
    const score = pageCount * 2 + (duration / 60) * 3;
    if (score <= 2) engagementScores.low++;
    else if (score <= 8) engagementScores.medium++;
    else if (score <= 20) engagementScores.high++;
    else engagementScores.veryHigh++;
  }
  stats.engagement = {
    scores: engagementScores,
    totalSessions: sessions.length
  };

  // 14. Session-Tiefe (wie viele Seiten pro Session)
  const depthBuckets = { '1': 0, '2': 0, '3-4': 0, '5-9': 0, '10+': 0 };
  for (const session of sessions) {
    const len = session.length;
    if (len === 1) depthBuckets['1']++;
    else if (len === 2) depthBuckets['2']++;
    else if (len <= 4) depthBuckets['3-4']++;
    else if (len <= 9) depthBuckets['5-9']++;
    else depthBuckets['10+']++;
  }
  stats.sessionDepth = depthBuckets;

  // 15. UTM-Parameter Tracking
  const utmSources = {}, utmMediums = {}, utmCampaigns = {}, utmCombinations = {};
  for (const entry of entries) {
    if (entry.isPageView && entry.utmSource) {
      utmSources[entry.utmSource] = (utmSources[entry.utmSource] || 0) + 1;
      if (entry.utmMedium) {
        utmMediums[entry.utmMedium] = (utmMediums[entry.utmMedium] || 0) + 1;
      }
      if (entry.utmCampaign) {
        utmCampaigns[entry.utmCampaign] = (utmCampaigns[entry.utmCampaign] || 0) + 1;
      }
      const comboKey = [entry.utmSource, entry.utmMedium || '-', entry.utmCampaign || '-'].join(' / ');
      utmCombinations[comboKey] = (utmCombinations[comboKey] || 0) + 1;
    }
  }
  const sortEntries = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
  stats.utmStats = {
    totalUtmVisits: Object.values(utmSources).reduce((a, b) => a + b, 0),
    sources: sortEntries(utmSources),
    mediums: sortEntries(utmMediums),
    campaigns: sortEntries(utmCampaigns),
    combinations: Object.entries(utmCombinations)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([combo, count]) => ({ combo, count }))
  };

  // 16. Top Nutzer-Pfade (vollständige Session-Journeys, mind. 2 Seiten)
  const journeys = {};
  for (const session of sessions) {
    if (session.length >= 2) {
      const journey = session.map(e => e.path.split('?')[0]).join(' → ');
      journeys[journey] = (journeys[journey] || 0) + 1;
    }
  }
  stats.topJourneys = Object.entries(journeys)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([journey, count]) => ({ journey, count }));

  return stats;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(seconds) {
  if (seconds === 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
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
      spikeDetection: todayEntries.spikeDetection || { flaggedRequests: 0, flaggedIps: 0, paths: [] },
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
