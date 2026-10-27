# Hub keys guide (H28)

One place for the API keys that Hub apps use: **Settings → API Keys**.
Add a key once and every Hub app (Agent, News, …) can use it. No app asks again.

- Keys are saved **only in this browser on this device** (localStorage `sites-hub.keys`).
- They are **not** synced to a joined phone. Add them on each device you use.
- The Hub never sends them anywhere. Each app sends a key only to its own service
  (for example, the Tavily key goes only to api.tavily.com).
- Clearing the browser's site data deletes them. Keep a copy of your keys somewhere safe.
- Every app inside the Hub can read every key. Only add keys you're happy for Hub apps to use.

## How to add a key

1. Open **Settings → API Keys** (or tap a "Set key" link inside an app: it opens the right row).
2. Paste the key into its row. It saves when you press Enter, tap **Save** or leave the field.
3. Tap **Test** to check it works. **👁** shows or hides the key. **Delete** removes it.
4. For a key that isn't listed, use **Add custom key**: type a name (lowercase letters, digits,
   `_ - .`) and the value.

## The keys

### `tavily`: Tavily (web search)

- **For:** web search and page reading in Agent (`web_search`, `web_fetch`) and the planned News AI summary.
- **Get it:** sign up at <https://app.tavily.com> and copy the key (starts with `tvly-`).
- **Free:** 1,000 API credits a month, no card needed. A basic search costs 1 credit, an
  advanced search 2. Details: <https://docs.tavily.com/documentation/api-credits>
- **Test button:** reads your usage from `api.tavily.com/usage`, which costs no credits.

### `gemini`: Google Gemini

- **For:** Gemini models (chat, summaries) in Agent and News.
- **Get it:** <https://aistudio.google.com/apikey> (sign in with a Google account, then **Create API key**).
- **Free:** there is a free tier with no billing account needed. Its limits (requests per minute and per day)
  differ by model and change often, so **check the page**: your live limits are at
  <https://aistudio.google.com/rate-limit>, and prices and free models are at <https://ai.google.dev/gemini-api/docs/pricing>.
  Daily limits reset at midnight Pacific time. On the free tier Google may use your prompts to improve its products.
- **Test button:** lists the models your key can use (free, no tokens used).

### `openai_base` + `openai_key`: OpenAI-compatible server

Any service that speaks the OpenAI API. Set the base URL and its key:

| Service | Base URL (`openai_base`) | Key (`openai_key`) |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | <https://platform.openai.com/api-keys> (paid, check the page) |
| Groq | `https://api.groq.com/openai/v1` | <https://console.groq.com/keys> (free tier: limits at <https://console.groq.com/docs/rate-limits>) |
| OpenRouter | `https://openrouter.ai/api/v1` | <https://openrouter.ai/keys> (some `:free` models: limits at <https://openrouter.ai/docs/api-reference/limits>) |
| LM Studio / llama.cpp (local) | `http://localhost:1234/v1` or `http://localhost:8080/v1` | usually none |

- **Test button** (on either row): calls `<base>/models` with the key.
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

### Custom keys

Any other name (for example `groq`, `openweather`). An app asks for it by name, and
`HubKeys.open('<name>')` opens a row for it, even before it's set.

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
HubKeys.KNOWN              // [{name, label, kind: 'key' | 'url', url, hint}]
```

Known names: `tavily`, `gemini`, `openai_base`, `openai_key`, `ollama_url`. Names are lowercased.

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
Never log keys or put them in URLs that get saved. Gemini's test URL is the one exception, because the API takes `?key=`.
