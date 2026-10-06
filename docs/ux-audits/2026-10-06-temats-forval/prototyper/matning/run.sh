#!/bin/sh
# Hela mätningen i en körning: stacken upp, passen, stacken ner.
#   sh run.sh <logg> [pass ...]
cd "$(dirname "$0")"
LOG=${1:-run.log}; shift
PASSES=${*:-open loading resume keyboard box steps}
rm -f links.json
./node_modules/.bin/tsx rig.mts links.json > "$LOG.rig" 2>&1 &
RIG=$!
until [ -f links.json ] || ! kill -0 $RIG 2>/dev/null; do sleep 1; done
[ -f links.json ] || { echo "RIG FAILED"; cat "$LOG.rig"; exit 1; }
for p in $PASSES; do echo "=== $p"; node shoot.mjs "$p" 2>&1 | grep -v '^\s*at '; done
kill -TERM $RIG; wait $RIG
echo DONE
