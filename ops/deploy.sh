#!/bin/sh
# Pull-based deploy on the box (DRIFT §7): the box fetches, builds and rolls; nothing reaches in.
# Run by the systemd timer every few minutes; does nothing unless origin/main moved.
# Usage: ops/deploy.sh [--force]
set -eu
cd "$(dirname "$0")/.."
git fetch --quiet origin main
local_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse origin/main)"
if [ "$local_sha" = "$remote_sha" ] && [ "${1:-}" != "--force" ]; then
  exit 0
fi
echo "{\"msg\":\"deploy\",\"from\":\"$local_sha\",\"to\":\"$remote_sha\"}"
git reset --hard --quiet origin/main
export BYD_TAG="$(git rev-parse --short HEAD)"
profiles=""
[ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ] && profiles="$profiles --profile tunnel"
[ -n "${R2_ACCESS_KEY_ID:-}" ] && profiles="$profiles --profile backup"
# Build first so the switch is short; the app drains on SIGTERM (DRIFT §3) and the schema
# migrates on start, so the order is: build, then up.
docker compose $profiles build --quiet
docker compose $profiles up -d --remove-orphans
docker image prune -f --filter "until=168h" > /dev/null
for i in $(seq 1 30); do
  if wget -qO- http://127.0.0.1:8080/health > /dev/null 2>&1; then
    echo "{\"msg\":\"deployed\",\"tag\":\"$BYD_TAG\"}"
    exit 0
  fi
  sleep 2
done
echo '{"msg":"deploy-unhealthy"}'
exit 1
