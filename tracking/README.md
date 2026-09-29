# Heartbeat – echte Verweildauer in den Tools messen

Aus dem Nginx-Log sieht das Dashboard nur, **wann eine Seite geladen wurde**.
Wer ein Tool öffnet und 20 Minuten darin arbeitet, erscheint als „1 Seite, 0 s“.
`heartbeat.js` meldet sich in aktiven Tabs alle 30 s kurz beim Server. Das
Dashboard verlängert damit die Session bis zum letzten Lebenszeichen.

- Keine Cookies, kein Local Storage, keine IDs, keine personenbezogenen Zusatzdaten.
- Sendet nur, wenn der Tab sichtbar ist **und** der Nutzer in den letzten 2 Min.
  aktiv war – oder wenn Audio/Video läuft (Musikplayer im Hintergrund).
- Nach 4 h ohne Seitenwechsel stoppt es (vergessene Tabs).
- Heartbeats zählen **nicht** als Seitenaufruf, Request oder Besucher. Sie
  verlängern nur bestehende Sessions; sie eröffnen nie eine neue.
- Solange kein Tool das Skript einbindet, ändert sich im Dashboard nichts.

## Schritt 1 – Nginx (einmalig, Server-Block von kodinitools.com)

In die Nginx-Konfiguration **der Website** (nicht die des Dashboards), z. B.
`/etc/nginx/sites-available/kodinitools.com`, innerhalb von `server { ... }`:

```nginx
# Heartbeat-Endpunkt: leere Antwort, landet im normalen Access-Log
location = /__kt_hb {
    add_header Cache-Control "no-store" always;
    return 204;
}

# Heartbeat-Skript direkt aus dem Dashboard-Repo ausliefern
location = /kt-heartbeat.js {
    alias /var/www/traffic-dashboard/tracking/heartbeat.js;
    default_type application/javascript;
    add_header Cache-Control "public, max-age=3600";
}
```

Prüfen und neu laden:

```bash
sudo nginx -t && sudo systemctl reload nginx
curl -sI https://kodinitools.com/__kt_hb        # erwartet: HTTP/2 204
curl -sI https://kodinitools.com/kt-heartbeat.js # erwartet: HTTP/2 200
```

> Wichtig: Der Server-Block muss in dasselbe Access-Log schreiben, das das
> Dashboard liest (`/var/log/nginx/kodinitools.com.access.log`). Das ist der Fall,
> solange in den beiden `location`-Blöcken kein eigenes `access_log` steht.

## Schritt 2 – In ein Tool einbauen

Im HTML des Tools vor `</body>` (bzw. in `index.html` bei Vite/Vue-Tools):

```html
<script src="/kt-heartbeat.js" defer></script>
```

Optional mit anderen Werten (Sekunden):

```html
<script src="/kt-heartbeat.js" data-interval="30" data-idle="120" defer></script>
```

Einmal pro Seite reicht; doppeltes Einbinden wird erkannt und ignoriert.

## Schritt 3 – Kontrolle

1. Tool im Browser öffnen, 1–2 Minuten benutzen.
2. Auf dem Server: `grep __kt_hb /var/log/nginx/kodinitools.com.access.log | tail`
3. Im Dashboard unter „Längste Sessions des Tages“: Sessions mit Heartbeat
   tragen das grüne Badge **live**.

## Updates

Das Skript wird direkt aus `/var/www/traffic-dashboard/tracking/` ausgeliefert.
Ein `./redeploy.sh` aktualisiert es also automatisch für alle Tools.

## Abdeckung prüfen: Welche echten Besucher zählt das Dashboard nicht?

Ein Heartbeat beweist einen echten Menschen (JavaScript läuft, Nutzer aktiv).
`scripts/check-coverage.js` listet alle IPs mit Heartbeat, die im Dashboard
**nicht** als Besucher zählen – mit Grund (Spike-Filter, Cloaked-Filter,
Bot-User-Agent, Seite aus Browser-Cache, nur Weiterleitungen). Es nutzt die
laufende Dashboard-API, also exakt dieselbe Erkennung wie das Dashboard.
Eigene IPs (`EXCLUDED_IPS`) sind nie enthalten.

```bash
cd /var/www/traffic-dashboard
node scripts/check-coverage.js               # heute
node scripts/check-coverage.js 2026-09-28    # bestimmter Tag (max. 30 Tage zurück)
node scripts/check-coverage.js --json        # Rohdaten
```

Täglich automatisch um 23:55 (Ergebnis in eine Logdatei):

```bash
( crontab -l 2>/dev/null; echo '55 23 * * * cd /var/www/traffic-dashboard && node scripts/check-coverage.js >> /var/log/traffic-coverage.log 2>&1' ) | crontab -
```

`--warn=5` beendet das Skript mit Exit-Code 2, wenn mehr als 5 % der echten
Besucher verpasst wurden – nützlich für eigene Alarm-Skripte.
