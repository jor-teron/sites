#!/usr/bin/env bash
# agent v3: two companions in ONE shared cage, never told about each other.
# Turns alternate on one clock (each person every 2*REQUEST_GAP s).
# SOLO=1 runs one person as a control. --continue/-c <name> like v2.
set -u

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
AI_EXP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

AGENT_LABEL="agent-v3"
ENABLE_CONTINUE=1
ENABLE_END_SESSION="${ENABLE_END_SESSION:-0}"   # opt-in via env
ENABLE_SEARCH="${ENABLE_SEARCH:-0}"             # opt-in via env
TIME_LIMIT="${TIME_LIMIT:-300}"                 # v3 default: discovery needs time

# shellcheck source=../module/main.sh
source "$AI_EXP_ROOT/module/main.sh"
# v3 modules. A v4 with separate cages swaps only shared-cage.sh.
# shellcheck source=../module/shared-cage.sh
source "$AI_EXP_ROOT/module/shared-cage.sh"
# shellcheck source=../module/companion.sh
source "$AI_EXP_ROOT/module/companion.sh"
# shellcheck source=../module/timeline.sh
source "$AI_EXP_ROOT/module/timeline.sh"
# shellcheck source=../module/discovery.sh
source "$AI_EXP_ROOT/module/discovery.sh"
# shellcheck source=../module/turns.sh
source "$AI_EXP_ROOT/module/turns.sh"

run_multi "$@"
