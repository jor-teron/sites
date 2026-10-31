# Experiment folders, --continue, the system prompt, and the turn loop.

usage() {
  local code="${1:-1}"
  cat <<EOF
AI sandbox experiment

Run an AI inside an offline BusyBox cage. It can run shell commands, keep
a journal, and stop early. Everything it does is written to a markdown log.

Usage:
  $0 <experiment-name> "<prompt>"
  $0 --continue <experiment-name> ["<prompt>"]
  $0 -c <experiment-name> ["<prompt>"]

The experiment is created at:
  $EXPERIMENTS_DIR/<experiment-name>/
--continue keeps that cage as it was left. Without a prompt, the last
prompt is used again. The AI's only memory of earlier sessions is the
newest part of cage/home/journal.md.

The AI calls run_shell to act and end_session when it has written its
final journal summary. A reply with no tool call also ends the run.

API key (first one found wins):
  1. GEMINI_API_KEY or GOOGLE_API_KEY in the environment
  2. A .env file next to this script:  GEMINI_API_KEY=your_key
  3. A hidden prompt, when this is run from a terminal

Needs: bash, curl, jq, a static busybox, unshare, chroot
Settings: $AI_EXP_ROOT/core/config.sh
EOF
  exit "$code"
}

parse_args() {
  CONTINUE=0
  case "${1:-}" in
    -h|--help) usage 0 ;;
    "") usage 1 ;;
    --continue|-c)
      CONTINUE=1
      shift
      [ $# -ge 1 ] && [ $# -le 2 ] || usage 1
      NAME="$1"
      PROMPT="${2:-}"
      ;;
    *)
      [ $# -eq 2 ] || usage 1
      NAME="$1"
      PROMPT="$2"
      ;;
  esac
  [ -n "$NAME" ] || usage 1
  case "$NAME" in
    */*|..|.) fail "Experiment name must be a single folder name, not a path." ;;
  esac
}

prepare_experiment() {
  local last
  mkdir -p "$EXPERIMENTS_DIR" || fail "Can't create $EXPERIMENTS_DIR"
  EXP_DIR="$EXPERIMENTS_DIR/$NAME"
  CAGE="$EXP_DIR/cage"
  RUN_DIR="$EXP_DIR/.run"
  TOOLS_FILE="$RUN_DIR/tools.json"
  REPLY_FILE="$RUN_DIR/reply.json"

  if [ "$CONTINUE" -eq 0 ]; then
    if [ -e "$EXP_DIR" ]; then
      fail "'$NAME' already exists. To pick up where it left off, run:
  $0 --continue $NAME"
    fi
    mkdir -p "$RUN_DIR" || fail "Can't create $EXP_DIR"
    build_cage
    SESSION=1
  else
    [ -d "$CAGE" ] || fail "No experiment called '$NAME' here (looked for $CAGE)."
    if [ -z "$PROMPT" ]; then
      [ -f "$RUN_DIR/prompt.txt" ] && PROMPT="$(cat "$RUN_DIR/prompt.txt")"
      [ -n "$PROMPT" ] || fail "No saved prompt for '$NAME'. Give one: $0 --continue $NAME \"your prompt\""
    fi
    mkdir -p "$RUN_DIR" "$CAGE/proc" "$CAGE/home" "$CAGE/tmp"
    last="$(cat "$RUN_DIR/session" 2>/dev/null || true)"
    last="${last//[[:space:]]/}"
    if [ -z "$last" ]; then
      # Experiments created by the older single-file script have logs but
      # no session counter. Count the log files. There is no upper limit.
      last="$(ls "$EXP_DIR"/log*.md 2>/dev/null | wc -l)"
      last="${last//[[:space:]]/}"
    fi
    case "$last" in
      ''|*[!0-9]*) last=0 ;;
    esac
    SESSION=$(( 10#$last + 1 ))
  fi
  echo "$SESSION" > "$RUN_DIR/session"
  printf '%s' "$PROMPT" > "$RUN_DIR/prompt.txt"
  LOG="$EXP_DIR/log-$SESSION.md"
  MSGS="$RUN_DIR/messages-$SESSION.json"
}

compose_system_prompt() {
  local turns
  turns=$(( TIME_LIMIT / REQUEST_GAP ))
  SYSTEM_PROMPT="You are an AI alone inside a tiny offline Linux sandbox. Only BusyBox commands exist and there is no network. You have exactly ${TIME_LIMIT} seconds: you started at $(clock) and must finish by ${END_TEXT}. You get one turn every ${REQUEST_GAP} seconds (about ${turns} turns), so you may chain commands with ; or && in one call. The time left is shown after every command.

Your home folder is /home. Keep a journal at /home/journal.md: append a line with the time (use the date command) and what you are doing and why. The journal is your only memory between sessions: anything not written there will be forgotten. Before you stop, append a short final summary to the journal.

Act by calling tools. run_shell runs a command in the sandbox. end_session stops this run immediately; call it once the final journal summary is written, and pass a short reason. A reply that does not call a tool also ends the session, so do not send plain text if you still want another turn."
}

attach_journal_memory() {
  local journal_file="$CAGE/home/journal.md" journal bytes
  if [ -f "$journal_file" ]; then
    bytes="$(wc -c < "$journal_file")"
    bytes="${bytes//[[:space:]]/}"
  else
    bytes=0
  fi
  if [ -s "$journal_file" ]; then
    journal="$(tail -c "$MAX_JOURNAL" "$journal_file")"
    if [ "$bytes" -gt "$MAX_JOURNAL" ]; then
      journal="...(older entries cut)
$journal"
    fi
  else
    journal="(your journal is empty or missing)"
  fi
  SYSTEM_PROMPT="$SYSTEM_PROMPT

This is session $SESSION. You have been here before. All files you left in the sandbox are still there, but you remember nothing except what you wrote in your journal. Here is /home/journal.md as you left it:
----- journal start -----
$journal
----- journal end -----
Start this session with a new heading in the journal, like: ## Session $SESSION"
  record "Continuing from session $(( SESSION - 1 )), journal given back: ${bytes} bytes"
  record ""
}

build_conversation() {
  compose_system_prompt
  if [ "$SESSION" -gt 1 ]; then
    attach_journal_memory
  fi
  write_tools_file
  "$JQ" -n --arg s "$SYSTEM_PROMPT" --arg u "$PROMPT" \
    '[{role:"system",content:$s},{role:"user",content:$u}]' > "$MSGS" \
    || fail "Could not write $MSGS"
}

# Run one tool call from an assistant message. Sets END_KIND=ai when
# end_session is called; the caller stops the loop immediately after that.
dispatch_tool() {
  local reply="$1" i="$2" call_id name cmd out reason limit
  call_id="$(tool_id "$reply" "$i")"
  name="$(tool_name "$reply" "$i")"
  case "$name" in
    run_shell)
      cmd="$(tool_arg "$reply" "$i" command)"
      if [ -z "$cmd" ]; then
        out="(no command given)"
      else
        note "\$ $cmd"
        limit="$(seconds_left)"
        [ "$limit" -gt "$CMD_TIMEOUT" ] && limit="$CMD_TIMEOUT"
        [ "$limit" -lt 1 ] && limit=1
        out="$(run_in_cage "$cmd" "$limit")"
        record '```'
        record "$out"
        record '```'
      fi
      tool_message "$call_id" "$out"
      ;;
    end_session)
      reason="$(one_line "$(tool_arg "$reply" "$i" reason)")"
      [ -n "$reason" ] || reason="(no reason given)"
      note "end_session: $reason"
      tool_message "$call_id" "Session ended."
      END_KIND=ai
      END_REASON="$reason"
      ;;
    *)
      [ -n "$name" ] || name="(unnamed)"
      note "unknown tool: $name"
      tool_message "$call_id" "(unknown tool: $name)"
      ;;
  esac
}

# A reply with no tool call ends the session. The old script injected a
# "Carry on" user message to keep the model busy; that padded runs, so a
# tool-less reply is treated as the model finishing. Plain text is stored
# as the ending reason. end_session is the explicit stop and is logged
# separately. Anything still running when the clock hits zero is "time's up".
run_loop() {
  local now wait left reply thought ncalls i err
  trap 'echo; record "## Stopped by you at $(clock)"; exit 130' INT
  LAST_REQUEST=0
  TURN=0
  END_KIND=time
  END_REASON=""

  while :; do
    now="$(date +%s)"
    wait=$(( REQUEST_GAP - (now - LAST_REQUEST) ))
    if [ "$wait" -gt 0 ]; then
      [ "$wait" -ge "$(seconds_left)" ] && break
      sleep "$wait"
    fi
    [ "$(seconds_left)" -le 0 ] && break

    LAST_REQUEST="$(date +%s)"
    TURN=$(( TURN + 1 ))
    left="$(seconds_left)"
    [ "$left" -lt "$API_TIMEOUT_FLOOR" ] && left="$API_TIMEOUT_FLOOR"
    if ! err="$(ask_ai "$left")"; then
      note "API error: $err"
      continue
    fi

    if ! reply="$("$JQ" -ce '.choices[0].message' "$REPLY_FILE" 2>/dev/null)"; then
      note "API error: response had no message"
      continue
    fi
    add_message "$reply"

    thought="$("$JQ" -r '.content // "" | strings' <<<"$reply")"
    [ -n "$thought" ] && note "thought: $thought"

    ncalls="$("$JQ" '(.tool_calls // []) | length' <<<"$reply")"
    case "$ncalls" in
      ''|*[!0-9]*) ncalls=0 ;;
    esac
    if [ "$ncalls" -eq 0 ]; then
      END_KIND=text
      END_REASON="$(one_line "$thought")"
      [ -n "$END_REASON" ] || END_REASON="(no tool call)"
      break
    fi

    for (( i=0; i<ncalls; i++ )); do
      dispatch_tool "$reply" "$i"
      [ "$END_KIND" = ai ] && break
    done
    [ "$END_KIND" = ai ] && break
  done
}
