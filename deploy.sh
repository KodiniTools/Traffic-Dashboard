#!/bin/bash

# Traffic Dashboard - Deployment Script
# ======================================

set -e

# Farben
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Traffic Dashboard - Deployment       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"

# Konfiguration
DEPLOY_DIR="/var/www/traffic-dashboard"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

# 1. Verzeichnis erstellen
echo -e "\n${YELLOW}[1/6]${NC} Verzeichnisse einrichten..."
sudo mkdir -p $DEPLOY_DIR
sudo mkdir -p /var/log/pm2

# 2. Dateien kopieren
echo -e "${YELLOW}[2/6]${NC} Dateien kopieren..."
sudo cp -r $REPO_DIR/backend $DEPLOY_DIR/
sudo cp -r $REPO_DIR/frontend $DEPLOY_DIR/
sudo cp $REPO_DIR/ecosystem.config.cjs $DEPLOY_DIR/

# 3. Backend Dependencies installieren
echo -e "${YELLOW}[3/6]${NC} Backend Dependencies installieren..."
cd $DEPLOY_DIR/backend
sudo npm install --production

# 4. Frontend bauen
echo -e "${YELLOW}[4/6]${NC} Frontend bauen..."
cd $DEPLOY_DIR/frontend
sudo npm install
sudo npm run build

# 5. Berechtigungen setzen
echo -e "${YELLOW}[5/6]${NC} Berechtigungen setzen..."
sudo chown -R $USER:$USER $DEPLOY_DIR

# Der Backend-Server braucht Lesezugriff auf Nginx-Logs
# Option A: User zur adm Gruppe hinzufügen
sudo usermod -aG adm $USER

# Option B: Alternative - Logs lesbarer machen (weniger sicher)
# sudo chmod 644 /var/log/nginx/*.log

# 6. PM2 starten/neustarten
echo -e "${YELLOW}[6/6]${NC} PM2 Service starten..."
cd $DEPLOY_DIR

# Prüfen ob bereits läuft
if pm2 list | grep -q "traffic-dashboard-api"; then
    echo "Restarting existing process..."
    pm2 restart traffic-dashboard-api
else
    echo "Starting new process..."
    pm2 start ecosystem.config.cjs
fi

# PM2 Startup sichern
pm2 save

echo -e "\n${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Deployment erfolgreich!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"

echo -e "\n${BLUE}Nächste Schritte:${NC}"
echo -e "1. API-Key in ${DEPLOY_DIR}/ecosystem.config.cjs ändern"
echo -e "2. PM2 neustarten: ${YELLOW}pm2 restart traffic-dashboard-api${NC}"
echo -e "3. Nginx konfigurieren (siehe nginx.conf)"
echo -e "4. SSL-Zertifikat einrichten:"
echo -e "   ${YELLOW}sudo certbot --nginx -d dashboard.kodinitools.com${NC}"
echo -e "\n${BLUE}Status prüfen:${NC}"
echo -e "   ${YELLOW}pm2 status${NC}"
echo -e "   ${YELLOW}pm2 logs traffic-dashboard-api${NC}"
echo -e "   ${YELLOW}curl http://localhost:3847/health${NC}"
