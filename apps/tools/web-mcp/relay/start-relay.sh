#!/usr/bin/env bash
# Web MCP — relay/start-relay.sh: download, Funnel, and run the Node relay. MCP2.2
#
# Checks for Node (>= 18), downloads the latest relay files from Pages into
# ~/web-mcp-relay, adds Tailscale Funnel routes for /mcp and /ws on port 8787,
# and starts the relay. Does not touch the Linux MCP server on port 10001,
# and never resets or removes existing Funnel / Serve routes.
#
# Usage:
#   ./start-relay.sh              # update, Funnel, run in the foreground
#   ./start-relay.sh --install    # also install a systemd unit (starts on boot)
#   ./start-relay.sh --uninstall  # remove the systemd unit (files are kept)
#   ./start-relay.sh --no-funnel  # skip Funnel setup
#   ./start-relay.sh --no-update  # skip the Pages download
#   ./start-relay.sh --help
#
# Environment:
#   WEB_MCP_PORT   listen port (default 8787)
#   WEB_MCP_HOST   bind address (default 127.0.0.1)
#   WEB_MCP_DIR    install folder (default ~/web-mcp-relay)
#   WEB_MCP_SRC    Pages base URL for the relay files

# Do not use `set -e`: Funnel or download failures should be reported, not
# abort a run that can still start the local relay.

# Pages folder that hosts the relay files after a push to main.
PAGES_BASE="${WEB_MCP_SRC:-https://jor-teron.github.io/sites/apps/tools/web-mcp/relay}"
# Folder on this machine where the relay files live.
INSTALL_DIR="${WEB_MCP_DIR:-$HOME/web-mcp-relay}"
# Listen port. 8787 is the default and is free of the Linux MCP server on 10001.
PORT="${WEB_MCP_PORT:-8787}"
# Bind address passed through to the Node process.
HOST="${WEB_MCP_HOST:-127.0.0.1}"
# systemd unit name written by --install.
SERVICE_NAME="web-mcp-relay"
# Path of the systemd unit file.
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
# How to install Node on Debian 12 when it is missing or too old.
NODE_APT_HINT="sudo apt update && sudo apt install -y nodejs"
# Directory that contains this script (used as a local fallback if Pages is down).
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# Built-in file list, used when the remote manifest cannot be fetched.
DEFAULT_FILES="web-mcp-relay.js
relay_config.js
relay_core.js
relay_ws.js
mod_mcp.js
relay_files.txt"

# Option flags, set while parsing the command line.
DO_INSTALL=0
DO_UNINSTALL=0
NO_FUNNEL=0
NO_UPDATE=0

# Print usage and exit 0.
usage() {
  cat <<'EOF'
Web MCP start-relay.sh — download, Funnel, and run the Node relay.

Usage:
  start-relay.sh              Update files, add Funnel routes, run in the foreground
  start-relay.sh --install    Also install a systemd service so it starts on boot
  start-relay.sh --uninstall  Remove the systemd service (relay files are kept)
  start-relay.sh --no-funnel  Skip Tailscale Funnel setup
  start-relay.sh --no-update  Do not download; use the files already on disk
  start-relay.sh --help       Show this help

Environment:
  WEB_MCP_PORT   Listen port (default 8787). Never use 10001 (Linux MCP).
  WEB_MCP_HOST   Bind address (default 127.0.0.1)
  WEB_MCP_DIR    Install folder (default ~/web-mcp-relay)
  WEB_MCP_SRC    Pages base URL for the relay files

The script adds Funnel routes for /mcp and /ws only. It does not reset or
remove existing Serve/Funnel config, and it does not touch port 10001.
EOF
}

# Return 0 if the command name in $1 is on PATH.
have_cmd() {
  command -v "$1" >/dev/null 2>&1
}

# Print the apt install hint for Node and return 1.
need_node() {
  echo "Node.js 18 or newer is required." >&2
  echo "On Debian 12 install it with:" >&2
  echo "  ${NODE_APT_HINT}" >&2
  return 1
}

# Check that node exists and its major version is at least 18.
check_node() {
  if ! have_cmd node; then
    need_node
    return 1
  fi
  # Major version, e.g. 18 from 18.19.0.
  local major
  major="$(node -p "parseInt(process.versions.node, 10)" 2>/dev/null || echo 0)"
  if [ "$major" -lt 18 ]; then
    echo "Node.js $major is too old (need 18 or newer)." >&2
    need_node
    return 1
  fi
  return 0
}

