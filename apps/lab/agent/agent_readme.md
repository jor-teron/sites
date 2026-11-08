# Agent

Formerly **Harness** (releases HR1–HR6). Renamed in AG1; release prefix is now **AG**.

Browser AI agent, fully in browser JS (no build, no server of its own). Talks to a local **Ollama** over HTTP, or (HR6) an OpenAI-compatible API or Gemini with your API key, or (AG2) runs the small built-in **Browser** model with neither.

## Files
- `index.html` — redirect to `agent.html`
- `agent.html` — page shell (top bar, chat, steps pane, settings dialog). AG30: 📊 links to `usage.html`
- `agent_sw.js` — AG8 Agent's own service worker (scope `apps/lab/agent/`): offline app shell + vendor engine on demand
- `ui/settings.css` — AG10 Settings cards (1 column on phones, 2 from 760px), switches, Hub key line
- `ui/main.css` — theme variables (`html[data-ht]`), layout; `ui/components.css` — buttons, bubbles, Thinking box, error cards, dialog, notice cards; `ui/steps.css` — steps pane; `ui/chats.css` — Chats drawer
- `app/core/migrate.js` — AG1 one-time carry-over from the old Harness names (storage keys, folder handle, `harness/` data folder)
- `app/core/messages.js` — `HR.msgs`: the open chat's history (AG4: per chat via `set()`, saved by `HR.chats`), roles user / assistant (+`tool_calls`) / tool, `toApi()` (recent turns in full, older ones as a trimmed note), `splitThink()`
- `app/core/tools.js` — `HR.tools`: registry of `{name, description, parameters (JSON schema), where:'browser', run(args, ctx), available?}`, `schemas()` for Ollama
- `app/core/perms.js` — AG3 `HR.perms`: Settings → Permissions (`allowed(tool)`, `auto(kind)`, `memory()`)
- `app/core/loop.js` — `HR.loop.run()`: the one agent loop (model + tools → run tool calls → append `tool` results → repeat; step limit, Stop, no-tools retry)
- `app/core/prompt.js` — `HR.prompt.system()`: the user's `agent/prompts/system.md` (created from the shipped default on first use) + a live "Current settings" section + memory from `HR.mem.block()`, read on every call
- `prompts/prompt_*.txt` — AG29 shipped prompt wording (system default, files, shell, web, memory, settings). Not the user's folder. `prompts/prompt_fallback.js` is generated from those files (`node prompts/gen_fallback.cjs`) for file:// and failed loads. `prompts/gen_fallback.cjs` rebuilds it.
- `app/core/memory.js` — AG4 `HR.mem`: `agent/memory/` layout (user, assistant, sessions/<chat>, date/YYYY_MM, topics/<name>), prompt block, one-time `memory.md` → `memory/user.md`
- `app/core/helper.js` — `HR.helper`: client for the bash helper (`/health` test, `/run`, AG7 `/run_stream` live output), status
- `app/core/hubkeys.js` — AG9 `HR.hubKeys`: keys from the Hub (`window.top.HubKeys`), in memory only, Hub first
- `app/models/net.js` — `HR.net`: shared fetch errors + SSE reader
- `app/models/registry.js` — `HR.models`: provider adapters behind one interface, settings → `cfg()`, API keys (`agent.keys`, per host)
- `app/models/openai.js` — OpenAI-compatible adapter (OpenAI, Groq, OpenRouter, …): streaming + tools
- `app/models/gemini.js` — Gemini adapter: streaming + function calling (thought signatures kept)
- `app/models/browser.js` — AG2 `HR.browser` + the `browser` adapter: Story Mini via a worker, tap-to-download, own cache, Stop, remove
- `app/models/browser_worker.js` — AG2 module Web Worker: Agent's own Transformers.js 3.7.0, `text-generation` pipeline, streams tokens
- `vendor/transformers-3.7.0/` — pinned `transformers.min.js` + plain ORT wasm (12 MB total; see its README)
- `app/models/presets.js` — AG12 `HR.presets`: tab order + OpenAI-compatible presets (fixed base, Hub key name); `openai.js` is registered once per preset
- `app/gui/pickgroups.js` — AG12 `HR.pickGroups`: hide non-chat models, group by family / maker, search, Recent (`agent.recent`)
- `app/models/imagegen.js` — AG11 `HR.imagegen`: Ollama `/api/generate` text → image, image model list + pick (from Lab Image Gen)
- `app/models/ollama.js` — `HR.ollama`: `tags()`, streaming `chat()` (NDJSON, AbortController, `tools` param, collects `tool_calls`), `tps()`; registered as the default `ollama` adapter
- `app/storage/fs.js` — `HR.fs`: File System Access folder (handle kept in IndexedDB `agent`/`kv`/`root`, permission re-check on load), safe relative paths, list / read / write / append / walk
- `app/storage/logs.js` — `HR.logs`: daily Markdown chat log `agent/chats/YYYY_MM/YYYY_MM_DD.md` (the diary)
- `app/storage/threadfmt.js` — AG4 `HR.threadfmt`: one chat ⇄ Markdown
- `app/storage/threads.js` — AG4 `HR.threads`: chat files + index in the folder, or IndexedDB `agent-chats` without one
- `app/storage/usage.js` — AG7 `HR.usage`: per-day token counts per provider · model (`agent/usage/YYYY_MM.json`, or IndexedDB without a folder), prices, cost. AG30 `listMonths()` only lists those month files
- `app/storage/trash.js` — AG7 `HR.trash`: backup before `write_file` overwrites (`agent/trash/YYYY_MM_DD/<path>~HHMMSS`) and Undo
- `app/tools/time.js` — `get_time` test tool (local ISO, 12h text, timezone, UTC offset)
- `app/tools/files.js` — `list_dir`, `read_file` (~20k cap), `write_file` (approval), `search` (names + text, capped); only offered when a folder is connected
- `app/tools/web.js` — AG6 `HR.web`: `web_search` / `web_fetch` through Tavily (only with a key and Allow web on)
- `app/tools/shell.js` — `run_shell` (approval card per command; only while the helper test passed)
- `app/tools/memory.js` — `memory_read`, `memory_append` with `target` user / assistant / session / topic (+ `name`) / date (read); no approval, shows in steps
- `app/gui/settings.js` — `HR.set`: AG10 Settings cards + big switches (`sw()`), phone accordion; `agent.settings` {theme, baseUrl, model, think, tools, maxSteps, saveChats}, theme apply, Settings dialog. AG30: no Usage card; `prices` stays in `agent.settings`
- `app/gui/model.js` — `HR.model`: AG5 top-bar model chip + picker dialog, per chat (typed model name as fallback)
- `app/gui/provider.js` — Settings → Model card (Ollama / OpenAI-compatible / Gemini, base URL presets, API key, model name)
- `app/gui/hubrows.js` — AG9/AG10 `HR.hubRows`: inside the Hub hides every key / base field and shows "Keys come from Hub › API Keys" + Open
- `app/gui/browsercard.js` — AG2 `HR.bcard`: download card (sizes, progress, Cancel) and Settings → Advanced → Browser model (status, Free browser model storage)
- `app/gui/steps.js` — `HR.steps`: one row per model call (🧠) and per tool call (🔧), notes; tap to expand
- `app/gui/bubbles.js` — `HR.view`: bubbles, Thinking box, tool chips, notes, hello, error cards
- `app/gui/approve.js` — `HR.approve`: Approve / Deny card (path, size, preview)
- `app/gui/folder.js` — `HR.folder`: top-bar folder chip, Settings → Folder (Pick / Reconnect, unsupported note)
- `app/gui/helperset.js` — Settings → Helper (On / Off, URL, token, Test, status)
- `app/gui/attach.js` — AG11 `HR.attach`: 📷 button, photo chips, `shrink()` (≤1024 px JPEG), `ok()` (provider takes images)
- `app/gui/imagemode.js` — AG11 `HR.imode`: Chat | Image toggle, `run(prompt)` makes a picture into an assistant bubble with ⬇ Download
- `app/gui/chat.js` — `HR.chat`: input, send / Stop, UI hooks for the loop, `render()`
- `app/gui/edit.js` — AG5 `HR.edit`: ✎ Edit / ↻ Retry / ⧉ Copy on bubbles (hover or tap)
- `app/gui/meter.js` — AG5 `HR.meter`: token / context meter above the composer
- `usage.html`, `ui/usage.css`, `app/gui/usageview.js` — AG30 Usage page (`HR.usageView`): Token usage & spending, and Rates. AG7–AG29 this view was Settings → Usage
- `app/gui/chats.js` — AG4 `HR.chats`: Chats drawer (new, switch, rename, delete), resume last chat, per-chat provider + model. AG27 rename uses `UiDialog.ask` (the Hub dialog), not `window.prompt`
- `app/gui/chatsearch.js` — AG8 `HR.chatSearch`: search box in the 💬 drawer (title + message text), snippet results, jump to the hit
- `app/main.js` — `HR.notify` (Hub cards, local fallback) + boot
- `helper/agent-helper.sh` — local bash helper (HR5), bash + socat or ncat, no Python
- `agent_icon.png`

