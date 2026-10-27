# Vision (VS1)

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
