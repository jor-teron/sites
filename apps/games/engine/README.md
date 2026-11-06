# HEX — Hub Engine eXperience (HEX-1)

Lightweight Hub game foundation. Shared CPU helpers + a thin **Three.js WebGPU** 3D layer.

## Layout
- `shared/` — fixed-step 30fps loop, vec3/mat4, input, seeded RNG, save (no GPU)
- `3d/core/` — HEX helpers that own how THREE is imported (`WebGPURenderer` only)
- `3d/vendor/three/` — official `three@0.170.0` `three.webgpu.js` (MIT, local; no CDN/npm runtime)

## Runtime
Requires `navigator.gpu`. **No WebGL fallback.** Serve over HTTP (not `file://`) for ES modules.

Demo: `apps/games/valley-explorer/`.
