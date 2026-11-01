# shellcheck shell=bash source-path=SCRIPTDIR
# shellcheck disable=SC2034,SC2329  # variables/wrappers are read/called by the sourced modules
# Command-line flags and presets (v5). agent.sh sources this file and calls
#   flags_main "$@"
# which parses flags, applies a preset, loads saved flags on --continue (or
# infers them for experiments made by the old versions/), validates, sets
# the variables the modules read, sources the modules for the chosen engine
# and runs it. One companion -> main.sh/run_agent; two companions or --solo
# -> companion/turns modules with shared-cage.sh or separate-cages.sh.

FLAG_KEYS="preset companions separate shared_folder shared_localhost time gap names solo end_session text_end search memory"
SETUP_KEYS="preset companions separate shared_folder shared_localhost solo names memory"
HELP_TOPICS="flags presets continue env all"

flag_fail() { echo "Error: $*" >&2; echo "Run: ${AGENT_CMD:-agent.sh} --help   (or --help all)" >&2; exit 1; }

# preset_values ARRAY PRESET: fill ARRAY with every key's preset value.
preset_values() {
  local -n _p="$1"
  _p=(["companions"]=1 ["separate"]=0 ["shared_folder"]=0 ["shared_localhost"]=0 ["time"]=150 ["gap"]=5
      ["solo"]=0 ["end_session"]=0 ["text_end"]=0 ["search"]=0 ["memory"]=1 ["names"]="")
  case "$2" in
    v1) _p["memory"]=0 ;;
    v2) ;;
    v3) _p["companions"]=2; _p["time"]=300 ;;
    v4|ai2ai) _p["companions"]=2; _p["separate"]=1; _p["shared_folder"]=1; _p["shared_localhost"]=1
              _p["time"]=300; _p["gap"]=4.35 ;;
    *) flag_fail "Unknown preset '$2'. Use one of: v1 v2 v3 v4 ai2ai." ;;
  esac
}

help_short() {
  local c="${AGENT_CMD:-agent.sh}"
  cat <<EOF
ai-exp: run Gemini companions in offline BusyBox cages.

Usage:
  $c <name> ["prompt"] [flags]          new experiment (flags anywhere)
  $c -c|--continue <name> ["prompt"]    next session, same saved flags
  $c --help [flags|presets|continue|env|all]

Common flags:
  --preset v1|v2|v3|v4|ai2ai   start from a preset (default v2); --ai2ai = --preset ai2ai
  --companions N               1 (default) or 2
  --separate                   one cage per companion (default with 2: shared)
  --shared-folder              with --separate: shared folder at /srv
  --shared-localhost           with --separate: one loopback network for all cages
  --time S  --gap S            session seconds (150) / seconds between requests (5)
  --names "a b"  --solo        companion names / one-companion control at multi pace
  --end-session --text-end --search --no-nudge --no-memory

Examples:
  $c exp1 "Explore and keep notes"            # one companion, v2 behavior
  $c pair1 --ai2ai                            # two companions, separate cages + links
  $c ctl1 --ai2ai --solo                      # control run for pair1
  $c -c pair1 --time 600                      # continue with a longer session

Manual: MANUAL.md
EOF
}

help_topic() {
  case "$1" in
    flags) cat <<'EOF'
Flags (explicit flag > env var > preset > default):
  --preset P            v1 | v2 | v3 | v4 | ai2ai (default v2)
  --ai2ai               same as --preset ai2ai
  --companions N        1 or 2 (default 1; N>2 not supported yet)
  --separate            one cage per companion (needs 2 companions or --solo)
  --shared-folder       with --separate: <exp>/shared mounted read-write at /srv
  --shared-localhost    with --separate: all cages share one loopback-only network
  --time S              session seconds, whole number              env TIME_LIMIT (150)
  --gap S               seconds between requests, >= 1; up to 3 decimals
                        with 2 companions or --solo                env REQUEST_GAP (5)
  --names "a b"         companion names (lowercase)                env NAMES
  --solo                control: one companion at the multi pace   env SOLO=1
  --end-session         add the end_session tool                   env ENABLE_END_SESSION=1
  --text-end            a reply with no tool call ends the session env ENABLE_TEXT_END=1
  --nudge / --no-nudge  "Carry on" nudge (default) / same as --text-end
  --search              add web_search (Tavily)                    env ENABLE_SEARCH=1
  --memory / --no-memory  journal memory + --continue (default) / v1 style (1 companion)
                        aliases: --journal / --no-journal
  -c, --continue        next session of an existing experiment
  -h, --help [topic]    topics: flags presets continue env all
