#!/usr/bin/env bash
# Starts a throwaway Mattermost, creates the test users/team, installs Matterpoll and Todo,
# and installs the plugin tarball from ../dist. Usage: MM_VERSION=12.0.0 ./scripts/start-server.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if docker compose version >/dev/null 2>&1; then COMPOSE=(docker compose); else COMPOSE=(docker-compose); fi
mmctl() { "${COMPOSE[@]}" exec -T mattermost /mattermost/bin/mmctl --local "$@"; }

echo "Starting Mattermost ${MM_VERSION:-11.7.11}…"
"${COMPOSE[@]}" up -d --wait postgres >/dev/null
"${COMPOSE[@]}" up -d mattermost >/dev/null
for _ in $(seq 1 90); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8067/api/v4/system/ping)" = 200 ]; then break; fi
    sleep 2
done
mmctl version | grep -m1 Version

mmctl user create --email admin@example.com --username admin --password 'Test-Passw0rd!' --system-admin --email-verified >/dev/null 2>&1 || true
mmctl user create --email member@example.com --username member --password 'Test-Passw0rd!' --email-verified >/dev/null 2>&1 || true
mmctl team create --name e2e --display-name "E2E" >/dev/null 2>&1 || true
mmctl team users add e2e admin member >/dev/null 2>&1 || true

CONTAINER=$("${COMPOSE[@]}" ps -q mattermost)
install() { # <tarball> <plugin id>
    docker cp "$1" "$CONTAINER:/mattermost/data/plugin.tar.gz"
    mmctl plugin add --force /mattermost/data/plugin.tar.gz
    mmctl plugin enable "$2"
}

# The plugins Quick Create builds on, at the versions we support.
mkdir -p .cache
fetch() { [ -s ".cache/$(basename "$1")" ] || curl -fsSL -o ".cache/$(basename "$1")" "$1"; echo ".cache/$(basename "$1")"; }
install "$(fetch https://github.com/matterpoll/matterpoll/releases/download/v1.9.0/com.github.matterpoll.matterpoll-1.9.0.tar.gz)" com.github.matterpoll.matterpoll
install "$(fetch https://github.com/mattermost-community/mattermost-plugin-todo/releases/download/v0.7.1/com.mattermost.plugin-todo-0.7.1.tar.gz)" com.mattermost.plugin-todo

TARBALL=$(ls -t ../dist/*.tar.gz | head -1)
install "$TARBALL" dev.patika.quick-create
echo "Ready: http://localhost:8067 (admin / member, password Test-Passw0rd!) with $(basename "$TARBALL")"
