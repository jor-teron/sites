# Device Benchmark (devbench)

Browser-side benchmark for phones, TVs and PCs. Works in the Hub and responds to the hub's D-pad.

## Behaviour
- Device info fills instantly on open; refresh rate appears after ~2 s.
- Each test has its own big Run button; one test runs at a time (buttons lock).
- "Run all" runs CPU, GPU, Memory, JavaScript, Disk, JPEG, Video, Ping in order. It never runs Download speed.
- Download speed only runs from its own button (uses ~12 MB data).
- "Download result (.txt)" saves every card as `label: value` lines.

## Files
`index.html` (redirect), `devbench.html` (cards), `devbench.css`, `devbench.js` (wiring, Run all, export),
`info.js`, `cpu.js`, `gpu.js`, `disk.js`, `memory.js`, `jsspeed.js`, `media.js`, `network.js`.

## How each test works
- **Device info:** cores, RAM, platform, model, GPU strings, storage quota; screen in CSS px and physical px (× devicePixelRatio), pixel density; refresh rate = requestAnimationFrame frames over 2 s rounded to 30/50/60/75/90/120/144/165/240 Hz; browser + version + OS from `userAgentData.getHighEntropyValues` (fullVersionList, platformVersion), user-agent text fallback.
- **CPU:** one worker per core, math loop 10 s, ops/s.
- **GPU:** WebGL full-canvas draws 10 s, Mpix/s.
- **Memory:** 64 MB Float64Array copy (`set`, counted as read+write) and sequential sum, best of 5, GB/s.
- **JavaScript:** round = sort 100k numbers, JSON stringify/parse ~1 MB, string/regex work, create+remove 2000 elements in a detached fragment; rounds for 3 s → rounds/s and ms/round.
- **Disk:** OPFS 64 MB write then read, MB/s.
- **JPEG:** 12 MP synthetic canvas, `toBlob('image/jpeg', 0.9)` and `createImageBitmap`, average of 5, ms and MP/s.
- **Video:** WebCodecs VideoEncoder, 120 frames 1920×1080 from canvas; codec avc1.42E028, else vp8, else vp09 (`isConfigSupported`); then VideoDecoder decodes those chunks. fps for each. No WebCodecs → "Not supported".
- **Ping:** 5 no-cache requests each to this site (HEAD) and `https://0.peerjs.com/` (no-cors, timing only); min/avg ms.
- **Download speed:** fetches `apps/office/ocr/vendor/tesseract-core-lstm.wasm.js` (~3.9 MB) 3 times with cache-busting; Mbps and MB used.

## Saved / exported data
Nothing is stored. Disk test writes a temp OPFS file. Export file: `devbench-<browser>-YYYYMMDD-HHMM.txt`.

## Manual browser test
1. Open devbench in the Hub; check Device info, refresh rate after ~2 s.
2. Scroll the page (touch, wheel, D-pad).
3. Tap Run all; every card except Download gets a result.
4. Tap Run download; see Mbps and MB used.
5. Tap Download result; open the .txt.

## Known limits
- Scores are browser scores, not native; first ping includes DNS/TLS (see min).
- Refresh rate reads low if the page is throttled or in background.
- Video hardware use is a preference; browsers don't report what was actually used.
- Device model only shows on Chromium with client hints; iOS hides most details.
- Download test depends on the OCR vendor file staying in the repo.
