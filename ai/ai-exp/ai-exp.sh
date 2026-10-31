#!/usr/bin/env bash
# AI sandbox experiment.
# Run an AI inside an offline BusyBox cage for a fixed time and log what it does.
# Usage: ./ai-exp.sh --help
# Settings live in lib/config.sh.

set -u

AI_EXP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=lib/config.sh
source "$AI_EXP_ROOT/lib/config.sh"
# shellcheck source=lib/util.sh
source "$AI_EXP_ROOT/lib/util.sh"
# shellcheck source=lib/log.sh
source "$AI_EXP_ROOT/lib/log.sh"
# shellcheck source=lib/cage.sh
source "$AI_EXP_ROOT/lib/cage.sh"
# shellcheck source=lib/api.sh
source "$AI_EXP_ROOT/lib/api.sh"
# shellcheck source=lib/session.sh
source "$AI_EXP_ROOT/lib/session.sh"

main() {
  parse_args "$@"
  validate_config
  require_host_tools
  init_cage_tz
  load_api_key
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
