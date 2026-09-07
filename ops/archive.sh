#!/bin/sh
# archive_command (DRIFT §5): every finished WAL segment goes to R2 within seconds. Without R2
# credentials there is nothing to archive to, and Postgres must not keep WAL forever waiting
# for one: say so once in the log and let the segment go.
set -eu
if [ -z "${AWS_ACCESS_KEY_ID:-}" ]; then
  if [ ! -f /tmp/.wal-archive-off ]; then
    echo '{"msg":"wal-archive","state":"off","reason":"no R2 credentials"}' >&2
    touch /tmp/.wal-archive-off
  fi
  exit 0
fi
exec wal-g wal-push "$1"
