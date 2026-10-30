# Vision (VS2)

Ask a vision model on your own Ollama about a photo. Lab → Tools.

- Screens (swipe 75 px / ←→, wrap-around): Look · Recent · Settings.
- Photo in: Open photo, 📷 Camera (`capture=environment`, phones), drag-drop, or paste. Shrunk to ≤1024 px JPEG (q 0.85) before sending.
- Modes: Describe, Read text (OCR), Image prompt (one text-to-image prompt), Ask (your question). Typing a question always asks it; follow-ups keep the chat about the same photo (the image rides on the first user message).
- API: `POST {url}/api/chat` `{model, messages:[{role:'user', content, images:[b64]}, …], stream:true}`; NDJSON `message.content` chunks stream into the reply. Cancel = AbortController.
- Copy answer (clipboard, execCommand fallback), Save .txt (whole chat), Clear chat.
- Recent: IndexedDB `vision-v1` store `chats` `{id, ts, mode, model, img, messages}`, newest 20; tap to reopen and keep asking, × to delete.
- Settings `vision-settings-v1`: `{theme, url, model, mode}`. Models from `/api/tags` (+ `/api/show` capabilities); `vision` capability first, then name guesses (llava, llama3.2-vision, qwen2.5vl, gemma3, minicpm-v…), "Other" to type a name.
- Files: `vision.html/.css`, `vision_app.js` (UI), `vision_ollama.js` (API), `vision_save.js` (the one save module: history + copy + .txt).

Ollama: start with `OLLAMA_ORIGINS=https://jor-teron.github.io` so the site can call it. Get a model with `ollama pull llama3.2-vision` or `ollama pull gemma3`.

## VS2 — Google Cloud Vision engine (default)

- Engine picker on the Look screen: **Cloud Vision | Ollama**, saved as `engine` in `vision-settings-v1` (plus `gmode`, `gkey`). First run: Cloud Vision when a `gvision` key exists, else Ollama.
- Key: the Hub's `gvision` (`window.top.HubKeys.get`, memory only, `onChange` re-reads) wins; standalone / not-in-Hub fallback is Settings → Cloud Vision key (stored locally). Settings shows "Using the Hub's key" + Open (`HubKeys.open('gvision')`).
- `vision_gcv.js`: `POST https://vision.googleapis.com/v1/images:annotate?key=` with `{requests:[{image:{content}, features}]}`. Modes: Labels (LABEL_DETECTION), Read text (DOCUMENT_TEXT_DETECTION), Objects (OBJECT_LOCALIZATION), Landmarks & logos (LANDMARK + LOGO), Colours (IMAGE_PROPERTIES, swatches + hex + %), Safe search (likelihoods in words), All.
- Errors `.kind`: nokey, invalid, disabled, billing, blocked, quota (429), unreachable, http — each a dialog pointing to Hub API Keys (OK opens it in the Hub).
- Results are plain text in the answer bubble, so Copy, Save .txt and Recent work as before; history records `engine`, and mode `gcv:<mode>`.
- Follow-up box is hidden for Cloud Vision (fixed results, not a chat); Cloud Vision turns are not sent to Ollama if you switch engines. Main-screen Ollama model select appears when engine = Ollama (Settings model UI unchanged).
- Privacy: Cloud Vision sends the photo to Google (about 1,000 free units a month per feature); Ollama stays on your network.
