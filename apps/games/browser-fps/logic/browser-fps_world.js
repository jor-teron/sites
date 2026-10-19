/**
 * Browser FPS — world setup and the shared context object.
 * createWorld() derives the map / mode / quality settings, grabs the DOM, builds the renderer, scene, camera,
 * lights, the camp arena or terrain map, effects and doors, and creates the player record. It returns the
 * context `S` that every logic module receives: constants and shared objects are plain fields, mutable
 * scalars shared between modules (yaw, pitch, MODE, input flags, ...) live on S, and each module registers
 * the functions other modules call (S.fire, S.damagePlayer, ...). Modules never import each other.
 */
import * as THREE from 'three';
import { createViewmodel } from '../render/browser-fps_viewmodel.js';
import { createAudio } from '../audio/browser-fps_audio.js';
import { buildIsland } from '../maps/browser-fps_island.js';
import { buildSnow } from '../maps/browser-fps_snow.js';
import { buildForest } from '../maps/browser-fps_forest.js';
import { createDoors } from './browser-fps_doors.js';
import { setupIslandLook } from './browser-fps_look.js';
import { createFx } from './browser-fps_fx.js';

export function createWorld(CFG, ASSETS) {
  const audio = createAudio(CFG.audio, ASSETS.sounds);
  const PLAYER_HEIGHT = CFG.player.height;
  // Map: 'camp' (Training Camp, walled box) or 'island'. ?map=island in the URL overrides the saved choice.
  const MAPS = ['camp', 'island', 'snow', 'forest'];
  const MAP = (() => {
    const q = new URLSearchParams(location.search).get('map');
    const m = q || localStorage.getItem(CFG.maps.storageKey) || CFG.maps.default;
    return MAPS.includes(m) ? m : 'camp';
  })();
  const SNOW = MAP === 'snow';
  const FOREST = MAP === 'forest';   // 1 km procedural forest (chunked LOD terrain, local AI grid)
  // Mode: 'explore' (no enemies, pickups, grenades or score) | 'fight'. URL ?mode= > saved choice > map default.
  const MODE_CFG = CFG.modes.perMap[MAP];
  const MODE = (() => {
    const q = new URLSearchParams(location.search).get('mode') || localStorage.getItem(CFG.modes.storageKey);
    return MODE_CFG.allowed.includes(q) ? q : MODE_CFG.default;
  })();
  const IS = SNOW ? CFG.snow : FOREST ? CFG.forest : CFG.island;   // terrain-map config (island, snow or forest)
  const ISLAND = MAP === 'island' || SNOW || FOREST;   // terrain map (heightfield, props, no camp walls)
  // Island: a square world box around the circle (grid / bounds), no walls or cover boxes
  const ARENA = ISLAND ? { ...CFG.arena, w: 2 * (IS.radius + IS.wade + 2), d: 2 * (IS.radius + IS.wade + 2), covers: [] } : CFG.arena;
  // Effects quality ('high' | 'low'); ?quality=low in the URL overrides the config
  const FXQ = (() => { const q = new URLSearchParams(location.search).get('quality') || CFG.fx.quality; return CFG.fx.presets[q] ? q : 'high'; })();
  const FX = { ...CFG.fx, ...CFG.fx.presets[FXQ], quality: FXQ };
  const SC = ISLAND ? { ...CFG.scene, ...IS.scene } : CFG.scene;

  const S = {
    CFG, ASSETS, audio, MAPS, MAP, SNOW, FOREST, MODE_CFG, IS, ISLAND, ARENA, FXQ, FX, SC,
    W: CFG.weapon, KEYS: CFG.keys,
    MODE,                                  // current mode (setMode changes it)
    yaw: 0, pitch: 0,                      // camera.rotation.y = yaw, camera.rotation.x = pitch
    keys: Object.create(null),
    pointerLocked: false,
    touchPlaying: false,                   // playing via on-screen touch controls (no pointer lock)
    touchMove: { x: 0, y: 0, sprint: false },   // analog joystick (browser-fps_touch.js)
    shooting: false,
    aimHeld: false,                        // right mouse button held
    aimT: 0,                               // 0 = hip, 1 = fully scoped (smoothed)
    spawnTimer: CFG.spawn.interval,
    nearDoor: null,
    touch: null,
    enemies: [],
    colliders: [],                         // solid AABBs used for player collision (world-space min/max)
  };
  S.isFight = () => S.MODE === 'fight';
  S.held = (list) => list.some((c) => S.keys[c]);
  S.active = () => S.pointerLocked || S.touchPlaying;
  /** Positional sound at a world point (volume by distance, pan by yaw). */
  S.sfxAt = (name, pos, vol) => audio.play(name, { pos, listener: S.player.pos, yaw: S.yaw, vol });
  S.createTarget = (spec) => ASSETS.enemy.createTarget(spec);
  document.body.classList.toggle('explore', !S.isFight());

  // ─── DOM ──────────────────────────────────────────────────────────────────
  for (const [k, id] of Object.entries({
    overlay: 'overlay', hud: 'hud', hpVal: 'hp-val', ammoVal: 'ammo-val', nadeVal: 'nade-val', nadePop: 'nade-pop',
    hitmarker: 'hitmarker', dmgFlash: 'dmg-flash', healFlash: 'heal-flash', healPop: 'heal-pop', deathEl: 'death',
    scopeOverlay: 'scope-overlay', crosshairEl: 'crosshair', deathMsg: 'death-msg', retryBtn: 'retry-btn', exitBtn: 'exit-btn',
  })) S[k] = document.getElementById(id);

  // ─── Renderer / Scene / Camera ────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, SC.maxPixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = SC.toneMappingExposure;
  renderer.autoClear = false;   // world pass, then viewmodel pass on a cleared depth buffer
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SC.background);
  scene.fog = new THREE.Fog(SC.background, SC.fogNear, SC.fogFar);

  const camera = new THREE.PerspectiveCamera(SC.fov, window.innerWidth / window.innerHeight, SC.near, SC.far);
  camera.rotation.order = 'YXZ';

  // First-person arms + rifle (own scene/camera, drawn last so it never clips into walls)
  const vm = createViewmodel(ASSETS.gun, ASSETS.arms);
  Object.assign(S, { renderer, scene, camera, vm });

  // ─── Lights ───────────────────────────────────────────────────────────────
  const amb = new THREE.AmbientLight(SC.ambientColor, SC.ambientIntensity);
  scene.add(amb);
  const sun = new THREE.DirectionalLight(SC.sunColor, SC.sunIntensity);
  sun.position.set(...SC.sunPos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SC.shadowMapSize, SC.shadowMapSize);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = SC.shadowFar;
  sun.shadow.camera.left = -SC.shadowExtent;
  sun.shadow.camera.right = SC.shadowExtent;
  sun.shadow.camera.top = SC.shadowExtent;
  sun.shadow.camera.bottom = -SC.shadowExtent;
  scene.add(sun);
  const fill = new THREE.HemisphereLight(SC.hemiSky, SC.hemiGround, SC.hemiIntensity);
  scene.add(fill);
  S.sun = sun;

  // ─── Arena builders ───────────────────────────────────────────────────────
  const colliders = S.colliders;

  function addBox(w, h, d, x, y, z, color, opts = {}) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.85,
      metalness: opts.metalness ?? 0.05,
      map: opts.map || null,
      bumpMap: opts.bumpMap || null,
      bumpScale: opts.bumpScale ?? 1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = opts.castShadow !== false;
    mesh.receiveShadow = true;
    scene.add(mesh);

    if (opts.collide !== false) {
      colliders.push({
        min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
        max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2),
        mesh,
      });
    }
    return mesh;
  }

  function buildArena() {
    const hw = ARENA.w / 2;
    const hd = ARENA.d / 2;
    const th = ARENA.wallThickness; // wall thickness

    // Textures from CFG.assets.textures (generated once, cloned per box with a size-correct repeat)
    const TX = ASSETS.textures;
    const made = {};
    const tex = (slot) => (TX[slot] ? (made[slot] ||= TX[slot].make(renderer, { tileSize: ARENA.floorTileSize })) : null);
    /** Box material options with repeat = box size / texture tile (long side x height for walls/cover). */
    function texOpts(slot, w, h, d, color) {
      const t = tex(slot);
      if (!t) return { color, opts: {} };
      const rep = (src) => { if (!src) return null; const c = src.clone(); c.repeat.set(Math.max(w, d) / t.tile[0], h / t.tile[1]); c.needsUpdate = true; return c; };
      const tint = t.tint != null ? new THREE.Color(color).lerp(new THREE.Color(0xffffff), 1 - t.tint) : 0xffffff;
      return { color: tint, opts: { map: rep(t.map), bumpMap: rep(t.bumpMap), bumpScale: t.bumpScale, roughness: t.roughness } };
    }

    // Floor (repeat over its top face: w x d)
    {
      const t = tex('floor');
      const o = { castShadow: false, roughness: 0.95 };
      if (t) {
        o.map = t.map.clone();
        o.map.repeat.set(ARENA.w / t.tile[0], ARENA.d / t.tile[1]);
        o.map.needsUpdate = true;
        o.roughness = t.roughness ?? 0.95;
      }
      addBox(ARENA.w, 0.4, ARENA.d, 0, -0.2, 0, ARENA.floorColor, o);
    }

    // Outer walls
    const wall = (w, h, d, x, y, z, color) => { const t = texOpts('wall', w, h, d, color); addBox(w, h, d, x, y, z, t.color, t.opts); };
    wall(ARENA.w + th * 2, ARENA.wallH, th, 0, ARENA.wallH / 2, -hd - th / 2, ARENA.wallColorNS);
    wall(ARENA.w + th * 2, ARENA.wallH, th, 0, ARENA.wallH / 2, hd + th / 2, ARENA.wallColorNS);
    wall(th, ARENA.wallH, ARENA.d, -hw - th / 2, ARENA.wallH / 2, 0, ARENA.wallColorEW);
    wall(th, ARENA.wallH, ARENA.d, hw + th / 2, ARENA.wallH / 2, 0, ARENA.wallColorEW);

    // Cover boxes (low-poly crates / barriers) + center stack
    for (const [w, h, d, x, y, z, color] of ARENA.covers) {
      const t = texOpts('cover', w, h, d, color);
      addBox(w, h, d, x, y, z, t.color, t.opts);
    }
  }

  let island = null, islandLook = null;
  if (ISLAND) {
    const keepClear = CFG.doors.list.filter((d) => d.map === MAP).map((d) => [d.pos[0], d.pos[1], CFG.doors.clear]);
    island = (SNOW ? buildSnow : FOREST ? buildForest : buildIsland)(scene, { ...IS, keepClear, look: FX.look ? IS.look : null }, ASSETS, renderer, { water: FX.water, waterFx: FX.water === 'reflect' ? CFG.fx.water : null });
    for (const c of island.colliders) colliders.push(c);
    scene.add(sun.target);
    if (FX.look && IS.look) islandLook = setupIslandLook({ scene, renderer, camera, sun, island, cfg: IS.look, sc: SC, colliders: island.colliders });
  } else buildArena();
  S.island = island; S.islandLook = islandLook;
  S.fx = createFx(scene, FX);
  /** Ground height under (x, z): 0 in the camp, the terrain on the island. */
  const groundAt = S.groundAt = ISLAND ? island.heightAt : () => 0;
  S.onLand = ISLAND ? island.onLand : () => true;
  // Doors between maps (CFG.doors); arriving through one (?from=<map>) spawns in front of the matching return door
  const doors = S.doors = createDoors({ scene, map: MAP, cfg: CFG.doors, groundAt, colliders, mapNames: CFG.mapNames });
  const FROM = new URLSearchParams(location.search).get('from');
  const ARRIVAL = S.ARRIVAL = FROM ? doors.arrival(FROM) : null;
  const START = S.START = ARRIVAL ? [ARRIVAL.x, ARRIVAL.z] : ISLAND ? island.start : CFG.player.start;

  // ─── Player state ─────────────────────────────────────────────────────────
  const player = S.player = {
    pos: new THREE.Vector3(START[0], PLAYER_HEIGHT + groundAt(START[0], START[1]), START[1]),
    vel: new THREE.Vector3(0, 0, 0),
    onGround: false,
    health: CFG.player.maxHealth,
    ammo: CFG.weapon.magSize,
    reloading: false,
    reloadT: 0,
    fireCooldown: 0,
    grenades: CFG.grenades.start,
    nadeCd: 0,
  };
  if (ISLAND && island.setFollow) island.setFollow(player.pos);   // forest: enemy spawn ring follows the player
  S.START_YAW = !ARRIVAL && ISLAND && island.startYaw != null ? island.startYaw : 0;
  S.yaw = S.START_YAW;

  // ─── Ray queries against the static world (shared by bullets, enemy sight and grenade blasts) ──
  /** Island: march the ray over the heightfield; distance where it dips under the terrain, or Infinity. */
  function terrainHit(origin, dir, maxT = 100) {
    if (!ISLAND) return Infinity;
    for (let t = 0.5; t < maxT; t += 0.6) {
      if (origin.y + dir.y * t < groundAt(origin.x + dir.x * t, origin.z + dir.z * t)) {
        let a = t - 0.6, b = t;                         // refine the crossing (exact impact point)
        for (let k = 0; k < 6; k++) { const m = (a + b) / 2; if (origin.y + dir.y * m < groundAt(origin.x + dir.x * m, origin.z + dir.z * m)) b = m; else a = m; }
        return Math.max(0.05, b);
      }
    }
    return Infinity;
  }
  /** Island: does the segment from -> (dir, dist) pass through a bush (concealment)? */
  function bushBlocks(from, dir, dist) {
    if (!ISLAND) return false;
    for (const b of island.bushes) {
      const ox = b.x - from.x, oy = b.y - from.y, oz = b.z - from.z;
      const t = ox * dir.x + oy * dir.y + oz * dir.z;
      if (t < 0 || t > dist) continue;
      const dx = ox - dir.x * t, dy = oy - dir.y * t, dz = oz - dir.z * t;
      if (dx * dx + dy * dy + dz * dz < b.r * b.r) return true;
    }
    return false;
  }
  /** Distance along the ray to the nearest wall/cover (targets ignored), or Infinity. */
  function wallHit(origin, dir, maxT = Infinity) {
    let best = Infinity;
    for (const c of colliders) {
      if (c.target || c.disabled) continue;
      // walls / cover never move: cache centre + half extents (+ bounding radius for the distance skip)
      if (!c._half) {
        c._half = new THREE.Vector3().subVectors(c.max, c.min).multiplyScalar(0.5);
        c._center = new THREE.Vector3().addVectors(c.min, c.max).multiplyScalar(0.5);
      }
      if (maxT < Infinity) {   // boxes farther than maxT cannot block (big maps: hundreds of trunks)
        const dx = c._center.x - origin.x, dy = c._center.y - origin.y, dz = c._center.z - origin.z, r = c._r ??= c._half.length();
        if (dx * dx + dy * dy + dz * dz > (maxT + r) * (maxT + r)) continue;
      }
      const t = rayAABB(origin, dir, c._center, c._half);
      if (t !== null && t > 0.05 && t < best) best = t;
    }
    return Math.min(best, terrainHit(origin, dir, Math.min(best, maxT, 100)));
  }
  /** Ray vs AABB (center + half-extents). Returns distance or null. */
  function rayAABB(origin, dir, center, half) {
    // no per-call allocation (called for every collider on every shot / sight check)
    const ix = dir.x !== 0 ? 1 / dir.x : 1e12, iy = dir.y !== 0 ? 1 / dir.y : 1e12, iz = dir.z !== 0 ? 1 / dir.z : 1e12;
    const t1 = (center.x - half.x - origin.x) * ix;
    const t2 = (center.x + half.x - origin.x) * ix;
    const t3 = (center.y - half.y - origin.y) * iy;
    const t4 = (center.y + half.y - origin.y) * iy;
    const t5 = (center.z - half.z - origin.z) * iz;
    const t6 = (center.z + half.z - origin.z) * iz;
    const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4), Math.min(t5, t6));
    const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4), Math.max(t5, t6));
    if (tmax < 0 || tmin > tmax) return null;
    return tmin >= 0 ? tmin : tmax;
  }
  Object.assign(S, { terrainHit, bushBlocks, wallHit, rayAABB });
  return S;
}
