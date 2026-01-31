# Traffic Dashboard für KodiniTools

Ein modernes Echtzeit-Traffic-Dashboard für deinen VPS, das Nginx-Logs direkt analysiert.

## Features

- 📊 **Übersichtliche Statistiken**: Besucher, Requests, Traffic, Bots
- 📈 **Interaktive Charts**: Traffic-Verlauf über Zeit
- 🤖 **Bot-Erkennung**: Automatische Identifikation von Googlebot, Bingbot, etc.
- 🔗 **Referrer-Tracking**: Woher kommen deine Besucher?
- 📄 **Top-Seiten**: Welche Seiten werden am meisten besucht?
- ⚡ **Live-Feed**: Echtzeit-Anzeige der letzten Requests
- 🔒 **API-Key Auth**: Einfache Authentifizierung

## Architektur

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Vue 3 SPA     │◄──►│  Express API    │◄──►│  Nginx Logs     │
│   (Frontend)    │    │  (Backend)      │    │  (Datenquelle)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
      :5173                  :3847            /var/log/nginx/
```

## Installation

### Voraussetzungen

- Node.js 18+
- PM2 (`npm install -g pm2`)
- Nginx mit Log-Dateien
- Lesezugriff auf `/var/log/nginx/`

### Quick Start

```bash
# 1. Repository klonen/kopieren
cd /var/www
git clone <repo> traffic-dashboard
# oder: Dateien manuell kopieren

# 2. API-Key setzen (WICHTIG!)
nano ecosystem.config.cjs
# Ändere DASHBOARD_API_KEY auf einen sicheren Wert

# 3. Deployment ausführen
chmod +x deploy.sh
./deploy.sh
```

### Manuelle Installation

```bash
# Backend
cd backend
npm install

# Frontend
cd frontend
npm install
npm run build

# PM2 starten
pm2 start ecosystem.config.cjs
pm2 save
```

## Konfiguration

### API-Key ändern

In `ecosystem.config.cjs`:

```javascript
env: {
  DASHBOARD_API_KEY: 'dein-super-sicherer-key-mindestens-32-zeichen'
}
```

Nach Änderung: `pm2 restart traffic-dashboard-api`

### Log-Pfad anpassen

In `backend/server.js`:

```javascript
const CONFIG = {
  logPath: '/var/log/nginx/deine-domain.access.log',
  apiKey: process.env.DASHBOARD_API_KEY
};
```

### Nginx konfigurieren

**Option A: Eigene Subdomain**

```bash
sudo cp nginx.conf /etc/nginx/sites-available/traffic-dashboard
sudo ln -s /etc/nginx/sites-available/traffic-dashboard /etc/nginx/sites-enabled/
sudo certbot --nginx -d dashboard.kodinitools.com
sudo nginx -t && sudo systemctl reload nginx
```

**Option B: Als Unterverzeichnis**

Füge zu deiner bestehenden Nginx-Config hinzu:

```nginx
location /dashboard {
    alias /var/www/traffic-dashboard/frontend/dist;
    try_files $uri $uri/ /dashboard/index.html;
}

location /dashboard/api {
    rewrite ^/dashboard/api(.*) /api$1 break;
    proxy_pass http://127.0.0.1:3847;
}
```

## Berechtigungen

Der Backend-Server braucht Lesezugriff auf Nginx-Logs:

```bash
# Option 1: User zur adm-Gruppe hinzufügen (empfohlen)
sudo usermod -aG adm $USER
# Danach neu einloggen!

# Option 2: Logs explizit lesbar machen
sudo chmod 644 /var/log/nginx/*.log
```

## API Endpunkte

| Endpunkt | Beschreibung |
|----------|--------------|
| `GET /api/stats/today` | Heutige Statistiken |
| `GET /api/stats/week` | Letzte 7 Tage |
| `GET /api/stats/twoweeks` | Letzte 14 Tage |
| `GET /api/stats/month` | Letzte 30 Tage |
| `GET /api/stats/live` | Letzte Stunde + Recent Requests |
| `GET /health` | Health Check (keine Auth) |

Alle `/api/*` Endpunkte brauchen Header: `X-API-Key: dein-key`

## Troubleshooting

### Logs prüfen

```bash
pm2 logs traffic-dashboard-api
pm2 logs traffic-dashboard-api --lines 100
```

### API testen

```bash
# Health Check (ohne Auth)
curl http://localhost:3847/health

# Mit Auth
curl -H "X-API-Key: dein-key" http://localhost:3847/api/stats/today
```

### Häufige Probleme

**"ENOENT: no such file or directory"**
→ Log-Pfad in server.js prüfen

**"Permission denied"**
→ Berechtigungen für Nginx-Logs prüfen

**"Unauthorized"**
→ API-Key im Frontend und ecosystem.config.cjs abgleichen

## Entwicklung

```bash
# Backend (in eigenem Terminal)
cd backend
node server.js

# Frontend (in eigenem Terminal)
cd frontend
npm run dev
```

Frontend läuft auf http://localhost:5173 mit Proxy zu Backend.

## Sicherheit

- ⚠️ **API-Key niemals im Code committen**
- ⚠️ **HTTPS verwenden** (Let's Encrypt)
- ⚠️ **Dashboard nicht öffentlich zugänglich machen**
- IPs werden im Live-Feed teilweise anonymisiert (xxx)

## Lizenz

MIT
