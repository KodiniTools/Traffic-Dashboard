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