## Ollama setup
Ollama only answers browser pages whose origin is in `OLLAMA_ORIGINS`. Example: `OLLAMA_ORIGINS="https://jor-teron.github.io" ollama serve` (the error card shows the exact origin and commands for macOS / Linux service / Windows). Base URL default `http://localhost:11434` (Settings). An https page can reach `http://localhost` but not a LAN IP over plain http.

## Bash helper (HR5)
`bash helper/agent-helper.sh [--port 11500] [--root DIR] [--token T]` starts a tiny HTTP server on **127.0.0.1 only** and prints a random token. Needs `socat` (or `ncat`); it explains how to install them when missing. Endpoints: `GET /health`, `POST /run` `{cmd_b64, cwd_b64, timeout}` → `{code, stdout_b64, stderr_b64, truncated, timed_out, ms}` (each stream capped at 64 KB, timeout default 30 s, max 600, via `timeout`/`gtimeout`). Token needed on every request (`Authorization: Bearer` or `X-Agent-Token`); CORS + Private Network Access headers; optional `AGENT_ORIGINS="https://jor-teron.github.io"` to allow only listed pages. In Agent: Settings → Helper → paste the token → Test. AG7 (helper `ag7`): `POST /run_stream` (same body) answers chunked NDJSON — `{"t":"o"|"e","d":b64}` output chunks, `{"t":"h"}` heartbeats, then `{"t":"end",code,timed_out,truncated,ms,…}`; the command runs in its own process group and is killed (TERM, then KILL after 1 s) when the page closes the request (Stop). `/health` reports `"stream":true`.

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
- **AG4** — **Multiple chats:** 💬 opens the Chats drawer (slide-over on phone, docked pane from 960px; 💬 hides it): big ＋ New chat (also ＋ in the top bar), chats newest first, tap to switch, ✎ rename, 🗑 delete (file + session notes; the daily log stays). Each chat is its own Markdown file `agent/chats/threads/<id>.md` (`: ` header lines, `# user — time`, `## assistant — time · model`, `### tool — name ✓ · ms` with `: args` / `: tool_calls` meta lines; body lines starting with `#`, `:` or `\` are escaped with `\`) plus `agent/chats/threads/index.json` (id, title, provider, model, created, updated). Without a folder (or with Save chats Off) the same text goes to IndexedDB `agent-chats`; picking a folder later copies those chats into it. Title = first user message; each chat remembers its provider + model and switches to them when opened. Reload resumes the last open chat (`agent.chat`); a pre-AG4 tab history becomes the first chat. Daily logs `chats/YYYY_MM/YYYY_MM_DD.md` stay as the diary. **History:** about the last 6000 chars of turns go in full (always from the latest user turn, starting at a user turn so tool pairs stay whole); older turns go as one system note, each line cut to 160 chars, the note ≤1500 chars (newest kept). No extra model call. **Memory layout** `agent/memory/`: `user.md`, `assistant.md`, `sessions/<chat id>.md`, `date/YYYY_MM.md` (every append is copied here as a diary line), `topics/<name>.md`. `memory_read` / `memory_append` take `target` user | assistant | session | topic (+ `name`); `memory_read` also reads `date`. The prompt gets user + assistant + this chat's session only (never other chats'), newest ~800 chars each and ~2000 in total. Old `agent/memory.md` is copied once to `memory/user.md` (old file kept). **Prompt:** the default `system.md` no longer hard-codes "every write asks first"; a "Current settings" section is built on every call from Tools / Allow writes / Allow shell / Auto-approve / Memory and overrides older text in an existing `system.md`.
- **AG5** — **Retry & Edit:** hover a bubble (mouse) or tap it (touch) to show big action buttons; nothing shows otherwise. ↻ Retry on the latest reply drops it and its tool steps and runs again; ✎ Edit on a user message edits it in place (Send / Cancel, Enter sends, Esc cancels), drops everything after it and runs again; ⧉ Copy on both. Not while a reply is running. The chat file is rewritten to match; the daily diary is append-only and gets a "↻ Retry" / "✎ Edited" note plus the new text. **Model per chat:** the top-bar chip shows `Provider · model`; tap → picker (provider buttons, model rows, ↻ reload, "Make default for new chats"). A pick applies to this chat only and is saved in the chat index; new chats start on the Settings default (Settings → Provider, which also moves the open chat to it). **Token meter** (Settings → Display, default On): bar + text above the composer with used / max context for this chat. Used = the last call's real counts (Ollama `prompt_eval_count` + `eval_count`, OpenAI `usage`, Gemini `usageMetadata`; saved as `: usage` in the chat file) plus ~chars/4 for anything after it, else everything estimated as chars/4 (shown with ≈). Max = provider value (Ollama `/api/show` `context_length`, capped by a Modelfile `num_ctx`; Gemini `inputTokenLimit`; OpenRouter / Groq `context_length` / `context_window`), else Settings → Context size (default 8192). Amber from 75 %, red from 90 % with a hint; tapping it then starts a new chat.
- **AG6** (shipped after AG7, tags `?v=20261027ag7b`) — **Web search with Tavily:** new tools `web_search` (query, max_results 1–10, default 5 → title / url / snippet) and `web_fetch` (url → readable page text via Tavily `/extract`, trimmed to ~8,000 chars). Settings → Web: Allow web (default On; the tools stay hidden until a key is set), Tavily API key (password field, stored only in this browser, sent only to api.tavily.com; free key at tavily.com, 1,000 credits / month), Search depth Basic (1 credit) / Advanced (2 credits). No approval card (read-only), but calls show in Steps and the diary, and the system prompt tells the model to search only when needed and cite URLs. Credits used (Tavily's `usage.credits` when sent, else 1 / 2 per call) go to the month's usage file (`credits.tavily`, plus per day), shown as "Tavily: N/1000 this month" in Settings → Usage (amber from 900). 401 / 403 (bad key), 429 (rate limit) and 432 / 433 (credits used up) show a clear error card in the chat and return an error to the model. CORS checked: api.tavily.com answers preflight with `Access-Control-Allow-Origin: *` (also on 401s).
- **AG7** (AG6 was reserved for web search) — **Usage log:** every model call adds its input / output tokens to today's row for that provider · model in `agent/usage/YYYY_MM.json` (`{v:1, days:{"YYYY-MM-DD":{"provider|model":{p,o,n,e}}}}`; IndexedDB `agent-chats`/`kv` `usage:YYYY_MM` without a folder). Real counts when the provider sends them, else ~chars/4 (marked ≈). Settings → Usage shows Today and This month (calls, in, out, cost); online models get optional $ / 1M input and output price fields to estimate cost (saved in settings). **Live shell output** (Settings → Helper, default Off): with helper `ag7` the `run_shell` chip fills in while the command runs and Stop kills it; Off (or an older helper) keeps the old wait-for-the-end behaviour. **Undo for file writes:** before `write_file` replaces a file the old version is copied byte-exact to `agent/trash/YYYY_MM_DD/<path>~HHMMSS` (the result tells the model where); the chip and its Steps row get **↶ Undo write**, which puts the old file back (the replaced version is first backed up to the trash too) or, for a new file, moves it to the trash. Undo info is kept in the chat file (`: undo`), so it still works after a reload. Agent never deletes from `agent/trash/`. Writing into `agent/trash/` itself is refused. Settings hint now lists where everything is saved.
- **AG8** — **Chat search:** a search box at the top of the 💬 drawer filters every chat (folder threads + chats kept only in IndexedDB, marked “(browser)”) by title and user / assistant text, case-insensitive; results show the title and a two-line snippet with the hit marked (You: / Agent:). Tapping one opens the chat, scrolls to the first matching bubble and highlights it (outline for 2.5 s, the words stay marked until the chat is redrawn). Esc or ✕ clears it. **Pinned chats:** each row has one ⋯ button (also long-press on touch, right-click on a mouse) that opens a small menu — 📌 Pin / Unpin, ✎ Rename, 🗑 Delete — instead of the old ✎ 🗑 row; `pinned: true` is stored in the chat index (`index.json` / IndexedDB), pinned chats sit under **Pinned** at the top, the rest under **Recent**. **Offline app:** `agent_sw.js`, Agent's own service worker, registered by `app/main.js` as plain `agent_sw.js` with scope `apps/lab/agent/` (like My Day's `dashboard_sw.js`), so the Hub's root `sw.js` is untouched (it only clears `hub-*` caches; Agent only clears `agent-*`). Since AG-F7 it keeps one plain cache, `agent-files` (no release or version in the name): on install it precaches every local file `agent.html` lists; pages, app files and `vendor/transformers-3.7.0/` files are network-first and stored under their bare URL, with the cached copy (pages: `agent.html`) used when offline. Never cached: anything cross-origin or non-GET — Ollama, OpenAI-compatible, Gemini, Tavily, the bash helper, Hugging Face model downloads (Transformers.js keeps its own cache). Trash is never auto-deleted (parked). Tags `?v=20261027ag8`.
- **AG9** — **Hub keys** (Hub H28 / H28.1, `hub/keys.readme.md`): inside the Hub, Agent reads `window.top.HubKeys` (try/catch, so standalone or cross-origin it simply isn't there; no permission prompt) for `tavily`, `gemini`, `openai_base`, `openai_key`, `ollama_url`, `groq`, `openrouter`, `deepseek`, `xai`. Values stay in memory (never copied to localStorage) and win over Agent's own fields; the fields are the fallback when standalone or when the Hub has no value. Mapping: Gemini → `gemini`; OpenAI-compatible base `api.groq.com` → `groq`, `openrouter.ai` → `openrouter`, `api.deepseek.com` → `deepseek`, `api.x.ai` → `xai` (new DeepSeek and xAI presets), any other base → the Hub's `openai_base` + `openai_key` (with no Hub base, `openai_key` is used for api.openai.com); a named preset keeps its own base even when the Hub has `openai_base`. Ollama URL → `ollama_url`. Settings rows that use a Hub value show **From Hub ✓ (name)** with **Change in Hub** (`HubKeys.open(name)`) and the field is disabled and empty (the Hub value is never shown); in the Hub without that key: **Not in Hub keys — using this field** with **Add in Hub**. `HubKeys.onChange` re-reads the key, repaints open Settings and reloads models (web tools follow at once). Boot waits for the Hub keys (max 1.5 s). **Show thinking live** (Settings → Display, default On): the Thinking box opens while thinking streams and folds when the answer starts; a tap on it hands control to you; Off = the old folded box. **Steps pane default Off** for people with no saved choice (Settings → Show steps pane; a saved On / Off is kept). Tags `?v=20261027ag9`.
- **AG10** — **Settings clean-up**: Settings is now 8 collapsible rounded cards, in order **Model** (provider, current model + Choose…, thinking), **Folder & Memory** (pick / reconnect, save chats, memory, where things are saved), **Permissions** (allow writes / shell, auto-approve writes / shell + the shell warning), **Web** (allow web, Tavily key, depth, Tavily N/1000 this month), **Helper** (switch; URL, token, Test, status and live shell output only show when it is on), **Display** (theme, show thinking, show thinking live, steps pane, token meter, Hub card), **Usage** (today / month, prices), **Advanced** (tools, step limit, context fallback, Browser model). Tap a header to open; on phones one card is open at a time, from 760px it is a 2-column grid; the last open card is remembered (`agent.setCard`). On / Off settings are big switches with one short help line. Inside the Hub every key / base input (Ollama URL, OpenAI-compatible base, API key, Tavily key) is hidden and the Model / Web cards show one line "Keys come from Hub › API Keys · name ✓ / not set" with **Open** (`HubKeys.open`); standalone the fields are as before. Model and Tavily error cards in the Hub say Hub › API Keys and have an **Open Hub › API Keys** button. The Browser model is kept; its button now reads "Free browser model storage (can re-download)". Every saved setting key is unchanged (no data loss); the old Hub-row markup and unused CSS were removed. `?v=20261027ag10`.
- **AG-F1** — **Duplicate chats fix**: `app/core/migrate.js` copied the old sessionStorage `harness.history` to `agent.history` on every load and never removed it, so `HR.msgs.legacy()` + `HR.chats.init` re-imported the same old chat as a new chat (new random id) on each reload. Now the copy happens once and `harness.history` is removed (migrate.js and `legacy()`), and an imported chat gets a stable id (`legacy-<hash of its turns>`) and is skipped if it is already saved (then the last chat opens as usual). Existing duplicates are not removed. `?v=20261030ag-f1`.
- **AG-F2** — **Folder permission after reload**: when a chats folder is remembered but the browser asks for permission again (`HR.fs` state `need`), the chats panel now says so and shows **📁 Reconnect folder · N waiting** (tap = `requestPermission`) instead of silently switching to browser storage. Chats saved meanwhile stay in IndexedDB with `pending:true` in the index. On Reconnect, `HR.threads.merge()` copies browser-only chats and, when the same id is in both, writes whichever has the later `updated` time to the folder (before: the browser copy was always skipped, losing its new messages); the pending marks are then cleared. No folder: unchanged. `?v=20261030ag-f2`.
- **AG-F3** — **Same chat in two tabs**: each tab remembers which version of the open chat it loaded (`updated` + message count). Before saving, if another tab saved a newer version, that version is loaded and this tab's new messages are added after it (with a note), instead of overwriting it. Saves are also announced on a `BroadcastChannel('agent-chats')`; a tab with nothing unsaved reloads the open chat at once. `?v=20261030ag-f3`.
- **AG-F4** — **Typing before chats load**: a message typed or sent before the chats list finished loading (up to ~1.5 s at start) now continues the last chat (its earlier turns go above) instead of starting a new chat. `?v=20261030ag-f4`.
- **AG-F6** — **Reconnect merge combines messages**: when the same chat is in the browser (saved while the folder needed permission) and in the folder, `HR.threads.merge()` no longer keeps only the newer copy (AG-F2). It combines both message lists (each message keyed by role + time + tool call id + text + occurrence), keeps their order (browser-only messages go after the last shared message before them), takes title / model from the newer copy, and writes the result to the folder and the browser copy. Nothing new in the browser copy -> folder untouched. `?v=20261030ag-f6`.
- **AG-F7** — **Plain offline cache:** `agent_sw.js` now uses one fixed cache `agent-files`, never keyed on a build or version. Pages, app files and `vendor/transformers` files are network-first (`cache:'no-cache'`), saved under their bare URL (query stripped), and served from the cache when offline (pages fall back to `agent.html`). Activate deletes the old `agent-shell-*` / `agent-vendor-*` caches once; `agent-browser-model` is untouched, so Remove browser model still deletes only that. `app/main.js` no longer reads a version from its `?v=` and registers plain `agent_sw.js`; every `?v=` tag was removed from Agent's links.

## Roadmap
- **HR1** — Chat skeleton with Ollama streaming, Thinking box, steps pane (done)
- **HR2** — Agent loop: Ollama tool calling, tool registry, each tool call / result as a step, max-steps and Stop (done)
- **HR3** — Folder tools via File System Access: pick a folder, list / read / search / write files (write needs approval) (done; preview instead of diff)
- **HR4** — Memory: daily Markdown logs, memory notes (read / append tools), editable system prompt, all in the folder (done)
- **HR5** — Bash helper on localhost: tiny local helper (token, optional origin allow-list) so the agent can run shell commands with approval (done; live streaming added in AG7)
- **HR6** — Online models: OpenAI-compatible + Gemini adapters with streaming and tool calling (done)
- **AG2** — Built-in Browser model (Story Mini, Transformers.js in a worker) with fallback (done)
- **AG3** — Permissions and Display switches (done)
- **AG4** — Multiple chats, memory layout (done)
- **AG5** — Retry / Edit, model per chat, token meter (done)
- **AG6** — Web search with Tavily (done)
- **AG7** — Usage log + cost estimate, live shell output with Stop-kills, Undo for file writes (done)
- **AG8** — Chat search, pinned chats, offline app (done)
- **AG9** — Hub keys, Show thinking live, steps pane default Off (done)
- **AG10** — Settings clean-up: cards, switches, Hub keys line (done)
- **Later** — system prompt presets, export / import sessions, trash cleanup (parked: no auto-delete)
- **AG11** — Vision + Image Gen merged in (both old Lab apps stay in Legacy, untouched). **📷 Photo:** button left of the message box; picked photos are downscaled to ≤1024 px JPEG and show as chips (✕ removes, up to 4); on Send they go with the user message (Ollama `images`, OpenAI-compatible `image_url` parts, Gemini `inlineData`) and show as thumbnails in the bubble. The Browser model can't see photos → a notice card. Saved in the chat file as `: images <json>`. **Image mode:** the 💬 Chat / 🖼 Image chip flips the composer; in Image mode Send calls Ollama `/api/generate` (1024×1024, 8 steps, like Image Gen) at the Ollama URL, with progress in a note, Stop works, and the picture lands in an assistant bubble with ⬇ Download (stored as ≤1024 px JPEG, `: image <b64>`). Model: new setting `imageModel` (auto-picked from installed models, z-image first, then saved). Errors (image gen off in Ollama ≥ 0.32.6, no image model, unreachable) show notice cards.
- **AG12** — **Provider tabs:** Browser, Ollama, Gemini, Groq, OpenRouter, xAI, DeepSeek, DeepInfra, OpenAI, Custom. The OpenAI-compatible ones reuse one adapter with fixed base URLs; Custom takes its own base URL (`customBase`, LM Studio / vLLM). The picker shows only ready tabs (Browser + Ollama always, others once a Hub or local key exists, Custom once it has a base); Settings lists all of them so keys can be typed. Each tab keeps its own model (`model_<id>`, `<id>Model`). DeepInfra has no Hub key slot yet: local key only. **Migration:** the old OpenAI-compatible setting moves to the tab its base matches (other bases → Custom); old chats open on that tab (`agent.ag12` {to, at}); keys carry over (per host). **Picker:** a late list from the previous tab is dropped (request token); embedding / audio / image / video / moderation / guard models are hidden; 10+ models fold under headings (Gemini / Gemma / Other, maker for `maker/model` ids, family for Ollama); 🔍 search filters as you type; 🕘 Recent = last 3 picks per tab (`agent.recent`).
- **AG12.1** — DeepInfra reads its key from the Hub (Settings > API Keys > DeepInfra, Hub H111); the Agent's own field is the fallback.
- **AG13** — One model label everywhere: `HR.browser.label` = "Story Mini · 3M · 20 MB" (3M = 3 million parameters, 20 MB = download) in the picker, download card and Settings. AI Story uses the same pattern: Lite · 0.7M · 1 MB, Mini · 3M · 20 MB, Pro · 42M · 44 MB.
- **AG14** — Image Gen gets its own page: 🖼 in the top bar opens a slide-over Image page (app/gui/imagepage.js, ui/imagepage.css) with a big prompt, ✨ Generate / ■ Stop, progress "step c / t", its own picker listing only image models (setting `imageModel`), steps (new setting `imageSteps`, default 8) and size 1024. No model / Ollama unreachable / image gen off shows one friendly card with `ollama pull x/z-image-turbo`, 📋 Copy and ↻ Retry. Gallery (newest first) lives in IndexedDB `agent-images` (app/storage/imagestore.js: ≤1024 px JPEG blob + prompt, model, time), apart from chats; tap = large view with ⬇ Download and 🗑 Delete (confirm). The composer Chat | Image toggle (imagemode.js) is gone; old chats with made pictures still render.
- **AG15** — Image gets its own page `image.html` (own URL, bookmarkable, Back works): 🖼 in the chat top bar is a link to it, **← Chat** goes back. The AG14 slide-over is gone from agent.html. Provider tabs (only ready ones): **Pollinations** (free, no key, keyless models Sana + Z-Image Turbo, one picture every 50 s: the Generate button counts down, last time kept in localStorage `agent.imgCool.<id>` so a reload doesn't skip it), **DeepInfra** (shown when a DeepInfra key exists; text-to-image models from /models/list, fallback FLUX-1-schnell / FLUX-1-dev / sdxl-turbo; OpenAI-compatible images API, falls back to /v1/inference), **Ollama** (as AG14). New settings `imageProvider` (last tab) and `imageModel_<provider>` (last model per tab; Ollama falls back to `imageModel`). Steps only shown for Ollama. Friendly cards for no key, no credit, unreachable, busy. Same gallery (IndexedDB `agent-images`). Files: image.html, app/gui/imagepage.js, app/models/img_pollinations.js, img_deepinfra.js, img_ollama.js (wraps imagegen.js), ui/imagepage.css; agent_sw.js precaches image.html too (VER agent-ag15).
- **AG16** — Image page gets **Gemini** and **OpenRouter** tabs (order: Pollinations, Gemini, DeepInfra, OpenRouter, Ollama; each shows only when its key exists, Hub first like chat). Gemini (app/models/img_gemini.js): image models from v1beta/models (gemini-*image* via generateContent with responseModalities TEXT+IMAGE, imagen-* via :predict), fallback gemini-2.5-flash-image; cards for free-tier / quota block, bad key, text-only reply. OpenRouter (app/models/img_openrouter.js): models whose output_modalities include image (minus openrouter/auto), with a price hint, via chat/completions modalities image+text; cards for no credit (402), bad key, text-only reply. Last model per tab: `imageModel_gemini`, `imageModel_openrouter`. agent_sw.js VER agent-ag16 (both scripts precached via image.html).
- **AG17** — Image page: **Steps** on every tab (Ollama 1–50 default 8; DeepInfra sends num_inference_steps through /v1/inference first, defaults schnell 4 / sdxl-turbo 4 / dev 25 else the list's default_iterations, max schnell 4 / sdxl-turbo 10 / 50; Pollinations, Gemini, OpenRouter: disabled, 'fixed by provider'), setting `imageSteps_<provider>` (Ollama falls back to `imageSteps`). **Size chips** Square 1:1, Portrait 3:4, Landscape 4:3, Phone 9:16, Wide 16:9, Custom W × H (app/gui/imagesize.js, setting `imageSize` '3:4' / 'custom:WxH'): pixel tabs round (Pollinations, Ollama ×16 ≤2048; DeepInfra ×64 ≤1536), Gemini / Imagen / OpenRouter get the nearest aspect ratio (imageConfig.aspectRatio, parameters.aspectRatio, image_config.aspect_ratio) with a note. **Prices** from the APIs only (OpenRouter completion price, DeepInfra pricing, Pollinations free). **Download name** = slugified prompt (+ -2, -3 for repeats) + real extension. **Recent** group (last 5 per tab, `imageRecent_<provider>`) on top of the model picker. agent_sw.js VER agent-ag17.
- **AG18** — Chat top row gets two native dropdowns: **Provider** (only ready providers, same order and rules as the picker tabs) and **Model** (that provider's chat models: 🕘 Recent first, then the picker's groups; non-chat hidden). Changing Provider loads its list (Loading… option) and selects its remembered model; changing Model switches the chat model at once, same as a tap in the dialog (updates Recent). 🔍 next to them opens the old picker dialog with search; both stay in sync (HR.model.onChange / pickProvider / pickModel). The old model chip is hidden. Errors show as a disabled 'Can’t load models' / 'Add an API key ⚙' option plus the existing cards. Phone: the dropdowns wrap to their own row as compact side-by-side chips with ellipsis. Files: app/gui/modelbar.js, ui/modelbar.css (model.js, main.js, agent.html). agent_sw.js VER agent-ag18.
- **AG19** — Image page layout: the top row is just ← Chat + **Provider** and **Model** dropdowns (same look as the chat top row, ui/modelbar.css; provider order Pollinations, Gemini, DeepInfra, OpenRouter, Ollama, ready ones only; Model = 🕘 Recent then the rest, price in the option text). The provider tabs and size chips are gone, which also fixes the top bar covering the provider list. Under the prompt, one compact line of dropdowns: **Ratio** (1:1, 3:4, 4:3, 9:16, 16:9, Custom → W / H boxes on the same line), **Size** (long side 512–2048 shown as the provider's rounded W × H; disabled 'set by provider' on Gemini / OpenRouter), **Steps** (Ollama, DeepInfra only; 1–50 clamped per model, default per model). New setting `imageLong` (long side px, default 1024). agent_sw.js VER agent-ag19.
- **AG20** — Image page: **☆ / ★ favourite** button next to the Model dropdown stars the current model; starred models sit in a '⭐ Favourites' group at the very top, above '🕘 Recent' (no repeats). Setting `imageFav_<provider>` (array). **Full-screen viewer** (app/gui/imageviewer.js) replaces the small preview dialog: the picture fills the screen (object-fit contain, dark), ← / → browse in gallery order, Esc closes, swipe left / right on phones, big ‹ › side buttons (hidden at the first / last picture, no wrap), 'n / total', bottom bar with the prompt (2 lines), ⬇ Download (prompt filename) and 🗑 Delete. agent_sw.js VER agent-ag20.


## AG23 — Agent on HubAPI (AG22 stays parked)

Agent chat and model adapters now route through `window.top.HubAPI` (H134c)
when available, with a local `window.HubAPI` check too. The bridge is loaded
before the model registry; the Browser model and all image generators are
unchanged. Streaming content/thinking, Stop signals, photos, tool ids/results,
Gemini thought signatures, token counts and provider error kinds pass through.
Web search/extract use HubAPI, keeping depth, limits, credit accounting and
Agent's key/quota/rate-limit cards. Hub failures are never retried directly.

Hub-backed built-ins use their provider id. OpenAI-compatible local keys or
custom endpoints use HubAPI's `custom` mode with Agent's existing effective
base/key; no config or key is written to the Hub. Gemini/Ollama require the
matching Hub key/URL: H134c does not support their app-local overrides. Web
requires a Hub Tavily key. Without these, or outside the Hub (including
`file://`, cross-origin embedding and older Hubs), the original adapters remain
active. Standalone deliberately keeps this fallback instead of loading the
Hub key store and changing how local settings work.

Ollama's Hub model list omits size/parameter metadata, so Agent additionally
reads its existing free tags list to keep the labels; failure of that metadata
read leaves the Hub list usable. The existing `/api/show` context lookup stays
direct because HubAPI has no equivalent. Browser-local inference and image
generation are outside the text HubAPI contract. No new custom-service picker
is added. The offline cache stays `agent-files`; existing SW `VER` is bumped to
`agent-ag23` so the bridge is discovered and precached. No URL version tags.

Tests (no browser or paid requests): `node --test tests/hubapi.test.cjs`, plus
`node --check` on Agent scripts and static HTML/link/id checks in that harness.
Run from `apps/lab/agent`. Tests use stubs, including the actual read-only Hub
implementation from this repository to check request/result compatibility.

### Legacy code notes — AG23

The original Gemini, OpenAI-compatible, Ollama and Tavily adapters are retained
as executable standalone/config fallbacks, not deleted. The former registry
assignment is kept as a comment beside the bridge registration. Provider wire
conversions (`toG`, `toOA`) remain available to existing callers. The bridge
wraps registration rather than duplicating these providers. Legacy extraction
formatting is unchanged except that HubAPI's original page length supplies the
trim notice. AG22 remains parked and is not implemented by AG23.

### Static smoke finding (not introduced by AG23)

`agent.html` on the starting main already has two `id="btnPick"` buttons
(model search and Pick folder). The smoke harness explicitly records this one
baseline duplicate and rejects any new duplicates. It is not changed as part
of the HubAPI migration; folder/model-search button wiring needs a separate fix.


## AG24 — visible Hub providers, no hidden company key slots

Company tabs/endpoints remain Agent UI choices, not Hub credential names.
Only Gemini, Tavily and Ollama still read direct HubKeys. All other chat/model
calls prefer a unique visible HubProviders `svc_` entry of type `openai`, with
its label matched case-insensitively and endpoint matched after trimming
trailing slashes. Custom matches by its explicitly configured endpoint alone.
No match, wrong type, renamed label or ambiguous duplicate falls back to
Agent's own local endpoint/key. Custom no longer inherits a Hub endpoint.
Matching services use their stable id in HubAPI; Agent never reads service
secrets or Hub provider storage. Streaming/tools/photos/usage remain AG23's
passthrough. Provider changes refresh the picker/settings through onChange.

Inside the Hub, missing service matches show a generic Add provider action;
matching services open their visible row. Local fields remain editable for
standalone and image use. Browser inference and all existing image generators
remain available with their supported local/direct credentials.

### Legacy code notes — AG24

Retired the old direct company-key names, host-to-key mapping, preset hub-slot
fields and Custom's Hub-base fallback. These paths are documented here instead
of leaving executable hidden lookups. Historical AG9/AG12/AG23 notes above
remain history only; AG24 supersedes their company credential behaviour.
Direct adapters remain as Agent-local fallbacks, never a retry after a failed
Hub call. Offline cache stays agent-files; SW VER is agent-ag24, with no URL
version tags. Existing duplicate btnPick ids remain an unrelated known issue.


## AG25 — image generation through HubAPI H134f

Gemini's direct Hub key and uniquely matching visible DeepInfra/OpenRouter
svc_ entries now use HubAPI.imageModels/generateImage. Agent never reads service
secrets. Model labels/prices and per-model DeepInfra step defaults/maximums
come from Hub metadata; ratio/size controls, gallery and {blob} results stay
unchanged. The bridge caches returned capabilities and exposes a capabilities
lookup through imageCapabilities when metadata is not already loaded.

Key errors become nokey; 402 becomes nocredit; 429 becomes quota. Other HTTP,
noimage, unreachable and abort errors retain the existing friendly cards.
Provider openSettings callbacks are retained and offered as a click-only
button. No failed Hub request is retried with a different/local credential.
Pollinations/Ollama and browser-local inference are untouched.

Standalone, unmatched providers, Agent-local Gemini keys and older Hubs without
image APIs keep the original adapters. The AG24 image limitation is resolved;
matching visible services no longer need duplicate local image keys. Existing
local-key controls remain available for fallback use. Offline cache remains
agent-files; the existing SW VER becomes agent-ag25, without URL version tags.

### Legacy code notes — AG25

Original img_gemini/img_deepinfra/img_openrouter adapters are retained explicitly
as standalone/local fallbacks, with comments at each wrapper boundary. AG25
supersedes earlier AG23/AG24 statements excluding images from the Hub bridge.
The Hub owns transport and secrets; Agent owns UI, saved settings and gallery.
Tests are syntax/static/HTML-link checks and offline VM transport stubs only;
no browser tests or paid API calls.


## AG26 — Gemini local-key override and Hub plain-error mapping

Image Gemini routing now mirrors Chat: when an Agent-local Gemini key differs
from the visible Hub Gemini key, models() and generate() keep the local
adapter and send that local key (img_gemini key() no longer lets getKey hide
it behind Hub). Matching or Hub-only keys still use HubAPI H134f.
DeepInfra/OpenRouter svc matching is unchanged. Paid Hub failures still never
retry with another credential.

Hub plain Errors that look like settingsError (keyName / openSettings, no kind)
map to nokey; requiredText-style "must be" Errors map to input. Existing
key/http/quota/abort mapping and click-only openSettings remain. Pollinations,
Ollama and browser inference stay untouched. Offline cache remains agent-files;
SW VER is agent-ag26, without URL version tags.

### Legacy code notes — AG26

AG25 routed Gemini images on any Hub Gemini key. AG26 restores Chat's active-key
check for images only. Original img_* adapters remain the local path under the
same wrapper comments. Tests stay syntax/static/HTML-link and offline VM stubs;
no browser or paid API calls.


## AG27 — Hub dialog for chat rename

✎ Rename in the Chats drawer calls `window.UiDialog.ask('Rename chat', current title, 'Rename')`
(`shared/dialog/dialog.js`, H75). Inside the Hub that posts `{type:'hub-dialog', method:'ask'}`
and waits for `hub-dialog-result`. Standalone and file:// draw that same dialog in the page
(`UiDialog` local mode: parent is not a Hub dialog host). Cancel, Esc, or a backdrop click
returns null and leaves the chat unchanged. An empty or whitespace-only name is still dropped.
A confirmed name is still collapsed, trimmed, and cut to 80 characters, then saved on the open
chat or via `HR.threads.save`, and the chat list refreshes. Delete still uses its own confirm.
If the shared dialog script did not load, a small in-app box (Cancel / Rename) is used.
`window.prompt` is not called. Offline cache remains agent-files; SW VER is agent-ag27,
without URL version tags. Hub, `shared/`, system, phone, games and Learn are unchanged.

### Legacy code notes — AG27

AG4–AG26 used `prompt('Rename chat', title)` and then the same whitespace collapse, trim,
80-character cut, empty-name skip, and save. That line is kept as a comment in
`app/gui/chats.js`. AG27 only replaces the browser prompt with the async Hub dialog API.
Tests are syntax/static checks plus an offline VM smoke of confirm, cancel, empty name,
and the Hub `hub-dialog` ask/result exchange. No browser tests or paid API calls.


## AG28 — step limit and context default

Settings → Advanced keeps the same two fields, in the same place: **Step limit** then **Context size if the provider doesn't say**. Nothing else in that card moved.

**Step limit** is a nonnegative safe whole number stored in `agent.settings` as `maxSteps` (default still 8). The old product cap of 30 is gone, so 31, 99 and 999 are saved and used as typed. **0 means unlimited**: the agent loop does not stop for a step count, and 0 is not turned into 8 or 30. Negative numbers, fractions, `NaN`, infinities and integers above `Number.MAX_SAFE_INTEGER` are rejected; the field snaps back to the last saved value (or 8 when nothing valid is saved). Stop, an aborted model call, and provider errors still halt the turn. The one existing "does not support tools" retry is unchanged. No new automatic retry was added. The Browser model still forces a single model call.

**Context size** is the same `ctxMax` fallback the token meter already uses when the provider does not report a window (`HR.meter` → `HR.set.ctxMax()`). The default is **128000** only when `agent.settings` has no `ctxMax`. A saved value, including an older 8192, is kept. The number field shows `128000` (this input does not group digits; the meter still uses its existing short form, so 128000 reads as 128k). Provider and model context (Ollama `/api/show`, Gemini `inputTokenLimit`, OpenAI-compatible `context_length` / `context_window`) still wins over this fallback. The 512–2,000,000 range is unchanged. History trimming in `messages.js` is unchanged.

Offline cache remains `agent-files`. SW VER is `agent-ag28`, without URL version tags. Hub, `shared/`, system, phone, games and Learn are unchanged.

### Legacy code notes — AG28

The 1–30 clamp lived in `HR.set.maxSteps`, the step field (`min="1" max="30"`) and `if (calls >= o.maxSteps)` in `app/core/loop.js` (0 used to hit that check immediately, and `parseInt(...) || 8` used to drop an explicit 0). Those lines are comments next to the new checks. The context fallback number was 8192 in `DEF`, `ctxMax()` and the field's change handler; that number is commented beside the 128000 default. Tests are syntax/static checks plus an offline VM smoke of the settings store, the loop, and the meter fallback. No browser tests and no paid API calls.


## AG29 — prompt text in files

The words the model sees are unchanged. What changed is where those words live. `app/core/prompt.js` no longer holds the prompt paragraphs. It loads them and still decides, on every model call, which lines apply.

Shipped app files, next to the page (not inside the user's folder):

- `prompts/prompt_system.txt` — the default text written to `agent/prompts/system.md` the first time that file is missing
- `prompts/prompt_settings.txt` — the "Current settings" header
- `prompts/prompt_files.txt` — `@@write_auto`, `@@write_ask`, `@@read_only`, `@@no_folder`
- `prompts/prompt_shell.txt` — `@@auto`, `@@ask` (included only when `run_shell` is available)
- `prompts/prompt_web.txt` — the web line (included only when `web_search` is available)
- `prompts/prompt_memory.txt` — `@@on`, `@@off`, and `@@block` (the header above `HR.mem.block()`)

`@@key` lines are markers. They are not sent to the model. A file with no `@@` line is one literal. Sections are joined the same way as before: settings lines with a single newline, and the system text, the settings block, and the memory block with a blank line between them.

The user's file stays `agent/prompts/system.md`. An existing file is not renamed and not overwritten, including a file the user has edited. `prompt_system.txt` is used only when that file is missing, and it is what gets created. The two paths are different: one is an app asset, the other is in the connected folder.

Tools off, or no tool listed, still adds no settings section. No folder still sends only the settings section (or nothing, when no tool is available). Memory off still leaves out the memory block and says memory is off. Auto-approve still switches the files and shell lines. AG28 step limit and context size are unchanged.

Loading, in order, for each asset: `fetch` of `prompts/<file>` (the service worker serves the cached copy when the network fails), then a direct read of the `agent-files` cache, then `HR.promptFiles` from `prompts/prompt_fallback.js`. That script is generated from the `.txt` files (`node prompts/gen_fallback.cjs`) and loaded before `prompt.js`, which is what makes `file://` work when `fetch` of a local text file is blocked. Hosted pages prefer a successful fetch, so the `.txt` files stay the source of truth. The fallback is not a second hand-written copy. If a fetched file is missing a required section, the generated copy supplies that section. If the asset, the cache, and the generated copy all fail, the call throws `Agent prompt asset missing` instead of sending an empty prompt or dropping a safety line. Template text is cached in the page after the first successful load. The settings lines are still chosen again on every model call.

Offline cache remains `agent-files`. SW VER is `agent-ag29`, without URL version tags. Install precaches the six `.txt` files and `prompt_fallback.js`. Hub, `shared/`, system, phone, games and Learn are unchanged.

### Legacy code notes — AG29

HR4–AG28 kept the default system prompt and the settings sentences as string literals in `app/core/prompt.js`. The branch structure (which line, which order, tools off, no folder) is commented there and is still the live control flow; the paragraphs themselves are only in `prompts/prompt_*.txt`. `prompts/prompt_fallback.js` is produced by `prompts/gen_fallback.cjs` and is checked against those files. Tests are syntax/static checks plus an offline VM smoke of template loading, assembly parity, the user's `system.md`, first-use creation, failed assets, and hosted / cache / file:// loads. No browser tests and no paid API calls.


## AG30 — Usage page

Usage is no longer a card in Settings. 📊 in the chat top bar opens `usage.html` (its own URL, same pattern as `image.html`). **← Chat** goes back. This is a page inside the Agent app, not a new Hub app. Settings keeps every other card, in the same order. `agent.setCard`, step limit, context size, and the AG29 prompt files are unchanged. If the remembered card was `sc_usage`, that id is gone, so Settings stays on the card the page marks open.

The page has two sections.

**Token usage & spending.** Today, This month, and All time. Today and This month read the current month file, the same file as before (`agent/usage/YYYY_MM.json`, or IndexedDB `usage:YYYY_MM`). The date is the `YYYY-MM-DD` key already stored there, in the browser's local date, which is also how new rows are written. All time adds every stored month file. `listMonths()` only lists those files. It does not record usage. Rows are grouped by the provider stored in the `provider|model` key, then by model. Input tokens, output tokens, and call counts are the stored numbers. A `≈` still means at least one call in that row was estimated as characters / 4. Spend is labeled **estimated**. It uses the existing `cost()` helper and the saved rates. It is not a provider bill, and no billing total is stored. A row with no rate says **Rate unavailable** and is left out of the estimated total. It is not counted as zero. A count that is not a number says **Unreadable** and is not counted as zero.

**Rates.** Every model in the saved usage files, plus any rate already saved, including a rate whose model has no calls in the selected period. The period filter does not hide a saved rate. Each side is the saved number per million tokens, or **Rate unavailable**. A saved number, including 0, is marked **Manually entered**. 0 is the number that was typed. It is not a provider free tier. There is no separate currency field and no rate-update time, so none is shown. The boxes are still the `$ / 1M` fields, stored as `agent.settings` → `prices` → `{in, out}`. Online models can still be edited there. Ollama and Browser get boxes only when a rate was already saved, so an existing value is not stuck. Nothing on this page is fetched from a provider.

Tavily credits stay a credit count on the usage file. The page shows the stored count for the selected period and says they are not token spend and not a provider bill. Settings → Web still shows `N/1000` for this month. Image generation does not write a cost onto the gallery record (image, prompt, model, time), so the page says image spend is not stored and does not add it to the token totals.

A usage file that does not parse is still read as empty. All time is withheld when the month files cannot be listed, instead of calling the current month "all time". A saved folder without permission shows the browser copy and says so. Reconnect stays on the chat page. No `window.prompt`.

`record()`, `credits()`, `setPrice()`, and `cost()` are unchanged. Offline cache remains `agent-files`. SW VER is `agent-ag30`, without URL version tags. Install precaches `usage.html`. Hub, `shared/`, system, phone, games and Learn are unchanged.

### Legacy code notes — AG30

AG7–AG29 drew Usage inside Settings (`#sc_usage` / `#usageBox`): Today without price boxes, This month with `$ / 1M` boxes for online models, an em dash when an online price was missing, and the word `local` for Ollama and Browser. The estimated total was blank when nothing had a price. That markup is an HTML comment in `agent.html`. The old table builder is a comment at the bottom of `app/gui/usageview.js`. The chat page still loads `usageview.js` so the Web card's Tavily line keeps updating. Tests are syntax/static checks plus an offline VM smoke of navigation, the two sections, Settings without the Usage card, stored totals, filters, grouping, manual / zero / missing rates, estimated-versus-bill wording, and safe text. No browser tests and no paid API calls.


## AG31 — Assist model and answer length

- **Answer length** (Settings › Model): Short, Normal (default) or Detailed, saved as `agent.settings.answerLength`. Short and Detailed add one plain line to the system prompt (`app/core/length.js`), so every model call of a message carries it, tool follow-ups included. Normal adds nothing, so requests match AG30. It never cuts replies or lowers max tokens, and it asks the model to keep code, files and tool arguments complete.
- **Assist model** (Settings › Model): Off (default) or a provider + model picked from the providers this Agent has set up (the Browser story model is left out). Saved as `agent.settings.assistProvider` (`''` = Off) and `agent.settings.assistModel`. It is not the ⌨️ Helper (bash on your computer).
- `app/core/assist.js` gives `HR.assist.ask({prompt|messages, system, json, maxChars, signal})` and `HR.assist.classify(text, labels)`: one call, no tools, through the same HubAPI/provider adapters, usage logged. Off, no model, not set up or a failed call is an error: there is no fallback to the main model and no retry. The main chat's provider and model are never changed.
- Nothing uses the Assist model yet. It is groundwork for rolling summaries (AG32, not built).
- Tests: `tests/ag31.test.cjs` (mocked adapters, no network).

## AG32 — rolling summaries of older turns

- Needs the AG31 **Assist model** (Settings › Model). Off (the default) = no summaries, no extra calls; the AG31 trimmed note is used as before.
- **Coverage.** The recent window (~6000 chars, starting at a user turn, always including the last user turn) is never summarised. Older messages are grouped: a user turn plus everything up to the next user turn, so tool calls and results stay together. After a reply, if ≥ 3000 chars of the older part are not yet covered, Agent makes **one** Assist call with the previous summary plus as many whole groups as fit in 12000 chars. Every message in those groups is sent **in full**: text, tool-call names with their JSON arguments, full tool results, and an "[N image(s) attached]" marker. A single group over 12000 chars is sent in 12000-char parts over later calls, tracked in `part`. Coverage only moves past it after the last part. Nothing counts as covered unless all of it was sent. No loop: one call per reply (or per **Update now**).
- **Reply.** Plain text, cut to 2000 chars if longer (it is a summary, not JSON).
- **Prompt.** `toApi()` sends the summary instead of only the turns it covers, then a trimmed note for older turns after it, then the recent turns in full. It is labelled context, not instructions; newer messages and corrections win. Never copied to memory.
- **Storage.** The summary sits beside the chat and the chat file is never changed: `agent/chats/threads/<chatId>.sum.json` in the chosen folder. When the chat lives in the browser (no folder, permission pending, or Save chats Off), it goes to IndexedDB `agent-chats` key `sum:<chatId>`. The dialog says which. Record `{v:2, text, n, hash, edited, at, part?}`, where `n` and `hash` cover the first n messages. An edit, retry or merge that changes them makes it *stale* (ignored until updated or reset). Deleting the chat deletes the sidecar. A failed save shows "not saved … kept for this session only". Early AG32 localStorage `agent.sum.<id>` records move over once.
- **Lifecycle.** Opening or switching a chat, a reload or a folder change loads that chat's record (a late load after another switch is dropped). Stop, chat switch and an Assist provider/model change cancel a running summary. A result is saved only for the chat that started it, and only if its turns and the record (no Save/Reset meanwhile) are unchanged.
- **🧾 Summary** chip above the composer opens **Earlier summary**: status, editable text, Save, Update now, Reset (clears the summary only), Close.
- Tests: `tests/ag32.test.cjs`.

## AG33 — keyword search of memory and knowledge

- **Keyword search, not vector/semantic** (that is AG34). It makes no model, embedding or provider calls.
- **Tool `memory_search(query, scope?, limit?)`** (`app/tools/search_memory.js` over `app/core/ksearch.js`). It needs a folder and is hidden when Memory is Off (`HR.perms`). The prompt tells the model it exists and to use it when needed, not every turn. Other tools are unchanged.
- **Scopes** (fixed roots only):
  - `session` = `agent/memory/sessions/<this chat>.md`. Only the open chat; other chats' sessions are never searched.
  - `user` and `assistant` = `memory/user.md` and `memory/assistant.md`.
  - `topics` = `memory/topics/*.md`.
  - `knowledge` = `agent/knowledge/raw/*.txt|*.md`.
  - `all` (default) = all five.
- **Never searched:** the diary (`memory/date/`, which mixes every chat's notes), chats/threads, prompts, usage, trash, logs, and anything else in the folder.
- **Limits:** ≤ 250 files, ≤ 512 KB per file, ≤ 6 MB per search, query ≤ 200 chars / 12 terms, results 1–10 (default 5), snippet lines ≤ 300 chars. Stop cancels between files.
- **Ranking** (deterministic, per line):
  - each term found: +1, +1 if it is a whole word, + up to 2 for repeats;
  - +3 per distinct term matched;
  - +5 for the whole phrase.
  - One hit per nearby 3-line block. Results show the hit line ±1 with line numbers and `scope · path:line`, marked as data, not instructions. No hit without a real term match.
- **Knowledge imports** (Settings › Folder & Memory › Knowledge):
  - Import files… copies the chosen `.txt` / `.md` into `agent/knowledge/raw/`. Your originals are never touched.
  - Names are made safe; a taken name becomes `name (2).md`. Each file must be ≤ 512 KB, and there can be at most 200 documents.
  - ✕ removes Agent's copy only, after a confirm.
  - There is no index file: files are read fresh each search, so edits and deletions count at once.
  - A small "Test a search" box shows what the agent would find (shown as text, no HTML).
- Existing memory files and layout are unchanged; no migration.
- Tests: `tests/ag33.test.cjs`.

## AG34 — semantic (meaning) search, optional

- Uses only the central **HubAPI.embeddingModels / HubAPI.embed** (H139a). Providers are Ollama and saved OpenAI-compatible Hub services (`svc_…`). Credentials stay in the Hub; Agent never reads or stores them. Without the Hub (standalone page), semantic search is unavailable and keyword search still works. No Gemini, no main-model or other fallback.
- **Settings › Folder & Memory › Semantic search:**
  - **Provider:** Off by default.
  - **Model:** picked from the Hub's list, or typed when the provider lists none. Generic OpenAI-compatible services return no list.
  - **Prefixes (optional):** a document prefix and a query prefix, sent exactly as typed (≤ 200 chars each). Default is none, so only use models that accept plain text, or type the prefixes their model card asks for.
  - **Build / Rebuild:** a confirm says how many pieces and characters go to which provider and model, and that it may cost.
  - **Stop**, and **Delete index** (deletes the derived file only).
- Keys in `agent.settings`: `semProvider`, `semModel`, `semDocPrefix`, `semQueryPrefix`.
- **What is indexed** (session notes deliberately excluded; keyword `memory_search` covers this chat's session): `memory/user.md`, `memory/assistant.md`, `memory/topics/*.md` and `knowledge/raw/*.txt|*.md`. **Session notes are not indexed**, so a shared index never holds a chat's private notes; keyword `memory_search` still covers this chat's session. Never the diary, chats, prompts or configs.
- **Index file:** `agent/knowledge/index/semantic.json` (folder only):
  - `{v:2, fp:{provider, model, dims, docPrefix, queryPrefix, ident}, partial, built, chunks:[{path, scope, s, e, a, b, hash, vec}]}`. A v1 index from the first AG34 build asks for Rebuild.
  - Vectors are unit-normalised to 5 decimals. No document text and no credentials are stored.
- **Chunks (AG34.1):** exact character spans `[s, e)` of the file, ≤ 20 lines and ≤ 1500 chars. A longer line is split into 1500-char spans, so every character is in exactly one chunk. `a`–`b` are the lines cited. `hash` covers exactly the embedded text (before any prefix), and search re-reads that exact span.
- **Partial index:** pieces over the 2000-chunk cap and files over 250 / 512 KB are left out. This is recorded in `partial` and shown in the status and in tool results.
- **Provider identity (AG34.1):** `fp.ident` is a hash of the provider's public Hub metadata: `HubProviders.info(id)` type and endpoint for `svc_…` (never `secret()`), or the Hub Ollama URL. Only the hash is stored. An endpoint edit under the same id makes the index unusable, also after reload, until Rebuild. A removed provider, a non-OpenAI type or one with no key is "not available": nothing is sent, and it disappears from the list. A Hub provider change event stops a running build for it.
- **Async safety:** a search re-checks the index, settings, provider identity, folder and Memory after the query embedding and before re-reading any file, and again before returning. A change in between discards the results. A build writes nothing if the folder, settings or provider changed meanwhile, and a folder switch stops it.
- **Build limits:** ≤ 250 files, ≤ 512 KB each, ≤ 2000 chunks, ≤ 1.5 M stored numbers, dims ≤ 4096. Batches are ≤ 32 inputs and ≤ 60 000 UTF-8 bytes, within the Hub caps.
- **Build safety:** every reply is checked (one finite, nonzero vector per input, all the same size). The file is written once, only after all batches succeed and the settings are unchanged. Stop, an error or a settings change keeps the previous index.
- **Tool `memory_semantic_search(query, limit?)`:**
  - Offered only when the index matches the current provider, model and prefixes, a folder is open, Memory is on and the Hub API is present. The prompt mentions it only then.
  - Each call makes one query embedding.
  - Cosine similarity ≥ 0.30, top 1–8 (default 4).
  - Every hit's lines are re-read and re-hashed; changed or deleted text is skipped and counted as stale.
  - Results are quoted data with `path:lines`, not instructions.
- Keyword `memory_search` stays the default and works without any index.
- Tests: `tests/ag34.test.cjs` (mocked HubAPI).

## AG35 (first stage) — stable prompt prefix

- **Prefix preparation only.** The system prompt is now built stable-first: `system.md`, then the settings/tool lines, then the AG31 answer-length line, then the memory block last (it changes when a note is saved). Before, the length line came after memory.
- There is no time, chat id or retrieved text in the system prompt. Tool schemas keep their fixed registration order. The prompt is rebuilt on every call (nothing cached in Agent), so memory and settings edits apply at once. Normal answer length still adds nothing.
- Providers that cache long repeated prompt prefixes on their side (automatic) may now reuse more of it. Agent does not turn anything on, cannot see whether it happened, and makes no savings claims. Caching does not enlarge the context or cut what is sent.
- **Cache reporting is pending the central HubAPI:** `chatAdvanced` usage currently has no cached-token fields. Explicit caches (e.g. Gemini cachedContent) are not supported. Nothing about cache is shown yet.
- Tests: `tests/ag35.test.cjs` (captured mocked requests through the real loop).

## AG35 stage 2 — provider-reported cached input (needs Hub H141)
- `app/core/cachemeta.js` reads the optional Hub `res.usage.cache = {cached_input_tokens, source}`. It accepts a value only when it is a nonnegative safe integer from a known source, the reply has a real `prompt_eval_count`, and the cached count is ≤ that prompt count. An explicit 0 is kept as 0. Anything else counts as unknown. Nothing is inferred from latency or prefix matching, and there is no caching toggle.
- The value is stored per assistant message (`usage.c`) and per call in the monthly usage rows: `c` = cached tokens, `k` = calls that reported, `kp` = input tokens of those calls. `p`/`o`/`n`/`e` are unchanged, so the cached tokens are not added to the totals a second time. Estimated or mismatched counts never record cache. Legacy rows stay unknown.
- The step panel shows "cached input (provider)" only when a value was reported. The Usage page column shows "c of kp input (x%) · k of n calls reported", "unknown" or "unreadable". There are no money estimates. Assist calls are tracked the same way.
- Caveats: Gemini explicit caches and cache-write accounting are deferred. Ollama always shows unknown. Without H141 the Agent behaves exactly as before.

## AG36 — Memory consolidation (opt-in, Off by default)
- Find it in Settings › Folder & Memory › **Consolidation** (setting key `consolidate`, default `off`). It has a status line, **Run now**, and **Review (N)**. Code: `app/core/consolidate.js` (`HR.consol`) and `app/gui/conview.js` (`HR.conView`).
- It runs **only while this tab is open and visible**. A 60 s in-page timer checks the gates. A pass starts once the chat has been idle for 2 min and at least 10 min have passed since this chat's last pass. Each pass makes at most **one** Assist call, billed like chat. There is no service worker, background sync or scheduler, so a closed or hidden tab does nothing, and work resumes from the saved checkpoint when you reopen the chat.
- A pass first asks the AG32 summary step whether it's due (same threshold, coverage, hash and cancel rules), so an unchanged chat never pays for a new summary. Otherwise it proposes at most 3 short notes. Only this chat's **user turns** are used as evidence; the current summary is sent as context only. Assistant text, tool results, documents and the diary are never used as evidence.
- If the input hash hasn't changed since the last pass, no call is made. That also applies after a failure or a malformed reply, so it doesn't retry until there are new messages or you press Run now.
- The reply must be `{"notes":[{"text":…}]}`; anything else is rejected whole. Secret-like notes (keys, tokens, passwords, card numbers, long hex or base64) are dropped. Proposals are deduplicated against the queue and against notes already saved or dismissed. The queue holds at most 8.
- Notes are only proposed here; nothing is written to memory. In Review you can edit a note, then **Save to memory** (default target: this chat's session notes; "About you" or "Agent notes" only if you pick them) or **Dismiss**. Dismissed notes don't come back.
- Saving uses `HR.mem.append`, so the diary line is written as usual. **Undo last save** puts both files back exactly as they were, but only if neither has changed since; otherwise it refuses. The current text goes to the trash first.
- Gates: Off · Assist model Off · reply running · summary busy · hidden tab · still loading. Memory Off or no folder pauses notes, but summaries still run. Stop, switching chats, changing Assist, Consolidation or Memory settings, or changing folders cancels the pass, and a late reply is discarded. Edits you make in Review always win over a late reply.
- State is kept per chat beside it: `agent/chats/threads/<id>.con.json` (or IndexedDB `con:<id>` when there's no folder). It holds `{v:1, ck:{hash, at, users, fail?}, last, queue:[{id, text, at, edited?, src:{chat, users, ctx}}], gone:[keys ≤300], undo:[{at, target, text, files:[{path, before, after}]} ≤10]}` and is deleted with the chat. The chat itself is never changed. The summary only trims what is sent to the model.

## AG37 — Agent's own API & Providers (independent of the Hub's API Keys)
- **Page:** `providers.html` ("API & Providers"; Settings › Model › 🔑 link; ← Chat goes back). There is no catalog tile. Error cards and the "Open" buttons open it at `#keys/<name or svc_id>`.
- **Runtime:** `app/api/hub/` holds app-local copies of Hub Builder 1's code: `hub_credentials.js`, `hub_keys.js`, `hub_providers.js`, `hub_embeddings.js`, `hub_api.js` (H141) and the API Keys editor `api-keys.js` / `api-keys.css`.
  - Each file has a provenance header (upstream path, commit, sha256) and two wrapper lines; everything else is the upstream file byte for byte.
  - Regenerate them with `python3 apps/lab/agent/app/api/vendor.py`. `tests/ag37` fails if a copy drifts from the Hub file.
- **Namespace:** the wrapper rebinds only `window` and `localStorage`, to `HR.apiHost` (`app/api/host.js`).
  - Inside the copies, `window.top === window` is Agent's own object, so Agent never reads, writes or calls `window.top.HubAPI` / `HubKeys` / `HubProviders`, standalone or inside the Hub iframe.
  - Storage keys get the prefix `agent.api:`, so the store is `agent.api:sites-hub.credentials` (same format as the Hub: `{v:1, keys, providers, undo}`).
  - Only `agent.api:` storage events from other Agent tabs are passed through.
- **Consumers:** `HR.hubAPI` / `HR.hubKeys` (same bridge code as AG23–AG36) now point at this runtime. That covers chat, tools, model lists, Assist, summaries and consolidation, web (Tavily), images (Gemini, OpenRouter, DeepInfra), embeddings and the AG35 cache metrics. Pollinations and the Browser model are unchanged and keyless.
- **One store:** Settings no longer has key fields.
  - On first load, Agent's *own* old keys are moved into the new store: `agent.keys` (Gemini and preset hosts become provider rows), `tavilyKey`, and a saved Ollama `baseUrl`. They are then removed from the old places (`app/api/legacy.js`, flag `agent.api.legacyMoved`).
  - Unknown hosts stay in `agent.keys`, unused.
  - The Hub's keys are never read, copied or migrated. If you used the Hub's keys before, add them again here.
- **Semantic index:** provider identity now carries the `a` prefix (`ao…` / `as…`). An index built from the Hub's config never matches and shows as needing a rebuild. An old Hub `svc_` id selected in Agent stays unresolved ("not set up in API & Providers"); nothing is sent and nothing is silently changed.
- **Security:** this is browser storage on this site, not a security boundary, and it is not encrypted. Key fields are password fields; Agent hides the upstream 👁 reveal button. Keys don't appear in metadata, logs, usage or chats.
- **CORS:** providers must allow browser requests. "Test" only lists models.
- **Limits:**
  - If no Ollama URL is saved, Agent's built-in Ollama adapter talks to `http://localhost:11434` directly.
  - The copied editor still shows the Hub's own rows and texts (Cloud Vision, NVIDIA, the Hub keys guide).
  - Hub profile sync never includes `agent.api:` keys.

## AG38 — Settings as a full page with categories
- Settings (⚙) opens full-page, like Hub Settings: a category list on the left and the chosen section on the right.
  `app/gui/setnav.js` (HR.setNav) builds the list from the existing cards, so every control id and storage key stays the same.
  The last category is remembered in `agent.setCard`, the key AG10 already used.
- Categories: Model · Folder · Knowledge & Search (Knowledge, plus expandable **Semantic search** and **Consolidation**) ·
  Permissions · Web · Helper · Display · **Usage** · Advanced, plus a link to **🔑 API & Providers** (`providers.html`, AG37).
- Usage is back in Settings › Usage. It uses the same `usageview.js` tables and draws when the section is shown.
  📊 and `agent.html#settings/usage` open it there. `usage.html` now only forwards to it, so old links keep working.
- Narrow screens show the category list first. Picking one shows that section with a ‹ Categories back button.
- UI only: no runtime, key or storage changes. Service worker VER is `agent-ag38`.

### Legacy code notes — AG38
- `settings.js` `cards()` still has the AG10 collapsing code, but it only runs when HR.setNav is missing.
- `usage.html` used to render the tables itself (AG30), and `usageview.init()` still boots there if it's ever standalone.
