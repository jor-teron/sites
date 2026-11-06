# HubAPI — H134b

One client-side, non-streaming request helper over HubKeys. **No existing app
uses it yet.** Adoption is a follow-up with Hub Apps Bot; Agent, OCR and Vision
are unchanged. No server, key migration, permission gate, retries, streaming,
tool calls, usage accounting or automatic model selection is added.
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

| provider | HubKeys entry | Endpoint base / request |
| --- | --- | --- |
| gemini | gemini | https://generativelanguage.googleapis.com/v1beta/models/MODEL:generateContent |
| openai | openai_key + optional openai_base | saved base, else https://api.openai.com/v1; /chat/completions |
| groq | groq | https://api.groq.com/openai/v1/chat/completions |
| openrouter | openrouter | https://openrouter.ai/api/v1/chat/completions |
| deepseek | deepseek | https://api.deepseek.com/v1/chat/completions |
| xai | xai | https://api.x.ai/v1/chat/completions |
| deepinfra | deepinfra | https://api.deepinfra.com/v1/openai/chat/completions |
| ollama | ollama_url (required; no key) | saved URL + /api/chat |

Fixed named providers ignore openai_base. OpenAI-compatible requests use Bearer
keys and `stream:false`; Ollama uses its native API with `stream:false` and
`options.temperature` / `options.num_predict`. Gemini uses x-goog-api-key and
`generationConfig.temperature` / `maxOutputTokens`. HTTP(S) base URLs must not
contain embedded credentials, query or fragment. Redirects are rejected.
Custom OpenAI bases must belong to a service you trust with openai_key.
HTTP local Ollama needs suitable CORS, browser local-network permissions and
mixed-content support. There is no proxy workaround.

### search({query, count?, signal?})

Uses Tavily's saved `tavily` key via Bearer header, `/search`, basic depth,
`include_usage:true`. query is required; count defaults to 5, integer clamped
1–10. Returns `{query, depth:'basic', results:[{title,url,snippet}]}`;
snippets are trimmed to 500 characters. No extract method or usage ledger yet.
Treat results as untrusted text, not HTML.

### vision({image, prompt?, signal?})

Uses `gvision`, Google Cloud Vision `images:annotate` with x-goog-api-key.
image is raw base64 or a base64 image data URL, not a remote URL or Blob.
This is label/OCR detection, **not a free-form multimodal chatbot**:
prompt accepts only `'labels'`, `'text'`, or `'all'` (default).
Payload matches OCR/Vision: `requests:[{image:{content}, features}]` with
LABEL_DETECTION (maxResults 15) and/or DOCUMENT_TEXT_DETECTION.
Returns `{text, labels:[{description,score}]}` (empty when nothing detected).

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
await api.chat({provider: 'groq', model: 'llama-3.3-70b-versatile',
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
stub fetch; no live paid API calls are part of H134b testing.