# Refuse to use port 10001, which belongs to the Linux MCP server.
check_port() {
  if [ "$PORT" = "10001" ]; then
    echo "WEB_MCP_PORT=10001 is reserved for the Linux MCP server. Use 8787 (the default)." >&2
    return 1
  fi
  return 0
}

# Keep only a safe basename (no slashes or parent-directory pieces).
safe_name() {
  # Raw name from the manifest or the built-in list.
  local name="$1"
  case "$name" in
    ""|*/*|*..*|.*)
      return 1
      ;;
  esac
  printf '%s\n' "$name"
}

# Parse a manifest body into a list of safe filenames.
parse_manifest() {
  # Manifest text (file contents or the built-in list).
  local body="$1"
  # One line at a time, comments and blanks skipped.
  local line name
  printf '%s\n' "$body" | while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ""|\#*)
        continue
        ;;
    esac
    name="$(safe_name "$line" 2>/dev/null || true)"
    if [ -n "$name" ]; then
      printf '%s\n' "$name"
    fi
  done
}

# Download one URL to a file with curl, or wget if curl is missing.
download_url() {
  # Source URL.
  local url="$1"
  # Destination path.
  local dest="$2"
  if have_cmd curl; then
    curl -fsSL --retry 2 --retry-delay 1 "$url" -o "$dest"
  elif have_cmd wget; then
    wget -q -O "$dest" "$url"
  else
    echo "Need curl or wget to download relay files." >&2
    return 1
  fi
}

# Copy every known relay file from $1 into $2.
copy_relay_files() {
  # Source folder (Pages temp dir, script dir, or a previous install).
  local src="$1"
  # Destination folder.
  local dest="$2"
  # File being copied.
  local name
  mkdir -p "$dest"
  for name in $(parse_manifest "$DEFAULT_FILES"); do
    if [ -f "$src/$name" ]; then
      cp -f "$src/$name" "$dest/$name"
    fi
  done
  # Also copy any extra files listed in a manifest already in dest or src.
  if [ -f "$src/relay_files.txt" ]; then
    for name in $(parse_manifest "$(cat "$src/relay_files.txt")"); do
      if [ -f "$src/$name" ]; then
        cp -f "$src/$name" "$dest/$name"
      fi
    done
  fi
}

# Download the latest relay files from Pages into INSTALL_DIR.
# Keeps the previous copy in INSTALL_DIR.prev if a download fails.
update_files() {
  # Temporary folder for a complete download; swapped in only on success.
  local tmp
  # Previous install, kept as a rollback if the new files are unusable.
  local prev="${INSTALL_DIR}.prev"
  # Built-in or remote file list.
  local files
  # One filename.
  local name
  # Count of files that downloaded cleanly.
  local ok=0
  # Count of files we tried to download.
  local tried=0

  tmp="$(mktemp -d "${TMPDIR:-/tmp}/web-mcp-relay.XXXXXX")" || return 1

  echo "Downloading relay files from ${PAGES_BASE}/"

  # Prefer the remote manifest so later modules are picked up automatically.
  if download_url "${PAGES_BASE}/relay_files.txt" "$tmp/relay_files.txt" 2>/dev/null; then
    files="$(parse_manifest "$(cat "$tmp/relay_files.txt")")"
  else
    echo "Remote manifest not available; using the built-in file list."
    files="$(parse_manifest "$DEFAULT_FILES")"
  fi

  if [ -z "$files" ]; then
    files="$(parse_manifest "$DEFAULT_FILES")"
  fi

  for name in $files; do
    tried=$((tried + 1))
    if download_url "${PAGES_BASE}/${name}" "$tmp/${name}"; then
      ok=$((ok + 1))
    else
      echo "Failed to download ${name}" >&2
    fi
  done

  # The entry point plus the core files must be present to run.
  if [ ! -f "$tmp/web-mcp-relay.js" ] || [ ! -f "$tmp/relay_core.js" ] || [ ! -f "$tmp/mod_mcp.js" ] || [ ! -f "$tmp/relay_config.js" ]; then
    echo "Download was incomplete." >&2
    # Fall back to the copy next to this script (a git checkout) if present.
    if [ -f "$SCRIPT_DIR/web-mcp-relay.js" ] && [ -f "$SCRIPT_DIR/relay_core.js" ]; then
      echo "Using the relay files next to start-relay.sh instead."
      rm -rf "$tmp"
      tmp="$(mktemp -d "${TMPDIR:-/tmp}/web-mcp-relay.XXXXXX")"
      copy_relay_files "$SCRIPT_DIR" "$tmp"
    elif [ -f "${INSTALL_DIR}/web-mcp-relay.js" ]; then
      echo "Keeping the existing files in ${INSTALL_DIR}."
      rm -rf "$tmp"
      return 0
    else
      rm -rf "$tmp"
      echo "No relay files to install. Copy this relay/ folder to the machine, or wait until Pages is updated." >&2
      return 1
    fi
  fi

  # Swap the new files in, keeping one previous copy.
  mkdir -p "$INSTALL_DIR"
  if [ -f "${INSTALL_DIR}/web-mcp-relay.js" ]; then
    rm -rf "$prev"
    mkdir -p "$prev"
    copy_relay_files "$INSTALL_DIR" "$prev"
  fi
  copy_relay_files "$tmp" "$INSTALL_DIR"
  rm -rf "$tmp"
  echo "Relay files are in ${INSTALL_DIR} (${ok}/${tried} downloaded)."
  return 0
}

# Make sure INSTALL_DIR has a runnable entry point, without downloading.
ensure_local_files() {
  if [ -f "${INSTALL_DIR}/web-mcp-relay.js" ]; then
    return 0
  fi
  if [ -f "$SCRIPT_DIR/web-mcp-relay.js" ]; then
    echo "Copying relay files from ${SCRIPT_DIR} to ${INSTALL_DIR}."
    copy_relay_files "$SCRIPT_DIR" "$INSTALL_DIR"
    return 0
  fi
  echo "No relay files in ${INSTALL_DIR}. Re-run without --no-update, or copy the relay/ folder there." >&2
  return 1
}

# Run a Funnel command, trying without sudo first, then with sudo if needed.
# Does not reset or remove any existing Funnel or Serve routes.
run_funnel() {
  # Arguments passed to `tailscale funnel`.
  if have_cmd tailscale && tailscale funnel "$@" >/dev/null 2>&1; then
    return 0
  fi
  if have_cmd sudo && sudo tailscale funnel "$@" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

# Add Funnel path routes for /mcp and /ws. Never calls funnel reset or off.
setup_funnel() {
  # Local URL prefix the Funnel should proxy to.
  local target="http://127.0.0.1:${PORT}"
  # Command lines printed so they can be run by hand if Funnel is skipped.
  local cmd_mcp="tailscale funnel --bg --yes --set-path=/mcp ${target}/mcp"
  local cmd_ws="tailscale funnel --bg --yes --set-path=/ws ${target}/ws"

  echo "Funnel commands (existing Serve/Funnel routes are left alone):"
  echo "  ${cmd_mcp}"
  echo "  ${cmd_ws}"

  if ! have_cmd tailscale; then
    echo "tailscale not found; skipped Funnel setup. Install Tailscale, then run the two commands above."
    return 0
  fi

  if run_funnel --bg --yes --set-path=/mcp "${target}/mcp"; then
    echo "Funnel path /mcp is set."
  else
    echo "Could not add the /mcp Funnel path. Run this by hand if you need it:" >&2
    echo "  ${cmd_mcp}" >&2
    echo "  sudo ${cmd_mcp}" >&2
  fi

  if run_funnel --bg --yes --set-path=/ws "${target}/ws"; then
    echo "Funnel path /ws is set."
  else
    echo "Could not add the /ws Funnel path. Run this by hand if you need it:" >&2
    echo "  ${cmd_ws}" >&2
    echo "  sudo ${cmd_ws}" >&2
  fi
  return 0
}

# Print the MagicDNS hostname, with no trailing dot, or an empty string.
tailscale_dns() {
  # JSON from `tailscale status --json`, parsed with Node (already required).
  local json dns
  if ! have_cmd tailscale; then
    return 0
  fi
  json="$(tailscale status --json 2>/dev/null || true)"
  if [ -z "$json" ]; then
    return 0
  fi
  dns="$(printf '%s' "$json" | node -e "
    let s = '';
    process.stdin.on('data', function (d) { s += d; });
    process.stdin.on('end', function () {
      try {
        const j = JSON.parse(s);
        const name = (j.Self && j.Self.DNSName) ? String(j.Self.DNSName) : '';
        process.stdout.write(name.replace(/\\.\$/, ''));
      } catch (e) { /* leave empty */ }
    });
  " 2>/dev/null || true)"
  printf '%s' "$dns"
}

