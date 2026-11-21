# web_search: a Tavily search run on the host with curl. The cage stays offline.

SEARCH_COUNT=0

load_tavily_key() {
  TAVILY_KEY="${TAVILY_API_KEY:-}"
  [ -n "$TAVILY_KEY" ] || TAVILY_KEY="$(env_value TAVILY_API_KEY)"
}

# $1 is the query. Sets SEARCH_OUT to compact text for the AI, cut to MAX_OUTPUT
# characters. Not run in a subshell, so SEARCH_COUNT keeps counting.
web_search() {
  SEARCH_OUT="$(search_text "$1")"
  [ -n "$TAVILY_KEY" ] && [ "$SEARCH_COUNT" -lt "$MAX_SEARCHES" ] && SEARCH_COUNT=$(( SEARCH_COUNT + 1 )) || true
}

search_text() {
  local query="$1" body resp out
  [ -n "$TAVILY_KEY" ] || { echo "web_search unavailable: no TAVILY_API_KEY"; return 0; }
  if [ "$SEARCH_COUNT" -ge "$MAX_SEARCHES" ]; then
    echo "web_search limit reached ($MAX_SEARCHES searches this session). No more searches."
    return 0
  fi
  body="$("$JQ" -nc --arg q "$query" --argjson n "$SEARCH_RESULTS" \
          '{query: $q, max_results: $n, search_depth: "basic", include_answer: true}')"
  if ! resp="$("$CURL" -sS --fail --max-time 20 -H "Authorization: Bearer $TAVILY_KEY" \
                -H "Content-Type: application/json" -d "$body" https://api.tavily.com/search 2>&1)"; then
    echo "web_search failed: $(head -c 300 <<<"$resp")"
    return 0
  fi
  out="$("$JQ" -r '
    (if (.answer // "") != "" then "Answer: \(.answer)\n" else "" end),
    ((.results // [])[] | "- \(.title // "")\n  \(.url // "")\n  \((.content // "") | .[0:500])")
  ' <<<"$resp" 2>/dev/null)" || { echo "web_search failed: unreadable response"; return 0; }
  [ -n "$out" ] || out="(no results)"
  if [ "${#out}" -gt "$MAX_OUTPUT" ]; then
    out="${out:0:$MAX_OUTPUT}
...(output cut)"
  fi
  printf '%s\n[search %s/%s]\n' "$out" "$(( SEARCH_COUNT + 1 ))" "$MAX_SEARCHES"
}
