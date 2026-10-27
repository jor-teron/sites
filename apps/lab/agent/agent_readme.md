# Agent

Formerly **Harness** (releases HR1–HR6). Renamed in AG1; release prefix is now **AG**.

Browser AI agent, fully in browser JS (no build, no server of its own). Talks to a local **Ollama** over HTTP, or (HR6) an OpenAI-compatible API or Gemini with your API key, or (AG2) runs the small built-in **Browser** model with neither.

## Files
- `index.html` — redirect to `agent.html`
- `agent.html` — page shell (top bar, chat, steps pane, settings dialog)
- `ui/main.css` — theme variables (`html[data-ht]`), layout; `ui/components.css` — buttons, bubbles, Thinking box, error cards, dialog, notice cards; `ui/steps.css` — steps pane
- `app/core/migrate.js` — AG1 one-time carry-over from the old Harness names (storage keys, folder handle, `harness/` data folder)
- `app/core/messages.js` — `HR.msgs`: history (memory + sessionStorage `agent.history`), roles user / assistant (+`tool_calls`) / tool, `toApi()`, `splitThink()`
- `app/core/tools.js` — `HR.tools`: registry of `{name, description, parameters (JSON schema), where:'browser', run(args, ctx), available?}`, `schemas()` for Ollama
- `app/core/perms.js` — AG3 `HR.perms`: Settings → Permissions (`allowed(tool)`, `auto(kind)`, `memory()`)
- `app/core/loop.js` — `HR.loop.run()`: the one agent loop (model + tools → run tool calls → append `tool` results → repeat; step limit, Stop, no-tools retry)
- `app/core/prompt.js` — `HR.prompt.system()`: `agent/prompts/system.md` (default created on first use) + newest ~800 chars of `agent/memory.md`, read on every call
- `app/core/helper.js` — `HR.helper`: client for the bash helper (`/health` test, `/run`), status
- `app/models/net.js` — `HR.net`: shared fetch errors + SSE reader
- `app/models/registry.js` — `HR.models`: provider adapters behind one interface, settings → `cfg()`, API keys (`agent.keys`, per host)
- `app/models/openai.js` — OpenAI-compatible adapter (OpenAI, Groq, OpenRouter, …): streaming + tools
- `app/models/gemini.js` — Gemini adapter: streaming + function calling (thought signatures kept)
- `app/models/browser.js` — AG2 `HR.browser` + the `browser` adapter: Story Mini via a worker, tap-to-download, own cache, Stop, remove
- `app/models/browser_worker.js` — AG2 module Web Worker: Agent's own Transformers.js 3.7.0, `text-generation` pipeline, streams tokens
- `vendor/transformers-3.7.0/` — pinned `transformers.min.js` + plain ORT wasm (12 MB total; see its README)
- `app/models/ollama.js` — `HR.ollama`: `tags()`, streaming `chat()` (NDJSON, AbortController, `tools` param, collects `tool_calls`), `tps()`; registered as the default `ollama` adapter
- `app/storage/fs.js` — `HR.fs`: File System Access folder (handle kept in IndexedDB `agent`/`kv`/`root`, permission re-check on load), safe relative paths, list / read / write / append / walk
- `app/storage/logs.js` — `HR.logs`: daily Markdown chat log `agent/chats/YYYY_MM/YYYY_MM_DD.md`
- `app/tools/time.js` — `get_time` test tool (local ISO, 12h text, timezone, UTC offset)
- `app/tools/files.js` — `list_dir`, `read_file` (~20k cap), `write_file` (approval), `search` (names + text, capped); only offered when a folder is connected
- `app/tools/shell.js` — `run_shell` (approval card per command; only while the helper test passed)
- `app/tools/memory.js` — `memory_read`, `memory_append` (no approval; shows in steps)
- `app/gui/settings.js` — `HR.set`: `agent.settings` {theme, baseUrl, model, think, tools, maxSteps, saveChats}, theme apply, Settings dialog
- `app/gui/model.js` — `HR.model`: model picker from the current provider (typed model name as fallback)
- `app/gui/provider.js` — Settings → Provider (Ollama / OpenAI-compatible / Gemini, base URL presets, API key, model name)
- `app/gui/browsercard.js` — AG2 `HR.bcard`: download card (sizes, progress, Cancel) and Settings → Browser model (status, Remove)
- `app/gui/steps.js` — `HR.steps`: one row per model call (🧠) and per tool call (🔧), notes; tap to expand
- `app/gui/bubbles.js` — `HR.view`: bubbles, Thinking box, tool chips, notes, hello, error cards
- `app/gui/approve.js` — `HR.approve`: Approve / Deny card (path, size, preview)
- `app/gui/folder.js` — `HR.folder`: top-bar folder chip, Settings → Folder (Pick / Reconnect, unsupported note)
- `app/gui/helperset.js` — Settings → Helper (On / Off, URL, token, Test, status)
- `app/gui/chat.js` — `HR.chat`: input, send / Stop, UI hooks for the loop
- `app/main.js` — `HR.notify` (Hub cards, local fallback) + boot
- `helper/agent-helper.sh` — local bash helper (HR5), bash + socat or ncat, no Python
- `agent_icon.png`