# Print the Grok URL hint. The PIN itself comes from the Web MCP page.
print_urls() {
  # MagicDNS name, if Tailscale is installed and logged in.
  local dns
  dns="$(tailscale_dns)"
  echo ""
  echo "Grok URL (replace <PIN> with the PIN from the Web MCP page):"
  if [ -n "$dns" ]; then
    echo "  https://${dns}/mcp/<PIN>"
  else
    echo "  https://<tailscale-dns-name>/mcp/<PIN>"
    echo "  Example: https://debian.tail94ffdb.ts.net/mcp/<PIN>"
  fi
  echo "The tab connects to wss://<same-host>/ws"
  echo "Local health check: curl -sS http://${HOST}:${PORT}/health"
}

# Write and enable a systemd unit that runs the relay as the current user.
install_service() {
  # Absolute path to the node binary.
  local node_bin
  # Absolute path to the entry script.
  local entry="${INSTALL_DIR}/web-mcp-relay.js"
  # Account the service should run as.
  local user
  # Unit file body, written to a temp file then copied into /etc.
  local unit
  # Temp path for the unit file.
  local tmp

  node_bin="$(command -v node)"
  user="$(id -un)"
  if [ ! -f "$entry" ]; then
    echo "Missing ${entry}; cannot install the service." >&2
    return 1
  fi

  tmp="$(mktemp)"
  cat > "$tmp" <<EOF
[Unit]
Description=Web MCP relay
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${node_bin} ${entry}
Environment=WEB_MCP_PORT=${PORT}
Environment=WEB_MCP_HOST=${HOST}
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

  echo "Installing systemd unit ${SERVICE_PATH} (User=${user}, Restart=always)."
  if [ "$(id -u)" -eq 0 ]; then
    cp "$tmp" "$SERVICE_PATH"
    chmod 644 "$SERVICE_PATH"
    systemctl daemon-reload
    systemctl enable --now "$SERVICE_NAME"
  elif have_cmd sudo; then
    sudo cp "$tmp" "$SERVICE_PATH"
    sudo chmod 644 "$SERVICE_PATH"
    sudo systemctl daemon-reload
    sudo systemctl enable --now "$SERVICE_NAME"
  else
    rm -f "$tmp"
    echo "Need root or sudo to install ${SERVICE_PATH}." >&2
    return 1
  fi
  rm -f "$tmp"
  echo "Service ${SERVICE_NAME} is enabled and started."
  if have_cmd systemctl; then
    systemctl --no-pager --full status "$SERVICE_NAME" || true
  fi
  return 0
}

