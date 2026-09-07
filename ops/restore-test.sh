#!/bin/sh
# Rehearse a restore (DRIFT §5): the latest base backup and its WAL from R2 into a throwaway
# Postgres in the backup image, then the newest session's log replayed through the engine in
# the app image. A backup nobody has read back is a hope; a log that does not replay is not a
# backup. Reads .env for R2 through compose. Usage: ops/restore-test.sh [backup name]
set -eu
cd "$(dirname "$0")/.."
out="$(mktemp)"
trap 'rm -f "$out"' EXIT
docker compose --profile backup run --rm --no-deps -T --user postgres backup /usr/local/bin/restore.sh "${1:-LATEST}" > "$out"
grep '"msg":"restored"' "$out"
grep '"msg":"export"' "$out" | docker compose run --rm --no-deps -T app node packages/server/node_modules/tsx/dist/cli.mjs packages/engine/scripts/replay-check.ts