## Ollama setup
Ollama only answers browser pages whose origin is in `OLLAMA_ORIGINS`. Example: `OLLAMA_ORIGINS="https://jor-teron.github.io" ollama serve` (the error card shows the exact origin and commands for macOS / Linux service / Windows). Base URL default `http://localhost:11434` (Settings). An https page can reach `http://localhost` but not a LAN IP over plain http.

## Bash helper (HR5)
`bash helper/agent-helper.sh [--port 11500] [--root DIR] [--token T]` starts a tiny HTTP server on **127.0.0.1 only** and prints a random token. Needs `socat` (or `ncat`); it explains how to install them when missing. Endpoints: `GET /health`, `POST /run` `{cmd_b64, cwd_b64, timeout}` → `{code, stdout_b64, stderr_b64, truncated, timed_out, ms}` (each stream capped at 64 KB, timeout default 30 s, max 600, via `timeout`/`gtimeout`). Token needed on every request (`Authorization: Bearer` or `X-Agent-Token`); CORS + Private Network Access headers; optional `AGENT_ORIGINS="https://jor-teron.github.io"` to allow only listed pages. In Agent: Settings → Helper → paste the token → Test.

## Releases
- **HR1** — Chat skeleton: dark theme default, System (follows Hub via `shared/theme/hub_theme.js`) / Light / Dark; model picker from `<baseUrl>/api/tags` (base URL saved); streaming replies via `/api/chat` with Stop; `<think>…</think>` and Ollama's `thinking` field in a folded Thinking box (Auto / On / Off `think` flag); tokens/sec (live estimate while streaming, Ollama's eval stats at the end); Steps pane, one row per model call (tap → request / response summary); error card when Ollama is unreachable explaining `OLLAMA_ORIGINS`; history in sessionStorage; Hub notice cards (reply ready while hidden, errors). Phone one column with steps as a bottom sheet; side-by-side from 960px.
- **HR2** — Agent loop (`app/core/loop.js`): sends Ollama native `tools`, runs each `tool_calls` entry through the registry, appends `role:'tool'` results and repeats until a reply without tool calls, the step limit (Settings, 1–30 model calls, default 8) or Stop (aborts the in-flight call and halts). Models that answer "does not support tools" are retried once without tools (noted in chat + steps). Steps pane: a row per model call and per tool call (args, result preview, ms, ✓/✕). Tool chips in chat. Test tool `get_time`. Tools switch in Settings (on by default).
- **HR3** — Folder tools: 📁 chip + Settings → Folder (Pick folder / Reconnect folder); the handle is kept in IndexedDB and permission re-checked on load. Tools `list_dir`, `read_file` (~20k chars), `write_file` (Approve / Deny card in chat with path, size, preview; Deny → "User denied"; Stop counts as Deny), `search` (file names + plain text, 40 hits / 3000 files cap, skips binaries, `.git`, `node_modules`). Paths relative to the folder root; `..` and absolute paths rejected. Folder tools are hidden from the model without a folder. Android browsers / Firefox / Safari: clear "not supported" note, no OPFS fallback.
- **HR4** — Memory and logs in `<folder>/agent/`: daily log `chats/YYYY_MM/YYYY_MM_DD.md` (`# user — HH:MM`, `## assistant — HH:MM · model`, tool steps as `> 🔧 name(args) ✓ ms → preview` blockquotes); `memory.md` notes with `memory_read` / `memory_append` (append needs no approval, shows in steps); `prompts/system.md` editable system prompt, created with a default on first use and read on every send; newest ~800 chars of memory injected into the system prompt. Setting "Save chats to folder" (on by default). Without a folder: in-tab history only, no system prompt, and a hint on the empty chat.
- **HR5** — Bash helper: `helper/agent-helper.sh` (pure bash + socat / ncat, 127.0.0.1:11500, random token, CORS, `/health`, `/run` with cwd, timeout and output caps). Settings → Helper (Off by default; URL, token, Test). Tool `run_shell` is offered only after a passing Test; every command shows an Approve / Deny card with the command, cwd and timeout. Result (exit code, stdout, stderr) shows in steps and the chat chip, and goes to the daily log as `> 💻` plus a fenced output block when saving is on.
- **HR6** — Online models: Settings → Provider (Ollama default / OpenAI-compatible / Gemini). OpenAI-compatible takes any base URL (presets OpenAI, Groq, OpenRouter) and streams `/chat/completions` with `tools`; Gemini streams `streamGenerateContent` with function declarations. Both translate the internal message format both ways (tool call ids, JSON-string arguments, `functionResponse`, Gemini thought signatures) and show reasoning in the Thinking box. API key stored in localStorage per provider host, with a note that it stays on this device. Model list from the provider plus an optional typed model name. The loop is unchanged apart from calling `adapter.chat()`; the "no tools" retry also catches OpenRouter's wording.

