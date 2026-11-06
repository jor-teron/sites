# Hub keys guide (H28, H28.1, H28.2)

One place for the API keys that Hub apps use: **Settings → API Keys**.
Add a key once and every Hub app (Agent, News, …) can use it. No app asks again.

- Keys are saved **only in this browser on this device** (localStorage `sites-hub.keys`), unless you turn on
  **Settings → About → Profile → Include keys in profile** (off by default). Then they are also written,
  as plain text, to `hub/hub-profile/hub.json` in your connected folder and to exported profile files.
- They are **not** synced to a joined phone. Add them on each device you use.
- The Hub never sends them anywhere. Each app sends a key only to its own service
  (for example, the Tavily key goes only to api.tavily.com).
- Clearing the browser's site data deletes them. Keep a copy of your keys somewhere safe.
- Every app inside the Hub can read every key. Only add keys you're happy for Hub apps to use.

## How to add a key

1. Open **Settings → API Keys** (or tap a "Set key" link inside an app: it opens the right row).
2. Paste the key into its row. It saves when you press Enter, tap **Save** or leave the field.
3. Tap **Test** to check it works. **👁** shows or hides the key. **Delete** removes it.
4. For OpenAI, Groq, OpenRouter, DeepSeek, xAI, DeepInfra or another AI service, use
   **Add provider**. Choose **OpenAI-compatible** or **Gemini** (the request format, not the company),
   then give it a label, API endpoint and key. Apps choose the model.

