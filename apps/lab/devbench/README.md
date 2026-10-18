# Device Benchmark (devbench)

The single benchmark app in Lab: phones, TVs and PCs. Light and quick: each test takes a few
seconds, no libraries, no model downloads. Merged from Browser Bench and AI Bench (their old
URLs `apps/lab/browser-bench/` and `apps/lab/ai-bench.html` are redirect stubs to `#games` / `#ai`).

## Page
- **Score card**: one overall score (0–100) and one **Run all** button (runs every main test, switching tabs as it goes).
- **Tabs** (`#device`, `#speed`, `#games`, `#ai` in the URL open that tab):
  - **Device**: device info (cores, RAM, GPU, screen, refresh rate, browser) + feature checklist.
  - **Speed**: CPU, GPU fill rate, Memory, JavaScript, Disk, JPEG, Ping.
  - **Games**: 2D sprites, 3D triangles, verdicts for Browser FPS / AoE RTS / AR game.
  - **AI**: matrix maths in a worker, WebAssembly, WebGPU matmul.
- **⚙ Settings**: extra tests (Video, Download speed ~12 MB) and export (JSON / TXT). Nothing is uploaded.

## Files
`index.html` (redirect), `devbench.html` (shell), `devbench.css`, `devbench.js` (cards, tabs, Run all, Settings),
`tests.js` (test registry), `score.js` (score + verdicts), `export.js` (JSON/TXT), `info.js`, `features.js`,
engines: `cpu.js`, `gpu.js`, `memory.js`, `jsspeed.js`, `disk.js`, `media.js`, `network.js`, `sprites.js`, `tris.js`,
`ai.js` + `ai_worker.js` (worker), `ai_gpu.js` (WebGPU).

## How each test works
- **CPU**: one worker per core, maths loop 2 s, ops/s.
- **GPU fill rate**: 2 s of batches of blended full-canvas triangles (512²); each batch ends with a 1-pixel `readPixels` so the GPU must finish; only batch time counts and the batch doubles until ~20 ms, so it is not capped by vsync.
- **Memory**: 32 MB `Float64Array` copy (read+write) and sum, best of 3, GB/s.
- **JavaScript**: sort / JSON / regex / DOM rounds for 2 s.
- **Disk**: OPFS 16 MB write then read, MB/s.
- **JPEG**: 3 MP canvas `toBlob` + `createImageBitmap`, average of 3.
- **Ping**: 5 no-cache requests each to this site and `0.peerjs.com`, min ms.
- **2D sprites**: add moving sprites until under 30 fps, max ~4 s.
- **3D triangles**: raw WebGL, 60k-triangle mesh drawn in growing batches for 2 s (readPixels each batch). Verdicts use a quarter of the raw rate (lit Three.js meshes cost more).
- **Matrix maths (JS)**: `ai_worker.js`, 256×256 FP32 and Int8-array matmul, warm-up + best of 3. Integer arrays are still JS numbers (not real INT8).
- **WebAssembly**: a 74-byte hand-written WASM loop (`x = x*a + 1`, 5 M iterations) vs the same JS loop, best of 3.
- **WebGPU matmul**: 512×512 naive WGSL matmul, best of 3 batches of 4, two cells checked against the CPU; "Not supported" without WebGPU.
- **Video** (extra): WebCodecs encode + decode 60 frames at 720p.
- **Download** (extra): `apps/office/ocr/vendor/tesseract-core-lstm.wasm.js` ×3.

## Score
Each part 0–100 against a fast gaming PC on a log scale (`score.js`, `DEVBENCH_SCORE_PARTS`), weighted mean of the parts that ran. Reference values are rough; calibrate on real devices.

## Manual browser test
Open from the Hub (Lab → Device Benchmark), tap Run all; every card gets a result, the score appears, Games shows verdicts. ⚙ → Export TXT.

## Known limits
- Browser scores, not native. Workers (CPU, AI) need http(s), not `file://`.
- Refresh rate reads low if the tab is in the background. Device model needs Chromium client hints.
- Download test depends on the OCR vendor file staying in the repo.
