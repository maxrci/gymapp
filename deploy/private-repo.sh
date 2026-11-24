#!/usr/bin/env bash
# Pi auf ein privates GitHub-Repo umstellen: eigener Lese-Schlüssel (Deploy Key) nur für dieses Repo.
# Aufruf auf dem Pi:  bash deploy/private-repo.sh
set -euo pipefail
KEY="$HOME/.ssh/gymapp_deploy"
REPO="${1:-$(git -C "$(dirname "$0")/.." remote get-url origin | sed -E 's#(https://github.com/|git@github.com:)##; s#\.git$##')}"
mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
if [ ! -f "$KEY" ]; then ssh-keygen -t ed25519 -N '' -C "gym-pi-deploy" -f "$KEY" >/dev/null; fi
if ! grep -q "Host github-gymapp" "$HOME/.ssh/config" 2>/dev/null; then
  cat >> "$HOME/.ssh/config" <<CFG
Host github-gymapp
  HostName github.com
  User git
  IdentityFile $KEY
  IdentitiesOnly yes
CFG
  chmod 600 "$HOME/.ssh/config"
fi
ssh-keyscan -t ed25519 github.com >> "$HOME/.ssh/known_hosts" 2>/dev/null
git -C "$(dirname "$0")/.." remote set-url origin "git@github-gymapp:${REPO}.git"
echo
echo "1) Diesen Schlüssel auf GitHub eintragen: Repo → Settings → Deploy keys → Add deploy key"
echo "   Titel: Gym Pi   ·   „Allow write access“ NICHT anhaken"
echo
cat "$KEY.pub"
echo
echo "2) Danach testen:  git -C $(cd "$(dirname "$0")/.." && pwd) fetch && echo OK"