Each row shows a short hint (what it's for, the free tier) and a **Used by** line naming the apps that read that
key from the Hub (Agent for the AI and search keys, OCR and Vision for `gvision`).

## The keys

### `tavily`: Tavily (web search)

- **For:** web search and page reading in Agent (`web_search`, `web_fetch`) and the planned News AI summary.
- **Get it:** sign up at <https://app.tavily.com> and copy the key (starts with `tvly-`).
- **Free:** 1,000 API credits a month, no card needed. A basic search costs 1 credit, an
  advanced search 2. Details: <https://docs.tavily.com/documentation/api-credits>
- **Test button:** reads your usage from `api.tavily.com/usage`, which costs no credits.

### `gemini`: Google Gemini

- **For:** Gemini models (chat, summaries) in Agent. (News doesn't read it yet.)
- **Get it:** <https://aistudio.google.com/apikey> (sign in with a Google account, then **Create API key**).
- **Free:** there is a free tier with no billing account needed. Its limits (requests per minute and per day)
  differ by model and change often, so **check the page**: your live limits are at
  <https://aistudio.google.com/rate-limit>, and prices and free models are at <https://ai.google.dev/gemini-api/docs/pricing>.
  Daily limits reset at midnight Pacific time. On the free tier Google may use your prompts to improve its products.
- **Test button:** lists the models your key can use (free, no tokens used).
- **Shared key (H28.2):** one Gemini key from AI Studio works for **Agent**, **Caption for Nei** and **Transcribe**.
  Agent reads it from this row. Caption for Nei and Transcribe still keep their own key field for now, so paste
  the same key there too.

### AI services: Add provider (H134d)

Settings shows permanent rows only for Tavily, Gemini, Ollama and Google Cloud Vision. Other AI services use
**Add provider**. Saved OpenAI-compatible and Gemini services appear below the Add provider card.

| Service | Provider type | API endpoint | Get a key |
|---|---|---|---|

| Service | Base URL (`openai_base`) | Key (`openai_key`) |
|---|---|---|
| OpenAI | OpenAI-compatible | `https://api.openai.com/v1` | <https://platform.openai.com/api-keys> (paid) |
| Groq | OpenAI-compatible | `https://api.groq.com/openai/v1` | <https://console.groq.com/keys> (free tier available) |
| OpenRouter | OpenAI-compatible | `https://openrouter.ai/api/v1` | <https://openrouter.ai/keys> (some `:free` models) |
| DeepSeek | OpenAI-compatible | `https://api.deepseek.com/v1` | <https://platform.deepseek.com/api_keys> (paid) |
| xAI | OpenAI-compatible | `https://api.x.ai/v1` | <https://console.x.ai> (paid) |
| DeepInfra | OpenAI-compatible | `https://api.deepinfra.com/v1/openai` | <https://deepinfra.com/dash/api_keys> (paid) |
| LM Studio / llama.cpp (local) | OpenAI-compatible | `http://localhost:1234/v1` or `http://localhost:8080/v1` | usually none |

- **Test button:** calls `<endpoint>/models` with the key. Custom-provider keys are excluded from profile files and sync.
- Some servers block requests from web pages (CORS). Then Test says "Could not reach the server",
  even when the key is right.

### `ollama_url`: Ollama (local models, no key)

- **For:** running models on your own computer (Agent's default provider).
- **Get it:** install from <https://ollama.com/download>, then `ollama pull <model>`.
- **Value:** `http://localhost:11434` (or another computer's address on your network).
- **Free:** yes, it runs on your own hardware.
- **Browser access:** start Ollama with `OLLAMA_ORIGINS` set to allow this site, for example
  `OLLAMA_ORIGINS="https://jor-teron.github.io"` (see <https://docs.ollama.com/faq>).
  A page served over https can't reach `http://` addresses other than localhost.
- **Test button:** calls `<url>/api/tags` and counts your models.

### `gvision`: Google Cloud Vision (H28.2)

- **For:** image understanding: text in photos and scans (OCR), labels, objects. The OCR app's "Vision" engine uses this API
  (it still has its own key field for now).
- **Get it:** in the Google Cloud console create or pick a project, enable **Cloud Vision API**
  (<https://console.cloud.google.com/apis/library/vision.googleapis.com>), then **Create credentials → API key** at
  <https://console.cloud.google.com/apis/credentials> (keys start with `AIza`). Restricting the key to the Cloud Vision API
  and to this site's address is a good idea. This is a different key from the Gemini one (AI Studio).
- **Billing:** a billing account must be linked to the project, even for free use.
- **Free:** the first 1,000 units a month are free (each feature on each image is one unit; a PDF page counts as an image),
  then it's paid per 1,000 units. Prices change, so **check the page**: <https://cloud.google.com/vision/pricing>
- **Test button:** sends an empty request (`POST vision.googleapis.com/v1/images:annotate`, no image, nothing billed).
  A bad key is reported as rejected. It also tells you when the key is fine but the Vision API isn't enabled,
  billing is off, or the key's restrictions block this site.

### Legacy key names (H134d)

Existing saved keys under `openai_base`, `openai_key`, `groq`, `openrouter`, `deepseek`, `xai` and `deepinfra`
are preserved; Agent and HubAPI can still read them. Their permanent Settings rows and the **Add custom key** form are gone.
A missing-key link opens **Add provider**. An explicit `#keys/<legacy-name>` deep link can still show that saved key for
maintenance. New services should use the provider store; apps choose models, while HubAPI reads the stable `svc_…` id.

## For app developers: the HubKeys API

`hub/core/hub_keys.js` is loaded by `hub.html` as `window.HubKeys`. Apps run in same-origin
iframes, so they call **`window.top.HubKeys`**. There's no permission prompt.

```js
HubKeys.get(name)          // → Promise<string | null>
HubKeys.set(name, value)   // → true when saved ('' or null removes it)
HubKeys.remove(name)       // → true when it was there
HubKeys.has(name)          // → boolean
HubKeys.list()             // → ['gemini', 'tavily', …]  names only, never values
HubKeys.open(name)         // opens Settings → API Keys at that row (#keys/<name>)
HubKeys.onChange(fn)       // fn({name, present}); also fires for changes made in other tabs.
                           // name '' = several keys changed. Returns unsubscribe().
HubKeys.KNOWN              // [{name, label, kind: 'key' | 'url', url, hint, usedBy}]  usedBy (H134a): ['Agent', …]
```

Known names remain `tavily`, `gemini`, `openai_base`, `openai_key`, `ollama_url`, `groq`, `openrouter`,
`deepseek`, `xai`, `deepinfra` and `gvision` for compatibility. Only Tavily, Gemini, Ollama and Cloud Vision are
visible by default. `HubKeys.definition(name)` returns a known definition with its hidden flag, or a generic custom-key
definition. For new AI services use `HubProviders` / `HubAPI` rather than adding another hard-coded key row.

**Standalone fallback.** When the app is opened on its own (not in the Hub), `window.top.HubKeys`
doesn't exist. Keep the app's own key field for that case:

```js
const hub = (() => { try { return window.top && window.top.HubKeys; } catch (_) { return null; } })();
const k = hub ? await hub.get('tavily') : localKey;   // short form: window.top?.HubKeys ? await window.top.HubKeys.get('tavily') : localKey
if (!k && hub) hub.open('tavily');                     // no key yet: send the user to the right row

// stay in sync when the key is changed in Settings (or another tab)
const off = hub ? hub.onChange((e) => { if (!e.name || e.name === 'tavily') reloadKey(); }) : () => {};
```

Inside the Hub, hide the app's own key field and show a "Set in Settings → API Keys" link
(`HubKeys.open(name)`) instead.

Read keys when you need them, not once at start, so a changed key works at once.
Never log keys or put them in URLs that get saved. Gemini's and Vision's test URLs are the exceptions, because those APIs take `?key=`.
