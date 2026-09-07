#!/bin/sh
# Pull-based deploy on the box (DRIFT §7): the box fetches, pulls and rolls; nothing reaches in.
# Run by the systemd timer every few minutes; does nothing unless a newer release appeared.
# main is the trunk and is never deployed on its own: the box runs the newest v-tag reachable
# from origin/main, which is the same commit CI built images for. Tagging is deploying.
# Usage: ops/deploy.sh [--force]
set -eu
cd "$(dirname "$0")/.."
git fetch --quiet --tags --force origin main
release="$(git describe --tags --abbrev=0 --match 'v*' origin/main 2>/dev/null || true)"
if [ -z "$release" ]; then
  echo '{"msg":"no-release"}'
  exit 0
fi
local_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse "${release}^{commit}")"
if [ "$local_sha" = "$remote_sha" ] && [ "${1:-}" != "--force" ]; then
  exit 0
fi
echo "{\"msg\":\"deploy\",\"release\":\"$release\",\"from\":\"$local_sha\",\"to\":\"$remote_sha\"}"
git reset --hard --quiet "$remote_sha"
export BYD_TAG="$release"
profiles=""
[ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ] && profiles="$profiles --profile tunnel"
[ -n "${R2_ACCESS_KEY_ID:-}" ] && profiles="$profiles --profile backup"
# With a registry, CI built the images when the tag was pushed (DRIFT §7): pull them, or wait
# for the next tick if CI is not done. Without one, build on the box. Either way the app drains
# on SIGTERM (§3) and migrates its schema on start, so the order is: have the image, then up.
if [ -n "${BYD_REGISTRY:-}" ]; then
  sha="$(git rev-parse HEAD)"
  # A registry repository name must be lowercase; the owner written in .env need not be. Without
  # this the manifest check below never finds the image and the box stalls on "images-not-ready".
  registry="$(echo "$BYD_REGISTRY" | tr '[:upper:]' '[:lower:]')"
  export BYD_APP_IMAGE="${registry}/app:${sha}"
  export BYD_RENDER_IMAGE="${registry}/render:${sha}"
  export BYD_POSTGRES_IMAGE="${registry}/postgres:${sha}"
  if [ -n "${GHCR_TOKEN:-}" ]; then
    echo "$GHCR_TOKEN" | docker login ghcr.io -u "${GHCR_USER:-token}" --password-stdin > /dev/null
  fi
  if ! docker manifest inspect "$BYD_APP_IMAGE" > /dev/null 2>&1 || ! docker manifest inspect "$BYD_RENDER_IMAGE" > /dev/null 2>&1 || ! docker manifest inspect "$BYD_POSTGRES_IMAGE" > /dev/null 2>&1; then
    echo "{\"msg\":\"images-not-ready\",\"sha\":\"$sha\"}"
    git reset --hard --quiet "$local_sha"
    exit 0
  fi
  docker compose $profiles pull --quiet app render postgres
else
  docker compose $profiles build --quiet
fi
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
