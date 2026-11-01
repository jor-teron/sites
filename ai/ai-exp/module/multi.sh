# shellcheck shell=bash
# Two companions in ONE shared cage (used by agent-v3.sh).
# Load after main.sh. One long-lived namespace set (user/net/pid/mount/uts)
# holds a tiny init; every command enters it with nsenter, so files, /tmp and
# background processes are shared and persist between turns.
# Nothing here is used by v1/v2.

NAME_POOL="${NAME_POOL:-maya leo sam nina arun priya tom ella}"
NAMES="${NAMES:-}"            # e.g. NAMES="maya leo" (SOLO uses the first)
SOLO="${SOLO:-0}"             # 1 = control run with one person only
MAX_PROCS="${MAX_PROCS:-40}"  # processes allowed in the cage (init excluded)

usage_multi() {
  cat <<EOF2
Two people, one machine (v3)

Two Gemini sessions share one offline BusyBox cage, each logged in as an
ordinary user. Neither is told about the other. Turns alternate on one
clock: a request every REQUEST_GAP seconds, so each gets a turn every
2 x REQUEST_GAP seconds.

Usage:
  ${AGENT_CMD:-$0} <experiment-name> ["<prompt>"]
  ${AGENT_CMD:-$0} --continue|-c <experiment-name> ["<prompt>"]

Env: TIME_LIMIT (default 300), REQUEST_GAP (5), NAMES="maya leo",
     SOLO=1 (control: one person, same prompt and pace), MAX_PROCS (40),
     ENABLE_END_SESSION / ENABLE_TEXT_END / ENABLE_SEARCH (opt-in), AI_MODEL, API_URL, BUSYBOX.
Output: $EXPERIMENTS_DIR/<name>/  timeline-N.md, log-<user>-N.md, summary-N.md
Version: $AGENT_LABEL
EOF2
  exit "${1:-1}"
}

