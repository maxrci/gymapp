#!/usr/bin/env bash
# Verwaltung auf dem Server mit den Einstellungen aus /etc/gym.env, z. B.:
#   bash deploy/cli.sh admin "Max" max
#   bash deploy/cli.sh add "Lisa" lisa
#   bash deploy/cli.sh passwd lisa
#   bash deploy/cli.sh users
#   bash deploy/cli.sh countfrom max 2026-11-19   (EP zählen erst ab diesem Tag)
#   bash deploy/cli.sh backup ~/gym-backup.db
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
if [ -r /etc/gym.env ]; then set -a; . /etc/gym.env; set +a; fi
exec node server/cli.js "$@"
