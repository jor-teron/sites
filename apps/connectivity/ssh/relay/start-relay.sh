#!/bin/sh
# SSH relay for the SSH app (Linux / macOS). Needs Python 3 and: pip install websockify
# Usage: ./start-relay.sh [listen-address] [port]        default: 0.0.0.0 8022
#   Only allow your LAN / VPN to reach this port. Edit allowlist.txt to choose target hosts.
#   For wss:// put cert.pem and key.pem next to this script (see README.md).
cd "$(dirname "$0")" || exit 1
ADDR="${1:-0.0.0.0}"; PORT="${2:-8022}"
command -v websockify >/dev/null 2>&1 && WS="websockify" || WS="python3 -m websockify"
TLS=""
if [ -f cert.pem ] && [ -f key.pem ]; then TLS="--cert=cert.pem --key=key.pem"; echo "TLS on: use wss://<this-pc>:$PORT"; else echo "No cert.pem/key.pem: plain ws://<this-pc>:$PORT (LAN/VPN only)"; fi
export PYTHONPATH="$PWD${PYTHONPATH:+:$PYTHONPATH}"
# shellcheck disable=SC2086
exec $WS $TLS --token-plugin=ssh_allowlist.Allowlist --token-source="$PWD/allowlist.txt" "$ADDR:$PORT"
