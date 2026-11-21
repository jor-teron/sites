# shellcheck shell=bash
# Model and provider selection (v6.1). Sourced by flags.sh (before the other
# modules, so --models list and flag checks work early). Two providers, both
# speak the OpenAI chat-completions format:
#   gemini     GEMINI_API_KEY / GOOGLE_API_KEY, URL API_URL (config.sh), gap = the preset gap
#   deepinfra  DEEPINFRA_API_KEY, URL DEEPINFRA_API_URL, gap DEEPINFRA_GAP (default 2 s)

# alias|provider|full model id
PROVIDER_MODELS=(
  "llama|deepinfra|meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo"
  "nemo|deepinfra|mistralai/Mistral-Nemo-Instruct-2407"
  "g31|gemini|gemini-3.1-flash-lite"
  "g35|gemini|gemini-3.5-flash-lite"
)
DEFAULT_MODEL_ALIAS="g35"

DEEPINFRA_API_URL="${DEEPINFRA_API_URL:-https://api.deepinfra.com/v1/openai/chat/completions}"
# Seconds between requests when every companion uses DeepInfra and --gap/REQUEST_GAP is not given.
DEEPINFRA_GAP="${DEEPINFRA_GAP:-2}"

# Filled by flags_apply: one entry per companion, in order (index = companion).
MODEL_IDS=(); MODEL_PROVS=()

models_list() {
  local row a p id
  printf '%-7s %-10s %s\n' ALIAS PROVIDER "MODEL ID"
  for row in "${PROVIDER_MODELS[@]}"; do
    IFS='|' read -r a p id <<<"$row"
    printf '%-7s %-10s %s%s\n' "$a" "$p" "$id" "$([ "$a" = "$DEFAULT_MODEL_ALIAS" ] && echo '   (default)')"
  done
  echo
  echo "Use --model X (everyone) or --models A,B (one per companion, in order)."
  echo "Full model IDs work too. Keys: GEMINI_API_KEY for Gemini, DEEPINFRA_API_KEY for DeepInfra."
}

# resolve_model WORD [lenient]: sets RM_ID and RM_PROV; returns 1 if unknown.
# lenient (env AI_MODEL only): an unknown name is passed to Gemini as is.
resolve_model() {
  local w="${1,,}" row a p id
  for row in "${PROVIDER_MODELS[@]}"; do
    IFS='|' read -r a p id <<<"$row"
    if [ "$w" = "$a" ] || [ "$w" = "${id,,}" ]; then RM_ID="$id"; RM_PROV="$p"; return 0; fi
  done
  if [ "${2:-}" = lenient ] && [ -n "$1" ]; then RM_ID="$1"; RM_PROV=gemini; return 0; fi
  return 1
}

# Distinct providers in use, one per line.
used_providers() { printf '%s\n' "${MODEL_PROVS[@]}" | awk '!seen[$0]++'; }

# Load a key for every provider actually used. Missing ones are reported together.
load_provider_keys() {
  local p msg="" prompted
  GEMINI_KEY=""; DEEPINFRA_KEY=""
  for p in $(used_providers); do
    case "$p" in
      gemini)
        GEMINI_KEY="${GEMINI_API_KEY:-${GOOGLE_API_KEY:-}}"
        [ -n "$GEMINI_KEY" ] || GEMINI_KEY="$(env_value GEMINI_API_KEY)"
        [ -n "$GEMINI_KEY" ] || GEMINI_KEY="$(env_value GOOGLE_API_KEY)"
        if [ -z "$GEMINI_KEY" ] && [ -t 0 ]; then
          read -r -s -p "Gemini API key (input hidden): " GEMINI_KEY; echo
        fi
        [ -n "$GEMINI_KEY" ] || msg+=$'\n'"  Gemini: set GEMINI_API_KEY (or GOOGLE_API_KEY), or put it in .env next to the script."
        ;;
      deepinfra)
        DEEPINFRA_KEY="${DEEPINFRA_API_KEY:-}"
        [ -n "$DEEPINFRA_KEY" ] || DEEPINFRA_KEY="$(env_value DEEPINFRA_API_KEY)"
        if [ -z "$DEEPINFRA_KEY" ] && [ -t 0 ]; then
          read -r -s -p "DeepInfra API key (input hidden): " DEEPINFRA_KEY; echo
        fi
        [ -n "$DEEPINFRA_KEY" ] || msg+=$'\n'"  DeepInfra: set DEEPINFRA_API_KEY, or put it in .env next to the script."
        ;;
    esac
  done
  prompted="$(used_providers | tr '\n' ' ')"
  [ -z "$msg" ] || fail "No API key found for: ${prompted% }.$msg"
}

