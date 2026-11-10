#!/usr/bin/env bash
# RL1: curl -fsSL https://raw.githubusercontent.com/jor-teron/sites/main/hub/relay/install.sh | bash
# Parse this compound command in full before making any changes.
(
set -euo pipefail
umask 077
BASE='https://raw.githubusercontent.com/jor-teron/sites/main/hub/relay'
DIR="${HUB_RELAY_DIR:-$HOME/.local/share/sites-hub-relay}"
command -v node >/dev/null 2>&1 || { echo "Install Node.js 18 or newer from https://nodejs.org/ first." >&2; exit 1; }
node -e 'if (Number(process.versions.node.split(".")[0]) < 18) process.exit(1)' || { echo "Node.js 18 or newer is required." >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "curl is required." >&2; exit 1; }
TMP="$(mktemp -d "${TMPDIR:-/tmp}/sites-hub-relay.XXXXXX")"
trap 'rm -rf -- "$TMP"' EXIT
FILES=(hub-relay.js relay_config.js relay_core.js relay_security.js relay_ws.js mod_mcp.js mod_tcp.js mod_fetch.js start-relay.sh start-relay.ps1 config.example.json tcp_allowlist.example.txt README.md)
echo "Downloading RL1 from jor-teron/sites main..."
for NAME in "${FILES[@]}"; do
  curl --proto '=https' --proto-redir '=https' --tlsv1.2 -fsSL --retry 2 --connect-timeout 15 --max-time 60 "$BASE/$NAME" -o "$TMP/$NAME"
done
# Do not replace a working install with missing/truncated downloads.
for NAME in "${FILES[@]}"; do
  test -s "$TMP/$NAME"
  case "$NAME" in *.js) node --check "$TMP/$NAME" ;; esac
done
node "$TMP/hub-relay.js" --help >/dev/null
node -e "require(process.argv[1]).loadConfig(['--config',process.argv[2]],{})" "$TMP/relay_config.js" "$TMP/config.example.json"
mkdir -p "$DIR"
BACKUP=''
for NAME in "${FILES[@]}"; do
  if [ -e "$DIR/$NAME" ]; then
    if [ -z "$BACKUP" ]; then BACKUP="$(mktemp -d "$DIR/before-RL1.XXXXXX")"; fi
    cp -p "$DIR/$NAME" "$BACKUP/$NAME"
  fi
done
for NAME in "${FILES[@]}"; do cp "$TMP/$NAME" "$DIR/$NAME"; done
if [ ! -e "$DIR/relay.json" ]; then cp "$DIR/config.example.json" "$DIR/relay.json"; fi
chmod u+x "$DIR/start-relay.sh"
echo "Installed in $DIR. TCP/fetch deny all targets until configured in relay.json."
if [ -n "$BACKUP" ]; then echo "Previous runtime files kept in $BACKUP"; fi
if [ "${HUB_RELAY_INSTALL_ONLY:-0}" = '1' ]; then exit 0; fi
bash "$DIR/start-relay.sh" </dev/null
)
