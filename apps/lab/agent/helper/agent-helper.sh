#!/usr/bin/env bash
# Agent — helper/agent-helper.sh (HR5): tiny local HTTP helper so the Agent page can run shell commands.
# Pure bash + socat (or ncat). No Python. Listens on 127.0.0.1 only (default port 11500), protected by a random token
# printed at start. Every command is also approved by you in the Agent chat (Approve / Deny card) before it is sent.
#   GET  /health  -> {"ok":true,"name":"agent-helper","version":"hr5","root":...}          (token required)
#   POST /run     {"cmd_b64","cwd_b64","timeout"} (or {"cmd","cwd"} when jq is installed)
#              -> {"ok":true,"code":N,"stdout_b64","stderr_b64","stdout_bytes","stderr_bytes","truncated","timed_out","ms"}
# Auth: "Authorization: Bearer <token>" or "X-Agent-Token: <token>". CORS for browser pages (+ Private Network Access).
# Usage: bash agent-helper.sh [--port 11500] [--token T] [--root DIR]
# Env: AGENT_PORT, AGENT_TOKEN, AGENT_ROOT (default cwd: where you start it), AGENT_MAX (output cap per stream,
#      default 65536 bytes), AGENT_ORIGINS (optional space-separated allowed Origins; unset = any origin with the token).
set -u
HH_VERSION=hr5

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

run_cmd() {
  local cmd cwd t out err code=0 to=0 trunc=false t0 ms tcmd=() so se sb eb max=${HH_MAX:-65536}
  cmd=$(field cmd_b64 | unb64); cwd=$(field cwd_b64 | unb64)
  if [ -z "$cmd" ] && command -v jq >/dev/null 2>&1; then cmd=$(printf %s "$BODY" | jq -r '.cmd // empty' 2>/dev/null); cwd=$(printf %s "$BODY" | jq -r '.cwd // empty' 2>/dev/null); fi
  [ -z "$cmd" ] && { reply '400 Bad Request' '{"ok":false,"error":"missing cmd"}'; return; }
  t=$(num timeout); t=${t:-30}; [ "$t" -lt 1 ] && t=1; [ "$t" -gt 600 ] && t=600
  case "$cwd" in '') cwd=$HH_ROOT ;; /*) ;; '~'*) cwd=$HOME${cwd#\~} ;; *) cwd=$HH_ROOT/$cwd ;; esac
  [ -d "$cwd" ] || { reply '400 Bad Request' "{\"ok\":false,\"error\":$(jstr "no such directory: $cwd")}"; return; }
  if command -v timeout >/dev/null 2>&1; then tcmd=(timeout -k 2 "$t"); elif command -v gtimeout >/dev/null 2>&1; then tcmd=(gtimeout -k 2 "$t"); fi
  out=$(mktemp) err=$(mktemp); t0=$(now_ms)
  log "run (cwd $cwd, ${t}s): $cmd"
  (cd "$cwd" && exec ${tcmd[@]+"${tcmd[@]}"} bash -c "$cmd") </dev/null >"$out" 2>"$err" || code=$?
  ms=$(( $(now_ms) - t0 )); [ ${#tcmd[@]} -gt 0 ] && { [ "$code" = 124 ] || [ "$code" = 137 ]; } && to=true || to=false
  sb=$(wc -c <"$out" | tr -d ' '); eb=$(wc -c <"$err" | tr -d ' ')
  { [ "$sb" -gt "$max" ] || [ "$eb" -gt "$max" ]; } && trunc=true
  so=$(head -c "$max" "$out" | b64); se=$(head -c "$max" "$err" | b64); rm -f "$out" "$err"
  log "  -> exit $code, ${ms} ms, ${sb}+${eb} bytes$([ "$to" = true ] && echo ' (timed out)')"
  reply '200 OK' "{\"ok\":true,\"code\":$code,\"stdout_b64\":\"$so\",\"stderr_b64\":\"$se\",\"stdout_bytes\":$sb,\"stderr_bytes\":$eb,\"truncated\":$trunc,\"timed_out\":$to,\"ms\":$ms,\"timeout_supported\":$([ ${#tcmd[@]} -gt 0 ] && echo true || echo false)}"
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
    'GET /health') reply '200 OK' "{\"ok\":true,\"name\":\"agent-helper\",\"version\":\"$HH_VERSION\",\"root\":$(jstr "$HH_ROOT"),\"shell\":$(jstr "$BASH_VERSION"),\"max\":${HH_MAX:-65536}}" ;;
    'POST /run') run_cmd ;;
    *) reply '404 Not Found' '{"ok":false,"error":"use GET /health or POST /run"}' ;;
  esac
}

if [ "${1:-}" = --handle ]; then handle; exit 0; fi

PORT=${AGENT_PORT:-11500}; TOKEN=${AGENT_TOKEN:-}; ROOT=${AGENT_ROOT:-$PWD}
while [ $# -gt 0 ]; do
  case "$1" in --port) PORT=$2; shift ;; --token) TOKEN=$2; shift ;; --root) ROOT=$2; shift ;;
    -h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;; *) echo "unknown option: $1 (try --help)" >&2; exit 2 ;; esac; shift
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
