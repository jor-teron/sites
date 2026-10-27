<!-- Agent — vendor/transformers-3.7.0/README.md: what is pinned here and why (AG2). -->
# Vendored for Agent's Browser model (AG2)

Agent's own copy; not shared with other apps. Loaded only by `app/models/browser_worker.js`, only after the download tap.

| File | From | Size | sha256 |
|---|---|---|---|
| transformers.min.js | npm `@huggingface/transformers@3.7.0` dist/ (Apache-2.0, see LICENSE) | 0.87 MB | 3a8a06da…279e |
| ort-wasm-simd-threaded.mjs | npm `onnxruntime-web@1.22.0-dev.20250409-89f8206ba4` dist/ (the version 3.7.0 bundles; MIT, © Microsoft) | 21 KB | 43c25054…6db4 |
| ort-wasm-simd-threaded.wasm | same | 11.1 MB (~2.8 MB gzip) | f061472c…de2b |

The plain wasm build is used instead of the 21.6 MB `.jsep` (WebGPU) build that 3.7.0 ships: half the size, ~10 MB less
memory; Agent runs the wasm execution provider only. Source maps left out (the `.min.js` still names one; a 404 in devtools is harmless).
To upgrade: replace all three files from matching versions, rename the folder, update the import in browser_worker.js and this table.
