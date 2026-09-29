#!/usr/bin/env node
/*
 * Abdeckungs-Check: Wie viele echte Besucher zählt das Dashboard NICHT?
 *
 * Nutzt Heartbeats als Beleg für echte Menschen und fragt die laufende
 * Dashboard-API (/api/stats/coverage) ab – dadurch gilt exakt dieselbe
 * Bot-/Spike-Erkennung wie im Dashboard.
 *
 * Aufruf (auf dem Server, im Repo-Verzeichnis):
 *   node scripts/check-coverage.js               # heute
 *   node scripts/check-coverage.js 2026-09-28    # bestimmter Tag (max. 30 Tage zurück)
 *   node scripts/check-coverage.js --warn=5      # Exit-Code 2, wenn > 5 % verpasst (für Cron)
 *   node scripts/check-coverage.js --json        # Rohdaten
 *
 * API-Key: aus $DASHBOARD_API_KEY, sonst aus ecosystem.config.cjs.
 * Benötigt Node 18+ (globales fetch).
 */
'use strict';

const path = require('path');
const { execFileSync } = require('child_process');

const PM2_APP = 'traffic-dashboard-api';

// Umgebung des LAUFENDEN Dashboard-Prozesses aus PM2 lesen – dort steht der
// tatsächlich verwendete API-Key (kann von ecosystem.config.cjs abweichen).
function readPm2Env() {
  try {
    const out = execFileSync('pm2', ['jlist'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 });
    const proc = JSON.parse(out).find(p => p.name === PM2_APP);
    if (!proc || !proc.pm2_env) return {};
    return { ...(proc.pm2_env.env || {}), ...proc.pm2_env };
  } catch {
    return {}; // pm2 nicht im PATH (z. B. Cron) oder nicht installiert
  }
}

function readEcosystemEnv() {
  try {
    const eco = require(path.join(__dirname, '..', 'ecosystem.config.cjs'));
    return (eco.apps && eco.apps[0] && eco.apps[0].env) || {};
  } catch {
    return {};
  }
}

// Reihenfolge: $DASHBOARD_API_KEY > laufender PM2-Prozess > ecosystem.config.cjs
function loadConfig() {
  const pm2 = readPm2Env();
  const eco = readEcosystemEnv();
  const pick = key => process.env[key] || pm2[key] || eco[key];
  const source = process.env.DASHBOARD_API_KEY ? 'Umgebungsvariable'
    : pm2.DASHBOARD_API_KEY ? 'PM2-Prozess'
    : eco.DASHBOARD_API_KEY ? 'ecosystem.config.cjs' : null;
  return { apiKey: pick('DASHBOARD_API_KEY'), port: pick('PORT') || 3847, source };
}

function parseArgs(argv) {
  const args = { date: null, json: false, warn: null };
  for (const a of argv) {
    if (a === '--json') args.json = true;
    else if (a.startsWith('--warn=')) args.warn = Number(a.slice(7));
    else if (/^\d{4}-\d{2}-\d{2}$/.test(a)) args.date = a;
    else {
      console.error(`Unbekanntes Argument: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

const REASONS = {
  'spike': 'als Spike/Bot-Welle gefiltert',
  'cloaked': 'als getarnter Crawler gefiltert (viele Seiten, keine Assets)',
  'kein-request': 'kein Seitenaufruf im Log (Seite aus Browser-Cache oder vor Mitternacht geladen)',
  'kein-seitenaufruf': 'nur Weiterleitungen/Assets/Fehlerseiten, kein gezählter Seitenaufruf'
};

function describeReason(reason) {
  if (REASONS[reason]) return REASONS[reason];
  if (reason.startsWith('bot:')) return `User-Agent als Bot erkannt (${reason.slice(4)})`;
  return reason;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { apiKey, port, source } = loadConfig();
  if (!apiKey) {
    console.error('Kein API-Key gefunden (DASHBOARD_API_KEY oder ecosystem.config.cjs).');
    process.exit(1);
  }

  const query = args.date ? `?date=${args.date}` : '';
  const url = `http://127.0.0.1:${port}/api/stats/coverage${query}`;
  let res;
  try {
    res = await fetch(url, { headers: { 'X-API-Key': apiKey }, signal: AbortSignal.timeout(60000) });
  } catch (err) {
    console.error(`Dashboard-API nicht erreichbar (${url}): ${err.message}`);
    console.error('Läuft der Dienst? -> pm2 status traffic-dashboard-api');
    process.exit(1);
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    console.error(`Fehler 401: API-Key abgelehnt (Key-Quelle: ${source}).`);
    console.error('Den Key mitgeben, mit dem du dich im Dashboard anmeldest:');
    console.error("  DASHBOARD_API_KEY='DEIN-KEY' node scripts/check-coverage.js");
    process.exit(1);
  }
  if (!res.ok) {
    console.error(`Fehler ${res.status}: ${data.error || 'unbekannt'}`);
    process.exit(1);
  }

  if (args.json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    const c = data.counted;
    const m = data.missed;
    const pct = (n, total) => (total > 0 ? `${Math.round((n / total) * 100)} %` : '-');
    console.log(`Abdeckungs-Check ${data.date}${data.isToday ? ' (heute, bis jetzt)' : ''}`);
    console.log('='.repeat(50));
    if (!data.heartbeatActive) {
      console.log('Keine Heartbeats an diesem Tag – Check nicht aussagekräftig.');
    }
    console.log(`Gezählte Besucher (IPs):          ${c.visitors}`);
    console.log(`  davon mit Heartbeat:            ${c.withHeartbeat} (${pct(c.withHeartbeat, c.visitors)})`);
    console.log(`  davon ohne Heartbeat:           ${c.withoutHeartbeat} (${pct(c.withoutHeartbeat, c.visitors)})`);
    console.log(`Besucher mit Heartbeat gesamt:    ${data.heartbeatVisitors}`);
    console.log(`NICHT gezählte echte Besucher:    ${m.total} (${m.percent} %)`);
    for (const [reason, n] of Object.entries(m.byReason)) {
      console.log(`  ${String(n).padStart(4)} × ${describeReason(reason)}`);
    }
    if (m.ips.length > 0) {
      console.log('\nDetails (max. 25):');
      for (const ip of m.ips) {
        const paths = ip.samplePaths.length ? ip.samplePaths.join(', ') : '-';
        console.log(`  ${ip.ip.padEnd(24)} ${String(ip.heartbeats).padStart(4)} HB  ${String(ip.requests).padStart(4)} Req  ${ip.reason.padEnd(18)} ${paths}`);
      }
    }
    console.log('\n"Ohne Heartbeat" = Blocker, JavaScript aus, Tab sofort geschlossen – oder Bots mit Browser-Kennung.');
  }

  if (args.warn !== null && Number.isFinite(args.warn) && data.missed.percent > args.warn) {
    process.exit(2);
  }
}

main();
