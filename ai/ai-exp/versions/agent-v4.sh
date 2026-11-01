#!/usr/bin/env bash
# agent v4: two companions, each in its OWN cage (own files, processes and
# hostname), never told about each other. Two hidden links join the cages:
# a shared folder at /srv and a shared localhost (one network namespace, lo
# only). Turns alternate on one clock; REQUEST_GAP may be fractional (4.35 s,
# so each person gets a turn about every 8.7 s). SOLO=1 and --continue as v3.
set -u

SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
AI_EXP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

AGENT_LABEL="agent-v4"
ENABLE_CONTINUE=1
ENABLE_END_SESSION="${ENABLE_END_SESSION:-0}"   # opt-in via env
ENABLE_SEARCH="${ENABLE_SEARCH:-0}"             # opt-in via env
TIME_LIMIT="${TIME_LIMIT:-300}"
REQUEST_GAP="${REQUEST_GAP:-4.35}"              # seconds, up to 3 decimals
FRACTIONAL_GAP=1

# shellcheck source=../module/main.sh
source "$AI_EXP_ROOT/module/main.sh"
# v3 modules, with separate-cages.sh in place of shared-cage.sh.
# shellcheck source=../module/separate-cages.sh
source "$AI_EXP_ROOT/module/separate-cages.sh"
# shellcheck source=../module/companion.sh
source "$AI_EXP_ROOT/module/companion.sh"
# shellcheck source=../module/timeline.sh
source "$AI_EXP_ROOT/module/timeline.sh"
# shellcheck source=../module/discovery.sh
source "$AI_EXP_ROOT/module/discovery.sh"
# shellcheck source=../module/discovery-links.sh
source "$AI_EXP_ROOT/module/discovery-links.sh"
# shellcheck source=../module/turns.sh
source "$AI_EXP_ROOT/module/turns.sh"

run_multi "$@"
