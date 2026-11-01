#!/usr/bin/env bash
# Launcher. Always run this; it hands off to the newest versions/agent-vN.sh (v3 now).
# Pin a version with AGENT_VERSION=N, e.g.  AGENT_VERSION=1 ./agent.sh exp1 "prompt"
set -u
ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
VDIR="$ROOT/versions"

if [ -n "${AGENT_VERSION:-}" ]; then
  v="${AGENT_VERSION#v}"
  case "$v" in ''|*[!0-9]*) echo "Error: AGENT_VERSION must be a number (got: $AGENT_VERSION)" >&2; exit 1 ;; esac
  target="$VDIR/agent-v$v.sh"
  if [ ! -f "$target" ]; then
    echo "Error: $target not found. Available:" >&2
    ls "$VDIR" 2>/dev/null | sed -n 's/^agent-v\([0-9][0-9]*\)\.sh$/  \1/p' | sort -n >&2
    exit 1
  fi
else
  v="$(ls "$VDIR" 2>/dev/null | sed -n 's/^agent-v\([0-9][0-9]*\)\.sh$/\1/p' | sort -n | tail -n1)"
  [ -n "$v" ] || { echo "Error: no versions/agent-vN.sh found in $VDIR" >&2; exit 1; }
  target="$VDIR/agent-v$v.sh"
fi

export AGENT_CMD="$0"
exec bash "$target" "$@"
