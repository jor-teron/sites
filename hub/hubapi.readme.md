# HubAPI — H134b, H134c, H134e

> H134e removes legacy named provider paths: only visible service entries and the four Services keys.
> H134c adds visible services (Settings > API Keys > Providers),
> `chatAdvanced()` (streaming, tools, images, Gemini thinking, usage), `models()`,
> `fetchPage()` (Tavily extract), `services()`, and `search({depth})` with credits.
> Sections marked H134c below; the H134b text still describes `chat()`, `search()`
> and `vision()` defaults.

Client-side request helpers over HubKeys and HubProviders. Apps choose the model; the Hub handles request formats and visible saved provider keys. No server, permission gate, retries or automatic model selection.
Calls send your input and the saved key to the selected provider and can cost
credits. Same-origin apps already have access to HubKeys: this is not a security
boundary or a secret vault. Do not pass untrusted provider choices to it.

## Loading

Desktop (formerly hub.html, now desktop/desktop.html) and phone load it immediately
after HubKeys through the shared `HubCore` link part. Apps inside the Hub use
`window.top.HubAPI` (same origin only). There is no hub.html on current main.
Standalone pages load, with paths adjusted to their folder:

```html
<script src="hub/core/hub_keys.js"></script>
<script src="hub/core/hub_providers.js"></script>
<script src="hub/core/hub_api.js"></script>
```

Without HubKeys at call time, methods reject with a clear loading error.

## Methods

All methods return Promises and accept an optional `signal` (AbortSignal).

### chat({provider, model, prompt?, system?, messages?, temperature?, maxTokens?, signal?})

Returns `{text: string}`. `provider` and `model` are required non-empty strings;
there is no model default. Supply `prompt` or non-empty `messages`.
`messages` is an array of `{role: 'system'|'user'|'assistant', content: string}`.
`system` is prepended; `prompt`, if supplied, is appended as the last user turn.
Only text is supported (no tool/image messages). `temperature` is a finite number
0–2; `maxTokens` is a positive integer; both are omitted unless provided.
Provider/model-specific limits still apply. Gemini system turns are joined into
systemInstruction and adjacent same-role turns merge, like Agent's adapter.

| provider | Configuration | Request format |
| --- | --- | --- |
| gemini | visible Gemini HubKeys entry | Google Gemini |
| ollama | visible Ollama HubKeys entry | native Ollama |
| svc_… | visible HubProviders entry | its chosen OpenAI-compatible or Gemini format |

Other old names and slots are rejected. They are not aliases and their saved values are not used.
Users re-enter those keys via **Add provider**. OpenAI-compatible requests use Bearer keys; Gemini uses
x-goog-api-key. Redirects are rejected and HTTP(S) endpoints cannot contain embedded credentials, query
or fragment.
HTTP local Ollama needs suitable CORS, browser local-network permissions and
mixed-content support. There is no proxy workaround.

### search({query, count?, depth?, signal?})

Uses Tavily's saved `tavily` key via Bearer header, `/search`,
`include_usage:true`. query is required; count defaults to 5, integer clamped
1–10. H134c: optional `depth: 'basic' | 'advanced'` (default basic; advanced
costs 2 credits). Returns `{query, depth, credits, results:[{title,url,snippet}]}`;
`credits` is Tavily's reported `usage.credits`, else 1 (basic) / 2 (advanced).
Snippets are trimmed to 500 characters. Same shape as H134b plus `credits`.
HTTP errors carry `e.status` (401/403 key, 429 rate limit, 432/433 credits used up).
Treat results as untrusted text, not HTML.

### fetchPage({url, depth?, maxChars?, signal?}) — H134c

Tavily `/extract` with `{urls:[url], extract_depth, include_usage:true}` (Agent's
web_fetch). Returns `{url, depth, text, length, trimmed, credits}`; `text` is the
page's raw_content with 3+ blank lines collapsed, cut to `maxChars` when given
(`length` is the full length). A page Tavily cannot read rejects with
`Could not read <url> (reason)`. credits: reported, else 1 / 2.

### vision({image, prompt?, signal?})

Uses `gvision`, Google Cloud Vision `images:annotate` with x-goog-api-key.
image is raw base64 or a base64 image data URL, not a remote URL or Blob.
This is label/OCR detection, **not a free-form multimodal chatbot**:
prompt accepts only `'labels'`, `'text'`, or `'all'` (default).
Payload matches OCR/Vision: `requests:[{image:{content}, features}]` with
LABEL_DETECTION (maxResults 15) and/or DOCUMENT_TEXT_DETECTION.
Returns `{text, labels:[{description,score}]}` (empty when nothing detected).

