#!/bin/sh
# MCP server control script (POSIX sh; also works under bash).
#   ./mcp.sh            run in this terminal (Ctrl+C stops it)
#   ./mcp.sh --bg       start in the background
#   ./mcp.sh --stop     stop it
#   ./mcp.sh --restart  stop, then start in the background
#   ./mcp.sh --status   is it running? does it answer? is Funnel on?
#   ./mcp.sh --logs     show the last lines of output
#   ./mcp.sh --funnel   (re)add the Tailscale Funnel path /ai/mcp
#   ./mcp.sh --selftest run diagnostic checks
#   ./mcp.sh --prepare  one-time: debootstrap Debian minbase into MCP_ROOT (sandbox/)
#   ./mcp.sh --help     this help
#   ./mcp.sh --usage    short usage
#   ./mcp.sh --version  print version
#   ./mcp.sh --quiet --bg  compact output (quiet may prefix any command)
set -u

# Resolve DIR even if invoked via a symlink or as `sh mcp.sh`.
DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
VERSION=$(cat "$DIR/VERSION" 2>/dev/null || printf unknown)
export PYTHONPATH="${DIR}${PYTHONPATH:+:$PYTHONPATH}"

# Optional config file. Env vars already set in the shell win over mcp.conf.
CONF="${MCP_CONF:-$DIR/mcp.conf}"
if [ -f "$CONF" ]; then
  # Safe KEY=VALUE loader: no eval, no command substitution.
  while IFS= read -r line || [ -n "$line" ]; do
    case "$line" in
      ""|\#*) continue ;;
    esac
    case "$line" in
      *=*) ;;
      *) continue ;;
    esac
    key=$(printf "%s" "$line" | cut -d= -f1 | tr -d ' \t')
    val=$(printf "%s" "$line" | cut -d= -f2-)
    # Strip surrounding quotes and a leading space.
    val=$(printf "%s" "$val" | sed 's/^[[:space:]]*//; s/^"\(.*\)"$/\1/; s/^'\''\(.*\)'\''$/\1/')
    KEY=$(printf "%s" "$key" | tr '[:lower:]' '[:upper:]')
    # Map conf keys to MCP_* env vars if the env var is not already set.
    envname=""
    case "$KEY" in
      PIN|MCP_PIN) envname=MCP_PIN ;;
      PASSWORD|MCP_PASSWORD) envname=MCP_PASSWORD ;;
      PIN_FILE|MCP_PIN_FILE) envname=MCP_PIN_FILE ;;
      PASSWORD_FILE|MCP_PASSWORD_FILE) envname=MCP_PASSWORD_FILE ;;
      HOST|MCP_HOST) envname=MCP_HOST ;;
      PORT|MCP_PORT) envname=MCP_PORT ;;
      PUBLIC_URL|MCP_PUBLIC_URL) envname=MCP_PUBLIC_URL ;;
      LOG|MCP_LOG) envname=MCP_LOG ;;
      ROOT|WORKSPACE|MCP_ROOT) envname=MCP_ROOT ;;
      SANDBOX|MCP_SANDBOX) envname=MCP_SANDBOX ;;
      SANDBOX_NET|MCP_SANDBOX_NET) envname=MCP_SANDBOX_NET ;;
      AUTH|MCP_AUTH) envname=MCP_AUTH ;;
      CORS_ORIGINS|MCP_CORS_ORIGINS) envname=MCP_CORS_ORIGINS ;;
      TRUST_PROXY|MCP_TRUST_PROXY) envname=MCP_TRUST_PROXY ;;
      TIMEOUT|MCP_TIMEOUT) envname=MCP_TIMEOUT ;;
      MEMORY_MB|MCP_MEMORY_MB) envname=MCP_MEMORY_MB ;;
      MAX_PROCS|MCP_MAX_PROCS) envname=MCP_MAX_PROCS ;;
      BIND|MCP_BIND)
        if [ -n "${MCP_BIND:-}" ]; then
          MCP_BIND="$MCP_BIND,$val"
        else
          MCP_BIND="$val"
        fi
        export MCP_BIND
        continue
        ;;
      *) continue ;;
    esac
    # Only fill in values that the environment has not already set.
    eval "already=\${$envname+x}"
    if [ -z "$already" ]; then
      eval "$envname=\"\$val\""
      export "$envname"
    fi
  done < "$CONF"