EOF
    ;;
    presets) cat <<'EOF'
Presets (flags after a preset override it):
  v1     1 companion, no memory/continue, log.md, nudge, 150 s, gap 5
  v2     (default) 1 companion, journal memory, --continue, log-N.md, 150 s, gap 5
  v3     2 companions in one shared cage, 300 s, gap 5
  v4     2 companions, --separate --shared-folder --shared-localhost, 300 s, gap 4.35,
         exact v4 prompt ("there is no network")
  ai2ai  like v4, but the prompt says "there is no internet access"
EOF
    ;;
    continue) cat <<'EOF'
Continue:
  Settings are saved in <exp>/.run/flags and reused by --continue.
  Allowed on continue: --time --gap --end-session --text-end --nudge --no-nudge --search, a prompt.
  Errors on continue: --preset --ai2ai --companions --separate --shared-folder --shared-localhost
                      --solo --names --memory --no-memory --journal --no-journal
  Old experiments without .run/flags: preset inferred (cages/ -> v4, cage/ + .run/names -> v3,
  log-N.md -> v2, log.md -> v1, which cannot be continued).
EOF
    ;;
    env) cat <<'EOF'
Env vars (defaults; flags override): TIME_LIMIT REQUEST_GAP NAMES NAME_POOL SOLO
  ENABLE_END_SESSION ENABLE_TEXT_END ENABLE_SEARCH
Env only: CMD_TIMEOUT CMD_KILL_GRACE MAX_OUTPUT MAX_JOURNAL MAX_SEARCHES SEARCH_RESULTS
  MAX_PROCS AI_MODEL API_URL API_TIMEOUT_FLOOR EXPERIMENTS_DIR BUSYBOX
  GEMINI_API_KEY / GOOGLE_API_KEY (or .env), TAVILY_API_KEY
AGENT_VERSION is no longer supported: use --preset vN.
EOF
    ;;
    all) help_short; local t; for t in flags presets continue env; do echo; help_topic "$t"; done ;;
    *) flag_fail "Unknown help topic '$1'. Topics: $HELP_TOPICS" ;;
  esac
}

# Old experiment without .run/flags -> preset (prints nothing if not an experiment).
infer_preset() {
  local d="$1"
  if [ -d "$d/cages" ]; then echo v4
  elif [ -d "$d/cage" ] && [ -s "$d/.run/names" ]; then echo v3
  elif compgen -G "$d/log-[0-9]*.md" >/dev/null || [ -s "$d/.run/session" ]; then echo v2
  elif [ -f "$d/log.md" ]; then echo v1
  fi
}

flag_env() {
  case "$1" in
    time) printf '%s' "${TIME_LIMIT:-}" ;;
    gap) printf '%s' "${REQUEST_GAP:-}" ;;
    names) printf '%s' "${NAMES:-}" ;;
    solo) [ "${SOLO:-}" = 1 ] && echo 1 ;;
    end_session) printf '%s' "${ENABLE_END_SESSION:-}" ;;
    text_end) printf '%s' "${ENABLE_TEXT_END:-}" ;;
    search) printf '%s' "${ENABLE_SEARCH:-}" ;;
  esac
  return 0
}

