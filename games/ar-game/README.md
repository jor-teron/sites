# AR Theme Game

Phone camera AR-style game with an optional **WebXR immersive-ar** mode.

- **Themes:** Pet (default), Zombie, Ghost.
- **Pets (Pet theme):** Dog, Cat, Chicken, Bunny (CC0 GLBs) and **Ours** (procedural cartoon pet; drop `assets/models/pet/ours/pet.glb` to replace it). Last choice is remembered in `localStorage`.
- **Overlay mode (every browser):** live rear camera + Three.js overlay. Tap the target to score.
- **AR mode (where supported):** WebXR `immersive-ar` with hit-test + DOM overlay. Tap a surface to place, then tap the pet to catch. The pet wanders within ~1 m of the placement.

## Run / test

Camera and WebXR need a **secure context** (HTTPS or `localhost`).

```bash
# From the sites repo root:
python3 -m http.server 8000
# Open http://localhost:8000/games/ar-game/
# Or open the hub: http://localhost:8000/hub.html#ar-game
```

On a phone over LAN, plain `http://192.168.…` will **not** get a camera. Use one of:

- GitHub Pages: https://jor-teron.github.io/sites/games/ar-game/
- Chrome DevTools → Port forwarding (`chrome://inspect`) to your laptop's `localhost`
- An HTTPS tunnel (e.g. `npx localtunnel --port 8000`)

### AR mode support

| Device / browser                         | Overlay | WebXR AR |
|------------------------------------------|---------|----------|
| Android Chrome + ARCore / Play Services for AR | yes     | yes      |
| iOS Safari / Chrome                      | yes     | no (no WebXR AR) |
| Desktop Chrome / Firefox                 | yes     | no (no AR headset / ARCore) |

When AR is available an **Enter AR** button appears at the top. Exit with the same button (becomes **Exit AR**) or the browser's XR UI.

## Tech

- ES modules + import map (no bundler).
- Three.js **r160** vendored under `vendor/three/` (module build + GLTFLoader, SkeletonUtils, BufferGeometryUtils). MIT licence in `vendor/three/LICENSE`.
- WebXR `immersive-ar` with `hit-test` (required) and `dom-overlay` (optional) so the HUD stays on screen.

## Pet models (CC0)

| Id | File | Author | Source | Licence |
|----|------|--------|--------|---------|
| dog | `assets/models/pet/dog/dog.glb` (~290 KB) | Quaternius | https://poly.pizza/m/2kUk0QqpCg | CC0 1.0 |
| cat | `assets/models/pet/cat/cat.glb` (~109 KB) | Quaternius | https://poly.pizza/m/2f54vbV0In | CC0 1.0 |
| chicken | `assets/models/pet/chicken/chicken.glb` (~137 KB) | Quaternius | https://poly.pizza/m/ineV9pU5VL | CC0 1.0 |
| bunny | `assets/models/pet/bunny/bunny.glb` (~526 KB) | Quaternius | https://poly.pizza/m/irZjWFARyl | CC0 1.0 |
| ours | procedural (or `assets/models/pet/ours/pet.glb`) | — | — | — |

Each GLB folder has a `LICENSE.txt` with the source URL, sha256 and animation clip list. Credit is not required by CC0, but is given with thanks. Quaternius FAQ: https://quaternius.com/faq.html ("All models are under the CC0 License.").

Idle / Walk / Jump clips are picked by short name (after the last `|`); missing clips fall back gracefully. While a GLB loads — or if it 404s / fails to parse — the procedural pet is shown.

## Layout

```
ar-game.html          entry (import map + UI)
ar-game.css           full-screen HUD / pet picker / AR button
ar-game_config.js     tunables + pet roster
ar-game_logic.js      boot, scoring, theme/pet switch, XR toggle
js/camera.js          getUserMedia start/stop
js/ar.js              Three.js renderer / scene / hit tests
js/xr.js              immersive-ar session, reticle, place, wander
js/pets.js            GLB cache, SkeletonUtils.clone, AnimationMixer, procedural pet
js/themes/{pet,zombie,ghost}.js
assets/models/pet/{dog,cat,chicken,bunny,ours}/
vendor/three/         three.module.min.js + addons
```

Placeholder note: Zombie and Ghost still use primitive shapes. Swap in models later the same way Pet does.
