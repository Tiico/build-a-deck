#!/usr/bin/env bash
# The other machine, on this one (#94, #95).
#
# The felt's names were measured against whatever the machine calls `system-ui`, and a Mac calls
# it SF Pro while a Linux box calls it DejaVu Sans — which draws K19's names 12-14 % wider. That
# is the whole of the eight failures CI reported, and it is why "green on my machine" was not an
# answer. Since #95 the felt ships its own face, so the suite should no longer care; this is what
# says so rather than anyone's word for it.
#
#   packages/web/test/dejavu.sh                      # the felt's own gate
#   packages/web/test/dejavu.sh test/felt-font.test.ts   # any other suite, same machine
#
# `mcr.microsoft.com/playwright:v1.63.0-noble` on its own goes green even with the bug present —
# it falls back to WenQuanYi Zen Hei — so `fonts-dejavu-core` is the part that matters, and
# `fc-match` prints what the container actually resolved so a green run cannot be a quiet one.
#
# The repo is copied rather than mounted: `pnpm install` inside the container would otherwise
# write linux binaries over this machine's own node_modules.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
WORK="${BYD_DEJAVU_WORK:-/tmp/byd-dejavu}"
IMAGE=mcr.microsoft.com/playwright:v1.63.0-noble
SUITE="${1:-test/felt-names.test.tsx}"

rsync -a --delete --exclude node_modules --exclude .git --exclude dist "$REPO/" "$WORK/"

docker run --rm -t -v "$WORK:/work" -w /work -e CI=1 -e HOME=/tmp "$IMAGE" bash -lc "
  set -e
  apt-get update -qq >/dev/null && apt-get install -y -qq fonts-dejavu-core >/dev/null
  fc-match sans-serif
  npm i -g pnpm@11.24.0 >/dev/null 2>&1
  pnpm install --no-frozen-lockfile
  cd packages/web && pnpm exec vitest run $SUITE
"
