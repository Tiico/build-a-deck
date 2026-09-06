#!/bin/sh
# Rehearse a restore (DRIFT §5): the newest dump from R2 into a throwaway Postgres, then count
# sessions and events. A backup nobody has read back is a hope. Reads .env for credentials.
set -eu
cd "$(dirname "$0")/.."
run="docker compose --profile backup run --rm -T backup /usr/local/bin/backup.sh"
latest="$($run latest)"
echo "restoring $latest"
docker run -d --rm --name byd-restore-test -e POSTGRES_PASSWORD=x -e POSTGRES_USER=byd -e POSTGRES_DB=byd postgres:17-alpine > /dev/null
trap 'docker rm -f byd-restore-test > /dev/null' EXIT
until docker exec byd-restore-test pg_isready -U byd -d byd > /dev/null 2>&1; do sleep 1; done
$run fetch "$latest" | docker exec -i byd-restore-test sh -c 'cat > /tmp/r.dump && pg_restore -U byd -d byd /tmp/r.dump'
docker exec byd-restore-test psql -U byd -d byd -tAc "select count(*) || ' sessions, ' || (select count(*) from events) || ' events' from sessions"