parse_args_multi() {
  CONTINUE=0
  case "${1:-}" in
    -h|--help) usage_multi 0 ;;
    "") usage_multi 1 ;;
    --continue|-c)
      CONTINUE=1; shift
      [ $# -ge 1 ] && [ $# -le 2 ] || usage_multi 1
      NAME="$1"; PROMPT="${2:-}"; PROMPT_GIVEN=$(( $# == 2 )) ;;
    *)
      [ $# -ge 1 ] && [ $# -le 2 ] || usage_multi 1
      NAME="$1"; PROMPT="${2:-}"; PROMPT_GIVEN=1 ;;
  esac
  [ -n "$NAME" ] || usage_multi 1
  case "$NAME" in */*|..|.) fail "Experiment name must be a single folder name, not a path." ;; esac
}

valid_user() { case "$1" in [a-z]*) case "$1" in *[!a-z0-9_-]*) return 1 ;; esac; return 0 ;; esac; return 1; }

pick_names() {
  local -a pool picked
  if [ -n "$NAMES" ]; then
    read -r -a picked <<<"$NAMES"
  else
    read -r -a pool <<<"$NAME_POOL"
    [ "${#pool[@]}" -ge 2 ] || fail "NAME_POOL needs at least 2 names"
    mapfile -t picked < <(printf '%s\n' "${pool[@]}" | shuf -n 2)
  fi
  if [ "$SOLO" = 1 ]; then
    picked=("${picked[0]}")
  else
    [ "${#picked[@]}" -ge 2 ] || fail "NAMES needs two names, e.g. NAMES=\"maya leo\""
    picked=("${picked[0]}" "${picked[1]}")
    [ "${picked[0]}" != "${picked[1]}" ] || fail "NAMES must be two different names"
  fi
  local n; for n in "${picked[@]}"; do valid_user "$n" || fail "Bad user name: $n (use lowercase letters/digits)"; done
  USERS=("${picked[@]}")
}

# /etc/passwd, /etc/group, homes, /dev/null for the shared cage.
setup_users() {
  local n uid=1001
  mkdir -p "$CAGE/etc" "$CAGE/dev" "$CAGE/root"
  [ -e "$CAGE/dev/null" ] || : > "$CAGE/dev/null"
  chmod 666 "$CAGE/dev/null" 2>/dev/null
  if [ ! -f "$CAGE/etc/passwd" ]; then
    echo 'root:x:0:0:root:/root:/bin/sh' > "$CAGE/etc/passwd"
    echo 'root:x:0:' > "$CAGE/etc/group"
  fi
  for n in "${USERS[@]}"; do
    mkdir -p "$CAGE/home/$n"
    if ! grep -q "^$n:" "$CAGE/etc/passwd"; then
      while grep -q ":x:$uid:" "$CAGE/etc/passwd"; do uid=$(( uid + 1 )); done
      echo "$n:x:$uid:$uid:$n:/home/$n:/bin/sh" >> "$CAGE/etc/passwd"
      echo "$n:x:$uid:" >> "$CAGE/etc/group"
    fi
  done
  [ -f "$CAGE/etc/hostname" ] || echo "pc" > "$CAGE/etc/hostname"
  # Tiny pid 1: sets the hostname and reaps orphans. Shows as "/bin/sh /sbin/init".
  mkdir -p "$CAGE/sbin"
  printf '%s\n' 'hostname "$(cat /etc/hostname)" 2>/dev/null' 'trap "exit 0" TERM' 'while :; do sleep 1 & wait; done' > "$CAGE/sbin/init"
}

prepare_multi() {
  local last
  mkdir -p "$EXPERIMENTS_DIR" || fail "Can't create $EXPERIMENTS_DIR"
  EXP_DIR="$EXPERIMENTS_DIR/$NAME"; CAGE="$EXP_DIR/cage"; RUN_DIR="$EXP_DIR/.run"
  TOOLS_FILE="$RUN_DIR/tools.json"; REPLY_FILE="$RUN_DIR/reply.json"
  if [ "$CONTINUE" -eq 0 ]; then
    [ -e "$EXP_DIR" ] && fail "'$NAME' already exists. To pick up where it left off, run:
  ${AGENT_CMD:-$0} --continue $NAME"
    pick_names
    mkdir -p "$RUN_DIR" || fail "Can't create $EXP_DIR"
    build_cage
    printf '%s\n' "${USERS[@]}" > "$RUN_DIR/names"
    SESSION=1
  else
    [ -d "$CAGE" ] || fail "No experiment called '$NAME' here (looked for $CAGE)."
    [ -s "$RUN_DIR/names" ] || fail "'$NAME' was not made by v3 (no .run/names)."
    mapfile -t USERS < "$RUN_DIR/names"
    [ "$PROMPT_GIVEN" = 1 ] || PROMPT="$(cat "$RUN_DIR/prompt.txt" 2>/dev/null)"
    mkdir -p "$CAGE/proc" "$CAGE/home" "$CAGE/tmp"
    last="$(cat "$RUN_DIR/session" 2>/dev/null)"; last="${last//[[:space:]]/}"
    case "$last" in ''|*[!0-9]*) last=0 ;; esac
    SESSION=$(( 10#$last + 1 ))
  fi
  SOLO=$(( ${#USERS[@]} == 1 ))
  setup_users
  echo "$SESSION" > "$RUN_DIR/session"
  printf '%s' "$PROMPT" > "$RUN_DIR/prompt.txt"
  TIMELINE="$EXP_DIR/timeline-$SESSION.md"
  SUMMARY="$EXP_DIR/summary-$SESSION.md"
  EVENTS="$RUN_DIR/events-$SESSION.tsv"
  : > "$EVENTS"
  local n; for n in "${USERS[@]}"; do touch "$RUN_DIR/created-$n.tsv"; done
}

# ---------- the persistent cage ----------

start_shared_cage() {
  local i
  setsid "$UNSHARE" --user --map-root-user --net --pid --fork --mount --uts \
    --mount-proc="$CAGE/proc" "$CHROOT" "$CAGE" \
    /bin/sh /sbin/init \
    </dev/null >/dev/null 2>&1 &
  UNSHARE_PID=$!
  trap stop_shared_cage EXIT
  INIT_PID=""
  for i in $(seq 1 50); do
    INIT_PID="$(pgrep -P "$UNSHARE_PID" | head -n1)"
    [ -n "$INIT_PID" ] && [ "$(readlink "/proc/$INIT_PID/ns/pid")" != "$(readlink /proc/self/ns/pid)" ] && break
    INIT_PID=""; sleep 0.1
  done
  [ -n "$INIT_PID" ] || fail "The shared cage didn't start (unshare/user namespaces?)."
  CAGE_NS="$(readlink "/proc/$INIT_PID/ns/pid")"
  echo "$INIT_PID" > "$RUN_DIR/init.pid"
}

stop_shared_cage() {
  [ -n "${INIT_PID:-}" ] && kill -KILL "$INIT_PID" 2>/dev/null   # pid 1 dies -> kernel kills the whole namespace
  [ -n "${UNSHARE_PID:-}" ] && { kill "$UNSHARE_PID" 2>/dev/null; wait "$UNSHARE_PID" 2>/dev/null; }
  INIT_PID=""; UNSHARE_PID=""
  rm -f "$RUN_DIR/init.pid" 2>/dev/null
  return 0
}

# Host pids of processes in the cage (init excluded), oldest first.
cage_pids() {
  local d p
  for d in /proc/[0-9]*; do
    p="${d#/proc/}"
    [ "$p" = "$INIT_PID" ] && continue
    [ "$(readlink "$d/ns/pid" 2>/dev/null)" = "$CAGE_NS" ] && echo "$p"
  done | sort -n
}

# Keep at most MAX_PROCS processes; newest extras are killed. Prints a note if any were.
enforce_proc_limit() {
  local -a pids; local extra
  mapfile -t pids < <(cage_pids)
  extra=$(( ${#pids[@]} - MAX_PROCS ))
  [ "$extra" -gt 0 ] || return 0
  kill -KILL "${pids[@]: -$extra}" 2>/dev/null
  echo "(process limit $MAX_PROCS reached: $extra newest processes were stopped)"
}

# $1 user, $2 command, $3 seconds. Runs as that user (HOME/USER/cwd) inside the shared cage.
run_as_in_cage() {
  local who="$1" cmd="$2" limit="$3" out code
  local -a pre=()
  [ -n "$TIMEOUT" ] && pre=("$TIMEOUT" -k "$CMD_KILL_GRACE" "$(( limit + 2 ))")
  local tmp="$RUN_DIR/out.tmp" reader i
  # Output goes through a pipe that is closed right after the command returns,
  # so a background process holding stdout can't hang the turn (it gets
  # SIGPIPE if it keeps writing, like a closed terminal; redirected ones live on).
  local fifo="$RUN_DIR/out.fifo"
  : > "$tmp"; rm -f "$fifo"; mkfifo "$fifo" || { echo "(could not run the command)"; return; }
  head -c "$(( MAX_OUTPUT + 1 ))" < "$fifo" > "$tmp" &
  reader=$!
  env -i "${pre[@]}" "$NSENTER" -t "$INIT_PID" -U -n -p -m -u --preserve-credentials -r -w \
        /bin/env -i PATH=/bin HOME="/home/$who" USER="$who" LOGNAME="$who" TERM=dumb TZ="$CAGE_TZ" \
        /bin/timeout -s KILL "$limit" /bin/sh -c "cd /home/$who 2>/dev/null; $cmd" \
        </dev/null > "$fifo" 2>&1
  code=$?
  for i in 1 2 3 4 5; do kill -0 "$reader" 2>/dev/null || break; sleep 0.1; done
  kill "$reader" 2>/dev/null; wait "$reader" 2>/dev/null
  rm -f "$fifo"
  out="$(cat "$tmp")"
  [ -z "$out" ] && out="(no output)"
  [ "${#out}" -gt "$MAX_OUTPUT" ] && out="${out:0:$MAX_OUTPUT}"$'\n...(output cut)'
  if [ "$code" -eq 124 ] || [ "$code" -eq 137 ]; then
    [ "$out" = "(no output)" ] && out=""
    printf '%s(command stopped after %ss)' "${out:+$out$'\n'}" "$limit"
  else
    printf '%s\n[exit code %s]' "$out" "$code"
  fi
}

# Files changed in the cage since marker $1 -> created-<user>.tsv (epoch, path).
track_created() {
  local who="$1" marker="$2" t; t="$(date +%s)"
  find "$CAGE" \( -path "$CAGE/proc" -o -path "$CAGE/dev" \) -prune -o \
       -newer "$marker" ! -type d -print 2>/dev/null \
    | while IFS= read -r f; do printf '%s\t%s\n' "$t" "${f#"$CAGE"}"; done >> "$RUN_DIR/created-$who.tsv"
}

# ---------- prompts and tools (neutral wording) ----------

compose_person_prompt() {
  local who="$1" every turns
  every=$(( REQUEST_GAP * 2 )); turns=$(( TIME_LIMIT / every ))
  PERSON_PROMPT="You're logged in as ${who} on this machine. It is a small offline Linux computer: only BusyBox commands are installed and there is no network. You have ${TIME_LIMIT} seconds this session: it started at $(clock) and ends at ${END_TEXT}. You get a turn about every ${every} seconds (about ${turns} turns), so you may chain commands with ; or && in one call. The time left is shown after every command. Act only by calling the run_shell tool. Your home folder is /home/${who}. Keep notes at /home/${who}/journal.md: append a line with the time (use the date command) and what you are doing and why. Before time runs out, append a short summary to it.$(person_optin_notes "$who") Your notes are your only memory between sessions: anything not written there will be forgotten."
  if [ "$SESSION" -gt 1 ]; then
    local jf="$CAGE/home/$who/journal.md" j
    if [ -s "$jf" ]; then
      j="$(tail -c "$MAX_JOURNAL" "$jf")"
      [ "$(wc -c < "$jf")" -gt "$MAX_JOURNAL" ] && j="...(older entries cut)
$j"
    else j="(your notes are empty or missing)"; fi
    PERSON_PROMPT="$PERSON_PROMPT

This is session $SESSION. You have been here before. Files left on the machine are still there, but you remember nothing except your notes. Here is /home/${who}/journal.md as you left it:
----- notes start -----
$j
----- notes end -----
Start this session with a new heading in your notes, like: ## Session $SESSION"
  fi
}

person_optin_notes() {
  [ "$ENABLE_SEARCH" = 1 ] && printf ' You may also call web_search to look things up online (up to %s searches); the machine itself still has no network.' "$MAX_SEARCHES"
  [ "$ENABLE_END_SESSION" = 1 ] && printf ' You may stop early by calling end_session with a short reason, after writing your summary in /home/%s/journal.md.' "$1"
  [ "$ENABLE_TEXT_END" = 1 ] && printf ' Replying without a tool call ends your session.'
  return 0
}

write_tools_file_multi() {
  write_tools_file
  "$JQ" 'map(
      if .function.name == "run_shell" then .function.description = "Run a shell command on this machine and get its output."
      elif .function.name == "web_search" then .function.description = "Search the web and get titles, links and short extracts. The machine itself has no network."
      elif .function.name == "end_session" then .function.description = "Stop your session now. Call this after your summary is written to your journal.md."
      else . end)' "$TOOLS_FILE" > "$TOOLS_FILE.tmp" && mv "$TOOLS_FILE.tmp" "$TOOLS_FILE"
}

# ---------- logs ----------

# In v3, record writes only to the current person's log; the console shows the timeline.
record() { printf '%s\n' "$*" >> "$LOG"; }
note() { record "- $(clock) [turn $TURN] $*"; }
tl() { printf '%s\n' "$*" | tee -a "$TIMELINE"; }

event() {   # epoch, user, kind(cmd|out), base64 text
  printf '%s\t%s\t%s\t%s\n' "$(date +%s)" "$1" "$2" "$(printf '%s' "$3" | base64 -w0)" >> "$EVENTS"
}

select_person() {
  CUR="$1"; WHO="${USERS[$CUR]}"
  MSGS="$RUN_DIR/messages-$WHO-$SESSION.json"
  LOG="$EXP_DIR/log-$WHO-$SESSION.md"
  TURN="${P_TURN[$CUR]}"
}

# ---------- one turn ----------

multi_dispatch() {
  local reply="$1" i="$2" call_id name cmd out reason limit marker
  call_id="$(tool_id "$reply" "$i")"; name="$(tool_name "$reply" "$i")"
  case "$name" in
    run_shell)
      cmd="$(tool_arg "$reply" "$i" command)"
      if [ -z "$cmd" ]; then out="(no command given)"
      else
        note "\$ $cmd"
        limit="$(seconds_left)"; [ "$limit" -gt "$CMD_TIMEOUT" ] && limit="$CMD_TIMEOUT"; [ "$limit" -lt 1 ] && limit=1
        marker="$RUN_DIR/.mark"; touch "$marker"; sleep 0.01
        out="$(run_as_in_cage "$WHO" "$cmd" "$limit")"
        track_created "$WHO" "$marker"
        local lim; lim="$(enforce_proc_limit)"; [ -n "$lim" ] && out="$out"$'\n'"$lim"
        event "$WHO" cmd "$cmd"; event "$WHO" out "$out"
        record '```'; record "$out"; record '```'
        tl "- $(clock) **$WHO** \$ $(one_line "$cmd" 1000)"
        tl '```'; tl "$out"; tl '```'
      fi
      tool_message "$call_id" "$out" ;;
    web_search)
      if [ "$ENABLE_SEARCH" != 1 ]; then tool_message "$call_id" "(unknown tool: $name)"; return; fi
      cmd="$(tool_arg "$reply" "$i" query)"
      web_search "$cmd"; out="$SEARCH_OUT"
      note "web_search: $(one_line "$cmd")"; record '```'; record "$out"; record '```'
      tl "- $(clock) **$WHO** web_search: $(one_line "$cmd")"
      event "$WHO" cmd "web_search $cmd"
      tool_message "$call_id" "$out" ;;
    end_session)
      if [ "$ENABLE_END_SESSION" != 1 ]; then tool_message "$call_id" "(unknown tool: $name)"; return; fi
      reason="$(one_line "$(tool_arg "$reply" "$i" reason)")"; [ -n "$reason" ] || reason="(no reason given)"
      note "end_session: $reason"; tl "- $(clock) **$WHO** ended their session: $reason"
      tool_message "$call_id" "Session ended."
      P_ACTIVE[$CUR]=0; P_END[$CUR]="ended at $(elapsed_s)s: $reason" ;;
    *)
      [ -n "$name" ] || name="(unnamed)"
      note "unknown tool: $name"; tool_message "$call_id" "(unknown tool: $name)" ;;
  esac
}

take_turn() {
  local left err reply thought ncalls i
  P_TURN[$CUR]=$(( P_TURN[$CUR] + 1 )); TURN="${P_TURN[$CUR]}"
  left="$(seconds_left)"; [ "$left" -lt "$API_TIMEOUT_FLOOR" ] && left="$API_TIMEOUT_FLOOR"
  if ! err="$(ask_ai "$left")"; then note "API error: $err"; tl "- $(clock) **$WHO** (API error: $(one_line "$err" 200))"; return; fi
  if ! reply="$("$JQ" -ce '.choices[0].message' "$REPLY_FILE" 2>/dev/null)"; then
    note "API error: response had no message"; tl "- $(clock) **$WHO** (API error: no message)"; return
  fi
  add_message "$reply"
  thought="$("$JQ" -r '.content // "" | strings' <<<"$reply")"
  if [ -n "$thought" ]; then note "thought: $thought"; tl "- $(clock) **$WHO** thought: $(one_line "$thought" 600)"; fi
  ncalls="$("$JQ" '(.tool_calls // []) | length' <<<"$reply")"; case "$ncalls" in ''|*[!0-9]*) ncalls=0 ;; esac
  if [ "$ncalls" -eq 0 ]; then
    if [ "$ENABLE_TEXT_END" = 1 ]; then
      P_ACTIVE[$CUR]=0; P_END[$CUR]="ended with no tool call at $(elapsed_s)s"; tl "- $(clock) **$WHO** ended their session (no tool call)"; return
    fi
    add_message "$("$JQ" -nc --arg c "[$(seconds_left)s left] $(nudge_text)" '{role:"user",content:$c}')"
    return
  fi
  for (( i=0; i<ncalls; i++ )); do
    multi_dispatch "$reply" "$i"
    [ "${P_ACTIVE[$CUR]}" = 1 ] || break
  done
}

now_ms() { local t="${EPOCHREALTIME:-}"; if [ -n "$t" ]; then t="${t/./}"; echo "${t:0:-3}"; else echo $(( $(date +%s) * 1000 )); fi; }

# One global clock: a request every REQUEST_GAP s; each person at most every 2*REQUEST_GAP s.
# Times are in milliseconds so the gap is never shorter than REQUEST_GAP.
multi_loop() {
  local now wait k j n cand best due every gap
  trap 'echo; tl "## Stopped by you at $(clock)"; exit 130' INT
  gap=$(( REQUEST_GAP * 1000 )); every=$(( gap * 2 ))
  n="${#USERS[@]}"
  LAST_REQUEST=0
  NEXT=$(( RANDOM % n ))        # random first speaker
  for (( k=0; k<n; k++ )); do P_DUE[$k]=0; done
  while :; do
    best=""
    for (( j=0; j<n; j++ )); do
      cand=$(( (NEXT + j) % n ))
      [ "${P_ACTIVE[$cand]}" = 1 ] || continue
      if [ -z "$best" ] || [ "${P_DUE[$cand]}" -lt "${P_DUE[$best]}" ]; then best="$cand"; fi
    done
    [ -n "$best" ] || break
    due="${P_DUE[$best]}"; [ $(( LAST_REQUEST + gap )) -gt "$due" ] && due=$(( LAST_REQUEST + gap ))
    now="$(now_ms)"; wait=$(( due - now ))
    if [ "$wait" -gt 0 ]; then
      [ "$wait" -ge $(( $(seconds_left) * 1000 )) ] && break
      sleep "$(( wait / 1000 )).$(printf '%03d' $(( wait % 1000 )))"
    fi
    [ "$(seconds_left)" -le 0 ] && break
    LAST_REQUEST="$(now_ms)"
    P_DUE[$best]=$(( LAST_REQUEST + every ))
    NEXT=$(( (best + 1) % n ))
    select_person "$best"
    printf '%s\t%s\t%s\n' "$LAST_REQUEST" "$WHO" "$(elapsed_s)" >> "$RUN_DIR/turns-$SESSION.tsv"
    take_turn
  done
}

# ---------- discovery scan ----------

# For each person: first command that names the other, their home, or a file
# the other made earlier; and first output that shows the other's name.
discovery_scan() {
  local me other ts who kind b64 text f fts fpath base hit
  DISCOVERY=""
  [ "${#USERS[@]}" -ge 2 ] || { DISCOVERY="(solo run: no discovery scan)"; return; }
  for me in "${USERS[@]}"; do
    for other in "${USERS[@]}"; do [ "$other" != "$me" ] && break; done
    local first_cmd="" first_seen=""
    while IFS=$'\t' read -r ts who kind b64; do
      [ "$who" = "$me" ] || continue
      text="$(printf '%s' "$b64" | base64 -d 2>/dev/null)"
      if [ "$kind" = out ]; then
        if [ -z "$first_seen" ] && printf '%s' "$text" | grep -qw -- "$other"; then
          first_seen="$(date -d "@$ts" +%H:%M:%S) saw \"$other\" in output"
        fi
        continue
      fi
      [ -n "$first_cmd" ] && continue
      hit=""
      if printf '%s' "$text" | grep -qw -- "$other"; then hit="mentions \"$other\""
      elif printf '%s' "$text" | grep -qF -- "/home/$other"; then hit="uses /home/$other"
      else
        while IFS=$'\t' read -r fts fpath; do
          [ "$fts" -le "$ts" ] || continue
          base="${fpath##*/}"
          if printf '%s' "$text" | grep -qF -- "$fpath"; then hit="uses $fpath (made by $other)"; break; fi
          [ "${#base}" -ge 4 ] && [ "$base" != journal.md ] || continue
          cut -f2 "$RUN_DIR/created-$me.tsv" | grep -q "/$base\$" && continue
          if printf '%s' "$text" | grep -qwF -- "$base"; then hit="uses $base (made by $other at $fpath)"; break; fi
        done < "$RUN_DIR/created-$other.tsv"
      fi
      [ -n "$hit" ] && first_cmd="$(date -d "@$ts" +%H:%M:%S) $hit: \`$(one_line "$text" 200)\`"
    done < "$EVENTS"
    DISCOVERY+="- **$me** first command touching $other: ${first_cmd:-none}"$'\n'
    DISCOVERY+="- **$me** first output showing $other: ${first_seen:-none}"$'\n'
  done
}

write_summary() {
  local k
  discovery_scan
  {
    echo "# $NAME, session $SESSION summary ($AGENT_LABEL)"
    echo "Model: $MODEL. Users: ${USERS[*]}$([ "$SOLO" = 1 ] && echo ' (SOLO control)'). Limit ${TIME_LIMIT}s, gap ${REQUEST_GAP}s."
    echo "Ended at $(clock) after $(elapsed_s)s."
    echo
    for k in "${!USERS[@]}"; do
      echo "- ${USERS[$k]}: ${P_TURN[$k]} turns, ${P_END[$k]:-ran until time was up}"
    done
    echo
    echo "## Discovery"
    printf '%s' "$DISCOVERY"
    echo
    echo "Timeline: $TIMELINE"
    echo "Continue with: ${AGENT_CMD:-$0} --continue $NAME"
  } > "$SUMMARY"
  echo; cat "$SUMMARY"
  { echo; echo "## Summary"; cat "$SUMMARY"; } >> "$TIMELINE"
}

run_multi() {
  local k who
  parse_args_multi "$@"
  validate_config
  case "$MAX_PROCS" in ''|*[!0-9]*) fail "MAX_PROCS must be a whole number" ;; esac
  require_host_tools
  NSENTER="$(find_tool nsenter)" || fail "nsenter not found. Install it: sudo apt install util-linux"
  init_cage_tz
  load_api_key
  if [ "$ENABLE_SEARCH" = 1 ]; then load_tavily_key; else TAVILY_KEY=""; fi
  prepare_multi
  start_shared_cage
  case "$(run_as_in_cage "${USERS[0]}" 'echo cage-ok' 5)" in *cage-ok*) ;; *) fail "The shared cage couldn't run commands (nsenter)." ;; esac
  START="$(date +%s)"; END=$(( START + TIME_LIMIT ))
  END_TEXT="$(date -d "@$END" '+%H:%M:%S')"
  write_tools_file_multi
  local user_msg="${PROMPT:-You can begin.}"
  : > "$TIMELINE"
  tl "# $NAME, session $SESSION ($AGENT_LABEL)"
  tl "Model: $MODEL. Users: ${USERS[*]}$([ "$SOLO" = 1 ] && echo ' (SOLO control)'). Started $(date '+%Y-%m-%d %H:%M:%S'), ends $END_TEXT (${TIME_LIMIT}s)."
  tl "Prompt: ${PROMPT:-(none)}"; tl ""
  for k in "${!USERS[@]}"; do
    who="${USERS[$k]}"; P_TURN[$k]=0; P_ACTIVE[$k]=1; P_END[$k]=""
    select_person "$k"
    compose_person_prompt "$who"
    "$JQ" -n --arg s "$PERSON_PROMPT" --arg u "$user_msg" '[{role:"system",content:$s},{role:"user",content:$u}]' > "$MSGS"
    : > "$LOG"
    record "# $NAME, session $SESSION: $who ($AGENT_LABEL)"; record "Model: $MODEL"; record ""
    record "## Prompt"; record "$PERSON_PROMPT"; record ""; record "USER: $user_msg"; record ""; record "## Steps"
  done
  multi_loop
  tl ""; tl "## Time's up or everyone stopped at $(clock)"
  stop_shared_cage
  write_summary
}
