# AI Bench (ai-bench.html)

Single-file browser compute benchmark in Lab. Plain HTML/CSS/JS, no libraries, no downloads.
Icon: `ai-bench_icon.png` (tiles/hub rule: file `x.html` → `x_icon.png`).

## Tests
- **Quick** (n=128) and **Peak** (n=256, 384): one FP32 matmul and one integer-array matmul, timed after a warm-up run. GFLOPS / GOPS + latency.
- **Sustained** (~25 s): FP32 256² for 15 s, then integer arrays for 10 s; average rate (compare with Peak to see throttling).
- **Run Full Suite**: Quick → Peak → Sustained in one locked run.
- **Story proxy S / M**: per step one 96² / 160² FP32 matmul plus a random word from a tiny list. Proxy steps/s, **not a real model** and not real tokens/s.

## Honest limits
- "Integer arrays" = Int8Array inputs, Int32Array output; JS does the maths as normal numbers, so it is not real INT8/NPU speed.
- Runs on the main thread: the page freezes briefly during big matmuls (Web Worker version planned).
- No WebGPU / WASM yet; real model tokens/s lives in Local AI Chat (transformers.js).

## Manual test
Open from the Hub (Lab), tap Quick, then Run Full Suite: progress bar moves through each step, buttons stay disabled until "Full suite complete.".
