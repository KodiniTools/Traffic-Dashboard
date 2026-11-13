// Tests der Zähl-Logik (Seitenaufrufe / Besucher / Top Seiten).
// server.js startet beim Laden den HTTP-Server und exportiert nichts. Damit
// der Produktivstart (PM2) unverändert bleibt, wird der Quelltext hier ohne
// app.listen(...) als Modul kompiliert. Aufruf: npm test
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const file = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(file, 'utf8').replace(/app\.listen\([\s\S]*$/, '') +
  '\nmodule.exports = { parseLogLine, aggregateStats, detectBehavioralBots, getStartOfDaysAgoZurich, getZurichDateString };';
const mod = new Module(file);
mod.filename = file;
mod.paths = Module._nodeModulePaths(path.dirname(file));
mod._compile(src, file);
const { parseLogLine, aggregateStats, detectBehavioralBots, getStartOfDaysAgoZurich, getZurichDateString } = mod.exports;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const line = (ip, p, status, ua = UA, time = '10:00:00') =>
  `${ip} - - [05/Nov/2026:${time} +0100] "GET ${p} HTTP/1.1" ${status} 100 "-" "${ua}"`;

test('Fehlerseiten (4xx/5xx) zählen nicht als Seitenaufruf/Besucher', () => {
  const entries = [
    line('1.1.1.1', '/gibtsnicht', 404),
    line('1.1.1.2', '/server-status', 403),
    line('1.1.1.3', '/', 500),
    line('1.1.1.4', '/', 200),
    line('1.1.1.5', '/', 304)
  ].map(parseLogLine);
  const stats = aggregateStats(entries);
  assert.strictEqual(stats.humanPageViews, 2);
  assert.strictEqual(stats.uniqueVisitors, 2);
  assert.deepStrictEqual(stats.topPagesDetailed.map(p => p.path), ['/']);
  // ...bleiben aber in der Fehlerseiten-Liste sichtbar
  assert.deepStrictEqual(stats.errorPages, [{ path: '/gibtsnicht', count: 1 }]);
});

test('Cubot-Handys und X-In-App-Browser sind keine Bots, Twitterbot schon', () => {
  const cubot = parseLogLine(line('2.2.2.1', '/', 200,
    'Mozilla/5.0 (Linux; Android 12; CUBOT KingKong 9) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'));
  const xApp = parseLogLine(line('2.2.2.2', '/', 200,
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Twitter for iPhone/10.50'));
  const twitterbot = parseLogLine(line('2.2.2.3', '/', 200, 'Twitterbot/1.0'));
  assert.strictEqual(cubot.isPageView, true);
  assert.strictEqual(xApp.isPageView, true);
  assert.strictEqual(twitterbot.isBot, true);
});

test('Scanner mit Browser-UA bleibt als getarnter Crawler erkannt, auch wenn Probes 404 liefern', () => {
  const entries = ['/a', '/b', '/c', '/d', '/e'].map((p, i) => line('3.3.3.3', p, 404, UA, `10:00:0${i}`));
  entries.push(line('3.3.3.3', '/', 200, UA, '10:00:09'));
  const parsed = entries.map(parseLogLine);
  detectBehavioralBots(parsed);
  assert.ok(parsed.every(e => e.botName === 'cloaked' && !e.isPageView));
});

test('Rollende Zeiträume beginnen um 00:00 Zürich', () => {
  const start = getStartOfDaysAgoZurich(14);
  const zurichTime = start.toLocaleTimeString('de-CH', { timeZone: 'Europe/Zurich', hour12: false });
  assert.strictEqual(zurichTime, '00:00:00');
  const days = Math.round((new Date(getZurichDateString() + 'T00:00:00Z') - new Date(getZurichDateString(start) + 'T00:00:00Z')) / 86400000);
  assert.strictEqual(days, 13); // heute + 13 volle Vortage = 14 Kalendertage
  assert.strictEqual(getZurichDateString(getStartOfDaysAgoZurich(1)), getZurichDateString());
});

test('getZurichDateString (gecachter Formatter) = toLocaleDateString, auch über Zeitumstellung', () => {
  const tz = { timeZone: 'Europe/Zurich' };
  // Um die Zeitumstellungen 2026 (29.03./25.10.) und Mitternacht herum
  for (const iso of ['2026-03-28T22:59:59Z', '2026-03-28T23:00:00Z', '2026-03-29T00:59:59Z', '2026-03-29T01:00:00Z',
    '2026-10-24T21:59:59Z', '2026-10-24T22:00:00Z', '2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z', '2026-12-31T23:00:00Z']) {
    const d = new Date(iso);
    assert.strictEqual(getZurichDateString(d), d.toLocaleDateString('en-CA', tz), iso);
  }
});
