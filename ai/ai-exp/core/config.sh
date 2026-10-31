# Tunable settings for ai-exp.sh. This is the only place defaults live.
# Export the same name before running the tool to override a default
# (AI_MODEL and API_URL included). Empty values fall back to the default.

# Seconds for the whole session.
TIME_LIMIT="${TIME_LIMIT:-150}"

# Minimum seconds between API request starts.
# The Gemini free tier is 15 requests/minute; 5s stays near 12/minute.
REQUEST_GAP="${REQUEST_GAP:-5}"

# Seconds before one sandbox command is killed.
CMD_TIMEOUT="${CMD_TIMEOUT:-15}"

# After CMD_TIMEOUT the command gets SIGTERM, then SIGKILL this many seconds later.
CMD_KILL_GRACE="${CMD_KILL_GRACE:-2}"

# Characters of command output sent back to the AI.
MAX_OUTPUT="${MAX_OUTPUT:-4000}"

# web_search calls allowed per session (Tavily free plan is ~1000 credits/month).
MAX_SEARCHES="${MAX_SEARCHES:-10}"

# Results asked from Tavily per web_search.
SEARCH_RESULTS="${SEARCH_RESULTS:-5}"

# Newest characters of journal.md fed back on --continue.
MAX_JOURNAL="${MAX_JOURNAL:-8000}"

# Chat model. Override with AI_MODEL.
MODEL="${AI_MODEL:-gemini-3.1-flash-lite}"

# OpenAI-compatible chat completions endpoint. Override with API_URL.
API_URL="${API_URL:-https://generativelanguage.googleapis.com/v1beta/openai/chat/completions}"

# Curl --max-time is at least this long, so a turn can finish near the deadline.
API_TIMEOUT_FLOOR="${API_TIMEOUT_FLOOR:-5}"

# Where experiment folders are created. Relative paths are from the current
# directory. The default sits next to this tool and is gitignored.
EXPERIMENTS_DIR="${EXPERIMENTS_DIR:-$AI_EXP_ROOT/experiments}"

validate_config() {
  local name val
  for name in TIME_LIMIT REQUEST_GAP CMD_TIMEOUT MAX_OUTPUT MAX_JOURNAL API_TIMEOUT_FLOOR MAX_SEARCHES SEARCH_RESULTS; do
    val="${!name}"
    case "$val" in
      ''|*[!0-9]*) fail "$name must be a positive whole number (got: ${val:-empty})" ;;
    esac
    [ "$val" -ge 1 ] || fail "$name must be at least 1"
  done
  case "$CMD_KILL_GRACE" in
    ''|*[!0-9]*) fail "CMD_KILL_GRACE must be a whole number (got: ${CMD_KILL_GRACE:-empty})" ;;
  esac
  [ -n "$MODEL" ] || fail "AI_MODEL is empty"
  [ -n "$API_URL" ] || fail "API_URL is empty"
  [ -n "$EXPERIMENTS_DIR" ] || fail "EXPERIMENTS_DIR is empty"
}
