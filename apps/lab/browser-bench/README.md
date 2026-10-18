# Browser Bench (browser-bench)

How well will this browser run our games (Browser FPS, AoE RTS, AR game)? Lab app, plain HTML/CSS/JS modules.

## Files
`index.html` (redirect), `browser-bench.html` (page), `browser-bench.css`, `browser-bench.js` (UI, Run all, score, verdicts, JSON/TXT export),
`browser-bench_info.js` (device info, feature checks), `browser-bench_tests.js` (tests), `browser-bench_icon.png`.

## Tests
CPU (maths + sort, best of 3) · 2D canvas (max sprites at 30 fps) · 3D WebGL with Three.js (max triangles at 30 fps, 640×360, readPixels each frame) ·
GPU textures (largest texture, up to 512 MB of 2048² textures) · Storage (localStorage, IndexedDB 20 MB, quota) ·
Network (same-site latency, ~0.9 MB download of `../island-demo/models/female/body_1k.glb`) · Audio (start time, latency) · Tap-to-sound button.

Score 0–100 is weighted against a good gaming PC; verdicts are Good / OK / Poor per game.

## Known limits
- Three.js 0.170.0 loads from jsdelivr (importmap), not a local vendor/ copy yet.
- Network test depends on the island-demo model file staying in the repo.
- Audio after Run all may show "suspended" (tap expired); use the Tap-to-sound button.
- Overlaps with Device Benchmark (devbench) on CPU/GPU/storage/network; merge planned.
