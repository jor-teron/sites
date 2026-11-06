# HEX WebGPU engine (HEX-8)

Guide for Hub games using this folder. No prior engine experience required.  
Do **not** put HEX docs in `apps/games/common/` (reserved). Live demo: `../valley-explorer/`.

Legacy standalone Games (classic canvas titles, CSV, settings): [../README.md](../README.md). Learn category is separate (`../../learn/README.md`) and does not use this engine.

## Requirements

- **HTTP** — ES modules need a local/Hub server (`file://` fails).
- **WebGPU** — `navigator.gpu` required; **no WebGL fallback**.
- **Three r170 / three@0.170.0** — vendored MIT build at `3d/vendor/three/three.webgpu.js`. Import only via `3d/core/three.js` or `hex3d.js` (no CDN/npm runtime).
- **GLTF** — vendored `addons/loaders/GLTFLoader.js` (imports remapped to that WebGPU file).

Errors/device-lost: `showOverlay(host, title, body)` in `hex3d.js`; styles in `3d/ui/overlay.css`.

## Folders

`shared/` CPU helpers · `3d/core/` HEX helpers · `3d/vendor/` Three r170 · [EXAMPLE.md](./EXAMPLE.md) minimal scene.

## Shared API

| Export | File | Defaults / notes |
|--------|------|------------------|
| `createLoop({ fps, update, render, onError, maxCatchup })` | `shared/loop.js` | `fps=30` (hard max **30**), `maxCatchup=3`. Fixed-step; pause when hidden; `setFps` also ≤30. Dev default 30 — not a perf claim. |
| `createInput(el)` | `shared/input.js` | `key`, `moveAxes`→`{x,y}` (W/↑ y−1…), `consumeLook`, `requestLock`, `requestJump`/`consumeJump` (Space `!repeat` + Jump btn, HEX-7a), `clearStuck`. Left touch=move, right=look. |
| `vec3` / `v3*` / `mat4` / `m4*` / `DEG` | `shared/math.js` | Float32 vec/mat helpers. |
| `createRng(seed)` | `shared/rng.js` | `{ next, range, int }` mulberry32. |
| `loadJson` / `saveJson` | `shared/save.js` | localStorage JSON. |

## 3D API

| Export | File | Defaults / notes |
|--------|------|------------------|
| `supportsWebGPU()` | `3d/core/hex3d.js` | `!!navigator.gpu`. |
| `createHex3D(canvas, opts)` | same | **async**. Opts: `clear=0x8ec6e6`, `fov=70`, `near=0.1`, `far=400`, `fogNear=55`, `fogFar=155`, `maxPixelRatio=1.5`. Returns `renderer,scene,camera,root,ambient,sun,hemi`, `setSize(w,h,force?)`, `setPixelRatioCap`, `setShadowsEnabled`, `render()`→`{ok,lost}`, `dispose`, `lost`. Resize only when CSS size/DPR changes. |
| `showOverlay(host, title, body)` | same | Blocking message overlay. |
| `createAssetManager()` | `3d/core/assets.js` | `loadModel(url,{normalize=true,targetSize=2})`→`{root,meta,dispose}`; URL cache + clone. No hot-reload; static paths only. |
| `solidMat`, `boxMesh`, `sphereMesh`, `coneMesh`, `cylinderMesh`, `capsuleMesh`, `heightfieldMesh` | `3d/core/primitives.js` | Node materials (`MeshStandardNodeMaterial`). Heightfield `{size=160,segments,heightFn,…}`→`{mesh,sample}` — **same heightFn for collision**. |
| `makeInstanced(geo, mat, items)` | `3d/core/instancing.js` | Static `InstancedMesh`; items `{x,y,z,ry?,sx?,sy?,sz?}`. |

Thin Three wrapper only — not a general renderer framework. Video capture: **N/A**.

## Valley facts (do not invent)

- GLB proof path: `../valley-explorer/assets/models/rock.glb` (see `valley-explorer/core/engine/game.js`).
- Jump: `JUMP_SPEED=6`, `GRAVITY=18`, `stepJump` in `valley-explorer/core/engine/jump.js`.
- Height: `makeHeightFn` in `valley-explorer/core/engine/height.js` — one authoritative sampler.
- Quality may change DPR/shadows; Valley keeps fps at 30.

## Adapt Valley (no build tool)

1. New folder `apps/games/<name>/` with `index.html` → `<name>.html` (copy Valley pattern).
2. Import with **relative** paths from your file depth, e.g. from `core/engine/game.js`:  
   `import { createHex3D, showOverlay, supportsWebGPU } from '../../../engine/3d/core/hex3d.js';`
3. Serve over HTTP; open the game. Hub CSV registration is separate (not this doc).

## Troubleshooting

Missing `navigator.gpu` / insecure context · init errors via overlay · `hex.lost` after GPU reset · `ASSET_LOAD` bad GLB URL · use node materials with WebGPU (not classic WebGL mats).

Vendor: [3d/vendor/three/README.md](./3d/vendor/three/README.md).
