#!/bin/sh
# Rehearse a restore (DRIFT §5), inside the backup image as the postgres user: the base backup
# and every archived WAL segment after it into an empty directory, Postgres started on it and
# promoted at the end of the archive, then a count and the newest session's whole log as JSON
# for a replay check outside. Prints JSON lines; the last one is the export.
#   restore.sh [backup name]   default LATEST
set -eu
dir=/tmp/restore
rm -rf "$dir" && mkdir -p "$dir" && chmod 700 "$dir"
wal-g backup-fetch "$dir" "${1:-LATEST}" > /tmp/restore-fetch.log 2>&1
touch "$dir/recovery.signal"
cat >> "$dir/postgresql.auto.conf" <<CONF
restore_command = 'wal-g wal-fetch %f %p'
recovery_target_timeline = 'latest'
archive_mode = off
listen_addresses = ''
unix_socket_directories = '/tmp'
port = 5433
CONF
pg_ctl -D "$dir" -l /tmp/restore-postgres.log -w -t 600 start > /dev/null
trap 'pg_ctl -D "$dir" -m fast -w stop > /dev/null' EXIT
q() { psql -h /tmp -p 5433 -U "${PGUSER:-byd}" -d "${PGDATABASE:-byd}" -tAX -c "$1"; }
until [ "$(q 'select pg_is_in_recovery()' 2>/dev/null || echo t)" = "f" ]; do sleep 1; done
echo "{\"msg\":\"restored\",\"backup\":\"${1:-LATEST}\",\"sessions\":$(q 'select count(*) from sessions'),\"events\":$(q 'select count(*) from events')}"
# The designers' AI keys (#999), sealed: what the rehearsal opens them with is not the box's master
# key, which is never in the backup, so every one of them must read as none. A backup from before
# the table has no keys to say.
if [ "$(q "select to_regclass('ai_keys') is not null")" = "t" ]; then
  q "select json_build_object('msg', 'ai-keys', 'keys', coalesce(json_agg(json_build_object(
       'account', account_id::text, 'provider', provider, 'ciphertext', encode(ciphertext, 'base64'), 'nonce', encode(nonce, 'base64'), 'last4', last4)), '[]'::json))
     from ai_keys"
else
  echo '{"msg":"ai-keys","keys":[]}'
fi
# The erasure ledger (#1279, DRIFT §5), one line per entry in the form `erase replay --from` reads:
# what a restore to an earlier point must do again, read from the latest point when the database
# itself cannot be read. Names nobody. A backup from before the table has no ledger to say, and one
# from before #1280 no account column, which is read so that its absence is no error.
if [ "$(q "select to_regclass('erasures') is not null")" = "t" ]; then
  q "select json_strip_nulls(json_build_object('msg', 'erasure', 'id', id, 'at', to_char(at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'),
       'kind', kind, 'reason', reason, 'session', session_id, 'seat', seat, 'project', project_id, 'account', to_jsonb(erasures) ->> 'account_id',
       'issuedAt', to_char(issued_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')))
     from erasures order by at, id"
fi
q "select json_build_object('msg', 'export', 'session', json_build_object(
     'id', s.id, 'version', s.version, 'setup', s.setup,
     'log', coalesce((select json_agg(json_strip_nulls(json_build_object(
        'schemaVersion', e.schema_version, 'seq', e.seq, 'batch', e.batch, 'by', e.by_seat, 'intent', e.intent, 'outcome', e.outcome,
        'at', to_char(e.at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'))) order by e.seq)
      from events e where e.session_id = s.id), '[]'::json)))
   from sessions s order by (select max(at) from events e where e.session_id = s.id) desc nulls last limit 1"