fi

export MCP_HOST="${MCP_HOST:-127.0.0.1}"
export MCP_PORT="${MCP_PORT:-8787}"
export MCP_ROOT="${MCP_ROOT:-$DIR/sandbox}"
export MCP_SANDBOX="${MCP_SANDBOX:-ns}"
export MCP_LOG="${MCP_LOG:-/home/ai/mcp.log}"
# MCP_PIN / MCP_PASSWORD come from the environment or mcp.conf if set;
# the server defaults to "password".

STATE_DIR="${MCP_STATE_DIR:-/home/ai}"
PIDFILE="$STATE_DIR/mcp.pid"
OUT="$STATE_DIR/mcp.out"
FUNNEL_PATH="/ai/mcp"

say() { printf '%s\n' "[mcp] $*"; }
info() { [ "${QUIET:-0}" -eq 1 ] || say "$*"; }
step() { info "[$1] $2"; }
step_ok() { info "      Result: OK"; }

port_pids() {
  out=""
  if command -v ss >/dev/null 2>&1; then
    out=$(ss -ltnpH "sport = :$MCP_PORT" 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2)
  fi
  if [ -z "$out" ] && command -v fuser >/dev/null 2>&1; then
    out=$(fuser -n tcp "$MCP_PORT" 2>/dev/null)
  fi
  if [ -z "$out" ] && command -v lsof >/dev/null 2>&1; then
    out=$(lsof -t -iTCP:"$MCP_PORT" -sTCP:LISTEN 2>/dev/null)
  fi
  # shellcheck disable=SC2086
  printf '%s\n' $out
}

find_pids() {
  pids=""
  if [ -f "$PIDFILE" ]; then
    p=$(cat "$PIDFILE" 2>/dev/null || true)
    if [ -n "$p" ] && kill -0 "$p" 2>/dev/null; then
      pids="$p"
    fi
  fi
  more=""
  if command -v pgrep >/dev/null 2>&1; then
    more=$(pgrep -f "mcp.server|mcp/server.py" 2>/dev/null || true)
  fi
  port=$(port_pids)
  printf '%s\n' $pids $more $port 2>/dev/null | grep -E '^[0-9]+$' | grep -vx "$$" | sort -u | tr '\n' ' '
}

port_busy() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltnH "sport = :$MCP_PORT" 2>/dev/null | grep -q . && return 0
  fi
  [ "$(check_http)" != "000" ]
}

is_running() {
  pids=$(find_pids)
  [ -n "$(printf '%s' "$pids" | tr -d ' ')" ]
}

check_http() {
  if ! command -v curl >/dev/null 2>&1; then
    printf '%s\n' "no-curl"
    return
  fi
  c=$(curl -s -o /dev/null -m 5 -w "%{http_code}" "http://$MCP_HOST:$MCP_PORT/mcp" 2>/dev/null || true)
  printf '%s\n' "${c:-000}"
}

show_start_config() {
  step "1/6" "Load configuration"
  if [ -f "$CONF" ]; then info "      Config: $CONF"; else info "      Config: not found (environment/defaults used)"; fi
  info "      Version: $VERSION"
  info "      Bind: $MCP_HOST:$MCP_PORT"
  info "      Workspace root: $MCP_ROOT"
  info "      Sandbox: $MCP_SANDBOX"
  case "${MCP_AUTH:-1}" in
    0|false|False|FALSE|no|NO|off|OFF) info "      Authentication: disabled (unsafe outside local testing)" ;;
    *) info "      Authentication: enabled" ;;
  esac
  step_ok
}

