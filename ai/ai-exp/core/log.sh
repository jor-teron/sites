# Markdown session logs. Each line of a step carries the clock time.

record() { printf '%s\n' "$*" | tee -a "$LOG"; }

note() { record "- $(clock) [turn $TURN] $*"; }

seconds_left() {
  local s=$(( END - $(date +%s) ))
  [ "$s" -lt 0 ] && s=0
  echo "$s"
}

elapsed_s() {
  local s=$(( $(date +%s) - START ))
  [ "$s" -lt 0 ] && s=0
  echo "$s"
}

start_log() {
  : > "$LOG"
  record "# Experiment $NAME, session $SESSION"
  record "Model: $MODEL"
  record "Started: $(date '+%Y-%m-%d %H:%M:%S'), ends $END_TEXT (${TIME_LIMIT}s)"
  record ""
  record "## Prompt"
  record "$PROMPT"
  record ""
  record "## Steps"
}

# END_KIND is "ai" (end_session), "text" (no tool call), or "time".
finish_log() {
  local elapsed
  elapsed="$(elapsed_s)"
  record ""
  case "$END_KIND" in
    ai)
      record "## Ended by AI at ${elapsed}s: ${END_REASON}"
      record "After $TURN turns (session $SESSION), at $(clock)."
      ;;
    text)
      record "## Ended with no tool call at ${elapsed}s: ${END_REASON}"
      record "After $TURN turns (session $SESSION), at $(clock)."
      ;;
    *)
      record "## Time's up at $(clock) after $TURN turns (session $SESSION)"
      ;;
  esac
  record "Experiment folder: $EXP_DIR"
  record "AI journal: $CAGE/home/journal.md"
  record "Continue it with: $0 --continue $NAME"
}
