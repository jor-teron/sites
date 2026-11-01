# shellcheck shell=bash
# Logs for v3: each companion's own log-<name>-N.md (record/note), the merged
# timeline-N.md shown on the console (tl), and the raw event list for discovery.

# ---------- logs ----------

# In v3, record writes only to the current person's log; the console shows the timeline.
record() { printf '%s\n' "$*" >> "$LOG"; }
note() { record "- $(clock) [turn $TURN] $*"; }
tl() { printf '%s\n' "$*" | tee -a "$TIMELINE"; }

event() {   # epoch, user, kind(cmd|out), base64 text
  printf '%s\t%s\t%s\t%s\n' "$(date +%s)" "$1" "$2" "$(printf '%s' "$3" | base64 -w0)" >> "$EVENTS"
}

