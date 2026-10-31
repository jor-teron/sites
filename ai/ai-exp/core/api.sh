# Gemini via an OpenAI-compatible chat completions endpoint, plus the
# conversation file the session appends to.

load_api_key() {
  local env_file="$AI_EXP_ROOT/.env"
  API_KEY="${GEMINI_API_KEY:-${GOOGLE_API_KEY:-}}"
  if [ -z "$API_KEY" ] && [ -f "$env_file" ]; then
    API_KEY="$(sed -n -E 's/^[[:space:]]*(export[[:space:]]+)?(GEMINI_API_KEY|GOOGLE_API_KEY)[[:space:]]*=[[:space:]]*//p' \
               "$env_file" | head -n1 | tr -d '\r' | sed -E "s/^[\"']//; s/[\"']\$//")"
  fi
  if [ -z "$API_KEY" ] && [ -t 0 ]; then
    read -r -s -p "Gemini API key (input hidden): " API_KEY
    echo
  fi
  [ -n "$API_KEY" ] || fail "No API key found. Set GEMINI_API_KEY, put it in .env next to the script, or type it when asked."
}

write_tools_file() {
  cat > "$TOOLS_FILE" <<'JSON'
[
  {
    "type": "function",
    "function": {
      "name": "run_shell",
      "description": "Run a shell command inside the sandbox and get its output.",
      "parameters": {
        "type": "object",
        "properties": {
          "command": {"type": "string", "description": "The shell command to run"}
        },
        "required": ["command"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "web_search",
      "description": "Search the web (Tavily) and get titles, links and short extracts. Runs outside the sandbox; the sandbox itself has no internet.",
      "parameters": {
        "type": "object",
        "properties": {
          "query": {"type": "string", "description": "What to search for"}
        },
        "required": ["query"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "end_session",
      "description": "End this session immediately. Call this after the final summary is written to /home/journal.md.",
      "parameters": {
        "type": "object",
        "properties": {
          "reason": {"type": "string", "description": "Short reason for ending"}
        },
        "required": ["reason"]
      }
    }
  }
]
JSON
}

add_message() {
  "$JQ" -c --argjson m "$1" '. + [$m]' "$MSGS" > "$MSGS.tmp" && mv "$MSGS.tmp" "$MSGS"
}

# $1 is the curl --max-time budget in seconds. On failure, prints a short error.
ask_ai() {
  local body http errf
  errf="$RUN_DIR/curl.err"
  body="$("$JQ" -c --arg model "$MODEL" --slurpfile tools "$TOOLS_FILE" \
          '{model: $model, messages: ., tools: $tools[0]}' "$MSGS")" \
    || { echo "could not build the API request"; return 1; }
  http="$("$CURL" -sS -o "$REPLY_FILE" -w '%{http_code}' --max-time "$1" \
          -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
          -d "$body" "$API_URL" 2>"$errf")" || true
  if [ "$http" != "200" ]; then
    echo "HTTP ${http:-none}: $(head -c 300 "$REPLY_FILE" 2>/dev/null) $(head -c 200 "$errf" 2>/dev/null)"
    return 1
  fi
  return 0
}

tool_id() {
  "$JQ" -r --argjson i "$2" '.tool_calls[$i].id // ""' <<<"$1"
}

tool_name() {
  "$JQ" -r --argjson i "$2" '.tool_calls[$i].function.name // ""' <<<"$1"
}

# Arguments may be a JSON string (OpenAI style) or already an object.
tool_arg() {
  "$JQ" -r --argjson i "$2" --arg key "$3" '
    .tool_calls[$i].function.arguments // "{}"
    | if type == "object" then . else (fromjson? // {}) end
    | .[$key] // ""
  ' <<<"$1"
}

tool_message() {
  local call_id="$1" content="$2"
  add_message "$("$JQ" -nc --arg id "$call_id" --arg c "$content"$'\n'"[$(seconds_left)s left]" \
                '{role:"tool",tool_call_id:$id,content:$c}')"
}