# Stop, disable, and remove the systemd unit. Relay files are left in place.
uninstall_service() {
  echo "Removing systemd unit ${SERVICE_PATH}."
  if [ "$(id -u)" -eq 0 ]; then
    systemctl disable --now "$SERVICE_NAME" 2>/dev/null || true
    rm -f "$SERVICE_PATH"
    systemctl daemon-reload
  elif have_cmd sudo; then
    sudo systemctl disable --now "$SERVICE_NAME" 2>/dev/null || true
    sudo rm -f "$SERVICE_PATH"
    sudo systemctl daemon-reload
  else
    echo "Need root or sudo to remove ${SERVICE_PATH}." >&2
    return 1
  fi
  echo "Service ${SERVICE_NAME} is removed. Relay files in ${INSTALL_DIR} were kept."
  echo "Funnel routes were left alone (this script never resets Funnel)."
  return 0
}

# Run the relay in the foreground, replacing this process.
run_foreground() {
  # Absolute path to the entry script.
  local entry="${INSTALL_DIR}/web-mcp-relay.js"
  if [ ! -f "$entry" ]; then
    echo "Missing ${entry}." >&2
    return 1
  fi
  echo "Starting the relay on ${HOST}:${PORT} (Ctrl+C to stop)."
  export WEB_MCP_PORT="$PORT"
  export WEB_MCP_HOST="$HOST"
  exec node "$entry"
}

# --- command line -----------------------------------------------------------

while [ $# -gt 0 ]; do
  case "$1" in
    --install)
      DO_INSTALL=1
      ;;
    --uninstall)
      DO_UNINSTALL=1
      ;;
    --no-funnel)
      NO_FUNNEL=1
      ;;
    --no-update)
      NO_UPDATE=1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [ "$DO_INSTALL" -eq 1 ] && [ "$DO_UNINSTALL" -eq 1 ]; then
  echo "Use only one of --install or --uninstall." >&2
  exit 2
fi

if [ "$DO_UNINSTALL" -eq 1 ]; then
  uninstall_service
  exit $?
fi

check_port || exit 1
check_node || exit 1

if [ "$NO_UPDATE" -eq 1 ]; then
  ensure_local_files || exit 1
else
  update_files || exit 1
fi

if [ "$NO_FUNNEL" -eq 0 ]; then
  setup_funnel
fi

print_urls

if [ "$DO_INSTALL" -eq 1 ]; then
  install_service || exit 1
  exit 0
fi

run_foreground
