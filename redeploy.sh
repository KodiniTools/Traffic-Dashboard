#!/bin/bash

# Traffic Dashboard - Redeploy Script
# ===================================
# Aktualisiert eine bereits laufende Installation nach einem Merge nach main.
# Holt den neuesten Code, aktualisiert Backend + Frontend und startet PM2 neu.
#
# Voraussetzung: Erstinstallation wurde einmalig mit deploy.sh gemacht und
# dieses Repo liegt im Deploy-Verzeichnis (Standard: /var/www/traffic-dashboard).
#
# Aufruf:  ./redeploy.sh
#          ./redeploy.sh main        # anderer Branch als main
#
# Idempotent: mehrfaches Ausführen schadet nicht.

set -euo pipefail

# Farben
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

# Konfiguration
BRANCH="${1:-main}"
PM2_APP="traffic-dashboard-api"
HEALTH_URL="http://localhost:3847/health"
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$REPO_DIR"

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Traffic Dashboard - Redeploy         ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo -e "Verzeichnis: ${REPO_DIR}"
echo -e "Branch:      ${BRANCH}\n"

# Warnen, wenn uncommittete Änderungen im Deploy-Klon liegen
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo -e "${RED}⚠  Es gibt lokale, uncommittete Änderungen in diesem Verzeichnis.${NC}"
    echo -e "${RED}   git pull könnte fehlschlagen. Bitte erst aufräumen (git stash / git checkout .).${NC}"
    exit 1
fi

# 1. Neuesten Code holen
echo -e "${YELLOW}[1/5]${NC} Code holen (git pull origin ${BRANCH})..."
git checkout "$BRANCH"
git pull origin "$BRANCH"

# Merken, ob sich Abhängigkeiten geändert haben (rein informativ – npm ci ist idempotent)
echo -e "\n${YELLOW}[2/5]${NC} Backend-Abhängigkeiten aktualisieren..."
cd "$REPO_DIR/backend"
npm ci --omit=dev

# 3. Frontend bauen (IMMER – nur so werden .vue-Änderungen sichtbar)
echo -e "\n${YELLOW}[3/5]${NC} Frontend bauen (npm ci && npm run build)..."
cd "$REPO_DIR/frontend"
npm ci
npm run build

# 4. Backend neu starten
echo -e "\n${YELLOW}[4/5]${NC} Backend neu starten (pm2 restart ${PM2_APP})..."
pm2 restart "$PM2_APP" --update-env
pm2 save

# 5. Health-Check
echo -e "\n${YELLOW}[5/5]${NC} Health-Check..."
sleep 1
if curl -fsS "$HEALTH_URL" > /dev/null; then
    echo -e "${GREEN}✓ Backend antwortet auf ${HEALTH_URL}${NC}"
else
    echo -e "${RED}✗ Health-Check fehlgeschlagen. Logs prüfen:${NC}"
    echo -e "  ${YELLOW}pm2 logs ${PM2_APP} --lines 30${NC}"
    exit 1
fi

echo -e "\n${GREEN}════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Redeploy erfolgreich!${NC}"
echo -e "${GREEN}════════════════════════════════════════${NC}"
echo -e "\nIm Browser einmal hart neu laden: ${YELLOW}Strg/Cmd + Shift + R${NC}"
