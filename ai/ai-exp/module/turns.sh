# shellcheck shell=bash
# Turns for v3: one global clock (a request every REQUEST_GAP s), alternating
# companions with a random first speaker, each at most every 2*REQUEST_GAP s.
# SOLO runs one companion at the same pace. If one ends early the other goes on.
# Also holds run_multi, the v3 entry point that ties the modules together.

SOLO="${SOLO:-0}"             # 1 = control run with one person only

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