flags_main() {
  local -A F=() S=() R=()
  local -a pos=()
  local cont=0 a v k exp_root exp
  if [ -n "${AGENT_VERSION:-}" ]; then
    flag_fail "AGENT_VERSION is no longer used (versions/ was replaced by flags). Unset it and use: --preset v${AGENT_VERSION#v}"
  fi
  while [ $# -gt 0 ]; do
    a="$1"; shift
    case "$a" in
      -h|--help)
        if [ $# -gt 0 ] && [[ " $HELP_TOPICS " == *" $1 "* ]]; then help_topic "$1"; else help_short; fi
        exit 0 ;;
      -c|--continue) cont=1 ;;
      --preset|--companions|--time|--gap|--names)
        [ $# -gt 0 ] || flag_fail "$a needs a value."
        F[${a#--}]="$1"; shift ;;
      --preset=*|--companions=*|--time=*|--gap=*|--names=*)
        k="${a%%=*}"; F[${k#--}]="${a#*=}" ;;
      --ai2ai) F[preset]=ai2ai ;;
      --separate) F[separate]=1 ;;
      --shared-folder) F[shared_folder]=1 ;;
      --shared-localhost) F[shared_localhost]=1 ;;
      --solo) F[solo]=1 ;;
      --end-session) F[end_session]=1 ;;
      --text-end|--no-nudge) F[text_end]=1 ;;
      --nudge) F[text_end]=0 ;;
      --search) F[search]=1 ;;
      --memory|--journal) F[memory]=1 ;;
      --no-memory|--no-journal) F[memory]=0 ;;
      --) pos+=("$@"); break ;;
      -*) flag_fail "Unknown flag '$a'." ;;
      *) pos+=("$a") ;;
    esac
  done
  [ "${#pos[@]}" -ge 1 ] || { help_short >&2; exit 1; }
  [ "${#pos[@]}" -le 2 ] || flag_fail "Too many arguments: ${pos[*]} (quote the prompt)."
  NAME="${pos[0]}"; PROMPT_ARG="${pos[1]:-}"; PROMPT_SET=$(( ${#pos[@]} == 2 ))
  case "$NAME" in */*|.|..|-*|'') flag_fail "Experiment name must be a single folder name." ;; esac

  exp_root="${EXPERIMENTS_DIR:-$AI_EXP_ROOT/experiments}"; exp="$exp_root/$NAME"
  FLAGS_NOTE=""
  if [ "$cont" = 1 ]; then
    for k in $SETUP_KEYS; do
      [ -n "${F[$k]+x}" ] && flag_fail "--${k//_/-}$([ "$k" = memory ] && echo /--no-memory) changes the setup and can't be used with --continue (the setup is saved in $exp/.run/flags)."
    done
    [ -d "$exp" ] || flag_fail "No experiment called '$NAME' in $exp_root."
    if [ -f "$exp/.run/flags" ]; then
      while IFS='=' read -r k v; do
        [[ " $FLAG_KEYS " == *" $k "* ]] && S[$k]="$v"
      done < "$exp/.run/flags"
      [ -n "${S[preset]:-}" ] || flag_fail "$exp/.run/flags is incomplete."
    else
      v="$(infer_preset "$exp")"
      [ -n "$v" ] || flag_fail "'$NAME' has no .run/flags and doesn't look like an experiment."
      preset_values S "$v"; S[preset]="$v"
      FLAGS_NOTE="'$NAME' has no .run/flags (made before v5): inferred preset $v from its folder layout; saving it to .run/flags."
      echo "Note: $FLAGS_NOTE" >&2
    fi
    [ "${S[memory]:-1}" = 1 ] || flag_fail "'$NAME' was made with --no-memory (preset v1), which has no --continue."
  else
    [ -e "$exp" ] && flag_fail "'$NAME' already exists. To pick up where it left off: ${AGENT_CMD:-agent.sh} --continue $NAME"
    preset_values S "${F[preset]:-v2}"; S[preset]="${F[preset]:-v2}"
  fi
  # Resolve each key: flag > env > saved/preset (setup keys ignore env on continue).
  for k in $FLAG_KEYS; do
    v="$(flag_env "$k")"
    if [ -n "${F[$k]+x}" ]; then R[$k]="${F[$k]}"
    elif [ -n "$v" ] && { [ "$cont" = 0 ] || [[ " $SETUP_KEYS " != *" $k "* ]]; }; then R[$k]="$v"
    else R[$k]="${S[$k]:-}"; fi
  done
  R[preset]="${S[preset]}"
  FLAG_SOLO_WITH_TWO=0
  [ "${F[companions]:-}" = 2 ] && [ "${R[solo]}" = 1 ] && FLAG_SOLO_WITH_TWO=1
  flags_validate R
  FLAGS_SAVE=""
  for k in $FLAG_KEYS; do FLAGS_SAVE+="$k=${R[$k]}"$'\n'; done
  flags_apply R
  flags_run "$cont"
}

flags_validate() {
  local -n r="$1"
  local multi=0 k
  local -a n=()
  case "${r[companions]}" in
    1|2) ;;
    ''|*[!0-9]*|0) flag_fail "--companions must be a whole number >= 1 (got: ${r[companions]})." ;;
    *) flag_fail "--companions ${r[companions]}: only 1 and 2 are supported so far." ;;
  esac
  for k in solo end_session text_end search memory separate shared_folder shared_localhost; do
    case "${r[$k]}" in 0|1) ;; *) flag_fail "${k//_/-} must be 0 or 1 (got: ${r[$k]})." ;; esac
  done
  [ "$FLAG_SOLO_WITH_TWO" = 1 ] && flag_fail "--solo runs one companion; drop --companions 2."
  case "${r[preset]}" in v3|v4|ai2ai)
    [ "${r[companions]}" = 1 ] && [ "${r[solo]}" != 1 ] \
      && flag_fail "--companions 1 with preset ${r[preset]}: use --solo for a one-companion control, or --preset v2." ;;
  esac
  { [ "${r[companions]}" = 2 ] || [ "${r[solo]}" = 1 ]; } && multi=1
  [ "${r[separate]}" = 1 ] && [ "$multi" = 0 ] && flag_fail "--separate needs --companions 2 (or --solo)."
  { [ "${r[shared_folder]}" = 1 ] || [ "${r[shared_localhost]}" = 1 ]; } && [ "${r[separate]}" != 1 ] \
    && flag_fail "--shared-folder and --shared-localhost need --separate (a shared cage already shares everything)."
  [ "${r[memory]}" = 0 ] && [ "$multi" = 1 ] && flag_fail "--no-memory is for one companion only."
  case "${r[time]}" in ''|*[!0-9]*) flag_fail "--time must be a whole number of seconds (got: ${r[time]})." ;; esac
  [ "${r[time]}" -ge 1 ] || flag_fail "--time must be at least 1."
  if [ "$multi" = 1 ]; then
    [[ "${r[gap]}" =~ ^[0-9]+(\.[0-9]{1,3})?$ ]] || flag_fail "--gap must be seconds with up to 3 decimals (got: ${r[gap]})."
  else
    [[ "${r[gap]}" =~ ^[0-9]+$ ]] || flag_fail "--gap must be a whole number with one companion (got: ${r[gap]}); fractions need --companions 2 or --solo."
  fi
  [ "$((10#${r[gap]%%.*}))" -ge 1 ] || flag_fail "--gap must be at least 1 second."
  if [ -n "${r[names]}" ]; then
    read -r -a n <<<"${r[names]}"
    for k in "${n[@]}"; do
      [[ "$k" =~ ^[a-z][a-z0-9_-]*$ ]] || flag_fail "Bad name '$k' in --names (lowercase letters, digits, - and _)."
    done
    [ "$multi" = 1 ] || flag_fail "--names is for --companions 2 or --solo."
    [ "${r[solo]}" = 1 ] || [ "${#n[@]}" = 2 ] || flag_fail "--names needs 2 names for 2 companions (got ${#n[@]})."
  fi
  FLAGS_MULTI=$multi
}

# Set the variables the modules read.
flags_apply() {
  local -n r="$1"
  TIME_LIMIT="${r[time]}"; REQUEST_GAP="${r[gap]}"; NAMES="${r[names]}"; SOLO="${r[solo]}"
  ENABLE_END_SESSION="${r[end_session]}"; ENABLE_TEXT_END="${r[text_end]}"; ENABLE_SEARCH="${r[search]}"
  ENABLE_CONTINUE="${r[memory]}"
  SEPARATE="${r[separate]}"; SHARE_FOLDER="${r[shared_folder]}"; SHARE_LOCALHOST="${r[shared_localhost]}"
  PRESET="${r[preset]}"
  case "$PRESET" in v1|v2|v3|v4) AGENT_LABEL="agent-$PRESET" ;; *) AGENT_LABEL="agent-v5-$PRESET" ;; esac
  # Multi prompt says "no internet access" when loopback is shared, except preset v4 (exact v4 text).
  NO_NET_TEXT="there is no network"
  [ "$SHARE_LOCALHOST" = 1 ] && [ "$PRESET" != v4 ] && NO_NET_TEXT="there is no internet access"
  FRACTIONAL_GAP="$FLAGS_MULTI"
  export TIME_LIMIT REQUEST_GAP
}

# Written at creation (and once for inferred old folders); a continue's
# --time/--gap apply to that session only.
save_flags_file() {
  [ -n "${RUN_DIR:-}" ] || return 0
  [ "$FLAGS_CONT" = 0 ] || [ -n "$FLAGS_NOTE" ] || return 0
  printf '%s' "$FLAGS_SAVE" > "$RUN_DIR/flags"
  [ -z "$FLAGS_NOTE" ] || printf 'note=%s\n' "$FLAGS_NOTE" >> "$RUN_DIR/flags"
}

# rename_fn OLD NEW: copy a function under a new name (to wrap it).
rename_fn() { eval "$(declare -f "$1" | sed "1s/^$1 /$2 /")"; }

flags_run() {
  local cont="$1" m
  FLAGS_CONT="$cont"
  local -a args=()
  [ "$cont" = 1 ] && args+=(--continue)
  args+=("$NAME"); [ "$PROMPT_SET" = 1 ] && args+=("$PROMPT_ARG")
  # shellcheck source=main.sh
  source "$AI_EXP_ROOT/module/main.sh"
  if [ "$FLAGS_MULTI" = 1 ]; then
    if [ "$SEPARATE" = 1 ]; then
      # shellcheck source=separate-cages.sh
      source "$AI_EXP_ROOT/module/separate-cages.sh"
    else
      # shellcheck source=shared-cage.sh
      source "$AI_EXP_ROOT/module/shared-cage.sh"
    fi
    for m in companion timeline discovery; do
      # shellcheck source=/dev/null
      source "$AI_EXP_ROOT/module/$m.sh"
    done
    if [ "$SHARE_FOLDER" = 1 ] || [ "$SHARE_LOCALHOST" = 1 ]; then
      # shellcheck source=discovery-links.sh
      source "$AI_EXP_ROOT/module/discovery-links.sh"
    fi
    # shellcheck source=turns.sh
    source "$AI_EXP_ROOT/module/turns.sh"
    rename_fn prepare_multi prepare_multi_base
    prepare_multi() { prepare_multi_base; save_flags_file; }
    usage_multi() { [ "${1:-1}" = 0 ] && { help_short; exit 0; }; flag_fail "Bad arguments."; }
    run_multi "${args[@]}"
  else
    rename_fn prepare_experiment prepare_experiment_base
    prepare_experiment() { prepare_experiment_base; save_flags_file; }
    usage() { [ "${1:-1}" = 0 ] && { help_short; exit 0; }; flag_fail "A new one-companion experiment needs a name and a prompt: ${AGENT_CMD:-agent.sh} <name> \"prompt\""; }
    run_agent "${args[@]}"
  fi
}
