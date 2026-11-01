# AR Theme Game

Phone camera AR-style game with an optional **WebXR immersive-ar** mode.

- **Themes:** Pet (default), Zombie, Ghost.
- **Pets (Pet theme):** Dog, Cat, Chicken, Bunny (CC0 GLBs) and **Ours** (procedural cartoon pet; drop `assets/models/pet/ours/pet.glb` to replace it). Last choice is remembered in `localStorage`.
- **Overlay mode (every browser):** live rear camera + Three.js overlay. Tap the target to score.
- **AR mode (where supported):** WebXR `immersive-ar` with hit-test + DOM overlay. Tap a surface to place, then tap the pet to catch. The pet wanders within ~1 m of the placement.

## Ghost chase (Ghost theme)

Works in the normal camera-overlay mode, so no WebXR is needed.

- **Look around in 360°:** the phone's gyroscope (`deviceorientation`) turns a virtual camera and the live video stays as the background. The ghost sits in a direction around you and only appears when you point the phone at it.
- **Find it:** when the ghost is off-screen, a white arrow at the screen edge points toward it. A synthesized hum/whoosh (Web Audio, no sound files) gets louder and brighter as you aim closer, panned left or right toward it. Audio starts on your tap.
- **Chase it:** aim at the ghost and it slides away. Sometimes it dashes behind you, so turn around. Evasion speed is capped. After a few seconds of being chased it gets **tired**: it barely moves and becomes more opaque. Tap it to catch (+1 score, then a new ghost spawns somewhere else around you).
- **iOS:** the motion permission prompt (`DeviceOrientationEvent.requestPermission`) is triggered by tapping **Ghost**. If that fails, tap the screen again to retry.
- **No gyroscope (desktop) or motion denied:** drag/swipe to look around (drag right turns left, "grab the world"). Drag also adds a yaw offset on phones.
- Tunables live in `ar-game_config.js` → `themes.ghost.chase` (distance, evade angle/speed/cap, dash chance, tiredness, drag sensitivity).
- Leaving the Ghost theme restores the normal overlay camera, removes the listeners, hides the arrow and suspends audio.
- In WebXR AR mode the ghost keeps the simple hover/pulse behaviour.

## Zombie survival (Zombie theme)

The real game mode (Pet = playful, Ghost = finding). Works in the normal camera-overlay mode.

- **360° look** like Ghost: gyroscope, or drag/swipe when there is no gyro.
- **Zombies** (code-built, ~1.6k triangles each, 256 px canvas textures: pale green skin with veins and wounds, torn plaid shirt with ragged hem and holes, ripped trousers, glowing eyes) spawn 11–15 m around you and shamble toward you (arms forward, limping, head lolling), growing larger as they get close. Wave 1 spawns roughly ahead of you; later waves come from every side.
- **Tap a zombie 2–3 times** to drop it. It flinches, flashes red and is knocked back on each hit, then falls over and fades. +1 score per kill.
- **If one reaches you:** red screen flash, vibration, -1 life. 3 lives (hearts at the bottom). At 0: **Game over** card with score, wave and best, plus **Retry**.
- **Waves:** a "Wave N" banner; each wave adds 2 zombies and +10% speed (capped at 2x).
- **Red edge arrow** points to the nearest zombie when it is off-screen.
- **Sound:** synthesized groans (louder and panned toward nearby zombies), hit thuds, death groans, damage boom (Web Audio, starts on your tap). `navigator.vibrate` on hits and damage where supported.
- **Best score** saved in `localStorage` (`ar-game.zombieBest`).
- Tunables: `ar-game_config.js` → `themes.zombie` (lives, distances, speed, wave sizes, spawn gaps, taps to kill, knockback, drag sensitivity).
- Leaving the theme restores the overlay camera and the previous score, hides the HUD/arrow and suspends audio.
- **WebXR AR mode:** falls back to one shambling zombie placed on the floor that wanders near you; tap it to drop it (+1).

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

**No-AR phones:** on open the game checks `navigator.xr.isSessionSupported('immersive-ar')`. If AR is missing, an overlay says "Your phone doesn't support AR — you'll get camera mode instead" with **Enter anyway** / **Back**. Pet is greyed out as **Pet (AR only)** and the game opens in Zombie; Zombie and Ghost play in camera + gyro mode. Phones with AR see no change.

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
ui/ar-game.css        full-screen HUD / pet picker / AR button
core/ar-game_config.js tunables + pet roster
core/ar-game_logic.js boot, scoring, theme/pet switch, XR toggle
core/camera.js        getUserMedia start/stop
core/ar.js            Three.js renderer / scene / hit tests
core/xr.js            immersive-ar session, reticle, place, wander
core/look.js          360° look: deviceorientation → camera, drag fallback, iOS permission
core/zombie_model.js  code-built zombie: textures, pivots, shamble / flinch / death poses
core/zombie_audio.js  Web Audio groans, hits, death, damage
core/themes/zombie.js zombie survival game (waves, lives, taps, arrow, HUD)
core/ghost_audio.js   Web Audio proximity hum/whoosh for the Ghost chase
core/pets.js          GLB cache, SkeletonUtils.clone, AnimationMixer, procedural pet
core/themes/{pet,zombie,ghost}.js
assets/models/pet/{dog,cat,chicken,bunny,ours}/
vendor/three/         three.module.min.js + addons
```

Placeholder note: Zombie and Ghost still use primitive shapes. Swap in models later the same way Pet does.
