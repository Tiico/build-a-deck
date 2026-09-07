#!/bin/sh
# Base backups to R2 with WAL-G (DRIFT §5); the WAL between them is archived by Postgres itself.
#   backup.sh once      a base backup now, then keep the last BACKUP_KEEP full backups (default 7)
#   backup.sh loop      a base backup every day at BACKUP_HOUR (UTC)
#   backup.sh list      the base backups in the bucket
# Runs in the backup container over the data volume, connected to Postgres for the backup
# start and stop; WALG_S3_PREFIX and the AWS_* variables say where.
set -eu
once() {
  wal-g backup-push "${PGDATA:-/var/lib/postgresql/data}"
  wal-g delete retain FULL "${BACKUP_KEEP:-7}" --confirm
  echo "{\"msg\":\"backup\",\"kept\":${BACKUP_KEEP:-7}}"
}
case "${1:-once}" in
  once) once ;;
  list) wal-g backup-list ;;
  loop)
    while true; do
      if [ "$(date -u +%H)" = "${BACKUP_HOUR:-03}" ]; then
        once || echo '{"msg":"backup-failed"}'
        sleep 3600
      fi
      sleep 300
    done
    ;;
  *) echo "usage: backup.sh once|loop|list" >&2; exit 2 ;;
esac
