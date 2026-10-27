# Harness

Browser AI agent harness, fully in browser JS (no build, no server of its own). Talks to a local **Ollama** over HTTP.

## Files
- `index.html` — redirect to `harness.html`
- `harness.html` — page shell (top bar, chat, steps pane, settings dialog)
- `ui/main.css` — theme variables (`html[data-ht]`), layout; `ui/components.css` — buttons, bubbles, Thinking box, error cards, dialog, notice cards; `ui/steps.css` — steps pane
- `app/core/messages.js` — `HR.msgs`: history (memory + sessionStorage `harness.history`), `toApi()`, `splitThink()`
- `app/models/ollama.js` — `HR.ollama`: `tags()`, streaming `chat()` (NDJSON, AbortController), `tps()`
- `app/gui/settings.js` — `HR.set`: `harness.settings` {theme, baseUrl, model, think}, theme apply, Settings dialog
- `app/gui/model.js` — `HR.model`: model picker from `/api/tags`
- `app/gui/steps.js` — `HR.steps`: one row per model call, tap to expand request / response summary
- `app/gui/chat.js` — `HR.chat`: bubbles, send / Stop, Thinking box, stats, error cards
- `app/main.js` — `HR.notify` (Hub cards, local fallback) + boot
- `harness_icon.png`

## Ollama setup
Ollama only answers browser pages whose origin is in `OLLAMA_ORIGINS`. Example: `OLLAMA_ORIGINS="https://jor-teron.github.io" ollama serve` (the error card shows the exact origin and commands for macOS / Linux service / Windows). Base URL default `http://localhost:11434` (Settings). An https page can reach `http://localhost` but not a LAN IP over plain http.

## Releases
- **HR1** — Chat skeleton: dark theme default, System (follows Hub via `shared/theme/hub_theme.js`) / Light / Dark; model picker from `<baseUrl>/api/tags` (base URL saved); streaming replies via `/api/chat` with Stop; `<think>…</think>` and Ollama's `thinking` field in a folded Thinking box (Auto / On / Off `think` flag); tokens/sec (live estimate while streaming, Ollama's eval stats at the end); Steps pane, one row per model call (tap → request / response summary); error card when Ollama is unreachable explaining `OLLAMA_ORIGINS`; history in sessionStorage; Hub notice cards (reply ready while hidden, errors). Phone one column with steps as a bottom sheet; side-by-side from 960px.

## Roadmap
- **HR1** — Chat skeleton with Ollama streaming, Thinking box, steps pane (done)
- **HR2** — Agent loop: Ollama tool calling, tool registry, each tool call / result as a step, max-steps and Stop
- **HR3** — Folder tools via File System Access: pick a folder, list / read / search / write files (write needs approval), diff view
- **HR4** — Memory: IndexedDB notes the agent can save / recall, chat sessions list, summaries of long chats
- **HR5** — Bash helper on localhost: tiny local helper (token + allow-list) so the agent can run shell commands with approval, output streamed into steps
- **HR6** — Polish: OpenAI-compatible providers, system prompt presets, export / import sessions, cost / token totals
