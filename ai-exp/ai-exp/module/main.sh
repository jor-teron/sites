# Loads every module and provides run_agent (one companion). module/flags.sh
# sources this, overrides what it needs, then calls: run_agent "$@"

# shellcheck source=config.sh
source "$AI_EXP_ROOT/module/config.sh"
# shellcheck source=util.sh
source "$AI_EXP_ROOT/module/util.sh"
# shellcheck source=log.sh
source "$AI_EXP_ROOT/module/log.sh"
# shellcheck source=cage.sh
source "$AI_EXP_ROOT/module/cage.sh"
# shellcheck source=api.sh
source "$AI_EXP_ROOT/module/api.sh"
# shellcheck source=search.sh
source "$AI_EXP_ROOT/module/search.sh"
# shellcheck source=session.sh
source "$AI_EXP_ROOT/module/session.sh"

run_agent() {
  parse_args "$@"
  validate_config
  require_host_tools
  init_cage_tz
  load_api_key
  if [ "$ENABLE_SEARCH" = 1 ]; then load_tavily_key; else TAVILY_KEY=""; fi
  prepare_experiment
  verify_cage
  START="$(date +%s)"
  END="$(( START + TIME_LIMIT ))"
  END_TEXT="$(date -d "@$END" '+%H:%M:%S' 2>/dev/null || date -r "$END" '+%H:%M:%S')"
  start_log
  build_conversation
  run_loop
  finish_log
}
