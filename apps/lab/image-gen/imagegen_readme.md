# Image Gen (IG1)

Text-to-image with an image model on your own Ollama. Lab → Tools.

- Screens (swipe 75 px / ←→, wrap-around): Generate · Gallery · Settings.
- Generate: prompt, size (Square 1024×1024, Portrait 768×1024, Landscape 1024×768), steps (default 8; 4 for flux models), Generate / Cancel, Save PNG.
- Calls `POST {url}/api/generate` with `{model, prompt, width, height, steps, stream:true}` and reads the NDJSON stream: `completed/total` drive the progress bar, the final line carries `image` (base64 PNG).
- Gallery: last 20 images in IndexedDB `imagegen-v1` (store `images`). Tap → view, Save, Reuse prompt, Delete.
- Settings `imagegen-settings-v1`: `{theme, url, model, size, steps, prompt}`. Models come from `/api/tags` (+ `/api/show` capabilities); image models first, "Other" lets you type a name.
- Files: `imagegen.html/.css`, `imagegen_app.js` (UI), `imagegen_ollama.js` (API), `imagegen_store.js` (gallery), `imagegen_save.js` (the only save path).

Ollama notes: image generation is experimental (macOS) and is switched off in 0.32.6+; use 0.32.5 with `x/z-image-turbo` or `x/flux2-klein`. Start Ollama with `OLLAMA_ORIGINS=https://jor-teron.github.io` so the site can call it.
