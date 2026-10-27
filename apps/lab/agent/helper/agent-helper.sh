#!/usr/bin/env bash
# Agent — helper/agent-helper.sh (HR5): tiny local HTTP helper so the Agent page can run shell commands.
# Pure bash + socat (or ncat). No Python. Listens on 127.0.0.1 only (default port 11500), protected by a random token
# printed at start. Every command is also approved by you in the Agent chat (Approve / Deny card) before it is sent.
#   GET  /health  -> {"ok":true,"name":"agent-helper","version":"hr5","root":...}          (token required)
#   POST /run     {"cmd_b64","cwd_b64","timeout"} (or {"cmd","cwd"} when jq is installed)
#              -> {"ok":true,"code":N,"stdout_b64","stderr_b64","stdout_bytes","stderr_bytes","truncated","timed_out","ms"}
#   POST /run_stream (AG7, same body) -> chunked NDJSON while it runs: {"t":"o"|"e","d":"<b64>"} output, {"t":"h"} heartbeat
#              (~1 s), last {"t":"end","code","timed_out","truncated","ms","stdout_bytes","stderr_bytes"}. Closing the request
#              (Stop in Agent) kills the command's whole process group within about a second.
# Auth: "Authorization: Bearer <token>" or "X-Agent-Token: <token>". CORS for browser pages (+ Private Network Access).
# Usage: bash agent-helper.sh [--port 11500] [--token T] [--root DIR]
# Env: AGENT_PORT, AGENT_TOKEN, AGENT_ROOT (default cwd: where you start it), AGENT_MAX (output cap per stream,
#      default 65536 bytes), AGENT_ORIGINS (optional space-separated allowed Origins; unset = any origin with the token).
set -u
HH_VERSION=ag7

