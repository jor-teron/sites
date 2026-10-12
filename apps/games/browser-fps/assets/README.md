# Browser FPS assets

Models are ES modules (code-built with Three.js) or optional `.glb` files, chosen in
`browser-fps_config.js` → `assets`:

```js
assets: {
  gun:    'guns/rifle_hq',            // or 'guns/rifle_basic'
  arms:   'characters/arms_hq',       // or 'characters/arms_basic'
  enemy:  'enemies/soldier_mk3',      // or 'enemies/soldier_mk2' / 'enemies/soldier_hq' / 'enemies/humanoid_basic'
  medkit: 'pickups/medkit_basic',
  grenade: 'weapons/grenade_frag',        // thrown grenade: build() -> Group (origin at centre)
  grenadePickup: 'pickups/grenade_crate', // map pickup: build() -> { root, kit, glow }
  textures: {                         // null = plain colours
    floor: 'textures/floor_concrete',
    wall:  'textures/wall_brick',
    cover: 'textures/cover_concrete_block',
  },
}
```

A slot value is either a built-in id (`<folder>/<file>` without `.js`) or a glTF binary:

```js
gun: { glb: 'assets/guns/m4.glb', fallback: 'guns/rifle_hq', scale: 1, position: [0,0,0], rotation: [0,0,0] }
```

`assets/registry.js` loads every slot at startup. The `.glb` path is relative to the game folder.
glTF files are loaded with three's `GLTFLoader` (three@0.170.0, `three/addons/` in the import map).
If anything fails (missing file, 404, bad module, wrong kind), it logs a `[assets]` warning and uses the
fallback (or the slot default), so the game always starts. `window.__fps.assets` / `assetLog` show what loaded.

## Folders

| folder        | slot     | kind     |
|---------------|----------|----------|
| `guns/`       | `gun`    | `gun`    |
| `characters/` | `arms`   | `arms`   (player first-person arms/hands) |
| `enemies/`    | `enemy`  | `enemy`  |
| `pickups/`    | `medkit` | `medkit` |
| `pickups/`    | `grenadePickup` | `pickup` |
| `weapons/`    | `grenade` | `grenade` |
| `sounds/`     | `sounds` | `sounds` (Web Audio synth pack: `make(ctx)` -> named sound fns) |
| `props/`      | `palm` / `bush` / `rock` | `prop` (island props, instanced: `build()` -> `{ parts, solid, conceal }`) |
| `textures/`   | `textures.floor/wall/cover` | `texture` |

`wear.js` holds shared helpers (procedural wear/roughness textures, capsule/limb meshes).

## Interfaces

Every module has a default export `{ kind, name, ... }`. Share geometry/materials at module level.

### gun — `build() -> { group, mag, muzzle, sight, hands }`
* **Gun space:** forward = **-Z**, up = +Y, origin ≈ receiver centre. One unit = 1 m before the viewmodel's
  0.6 scale; the rig places it lower-right of the camera (`browser-fps_viewmodel.js`).
* `group`: all meshes. `mag`: Object3D for the magazine, child of `group`, at its rest position. The reload
  animation drops/raises it along Y.
* `muzzle` (Vector3): barrel tip. Muzzle flash, tracers and the flash light start here.
* `sight` (Vector3): scope eyepiece / rear sight on the sight axis. Aiming centres this on the screen
  (ADS). The 4x zoom and overlay come from `config.scope`.
* `hands.right` / `hands.left` (Vector3): pistol grip and handguard/foregrip. The arms are placed there.
* Recoil, bob, sway and reload transform the whole gun. No skeleton needed.
* Budget: about 1.5k triangles for the gun (rifle_hq ≈ 1.5k; arms_hq + rifle_hq ≈ 3.1k together).

### arms — `build(gun) -> { right, left }`
* Two Object3Ds in **gun space**, built around `gun.hands`. `left` moves as a whole during reload
  (hand to the mag well and back), so keep the left hand, wrist and sleeve inside it.
* Sleeves should run back/down toward the camera (+Z, -Y) so they leave the screen edge.

### enemy — `createTarget(spec, opts) -> target`
* Built-ins: `soldier_hq` (default: vest, pouches, belt, shaped arms, cargo trousers, knee pads, boots;
  ~1.2k tris) and `humanoid_basic` (~420 tris).
* New humanoid models: write a body builder and call `createTarget(spec, opts, myBody)` from
  `humanoid_basic.js` (see `soldier_hq.js`). The builder gets `{ spec, pivot, part, G, THREE }` and returns
  `{ mats, legL, legR }`. It must call `buildHead(part, skinMat)` (shared head = shared head hit zone).
  `legL`/`legR` are hip pivots at y 0.9 (walk swing), and `mats` get the white hit flash. The rig keeps
  hit zones, collider, knockback, death fall, corpse sink and the muzzle flash.
* See the header of `enemies/humanoid_basic.js` for the full target object (raycast/hit/update/touches/…).
* Local space: origin at the **feet**, facing **+Z**, about 2 units tall.
* **Hit zones** (in `humanoid_basic.js`): head sphere `c (0,1.84,0) r 0.19` (×2.5 damage), body boxes
  torso/arms `x ±0.44, y 0.88–1.7, z ±0.17` and legs `x ±0.24, y 0–0.88, z ±0.13`. Player collider is
  0.84 × 2.02. A new enemy model should match these proportions, or change the zones together with it.
* Enemy gun muzzle: `MUZZLE_LOCAL (0.1, 1.3, 0.78)`.
* A `.glb` enemy is passed as `opts.visual`: the code humanoid's meshes are hidden and the model is added
  to its pivot. Hit zones, collider, knockback, death fall, rise and walk bob still work. Leg swing does
  not (no skeleton). Animate the glb yourself if it has clips.

### texture — `make(renderer, { tileSize }) -> { map, bumpMap?, bumpScale?, tile: [w, h], roughness?, tint? }`
* Procedural CanvasTextures, made once and cloned per box. `tile` is the world size covered by one
  repeat; the arena sets `repeat = (max(box w, d) / tile[0], box h / tile[1])` for walls/cover and
  `(arena w / tile[0], arena d / tile[1])` for the floor, so bricks/blocks keep their real size.
* Use RepeatWrapping and draw seams on the texture edges so it tiles. `tint` (0..1) = how much of the
  per-box config colour is kept (cover). Otherwise the box colour is white so the texture shows true.
* Built-ins: `floor_concrete` (tile 4 x floorTileSize), `wall_brick` (2 x 2 u, bricks 0.5 x 0.25,
  bump map), `cover_concrete_block` (1 x 1 u, bump map).

### medkit — `build() -> { root, kit, glow }`
* `root` stands on the floor (y = 0). The pickup logic bobs/spins `kit` and pulses `glow.material.opacity`
  (`glow` is optional). Size about 0.5 × 0.35 × 0.35.

## glb node names (optional anchors)
* gun: `muzzle`, `sight`, `hand_R`, `hand_L` (empties) and `mag` (magazine node, animated on reload).
  Missing ones come from the fallback code model.
* arms: `arm_R`, `arm_L` (if absent, the whole scene is the right arm and nothing moves on reload).
* Apply scale/rotation in the config (`scale`, `rotation`) or bake it into the file. Use gun-space
  orientation (-Z forward).

## Adding a model
1. Copy e.g. `guns/rifle_basic.js` to `guns/my_rifle.js` and change `name` and the meshes/anchors.
2. Set `assets.gun = 'guns/my_rifle'` in the config. Or drop `my_rifle.glb` in `guns/` and use
   `{ glb: 'assets/guns/my_rifle.glb', fallback: 'guns/rifle_hq' }`.
