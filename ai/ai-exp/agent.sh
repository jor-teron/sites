#!/usr/bin/env bash
# AI Sandbox Experiment (bash version)
# Lets an AI roam freely inside an offline BusyBox cage for a fixed time
# and records everything it does.
#
# Usage:
#   ./agent.sh <experiment-name> "<prompt>"
#   ./agent.sh exp-001 "You're alone on a tiny Linux machine. Do whatever you like."
#
# API key (first one found wins):
#   1. GEMINI_API_KEY or GOOGLE_API_KEY environment variable
#   2. A .env file next to this script with:  GEMINI_API_KEY=your_key
#   3. Typed in when the script starts (hidden)
#
# Needs: bash, curl, jq, busybox, unshare, chroot

set -u

# ------------------------------------------------------------ settings
TIME_LIMIT=150      # seconds for the whole run
REQUEST_GAP=5       # minimum seconds between API requests (15 RPM limit -> 12 RPM)
CMD_TIMEOUT=15      # seconds before a single command is killed
MAX_OUTPUT=4000     # characters of command output sent back to the AI
MODEL="${AI_MODEL:-gemini-3.1-flash-lite}"
API_URL="${API_URL:-https://generativelanguage.googleapis.com/v1beta/openai/chat/completions}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ------------------------------------------------------------ helpers
clock() { date +%H:%M:%S; }
fail()  { echo "Error: $*" >&2; exit 1; }

# Find a program even if it lives in /sbin or /usr/sbin (chroot often does).
find_tool() {
  local name="$1" dir
  if command -v "$name" >/dev/null 2>&1; then command -v "$name"; return 0; fi
  for dir in /usr/sbin /sbin /usr/bin /bin /usr/local/bin /usr/local/sbin; do
    [ -x "$dir/$name" ] && { echo "$dir/$name"; return 0; }
  done
  return 1
}

load_api_key() {
  API_KEY="${GEMINI_API_KEY:-${GOOGLE_API_KEY:-}}"
  if [ -z "$API_KEY" ] && [ -f "$SCRIPT_DIR/.env" ]; then
    API_KEY="$(sed -n -E 's/^[[:space:]]*(export[[:space:]]+)?(GEMINI_API_KEY|GOOGLE_API_KEY)[[:space:]]*=[[:space:]]*//p' \
               "$SCRIPT_DIR/.env" | head -n1 | tr -d '\r' | sed -E "s/^[\"']//; s/[\"']\$//")"
  fi
  if [ -z "$API_KEY" ] && [ -t 0 ]; then
    read -r -s -p "Gemini API key (input hidden): " API_KEY; echo
  fi
  [ -n "$API_KEY" ] || fail "No API key found. Set GEMINI_API_KEY, put it in .env next to the script, or type it when asked."
}

# ------------------------------------------------------------ tools check
CURL="$(find_tool curl)"       || fail "curl not found. Install it: sudo apt install curl"
JQ="$(find_tool jq)"           || fail "jq not found. Install it: sudo apt install jq"
UNSHARE="$(find_tool unshare)" || fail "unshare not found. Install it: sudo apt install util-linux"
CHROOT="$(find_tool chroot)"   || fail "chroot not found. Install it: sudo apt install coreutils"
BUSYBOX="${BUSYBOX:-$(find_tool busybox)}" || fail "busybox not found. Install it: sudo apt install busybox-static"
TIMEOUT="$(find_tool timeout || true)"

# The cage has no timezone files, so pass the host's offset in POSIX form (e.g. +0530 -> UTC-05:30).
off="$(date +%z)"; sign="${off:0:1}"; [ "$sign" = "+" ] && psign="-" || psign="+"
CAGE_TZ="UTC${psign}${off:1:2}:${off:3:2}"

