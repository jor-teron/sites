#!/usr/bin/env bash
# RL1: local files only. No download, services or router changes.
set -euo pipefail
DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
command -v node >/dev/null 2>&1 || { echo "Install Node.js 18 or newer first." >&2; exit 1; }
node -e 'if (Number(process.versions.node.split(".")[0]) < 18) process.exit(1)' || { echo "Node.js 18 or newer is required." >&2; exit 1; }
HAS_CONFIG=0
for ARG in "$@"; do if [ "$ARG" = "--config" ]; then HAS_CONFIG=1; fi; done
if [ "$HAS_CONFIG" -eq 0 ] && [ -z "${HUB_RELAY_CONFIG:-}" ] && [ -f "$DIR/relay.json" ]; then
  exec node "$DIR/hub-relay.js" --config "$DIR/relay.json" "$@"
fi
exec node "$DIR/hub-relay.js" "$@"
