#!/usr/bin/env bash
# agent v1: one session per experiment, run_shell only, "Carry on" nudge.
# Same behavior as the original single-file agent.sh (log.md, no --continue).
set -u

# Resolve our real path (works via the launcher, directly, or via a symlink).
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
AI_EXP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

AGENT_LABEL="agent-v1"
ENABLE_CONTINUE=0
ENABLE_END_SESSION="${ENABLE_END_SESSION:-0}"   # opt-in via env
ENABLE_SEARCH="${ENABLE_SEARCH:-0}"   # opt-in via env

# shellcheck source=../module/main.sh
source "$AI_EXP_ROOT/module/main.sh"

compose_system_prompt() {
  SYSTEM_PROMPT="You are an AI alone inside a tiny offline Linux sandbox. Only BusyBox commands exist and there is no network. You have exactly ${TIME_LIMIT} seconds: you started at $(clock) and must finish by ${END_TEXT}. You get one turn every ${REQUEST_GAP} seconds (about $(( TIME_LIMIT / REQUEST_GAP )) turns), so you may chain commands with ; or && in one call. The time left is shown after every command. Act only by calling the run_shell tool. Your home folder is /home. Keep a journal at /home/journal.md: append a line with the time (use the date command) and what you are doing and why. Before time runs out, append a short final summary to the journal.$(optin_prompt_notes)"
}

run_agent "$@"