prep() {
  show_start_config
  step "2/6" "Prepare workspace and state directories"
  if ! mkdir -p "$MCP_ROOT" "$STATE_DIR"; then
    say "ERROR: cannot create workspace or state directory. Check path and permissions."
    exit 1
  fi
  if [ ! -d "$MCP_ROOT" ] || [ ! -w "$MCP_ROOT" ]; then
    say "ERROR: workspace root is not a writable directory: $MCP_ROOT"
    exit 1
  fi
  if [ ! -d "$STATE_DIR" ] || [ ! -w "$STATE_DIR" ]; then
    say "ERROR: state directory is not writable: $STATE_DIR"
    exit 1
  fi
  info "      Workspace: $MCP_ROOT"
  info "      State: $STATE_DIR"
  step_ok

  step "3/6" "Check sandbox prerequisites"
  if [ "$MCP_SANDBOX" = "ns" ]; then
    if ! command -v unshare >/dev/null 2>&1; then
      say "ERROR: unshare is not installed; install util-linux or use MCP_SANDBOX=none."
      exit 1
    fi
    if ! unshare --user --map-root-user true 2>/dev/null; then
      say "ERROR: unprivileged user namespaces are not available."
      say "Enable them (Debian): sudo sysctl -w kernel.unprivileged_userns_clone=1"
      say "Or use the weaker mode: MCP_SANDBOX=none $0 --bg"
      exit 1
    fi
    info "      User namespaces: available"
  else
    info "      Namespace isolation: disabled (weaker mode)"
  fi
  step_ok
}

do_fg() {
  prep
  step "4/6" "Check existing server and port"
  if is_running; then
    say "already running (pid $(find_pids)). Use --restart."
    exit 1
  fi
  if port_busy; then
    say "ERROR: port $MCP_PORT is already in use. Check ./mcp.sh --status."
    exit 1
  fi
  step_ok
  step "5/6" "Launch foreground server"
  info "      Ctrl+C stops the server."
  step_ok
  step "6/6" "Starting HTTP listener"
  exec python3 -m mcp.server
}

do_bg() {
  prep
  step "4/6" "Check existing server and port"
  if is_running; then
    say "already running (pid $(find_pids)). Use --restart."
    return 0
  fi
  if port_busy; then
    say "ERROR: port $MCP_PORT is in use by something else. Run: ./mcp.sh --stop (or sudo ./mcp.sh --stop)"
    exit 1
  fi
  step_ok

  step "5/6" "Prepare output log and launch background process"
  if ! mkdir -p "$(dirname -- "$OUT")"; then
    say "ERROR: cannot create log directory for $OUT"
    exit 1
  fi
  info "      Output log: $OUT"
  nohup python3 -m mcp.server >> "$OUT" 2>&1 &
  server_pid=$!
  if [ -z "$server_pid" ]; then
    say "ERROR: could not launch Python server process."
    exit 1
  fi
  echo "$server_pid" > "$PIDFILE" || {
    say "ERROR: server launched but PID file could not be written: $PIDFILE"
    exit 1
  }
  info "      Process ID: $(cat "$PIDFILE")"
  step_ok

  step "6/6" "Wait for HTTP health response"
  i=0
  while [ "$i" -lt 10 ]; do
    i=$((i + 1))
    sleep 0.5 2>/dev/null || sleep 1
    if ! kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
      say "ERROR: server exited during startup. Last output:"
      tail -n 20 "$OUT" 2>/dev/null || true
      rm -f "$PIDFILE"
      exit 1
    fi
    code=$(check_http)
    if [ "$code" = "401" ] || [ "$code" = "200" ] || [ "$code" = "405" ]; then
      say "READY: server is running (PID $(cat "$PIDFILE"))."
      say "Local endpoint: http://$MCP_HOST:$MCP_PORT/mcp"
      say "Health check:   http://$MCP_HOST:$MCP_PORT/health"
      say "Server output:  $OUT"
      step_ok
      return 0
    fi
  done
  say "WARNING: process started (PID $(cat "$PIDFILE")) but did not answer the HTTP check yet."
  say "Check server output with: ./mcp.sh --logs"
}

do_stop() {
  pids=$(find_pids)
  if [ -z "$(printf '%s' "$pids" | tr -d ' ')" ]; then
    say "not running."
    rm -f "$PIDFILE"
    return 0
  fi
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  i=0
  while [ "$i" -lt 10 ]; do
    i=$((i + 1))
    sleep 0.5 2>/dev/null || sleep 1
    if ! is_running && ! port_busy; then
      say "stopped."
      rm -f "$PIDFILE"
      return 0
    fi
  done
  # shellcheck disable=SC2046
  kill -9 $(find_pids) 2>/dev/null || true
  sleep 0.5 2>/dev/null || sleep 1
  rm -f "$PIDFILE"
  if port_busy; then
    say "port $MCP_PORT is still in use by a process I can't stop (maybe another user or root)."
    say "Try: sudo ./mcp.sh --stop"
    return 1
  fi
  say "stopped (forced)."
}

