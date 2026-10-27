# Harness

Browser AI agent harness, fully in browser JS (no build, no server of its own). Talks to a local **Ollama** over HTTP.

## Files
- `index.html` — redirect to `harness.html`
- `harness.html` — page shell (top bar, chat, steps pane, settings dialog)
- `ui/main.css` — theme variables (`html[data-ht]`), layout; `ui/components.css` — buttons, bubbles, Thinking box, error cards, dialog, notice cards; `ui/steps.css` — steps pane
- `app/core/messages.js` — `HR.msgs`: history (memory + sessionStorage `harness.history`), roles user / assistant (+`tool_calls`) / tool, `toApi()`, `splitThink()`
- `app/core/tools.js` — `HR.tools`: registry of `{name, description, parameters (JSON schema), where:'browser', run(args, ctx), available?}`, `schemas()` for Ollama
- `app/core/loop.js` — `HR.loop.run()`: the one agent loop (model + tools → run tool calls → append `tool` results → repeat; step limit, Stop, no-tools retry)
- `app/models/ollama.js` — `HR.ollama`: `tags()`, streaming `chat()` (NDJSON, AbortController, `tools` param, collects `tool_calls`), `tps()`
- `app/storage/fs.js` — `HR.fs`: File System Access folder (handle kept in IndexedDB `harness`/`kv`/`root`, permission re-check on load), safe relative paths, list / read / write / append / walk
- `app/tools/time.js` — `get_time` test tool (local ISO, 12h text, timezone, UTC offset)
- `app/tools/files.js` — `list_dir`, `read_file` (~20k cap), `write_file` (approval), `search` (names + text, capped); only offered when a folder is connected
- `app/gui/settings.js` — `HR.set`: `harness.settings` {theme, baseUrl, model, think, tools, maxSteps}, theme apply, Settings dialog
- `app/gui/model.js` — `HR.model`: model picker from `/api/tags`
- `app/gui/steps.js` — `HR.steps`: one row per model call (🧠) and per tool call (🔧), notes; tap to expand
- `app/gui/bubbles.js` — `HR.view`: bubbles, Thinking box, tool chips, notes, hello, error cards
- `app/gui/approve.js` — `HR.approve`: Approve / Deny card (path, size, preview)
- `app/gui/folder.js` — `HR.folder`: top-bar folder chip, Settings → Folder (Pick / Reconnect, unsupported note)
- `app/gui/chat.js` — `HR.chat`: input, send / Stop, UI hooks for the loop
- `app/main.js` — `HR.notify` (Hub cards, local fallback) + boot
- `harness_icon.png`

## Ollama setup
Ollama only answers browser pages whose origin is in `OLLAMA_ORIGINS`. Example: `OLLAMA_ORIGINS="https://jor-teron.github.io" ollama serve` (the error card shows the exact origin and commands for macOS / Linux service / Windows). Base URL default `http://localhost:11434` (Settings). An https page can reach `http://localhost` but not a LAN IP over plain http.

## Releases
- **HR1** — Chat skeleton: dark theme default, System (follows Hub via `shared/theme/hub_theme.js`) / Light / Dark; model picker from `<baseUrl>/api/tags` (base URL saved); streaming replies via `/api/chat` with Stop; `<think>…</think>` and Ollama's `thinking` field in a folded Thinking box (Auto / On / Off `think` flag); tokens/sec (live estimate while streaming, Ollama's eval stats at the end); Steps pane, one row per model call (tap → request / response summary); error card when Ollama is unreachable explaining `OLLAMA_ORIGINS`; history in sessionStorage; Hub notice cards (reply ready while hidden, errors). Phone one column with steps as a bottom sheet; side-by-side from 960px.
- **HR2** — Agent loop (`app/core/loop.js`): sends Ollama native `tools`, runs each `tool_calls` entry through the registry, appends `role:'tool'` results and repeats until a reply without tool calls, the step limit (Settings, 1–30 model calls, default 8) or Stop (aborts the in-flight call and halts). Models that answer "does not support tools" are retried once without tools (noted in chat + steps). Steps pane: a row per model call and per tool call (args, result preview, ms, ✓/✕). Tool chips in chat. Test tool `get_time`. Tools switch in Settings (on by default).
- **HR3** — Folder tools: 📁 chip + Settings → Folder (Pick folder / Reconnect folder); the handle is kept in IndexedDB and permission re-checked on load. Tools `list_dir`, `read_file` (~20k chars), `write_file` (Approve / Deny card in chat with path, size, preview; Deny → "User denied"; Stop counts as Deny), `search` (file names + plain text, 40 hits / 3000 files cap, skips binaries, `.git`, `node_modules`). Paths relative to the folder root; `..` and absolute paths rejected. Folder tools are hidden from the model without a folder. Android browsers / Firefox / Safari: clear "not supported" note, no OPFS fallback.

## Roadmap
- **HR1** — Chat skeleton with Ollama streaming, Thinking box, steps pane (done)
- **HR2** — Agent loop: Ollama tool calling, tool registry, each tool call / result as a step, max-steps and Stop (done)
- **HR3** — Folder tools via File System Access: pick a folder, list / read / search / write files (write needs approval) (done; preview instead of diff)
- **HR4** — Memory: IndexedDB notes the agent can save / recall, chat sessions list, summaries of long chats
- **HR5** — Bash helper on localhost: tiny local helper (token + allow-list) so the agent can run shell commands with approval, output streamed into steps
- **HR6** — Polish: OpenAI-compatible providers, system prompt presets, export / import sessions, cost / token totals