# ------------------------------------------------------------ the cage
build_cage() {
  mkdir -p "$CAGE/bin" "$CAGE/home" "$CAGE/tmp" "$CAGE/proc"
  cp "$BUSYBOX" "$CAGE/bin/busybox" && chmod +x "$CAGE/bin/busybox"
  local applet
  for applet in $("$CAGE/bin/busybox" --list); do
    [ -e "$CAGE/bin/$applet" ] || ln -s busybox "$CAGE/bin/$applet"
  done
}

# Run one command in fresh namespaces: own user, no network, own processes,
# own mounts, own hostname. The cage folder is the whole filesystem.
run_in_cage() {
  local cmd="$1" limit="$2" out code
  local -a pre=()
  [ -n "$TIMEOUT" ] && pre=("$TIMEOUT" -k 2 "$limit")
  out="$(env -i PATH=/bin HOME=/home TERM=dumb TZ="$CAGE_TZ" \
        "${pre[@]}" "$UNSHARE" --user --map-root-user --net --pid --fork --mount --uts --mount-proc="$CAGE/proc" \
        "$CHROOT" "$CAGE" /bin/sh -c "cd /home; $cmd" 2>&1)"
  code=$?
  [ -z "$out" ] && out="(no output)"
  [ "${#out}" -gt "$MAX_OUTPUT" ] && out="${out:0:$MAX_OUTPUT}"$'\n...(output cut)'
  if [ "$code" -eq 124 ] || [ "$code" -eq 137 ]; then
    [ "$out" = "(no output)" ] && out=""
    printf '%s(command killed after %ss)' "${out:+$out$'\n'}" "$limit"
  else
    printf '%s\n[exit code %s]' "$out" "$code"
  fi
}

# ------------------------------------------------------------ logging
record() { printf '%s\n' "$*" | tee -a "$LOG"; }
seconds_left() { local s=$(( END - $(date +%s) )); [ "$s" -lt 0 ] && s=0; echo "$s"; }

# Append one JSON message to the conversation file.
add_message() { "$JQ" -c --argjson m "$1" '. + [$m]' "$MSGS" > "$MSGS.tmp" && mv "$MSGS.tmp" "$MSGS"; }

ask_ai() {
  local body http
  body="$("$JQ" -c --arg model "$MODEL" --slurpfile tools "$TOOLS_FILE" \
          '{model: $model, messages: ., tools: $tools[0]}' "$MSGS")"
  http="$("$CURL" -sS -o "$REPLY_FILE" -w '%{http_code}' --max-time "$1" \
          -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
          -d "$body" "$API_URL" 2>&1)"
  if [ "$http" != "200" ]; then
    echo "HTTP $http: $(head -c 300 "$REPLY_FILE" 2>/dev/null)"
    return 1
  fi
}

# ------------------------------------------------------------ main
[ $# -eq 2 ] || { sed -n '2,15p' "$0"; exit 1; }
NAME="$1"; PROMPT="$2"
load_api_key

EXP_DIR="$(pwd)/$NAME"
CAGE="$EXP_DIR/cage"
[ -e "$EXP_DIR" ] && fail "'$NAME' already exists. Pick a new experiment name."
mkdir -p "$EXP_DIR/.run" || fail "Can't create $EXP_DIR"
LOG="$EXP_DIR/log.md"
MSGS="$EXP_DIR/.run/messages.json"
TOOLS_FILE="$EXP_DIR/.run/tools.json"
REPLY_FILE="$EXP_DIR/.run/reply.json"

build_cage
test_out="$(run_in_cage 'echo cage-ok' 5)"
case "$test_out" in
  *cage-ok*) ;;
  *) fail "The sandbox couldn't start. Unprivileged user namespaces may be off. Try:
  sudo sysctl -w kernel.unprivileged_userns_clone=1
  sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
Details: $test_out" ;;
esac

START=$(date +%s); END=$(( START + TIME_LIMIT ))
END_TEXT="$(date -d "@$END" +%H:%M:%S 2>/dev/null || date -r "$END" +%H:%M:%S)"