do_status() {
  if is_running; then
    say "running (pid $(find_pids))"
  else
    say "NOT running"
  fi
  code=$(check_http)
  case "$code" in
    401|405|200) say "local check: answers on port $MCP_PORT (good)" ;;
    000) say "local check: no answer on port $MCP_PORT" ;;
    *)   say "local check: HTTP $code" ;;
  esac
  # Report the optional workspace filesystem cap using the same helper
  # as the server's startup banner. Fall back to "off" if Python cannot
  # inspect the workspace for any reason.
  limit=$(python3 -c 'import os; from mcp.workspace import workspace_limit_status; print(workspace_limit_status(os.path.join(os.environ["MCP_ROOT"], "workspace")))' 2>/dev/null || printf 'unknown')
  say "workspace size limit: $limit"
  if command -v tailscale >/dev/null 2>&1; then
    if tailscale funnel status 2>/dev/null | grep -q "$FUNNEL_PATH"; then
      say "funnel: $FUNNEL_PATH is on"
    else
      say "funnel: $FUNNEL_PATH NOT found. Fix with: ./mcp.sh --funnel"
    fi
  fi
}

do_logs() {
  n=${1:-30}
  if [ -f "$OUT" ]; then
    tail -n "$n" "$OUT"
  else
    say "no output file yet ($OUT)"
  fi
}

do_funnel() {
  if ! command -v tailscale >/dev/null 2>&1; then
    say "tailscale not installed"
    exit 1
  fi
  tailscale funnel --bg --set-path "$FUNNEL_PATH" "http://127.0.0.1:$MCP_PORT/mcp" \
    || sudo tailscale funnel --bg --set-path "$FUNNEL_PATH" "http://127.0.0.1:$MCP_PORT/mcp"
  tailscale funnel status
}

do_prepare() {
  # One-time: debootstrap Debian minbase into MCP_ROOT (default: sandbox/).
  # Regular start/stop never calls this. Re-running is a no-op if already prepared.
  root="${MCP_ROOT:-$DIR/sandbox}"
  marker="$root/.ai-mcp-rootfs"
  if [ -f "$marker" ]; then
    say "rootfs already prepared in $root"
    exit 0
  fi
  if ! command -v debootstrap >/dev/null 2>&1; then
    say "debootstrap not installed. On Debian/Ubuntu: sudo apt-get install debootstrap"
    exit 1
  fi
  suite="${MCP_ROOTFS_SUITE:-bookworm}"
  say "preparing Debian $suite minbase in $root (this may take several minutes)"
  if ! sudo debootstrap --variant=minbase "$suite" "$root"; then
    say "debootstrap failed"
    exit 1
  fi
  # Marker so future restarts and re-runs of --prepare skip the work.
  printf 'suite=%s\nprepared=%s\n' "$suite" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$marker"
  say "rootfs ready in $root. Regular ./mcp.sh --bg will use it; no debootstrap on restart."
}

QUIET=0
if [ "${1:-}" = "--quiet" ]; then
  QUIET=1
  shift
fi

case "${1:-}" in
  "")              do_fg ;;
  --bg|--start)    do_bg ;;
  --stop)          do_stop ;;
  --restart)       do_stop || exit 1; do_bg ;;
  --status)        do_status ;;
  --logs)          do_logs "${2:-30}" ;;
  --funnel)        do_funnel ;;
  --selftest)      exec python3 -m mcp.selftest ;;
  --prepare)       do_prepare ;;
  -h|--help)
    sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
    ;;
  --usage)
    printf '%s
' "Usage: mcp.sh [--bg|--stop|--restart|--status|--logs [N]|--funnel|--selftest|--prepare|--help|--usage|--version]"
    ;;
  --version)
    printf '%s
' "ai-mcp mcp.sh $VERSION"
    ;;
  *)
    say "unknown option: $1"
    sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
