#!/bin/sh
# Put the deploy timer in front of this checkout, wherever the checkout happens to be (DRIFT §7).
# The unit carries %DIR% rather than a directory, because a path written into the repository is a
# path someone has to edit by hand the day the box keeps its stacks somewhere else — and from then
# on the repository says one thing and the box does another.
#   sudo ops/install.sh          install the units and start the timer
#   sudo ops/install.sh --units  install them and leave the timer alone, for a box with no .env yet
set -eu
dir="$(cd "$(dirname "$0")/.." && pwd)"
for unit in byd-deploy.service byd-deploy.timer; do
  sed "s#%DIR%#${dir}#g" "$dir/ops/$unit" > "/etc/systemd/system/$unit"
done
systemctl daemon-reload
echo "{\"msg\":\"installed\",\"dir\":\"$dir\"}"
if [ "${1:-}" = "--units" ]; then
  echo '{"msg":"timer-left-alone"}'
  exit 0
fi
systemctl enable --now byd-deploy.timer
echo '{"msg":"timer-on","every":"5min"}'