# Point MODEL, PROVIDER, API_KEY and CALL_URL at companion $1 (0-based).
provider_activate() {
  local i="${1:-0}"
  MODEL="${MODEL_IDS[$i]}"; PROVIDER="${MODEL_PROVS[$i]}"
  case "$PROVIDER" in
    deepinfra) API_KEY="$DEEPINFRA_KEY"; CALL_URL="$DEEPINFRA_API_URL" ;;
    *)         API_KEY="$GEMINI_KEY";    CALL_URL="$API_URL" ;;
  esac
}

# Header text for timeline/summary: "Model: X" when everyone uses the same model,
# otherwise "Models: maya=X, leo=Y". Needs USERS.
models_header() {
  local k out="" same=1
  for k in "${!MODEL_IDS[@]}"; do [ "${MODEL_IDS[$k]}" = "${MODEL_IDS[0]}" ] || same=0; done
  if [ "$same" = 1 ]; then printf 'Model: %s' "${MODEL_IDS[0]}"; return; fi
  for k in "${!MODEL_IDS[@]}"; do out+="${out:+, }${USERS[$k]:-$k}=${MODEL_IDS[$k]}"; done
  printf 'Models: %s' "$out"
}

# ---------- request and reply conversion ----------

# Request body for the current MODEL/PROVIDER (reads $MSGS and $TOOLS_FILE).
# Gemini: the stored messages as they are. DeepInfra: stored messages reduced
# to the plain OpenAI fields, so nothing provider-specific is sent back.
build_request() {
  case "$PROVIDER" in
    deepinfra)
      "$JQ" -c --arg model "$MODEL" --slurpfile tools "$TOOLS_FILE" '
        {model: $model, tools: $tools[0], messages: map(
          {role, content: (.content // "")}
          + (if .tool_call_id then {tool_call_id} else {} end)
          + (if (.tool_calls // []) | length > 0 then {tool_calls} else {} end))}' "$MSGS" ;;
    *)
      "$JQ" -c --arg model "$MODEL" --slurpfile tools "$TOOLS_FILE" \
        '{model: $model, messages: ., tools: $tools[0]}' "$MSGS" ;;
  esac
}

# The assistant message from $REPLY_FILE, ready to store. Fails if there is none.
# Gemini: as returned. DeepInfra: cleaned up to role/content/tool_calls with
# string arguments and an id on every call (some models omit or vary them).
reply_message() {
  case "$PROVIDER" in
    deepinfra)
      "$JQ" -ce --arg salt "$RANDOM" '
        .choices[0].message
        | {role: "assistant", content: (.content // "")}
        + (if (.tool_calls // []) | length > 0 then
            {tool_calls: [ .tool_calls | to_entries[] | .key as $i | .value | {
               id: (if (.id // "") != "" then .id else "call_\($salt)_\($i)" end),
               type: "function",
               function: {name: (.function.name // ""),
                          arguments: ((.function.arguments // "{}")
                                      | if type == "string" then (if . == "" then "{}" else . end) else tojson end)}} ]}
           else {} end)' "$REPLY_FILE" ;;
    *) "$JQ" -ce '.choices[0].message' "$REPLY_FILE" ;;
  esac
}
