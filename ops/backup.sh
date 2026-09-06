#!/bin/sh
# Backups to R2 (DRIFT §5, first step): pg_dump, upload under the date, prune after 30 days.
#   backup.sh once          one backup now
#   backup.sh loop          a backup every day at BACKUP_HOUR (UTC)
#   backup.sh latest        the name of the newest dump in the bucket
#   backup.sh fetch NAME    the dump to stdout
set -eu
conf() {
  mkdir -p "$HOME/.config/rclone"
  cat > "$HOME/.config/rclone/rclone.conf" <<CONF
[r2]
type = s3
provider = Cloudflare
access_key_id = ${R2_ACCESS_KEY_ID}
secret_access_key = ${R2_SECRET_ACCESS_KEY}
endpoint = https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com
acl = private
CONF
}
once() {
  conf
  stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
  file="/tmp/byd-${stamp}.dump"
  pg_dump --format=custom --file="$file" "$PGDATABASE"
  rclone copyto "$file" "r2:${R2_BUCKET}/pg/byd-${stamp}.dump"
  rclone delete --min-age 30d "r2:${R2_BUCKET}/pg/"
  rm -f "$file"
  echo "{\"msg\":\"backup\",\"file\":\"byd-${stamp}.dump\"}"
}
case "${1:-once}" in
  once) once ;;
  latest) conf; rclone lsf "r2:${R2_BUCKET}/pg/" | sort | tail -1 ;;
  fetch) conf; rclone cat "r2:${R2_BUCKET}/pg/$2" ;;
  loop)
    while true; do
      if [ "$(date -u +%H)" = "${BACKUP_HOUR:-03}" ]; then
        once || echo '{"msg":"backup-failed"}'
        sleep 3600
      fi
      sleep 300
    done
    ;;
esac