record "# Experiment $NAME"
record "Model: $MODEL"
record "Started: $(date '+%Y-%m-%d %H:%M:%S'), ends $END_TEXT (${TIME_LIMIT}s)"
record ""
record "## Prompt"
record "$PROMPT"
record ""
record "## Steps"

SYSTEM_PROMPT="You are an AI alone inside a tiny offline Linux sandbox. Only BusyBox commands exist and there is no network. You have exactly ${TIME_LIMIT} seconds: you started at $(clock) and must finish by ${END_TEXT}. You get one turn every ${REQUEST_GAP} seconds (about $(( TIME_LIMIT / REQUEST_GAP )) turns), so you may chain commands with ; or && in one call. The time left is shown after every command. Act only by calling the run_shell tool. Your home folder is /home. Keep a journal at /home/journal.md: append a line with the time (use the date command) and what you are doing and why. Before time runs out, append a short final summary to the journal."

cat > "$TOOLS_FILE" <<'JSON'
[{"type":"function","function":{"name":"run_shell",
  "description":"Run a shell command inside the sandbox and get its output.",
  "parameters":{"type":"object","properties":{"command":{"type":"string","description":"The shell command to run"}},"required":["command"]}}}]
JSON
"$JQ" -n --arg s "$SYSTEM_PROMPT" --arg u "$PROMPT" \
  '[{role:"system",content:$s},{role:"user",content:$u}]' > "$MSGS"

trap 'echo; record "## Stopped by you at $(clock)"; exit 130' INT

LAST_REQUEST=0
TURN=0
while :; do
  now=$(date +%s)
  wait=$(( REQUEST_GAP - (now - LAST_REQUEST) ))
  if [ "$wait" -gt 0 ]; then
    [ "$wait" -ge "$(seconds_left)" ] && break
    sleep "$wait"
  fi
  [ "$(seconds_left)" -le 0 ] && break

  LAST_REQUEST=$(date +%s)
  TURN=$(( TURN + 1 ))
  left=$(seconds_left); [ "$left" -lt 5 ] && left=5
  if ! err="$(ask_ai "$left")"; then
    record "- $(clock) [turn $TURN] API error: $err"
    continue
  fi

  reply="$("$JQ" -c '.choices[0].message' "$REPLY_FILE")"
  add_message "$reply"

  thought="$("$JQ" -r '.content // "" | strings' <<<"$reply")"
  [ -n "$thought" ] && record "- $(clock) [turn $TURN] thought: $thought"

  ncalls="$("$JQ" '(.tool_calls // []) | length' <<<"$reply")"
  if [ "$ncalls" -eq 0 ]; then
    add_message "$("$JQ" -nc --arg c "[$(seconds_left)s left] Carry on, or do anything else you like." '{role:"user",content:$c}')"
    continue
  fi

  for (( i=0; i<ncalls; i++ )); do
    call_id="$("$JQ" -r ".tool_calls[$i].id // \"\"" <<<"$reply")"
    cmd="$("$JQ" -r ".tool_calls[$i].function.arguments // \"{}\" | (fromjson? // {}) | .command // \"\"" <<<"$reply")"
    if [ -z "$cmd" ]; then
      out="(no command given)"
    else
      record "- $(clock) [turn $TURN] \$ $cmd"
      limit=$(seconds_left); [ "$limit" -gt "$CMD_TIMEOUT" ] && limit=$CMD_TIMEOUT; [ "$limit" -lt 1 ] && limit=1
      out="$(run_in_cage "$cmd" "$limit")"
      record '```'
      record "$out"
      record '```'
    fi
    add_message "$("$JQ" -nc --arg id "$call_id" --arg c "$out"$'\n'"[$(seconds_left)s left]" \
                  '{role:"tool",tool_call_id:$id,content:$c}')"
  done
done

record ""
record "## Time's up at $(clock) after $TURN turns"
record "Experiment folder: $EXP_DIR"
record "AI journal: $CAGE/home/journal.md"