## Visible providers — H134c/H134e

Jor can add a provider in **Settings > API Keys > Providers** without a
code change. Each saved service has four fields only: **Label**, **Provider
type** (`OpenAI-compatible` or `Gemini`), **API key** and **API endpoint**.
There is no model field: apps choose models. No header editor or response mapping.

Storage (this browser only): `localStorage['sites-hub.providers']` = JSON list:

```json
[{"id": "svc_mhn3k2qa7f0c1x", "label": "My LM Studio", "type": "openai",
  "key": "…", "endpoint": "http://localhost:1234/v1", "created": 1793245200000}]
```

- `id` is generated once at creation (`'svc_' + base36 time + random`) and never
  changes. Apps store and call the **id**; the label is display text only, so a
  rename never breaks a caller. Old built-in provider names have no compatibility handling.
- `type`: `openai` (POST `<endpoint>/chat/completions`, Bearer key; key optional
  for local servers) or `gemini` (`<endpoint>/models/MODEL:streamGenerateContent`,
  x-goog-api-key; empty endpoint = https://generativelanguage.googleapis.com/v1beta).
- Endpoint: http(s), no login, query or fragment; trailing `/` dropped.
- Never in the profile file or profile sync (hub_profile.js EXCLUDE `providers`).
- Settings never writes a saved key back into the page: the key field stays
  empty ("Key saved · type to replace"). **Test** sends
  `GET <endpoint>/models` (free model list) and shows `Works · N models`,
  `Key rejected (401)`, `No model list at this endpoint (404)` etc.

Store API (`window.top.HubProviders`, hub/core/hub_providers.js):
`list()` → `[{id, label, type}]` (never key or endpoint), `has(id)`,
`info(id)` → `{id, label, type, endpoint, hasKey}`, `add({label,type,key,endpoint})`
→ id, `update(id, {label?,type?,key?,endpoint?})` (key '' keeps, null removes),
`remove(id)`, `onChange(fn)`, `open(id)` (Settings at that row), `TYPES`.
`secret(id)` returns the key for HubAPI/Settings Test; apps should not need it.

Apps list services with **`HubAPI.services()`** → `[{id, label, type}]` (no key,
no endpoint) and call with the id:

```js
const api = window.top.HubAPI;
const svc = api.services();          // [{id:'svc_…', label:'My LM Studio', type:'openai'}]
const r = await api.chat({provider: svc[0].id, model: 'qwen2.5-7b-instruct', prompt: 'hmm'});
```

`chat()` accepts a service id (same `{text}` result). An unknown id rejects with
kind `'key'`: "This provider is not saved in this browser…".

## chatAdvanced — H134c

`chatAdvanced({provider, model, messages, tools?, onDelta?, signal?, thinking?, temperature?, maxTokens?, reasoningEffort?, endpoint?, key?})`

For Agent-style apps. Always streams. Request bodies mirror Agent's adapters
(apps/lab/agent/app/models/gemini.js, openai.js, ollama.js), so Agent can become
a thin adapter.

- `provider`: `gemini`, `ollama`, a visible service id `svc_…`, or `'custom'` with
  the app's own `endpoint` (+ optional `key`) — an OpenAI-compatible base the app
  owns (Agent's Custom tab); the Hub stores nothing for it.
- `messages`: Agent's internal (Ollama-style) format:
  `{role:'system'|'user'|'assistant'|'tool', content, images?, tool_calls?, tool_name?, tool_call_id?}`.
  `images`: raw base64 JPEG (Agent), a data URL, or `{data, mimeType}`.
  Assistant `tool_calls`: `[{id?, function:{name, arguments}, thoughtSignature?}]`
  (thoughtSignature is sent back to Gemini as the part's `thoughtSignature`).
  Tool results: `{role:'tool', tool_name, tool_call_id?, content}`.
- `tools`: OpenAI style `[{type:'function', function:{name, description, parameters}}]`
  (Gemini gets `functionDeclarations`, empty parameter objects dropped).
- `thinking`: `true` (Gemini includeThoughts; Ollama think:true), `false` (Gemini
  thinkingBudget 0; Ollama think:false), omitted = model default, or
  `{includeThoughts?, budget?, level?}` for Gemini thinkingConfig. OpenAI-compatible
  reasoning arrives via `reasoning_content` / `reasoning` deltas; `reasoningEffort`
  is passed as `reasoning_effort` when given.
- `onDelta(content, thinking)` is called for every streamed piece.
- Wire: Gemini `:streamGenerateContent?alt=sse`; OpenAI-compatible
  `/chat/completions` with `stream:true, stream_options:{include_usage:true}`
  (tool_call deltas joined by index); Ollama `/api/chat` NDJSON.

Returns:

```js
{ text, thinking?, tool_calls: [{id?, function:{name, arguments /* object */}, thoughtSignature?}],
  usage?: {prompt_tokens, completion_tokens, total_tokens, thoughts_tokens?},
  eval_count, prompt_eval_count, eval_duration /* ns */, done_reason, provider /* 'gemini'|'openai'|'ollama' */ }
```

`eval_count` / `prompt_eval_count` / `eval_duration` / `done_reason` are the
fields Agent's adapters already return (Gemini eval_count = candidates + thoughts).

Errors carry `kind`: `'key'` (missing key / unknown service, with `keyName` and
`openSettings()` for built-ins), `'input'`, `'http'` (+ `status`), `'unreachable'`,
`'abort'` (name `AbortError`). Unlike `chat()`, `'http'` errors include the
provider's short error text (e.g. model not found), **redacted**: the key sent,
`key=…`, `Bearer …` and common key prefixes are replaced with `•••`, max 300 chars.

```js
const r = await window.top.HubAPI.chatAdvanced({
  provider: 'gemini', model: 'gemini-2.5-flash', thinking: true,
  messages: [{role: 'system', content: 'Be brief'}, {role: 'user', content: 'Weather in Delhi?'}],
  tools: [{type: 'function', function: {name: 'web_search', description: 'Search',
    parameters: {type: 'object', properties: {query: {type: 'string'}}, required: ['query']}}}],
  onDelta: (c, th) => { out.textContent += c; think.textContent += th; },
  signal: stopController.signal });
if (r.tool_calls.length) { /* run tools, append {role:'assistant', tool_calls} + {role:'tool', …}, call again */ }
```

### models({provider, endpoint?, key?, signal?}) — H134c

Free model list: OpenAI-compatible `GET /models`, Gemini `GET /models?pageSize=200`
(generateContent models only), Ollama `GET /api/tags`. Returns `[{name, label, ctx}]`.

## Errors and examples

Missing keys reject with e.g. `No Gemini key saved. Add it in Settings > API Keys.`
The Error has `keyName` and `openSettings()` (calls HubKeys.open for that row).
Call openSettings from a user click, not automatically. Validation, HTTP status,
quota, CORS/network, invalid JSON and no-text errors have generic, helpful
messages. Provider error bodies, fetch exception details and URLs are never
included in errors or logged; the helper emits no console output. Caller aborts
reject with name `AbortError`. Raw provider payloads are deliberately not returned.

```js
const api = window.top.HubAPI;
const answer = await api.chat({
  provider: 'gemini', model: 'gemini-2.5-flash', prompt: 'Say hello',
  system: 'Be brief', maxTokens: 100
});
console.log(answer.text); // Do not log keys or full request options.
await api.chat({provider: 'svc_…', model: 'llama-3.3-70b-versatile',
  messages: [{role: 'user', content: 'Hello'}]});
const found = await api.search({query: 'browser accessibility', count: 3});
const detected = await api.vision({image: imageBase64, prompt: 'text'});
try {
  await api.chat({provider: 'openai', model: 'gpt-4o-mini', prompt: 'Hello'});
} catch (e) {
  errorLabel.textContent = e.message;
  if (e.openSettings) settingsButton.onclick = () => e.openSettings();
}
```

Model names above are examples, not availability guarantees. Offline smoke tests
stub fetch; no live paid API calls are part of H134b or H134c testing.

## H134e: no legacy provider keys

Only the four Services keys and visible Providers are consumed. The old named slots (including Groq,
OpenRouter, DeepSeek, xAI, DeepInfra and `openai_base`/`openai_key`) are neither read nor displayed.
No migration runs; users manually re-enter them through Add provider. Existing localStorage values are
left alone but unused. Profile exclusion for `sites-hub.providers` remains unchanged.
