# Image Gen (IG4)

Text-to-image (and, where Ollama allows it, image-to-image) with an image model on your own Ollama. Lab → Tools.

- Screens (swipe 75 px / ←→, wrap-around): Generate · Gallery · Settings.
- Generate: prompt, optional **start photo**, size (Photo = match start photo, Square 1024×1024, Portrait 768×1024, Landscape 1024×768), steps (default 8; 4 for flux models), Generate / Cancel, Save PNG.
- Calls `POST {url}/api/generate` with `{model, prompt, width, height, steps, stream:true}` (+ `images:[b64]` with a start photo) and reads the NDJSON stream: `completed/total` drive the progress bar, the final line carries `image` (base64 PNG).
- Gallery: last 20 images in IndexedDB `imagegen-v1` (store `images`). Tap → view, Before / after (edits), Upscale 2×, Use as start, Reuse prompt, Delete, Send to Gallery, Save PNG. **Compare** → tap two images → slider.
- Settings `imagegen-settings-v1`: `{theme, url, model, size, steps, prompt, sharpen}`. Models come from `/api/tags` (+ `/api/show` capabilities); image models first, "Other" lets you type a name.
- Files: `imagegen.html/.css`, `imagegen_app.js` (UI), `imagegen_ollama.js` (API), `imagegen_edit.js` (start photo, upscale, similarity), `imagegen_store.js` (gallery), `imagegen_save.js` (the only save path).

## IG3
- **Start photo (image-to-image)**: Add photo / Change, drag-drop onto the app, paste, or "Use as start" on a result or gallery image. Shrunk to ≤1024 px JPEG q0.92; Photo size = long side 1024, multiples of 16. Sent as `images:[base64]` (no data: prefix).
  - **Ollama support (researched Oct 2026): effectively none today.** Ollama added image editing in 0.15.1 (commit c01608b, `GenerateImageWithInputs`, flux2 only, max 2 images, HTTP 400 "model does not support image editing" for z-image). The dispatch is in the runner through v0.15.4; the runner rewrite in v0.15.5 (later 6ddd886) dropped it, so 0.15.5–0.32.5 accept `images` but silently make a new image from the prompt (issue #14306, users report it from ~0.15.6; fix PR #14408 closed unmerged; in v0.32.5 `x/imagegen/imagegen.go` always calls `GenerateImage`). 0.32.6+ removed image generation. There is no strength/denoise option; steps still apply.
  - The app shows a heads-up under the photo; an HTTP 400 about editing → "Start photo not supported" dialog; a result that doesn't resemble the photo (grey 32×32 correlation < 0.3) → "Ollama ignored the start photo" dialog. Edits are kept with their start photo (`kind:'edit'`, `src`) for Before / after.
- **Upscale 2×**: canvas, `imageSmoothingQuality:'high'`, optional mild sharpen (Settings → Sharpen after upscale, default On). Saved as a new gallery image (`kind:'up'`, `from`), max 4096 px a side.
- **Compare**: two images stacked, the right one revealed by a draggable divider (drag, slider, ←/→ by 5 %), Swap, Esc closes. Gallery → Compare → tap two; Before / after on edits.
- **Send to Gallery**: Gallery (`apps/media/gallery`) has no shared store; it shows files from a folder/files the user opens (IndexedDB `gallery-v1` only keeps the folder handle). So Send to Gallery = save PNG to Downloads via `IGSave.toGallery` + a dialog explaining how to open it in Gallery (link opens Gallery in a new tab). Gallery files are untouched.

Ollama notes: image generation is experimental (macOS) and is switched off in 0.32.6+; use 0.32.5 with `x/z-image-turbo` or `x/flux2-klein`. Start Ollama with `OLLAMA_ORIGINS=https://jor-teron.github.io` so the site can call it.

## IG4 — free online generator (Pollinations)
- Engine picker on Generate: **Ollama** (unchanged) | **Online (free)**, saved as `engine` in `imagegen-settings-v1` (plus `seed`).
- `imagegen_online.js`: `GET https://image.pollinations.ai/prompt/{encoded prompt}?width&height&seed` (Classic API, no key, CORS `*`, checked 30 Oct 2026). Fetched as a blob, converted to PNG on this device, shown and stored like Ollama results (`IGStore`, `engine:'online'`, `seed`, `steps:0`); Save PNG / Upscale / Compare / Send to Gallery work the same.
- Limits from the docs: one image at a time per IP, ≥45 s apart (app blocks earlier tries), ≤768×768 area (Square 768², Portrait 576×768, Landscape 768×576), one model, a small Pollinations logo always (`nologo` and model choice need a paid key, so not used). Over the limit = HTTP 402 + `Retry-After` → "Free limit reached" dialog.
- Spinner only (no step progress); Cancel = AbortController. Seed field (blank = random); Reuse prompt restores engine + seed.
- Start photo and Steps are hidden for Online (Ollama only), with a note. Privacy: the prompt goes to Pollinations, and results are cached there by URL.
