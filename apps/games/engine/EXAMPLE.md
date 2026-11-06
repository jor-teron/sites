# Minimal HEX scene (documented example)

Illustrative module for a game under `apps/games/<name>/core/engine/boot.js`.  
Imports and names match **current** exports. Needs HTTP + WebGPU; not a registered Hub game.

```js
import { createLoop } from '../../../engine/shared/loop.js';
import { createInput } from '../../../engine/shared/input.js';
import {
  createHex3D, showOverlay, supportsWebGPU
} from '../../../engine/3d/core/hex3d.js';
import { createAssetManager } from '../../../engine/3d/core/assets.js';
import { boxMesh } from '../../../engine/3d/core/primitives.js';
import { makeInstanced } from '../../../engine/3d/core/instancing.js';
import { BoxGeometry } from '../../../engine/3d/core/three.js';
import { solidMat } from '../../../engine/3d/core/primitives.js';

export async function bootMinimal(canvas, host) {
  if (!supportsWebGPU()) {
    showOverlay(host, 'WebGPU required', 'navigator.gpu is missing.');
    return null;
  }
  let hex;
  try {
    hex = await createHex3D(canvas, { clear: 0x8ec6e6, maxPixelRatio: 1.5 });
  } catch (e) {
    showOverlay(host, 'WebGPU init failed', (e && e.message) || String(e));
    return null;
  }

  hex.root.add(boxMesh(2, 1, 2, 0x3f8f4a));
  // Optional: many identical boxes → one draw
  hex.root.add(makeInstanced(
    new BoxGeometry(0.6, 0.6, 0.6),
    solidMat(0x6a6e74),
    [{ x: 3, y: 0.3, z: -2 }, { x: -3, y: 0.3, z: -1, ry: 0.4 }]
  ));

  // Real Valley GLB (relative from this boot file depth):
  // ../../../valley-explorer/assets/models/rock.glb  — or ship your own under assets/models/
  const assets = createAssetManager();
  try {
    const url = new URL('../../../valley-explorer/assets/models/rock.glb', import.meta.url).href;
    const { root } = await assets.loadModel(url, { normalize: true, targetSize: 2 });
    root.position.set(0, 0, -4);
    hex.root.add(root);
  } catch (e) {
    console.warn('optional GLB skipped', e && e.message);
  }

  const input = createInput(canvas);
  canvas.addEventListener('click', () => input.requestLock());

  hex.setSize(window.innerWidth, window.innerHeight, true);
  window.addEventListener('resize', () => hex.setSize(window.innerWidth, window.innerHeight));

  const loop = createLoop({
    fps: 30,
    update(dt) {
      if (hex.lost) return;
      const look = input.consumeLook();
      hex.camera.rotation.y -= look.dx * 0.002;
      if (input.consumeJump()) { /* game-specific jump */ }
    },
    render() {
      const r = hex.render();
      if (r.lost) {
        loop.stop();
        showOverlay(host, 'GPU device lost', 'Reload the page.');
      }
    },
    onError(e) { showOverlay(host, 'Runtime error', (e && e.message) || String(e)); }
  });

  return { start: () => loop.start(), stop: () => loop.stop(), hex, input, loop };
}
```

HTML shell (same pattern as Valley): `<script type="module" src="ui/main.js">` calling `bootMinimal`.  
Jump constants used by Valley: `JUMP_SPEED=6`, `GRAVITY=18` from `valley-explorer/core/engine/jump.js`.