blen() { local LC_ALL=C; printf %s "${#1}"; }
b64() { base64 | tr -d '\n\r'; }
unb64() { base64 -d 2>/dev/null || base64 -D 2>/dev/null; }
jstr() { local s=${1//\\/\\\\}; s=${s//\"/\\\"}; s=${s//$'\n'/\\n}; s=${s//$'\r'/\\r}; s=${s//$'\t'/\\t}; printf '"%s"' "$s"; }
now_ms() { if [ -n "${EPOCHREALTIME:-}" ]; then local t=${EPOCHREALTIME/[.,]/}; printf %s "${t:0:${#t}-3}"; else printf %s "$(( $(date +%s) * 1000 ))"; fi; }
log() { printf '[%s] %s\n' "$(date +%H:%M:%S)" "$*" >&2; }

reply() { # status text, body(json)
  local origin=${REQ_ORIGIN:-*}
  printf 'HTTP/1.1 %s\r\nContent-Type: application/json\r\nContent-Length: %s\r\nAccess-Control-Allow-Origin: %s\r\nVary: Origin\r\n' "$1" "$(blen "$2")" "$origin"
  printf 'Access-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Authorization, Content-Type, X-Agent-Token\r\n'
  printf 'Access-Control-Allow-Private-Network: true\r\nAccess-Control-Max-Age: 600\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n%s' "$2"
}
field() { printf %s "$BODY" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([A-Za-z0-9+/=]*\)\".*/\1/p" | head -n1; }
num() { printf %s "$BODY" | sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\([0-9][0-9]*\).*/\1/p" | head -n1; }

prep() { # parse BODY -> CMD CWD T TCMD; replies 400 and returns 1 on bad input
  CMD=$(field cmd_b64 | unb64); CWD=$(field cwd_b64 | unb64); TCMD=()
  if [ -z "$CMD" ] && command -v jq >/dev/null 2>&1; then CMD=$(printf %s "$BODY" | jq -r '.cmd // empty' 2>/dev/null); CWD=$(printf %s "$BODY" | jq -r '.cwd // empty' 2>/dev/null); fi
  [ -z "$CMD" ] && { reply '400 Bad Request' '{"ok":false,"error":"missing cmd"}'; return 1; }
  T=$(num timeout); T=${T:-30}; [ "$T" -lt 1 ] && T=1; [ "$T" -gt 600 ] && T=600
  case "$CWD" in '') CWD=$HH_ROOT ;; /*) ;; '~'*) CWD=$HOME${CWD#\~} ;; *) CWD=$HH_ROOT/$CWD ;; esac
  [ -d "$CWD" ] || { reply '400 Bad Request' "{\"ok\":false,\"error\":$(jstr "no such directory: $CWD")}"; return 1; }
  if command -v timeout >/dev/null 2>&1; then TCMD=(timeout -k 2 "$T"); elif command -v gtimeout >/dev/null 2>&1; then TCMD=(gtimeout -k 2 "$T"); fi
  return 0
}

run_cmd() {
  local out err code=0 to=false trunc=false t0 ms so se sb eb max=${HH_MAX:-65536}
  prep || return
  out=$(mktemp) err=$(mktemp); t0=$(now_ms)
  log "run (cwd $CWD, ${T}s): $CMD"
  (cd "$CWD" && exec ${TCMD[@]+"${TCMD[@]}"} bash -c "$CMD") </dev/null >"$out" 2>"$err" || code=$?
  ms=$(( $(now_ms) - t0 )); [ ${#TCMD[@]} -gt 0 ] && { [ "$code" = 124 ] || [ "$code" = 137 ]; } && to=true
  sb=$(wc -c <"$out" | tr -d ' '); eb=$(wc -c <"$err" | tr -d ' ')
  { [ "$sb" -gt "$max" ] || [ "$eb" -gt "$max" ]; } && trunc=true
  so=$(head -c "$max" "$out" | b64); se=$(head -c "$max" "$err" | b64); rm -f "$out" "$err"
  log "  -> exit $code, ${ms} ms, ${sb}+${eb} bytes$([ "$to" = true ] && echo ' (timed out)')"
  reply '200 OK' "{\"ok\":true,\"code\":$code,\"stdout_b64\":\"$so\",\"stderr_b64\":\"$se\",\"stdout_bytes\":$sb,\"stderr_bytes\":$eb,\"truncated\":$trunc,\"timed_out\":$to,\"ms\":$ms,\"timeout_supported\":$([ ${#TCMD[@]} -gt 0 ] && echo true || echo false)}"
}

# --- AG7 live output: chunked NDJSON, poll the output files every 0.2 s ---
chunk() { printf '%x\r\n%s\r\n' "$(blen "$1")" "$1" 2>/dev/null; }   # fails once the browser closed the request
NEWOFF=0
emit_new() { # kind(o|e) file offset max -> sends new bytes (capped at max), sets NEWOFF; returns 1 when the client is gone
  local sz n d off=$3; sz=$(wc -c <"$2" | tr -d ' '); NEWOFF=$off
  [ "$sz" -le "$off" ] && return 0
  if [ "$off" -ge "$4" ]; then STRUNC=true; NEWOFF=$sz; return 0; fi
  n=$(( sz - off )); [ $(( off + n )) -gt "$4" ] && { n=$(( $4 - off )); STRUNC=true; }
  d=$(tail -c +$(( off + 1 )) "$2" | head -c "$n" | b64); NEWOFF=$(( off + n )); [ "$NEWOFF" -ge "$4" ] && [ "$sz" -gt "$4" ] && NEWOFF=$sz
  chunk "{\"t\":\"$1\",\"d\":\"$d\"}"$'\n'
}
killtree() { kill -TERM -- "-$1" 2>/dev/null || kill -TERM "$1" 2>/dev/null; sleep 1; kill -KILL -- "-$1" 2>/dev/null || kill -KILL "$1" 2>/dev/null; }
run_stream() {
  local out err code=0 to=false t0 ms pid oo=0 eo=0 sb eb run tick=0 max=${HH_MAX:-65536} gone=0
  STRUNC=false
  prep || return
  out=$(mktemp) err=$(mktemp); t0=$(now_ms)
  log "stream (cwd $CWD, ${T}s): $CMD"
  printf 'HTTP/1.1 200 OK\r\nContent-Type: application/x-ndjson\r\nTransfer-Encoding: chunked\r\nAccess-Control-Allow-Origin: %s\r\nVary: Origin\r\n' "${REQ_ORIGIN:-*}"
  printf 'Access-Control-Allow-Private-Network: true\r\nCache-Control: no-store\r\nX-Accel-Buffering: no\r\nConnection: close\r\n\r\n'
  trap '' PIPE
  if command -v setsid >/dev/null 2>&1; then
    (cd "$CWD" && exec setsid ${TCMD[@]+"${TCMD[@]}"} bash -c "$CMD") </dev/null >"$out" 2>"$err" &
  else
    set -m; (cd "$CWD" && exec ${TCMD[@]+"${TCMD[@]}"} bash -c "$CMD") </dev/null >"$out" 2>"$err" & set +m
  fi
  pid=$!
  while :; do
    run=0; kill -0 "$pid" 2>/dev/null && run=1
    emit_new o "$out" "$oo" "$max" || gone=1; oo=$NEWOFF
    emit_new e "$err" "$eo" "$max" || gone=1; eo=$NEWOFF
    [ "$run" = 0 ] && break
    tick=$(( tick + 1 )); [ $(( tick % 5 )) = 0 ] && { chunk '{"t":"h"}'$'\n' || gone=1; }
    if [ "$gone" = 1 ]; then log "  -> stopped by Agent, killing $pid"; killtree "$pid"; wait "$pid" 2>/dev/null; rm -f "$out" "$err"; return; fi
    sleep 0.2
  done
  wait "$pid"; code=$?
  ms=$(( $(now_ms) - t0 )); [ ${#TCMD[@]} -gt 0 ] && { [ "$code" = 124 ] || [ "$code" = 137 ]; } && to=true
  sb=$(wc -c <"$out" | tr -d ' '); eb=$(wc -c <"$err" | tr -d ' '); rm -f "$out" "$err"
  log "  -> exit $code, ${ms} ms, ${sb}+${eb} bytes (streamed)$([ "$to" = true ] && echo ' (timed out)')"
  chunk "{\"t\":\"end\",\"code\":$code,\"timed_out\":$to,\"truncated\":$STRUNC,\"ms\":$ms,\"stdout_bytes\":$sb,\"stderr_bytes\":$eb}"$'\n'
  printf '0\r\n\r\n' 2>/dev/null
}

handle() { # one HTTP request on stdin/stdout
  local line method path h k v len=0 auth='' tok=''
  REQ_ORIGIN='*'; BODY=''
  IFS= read -r line || exit 0; line=${line%$'\r'}
  method=${line%% *}; path=${line#* }; path=${path%% *}; path=${path%%\?*}
  shopt -s nocasematch
  while IFS= read -r h; do
    h=${h%$'\r'}; [ -z "$h" ] && break
    k=${h%%:*}; v=${h#*:}; v=${v# }
    case "$k" in content-length) len=${v//[^0-9]/} ;; authorization) auth=$v ;; x-agent-token) tok=$v ;; origin) REQ_ORIGIN=$v ;; esac
  done
  shopt -u nocasematch
  if [ -n "${AGENT_ORIGINS:-}" ] && [ "$REQ_ORIGIN" != '*' ] && [[ " $AGENT_ORIGINS " != *" $REQ_ORIGIN "* ]]; then
    log "blocked origin $REQ_ORIGIN"; reply '403 Forbidden' '{"ok":false,"error":"origin not allowed"}'; return; fi
  [ "$method" = OPTIONS ] && { reply '204 No Content' ''; return; }
  len=${len:-0}; [ "$len" -gt 1048576 ] && { reply '413 Payload Too Large' '{"ok":false,"error":"body too large"}'; return; }
  [ "$len" -gt 0 ] && BODY=$(head -c "$len")
  [ "${auth#Bearer }" = "$HH_TOKEN" ] || [ "$tok" = "$HH_TOKEN" ] || { log "401 $method $path"; reply '401 Unauthorized' '{"ok":false,"error":"bad or missing token"}'; return; }
  case "$method $path" in
    'GET /health') reply '200 OK' "{\"ok\":true,\"name\":\"agent-helper\",\"version\":\"$HH_VERSION\",\"root\":$(jstr "$HH_ROOT"),\"shell\":$(jstr "$BASH_VERSION"),\"max\":${HH_MAX:-65536},\"stream\":true}" ;;
    'POST /run') run_cmd ;;
    'POST /run_stream') run_stream ;;
    *) reply '404 Not Found' '{"ok":false,"error":"use GET /health, POST /run or POST /run_stream"}' ;;
  esac
}

if [ "${1:-}" = --handle ]; then handle; exit 0; fi

PORT=${AGENT_PORT:-11500}; TOKEN=${AGENT_TOKEN:-}; ROOT=${AGENT_ROOT:-$PWD}
while [ $# -gt 0 ]; do
  case "$1" in --port) PORT=$2; shift ;; --token) TOKEN=$2; shift ;; --root) ROOT=$2; shift ;;
    -h|--help) sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;; *) echo "unknown option: $1 (try --help)" >&2; exit 2 ;; esac; shift
done
[ -n "$TOKEN" ] || TOKEN=$(head -c 18 /dev/urandom | od -An -tx1 | tr -d ' \n')
ROOT=$(cd "$ROOT" 2>/dev/null && pwd) || { echo "root folder not found" >&2; exit 2; }
HH_SELF=$(cd "$(dirname "$0")" && pwd)/$(basename "$0")
export HH_TOKEN=$TOKEN HH_ROOT=$ROOT HH_SELF HH_MAX=${AGENT_MAX:-65536} AGENT_ORIGINS=${AGENT_ORIGINS:-}

cat >&2 <<MSG
Agent helper ($HH_VERSION) — http://127.0.0.1:$PORT  (local only)
  Token: $TOKEN
  Root:  $ROOT  (default working folder for commands)
In Agent: Settings ⚙ → Helper → On, URL http://127.0.0.1:$PORT, paste the token, Test.
Each command still needs your Approve in the chat. Ctrl+C stops the helper.
MSG
if command -v socat >/dev/null 2>&1; then
  exec socat "TCP-LISTEN:$PORT,bind=127.0.0.1,reuseaddr,fork" SYSTEM:'exec bash "$HH_SELF" --handle'
elif command -v ncat >/dev/null 2>&1; then
  exec ncat -lk 127.0.0.1 "$PORT" --sh-exec 'exec bash "$HH_SELF" --handle'
else
  cat >&2 <<'MSG'
Missing socat (or ncat). The helper needs one of them to listen for HTTP. Install socat:
  Debian / Ubuntu:  sudo apt install socat        Fedora:  sudo dnf install socat
  Arch:             sudo pacman -S socat          macOS:   brew install socat
  (or ncat from nmap). Plain "nc" cannot serve more than one request, so it is not supported.
MSG
  exit 1
fi