- **AG1** — Renamed Harness → Agent: folder `apps/lab/agent/`, `agent.html`, `agent_readme.md`, `agent_icon.png`, `helper/agent-helper.sh` (env `AGENT_*`, e.g. `AGENT_ORIGINS`; header `X-Agent-Token`), data folder `<folder>/agent/`, keys `agent.settings` / `agent.keys` / `agent.history`, IndexedDB `agent`. One-time migration copies the old `harness.*` values, the remembered folder handle and `<folder>/harness/**` files (missing ones only; old folder kept).
- **AG2** — Built-in **Browser** provider (no Ollama, no API key): Story Mini = `onnx-community/TinyStories-3M-ONNX` (GPT-Neo, q8 `model_quantized.onnx` 17.0 MB + tokenizer 3.6 MB ≈ 20.6 MB from Hugging Face) on Agent's own Transformers.js 3.7.0 in `vendor/` (plain ORT wasm, 1 thread, no arena) inside a module Web Worker; tokens stream, Stop terminates the worker (the next send reloads from cache in about a second). Files live in Agent's own Cache API store `agent-browser-model`. Nothing downloads until you tap the card, which shows the sizes (≈ 33 MB once incl. the 12 MB engine, ~3 MB compressed) and progress; then it is remembered (`browserModel: 'ready'`). First start or an unreachable provider / missing key → Browser for this session with a quiet note (↻ retries the chosen provider). While Browser is in use tools, the loop and the system prompt are off (story model: it continues your last message), noted in Steps only. Settings → Browser model → Remove browser model frees the space.
- **AG3** — Settings switches with big On / Off targets. **Permissions:** Auto-approve file writes (off), Auto-approve shell commands (off, separate; a warning line shows while on), Allow file writes (on; off removes `write_file` = read-only), Allow shell (on; off hides `run_shell` even with the helper connected), Memory (on; off hides `memory_read` / `memory_append` and leaves memory notes out of the system prompt). **Display:** Show thinking (on), Show steps pane (on; off hides the pane and ☰), Hub card when a long task finishes (on; one card only when the run took over 20 s, via `HR.notify` = `window.top.HubNotify.notice` in a try block, small local card as fallback; no start / progress cards). Auto-approved writes and commands still show in Steps, the tool chip and the daily log, marked `auto`.

## Roadmap
- **HR1** — Chat skeleton with Ollama streaming, Thinking box, steps pane (done)
- **HR2** — Agent loop: Ollama tool calling, tool registry, each tool call / result as a step, max-steps and Stop (done)
- **HR3** — Folder tools via File System Access: pick a folder, list / read / search / write files (write needs approval) (done; preview instead of diff)
- **HR4** — Memory: daily Markdown logs, memory notes (read / append tools), editable system prompt, all in the folder (done)
- **HR5** — Bash helper on localhost: tiny local helper (token, optional origin allow-list) so the agent can run shell commands with approval (done; output returned when the command ends, not streamed)
- **HR6** — Online models: OpenAI-compatible + Gemini adapters with streaming and tool calling (done)
- **AG2** — Built-in Browser model (Story Mini, Transformers.js in a worker) with fallback (done)
- **AG3** — Permissions and Display switches (done)
- **AG4** — Multiple chats, memory layout (next)
- **Later** — system prompt presets, export / import sessions, cost / token totals
