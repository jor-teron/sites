#!/usr/bin/env bash
# ai-exp launcher (v5). Flags and presets choose the setup:
#   ./agent.sh <name> ["prompt"] [flags]      ./agent.sh --help [all]
# See MANUAL.md. (versions/ and AGENT_VERSION were replaced by --preset.)
set -u
AI_EXP_ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
# shellcheck disable=SC2034  # read by util.sh (.env lookup)
SCRIPT_DIR="$AI_EXP_ROOT"
export AGENT_CMD="$0"
# shellcheck source=module/flags.sh
source "$AI_EXP_ROOT/module/flags.sh"
flags_main "$@"
