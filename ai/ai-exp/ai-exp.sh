#!/usr/bin/env bash
# AI sandbox experiment.
# Run an AI inside an offline BusyBox cage for a fixed time and log what it does.
# Usage: ./ai-exp.sh --help
# Settings live in core/config.sh.

set -u

AI_EXP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=core/config.sh
source "$AI_EXP_ROOT/core/config.sh"
# shellcheck source=core/util.sh
source "$AI_EXP_ROOT/core/util.sh"
# shellcheck source=core/log.sh
source "$AI_EXP_ROOT/core/log.sh"
# shellcheck source=core/cage.sh
source "$AI_EXP_ROOT/core/cage.sh"
# shellcheck source=core/api.sh
source "$AI_EXP_ROOT/core/api.sh"
# shellcheck source=core/search.sh
source "$AI_EXP_ROOT/core/search.sh"
# shellcheck source=core/session.sh
source "$AI_EXP_ROOT/core/session.sh"

main() {
  parse_args "$@"
  validate_config
  require_host_tools
  init_cage_tz
  load_api_key
  load_tavily_key
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

main "$@"
