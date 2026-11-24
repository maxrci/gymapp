#!/usr/bin/env bash
# Gym-Server auf einem Raspberry Pi (oder jedem Linux-Rechner) mit Ubuntu 24.04 einrichten.
# Aufruf im Projektordner:   bash deploy/pi-setup.sh
# Was passiert:
#   1. Node.js 24 installieren (Ubuntu bringt nur Node 18 mit, der Server braucht mind. 22.13)
#   2. Einstellungen in /etc/gym.env anlegen (Gruppenname, Server-Adresse)
#   3. systemd-Dienst „gym“ einrichten – startet automatisch beim Booten und nach Abstürzen
# Die Daten liegen im Ordner data/ des Projekts (SQLite-Datei, wenige MB).
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_USER="${SUDO_USER:-$USER}"
ENV_FILE=/etc/gym.env

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }

node_ok() {
  command -v node >/dev/null 2>&1 && node -e '
    const [a, b] = process.versions.node.split(".").map(Number);
    process.exit(a > 22 || (a === 22 && b >= 13) ? 0 : 1);'
}

say "1/3 Node.js prüfen"
if node_ok; then
  echo "Node.js $(node -v) ist schon installiert."
else
  echo "Installiere Node.js 24 (NodeSource) …"
  sudo apt-get update -y
  sudo apt-get install -y ca-certificates curl gnupg
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
  node_ok || { echo "Node.js-Installation fehlgeschlagen."; exit 1; }
  echo "Node.js $(node -v) installiert."
fi

say "2/3 Einstellungen ($ENV_FILE)"
if [ ! -f "$ENV_FILE" ]; then
  read -r -p "Name eurer Gruppe [Gym-Crew]: " GROUP_NAME || true
  GROUP_NAME="${GROUP_NAME:-Gym-Crew}"
  sudo tee "$ENV_FILE" >/dev/null <<EOF
# Einstellungen für den Gym-Server (nach Änderungen: sudo systemctl restart gym)
GROUP_NAME=$GROUP_NAME
PORT=8080
# Nur lokal lauschen – erreichbar wird der Server über Tailscale Funnel, Caddy oder Cloudflare Tunnel
HOST=127.0.0.1
# Öffentliche HTTPS-Adresse des Servers (nach dem Online-Stellen eintragen), z. B. https://pi.tail1234.ts.net
PUBLIC_URL=
# Die App kommt vom Server selbst und ist privat (nur nach Anmeldung). APP_PUBLIC=1 würde das abschalten.
# Von welchen Adressen die App die API aufrufen darf (* = alle; Anmeldung läuft über Token, nicht über Cookies)
ALLOWED_ORIGINS=*
EOF
  echo "Angelegt. Ändern mit: sudo nano $ENV_FILE"
else
  echo "Vorhanden – bleibt unverändert."
fi

say "3/3 Dienst einrichten"
sudo tee /etc/systemd/system/gym.service >/dev/null <<EOF
[Unit]
Description=Gym-Server (Workouts, Arena, Challenges)
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=0

[Service]
User=$RUN_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$(command -v node) server/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now gym
sudo systemctl restart gym
sleep 2

PORT_NOW="$(grep -E '^PORT=' "$ENV_FILE" | cut -d= -f2)"
if curl -fsS "http://127.0.0.1:${PORT_NOW:-8080}/api/info" >/dev/null; then
  echo "Server läuft: http://127.0.0.1:${PORT_NOW:-8080}"
else
  echo "Server antwortet nicht. Logs ansehen: journalctl -u gym -n 50"
  exit 1
fi

cat <<EOF

Fertig! Nächste Schritte:
  1. Online stellen, z. B. mit Tailscale Funnel:
       curl -fsSL https://tailscale.com/install.sh | sh
       sudo tailscale up
       sudo tailscale funnel --bg ${PORT_NOW:-8080}
     Die angezeigte https://…ts.net-Adresse als PUBLIC_URL in $ENV_FILE eintragen
     und: sudo systemctl restart gym
  2. Dich als Admin anlegen:
       bash deploy/cli.sh admin "Dein Name" deinname
  3. App öffnen (deine https://…ts.net-Adresse) → mit deinem Konto anmelden
     → „Gruppe verwalten“ → Freunde anlegen und Zugangsdaten verschicken.
EOF
