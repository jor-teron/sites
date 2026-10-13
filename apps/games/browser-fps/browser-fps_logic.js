/**
 * Browser FPS starter — Assault Cube–style feel (placeholders only).
 * Three.js r170 via import map. No build step.
 */
import * as THREE from 'three';
import { loadAssets, loadLog } from './assets/registry.js';
import { createViewmodel } from './browser-fps_viewmodel.js';
import { createPickups } from './browser-fps_pickups.js';
import { createGrenades } from './browser-fps_grenades.js';
import { createAudio } from './browser-fps_audio.js';
import { buildIsland } from './browser-fps_island.js';
import { buildSnow } from './browser-fps_snow.js';
import { createDoors } from './browser-fps_doors.js';
import { setupIslandLook } from './browser-fps_look.js';
import { createFx } from './browser-fps_fx.js';

// ─── Tunables (from browser-fps_config.js) ──────────────────────────────────
const CFG = window.BROWSER_FPS_CONFIG;
// Models (gun, arms, enemy, medkit) chosen by CFG.assets; .glb models fall back to code models on failure
const ASSETS = await loadAssets(CFG.assets);
const audio = createAudio(CFG.audio, ASSETS.sounds);
const listenerPos = () => player.pos;
/** Positional sound at a world point (volume by distance, pan by yaw). */
const sfxAt = (name, pos, vol) => audio.play(name, { pos, listener: listenerPos(), yaw, vol });
const createTarget = (spec) => ASSETS.enemy.createTarget(spec);
const PLAYER_HEIGHT = CFG.player.height;
const PLAYER_RADIUS = CFG.player.radius;
const MOVE_SPEED = CFG.player.moveSpeed;
const SPRINT_MULT = CFG.player.sprintMult;
const JUMP_VEL = CFG.player.jumpVel;
const GRAVITY = CFG.player.gravity;
const MOUSE_SENS = CFG.player.mouseSens;
const SCOPE = CFG.scope;
const FIRE_RATE = CFG.weapon.fireRate;
const MAG_SIZE = CFG.weapon.magSize;
const RELOAD_TIME = CFG.weapon.reloadTime;
const HIT_DAMAGE = CFG.weapon.hitDamage;
const MAX_HEALTH = CFG.player.maxHealth;
// Map: 'camp' (Training Camp, walled box) or 'island'. ?map=island in the URL overrides the saved choice.
const MAPS = ['camp', 'island', 'snow'];
const MAP = (() => {
  const q = new URLSearchParams(location.search).get('map');
  const m = q || localStorage.getItem(CFG.maps.storageKey) || CFG.maps.default;
  return MAPS.includes(m) ? m : 'camp';
})();
const SNOW = MAP === 'snow';
const IS = SNOW ? CFG.snow : CFG.island;   // terrain-map config (island or snow)
const ISLAND = MAP === 'island' || SNOW;   // terrain map (heightfield, props, no camp walls)
// Island: a square world box around the circle (grid / bounds), no walls or cover boxes
const ARENA = ISLAND ? { ...CFG.arena, w: 2 * (IS.radius + IS.wade + 2), d: 2 * (IS.radius + IS.wade + 2), covers: [] } : CFG.arena;
// Effects quality ('high' | 'low'); ?quality=low in the URL overrides the config
const FXQ = (() => { const q = new URLSearchParams(location.search).get('quality') || CFG.fx.quality; return CFG.fx.presets[q] ? q : 'high'; })();
const FX = { ...CFG.fx, ...CFG.fx.presets[FXQ], quality: FXQ };
const SC = ISLAND ? { ...CFG.scene, ...IS.scene } : CFG.scene;
const W = CFG.weapon;
const KEYS = CFG.keys;
const held = (list) => list.some((c) => keys[c]);

// ─── DOM ────────────────────────────────────────────────────────────────────
const overlay = document.getElementById('overlay');
const hud = document.getElementById('hud');
const hpVal = document.getElementById('hp-val');
const ammoVal = document.getElementById('ammo-val');
const nadeVal = document.getElementById('nade-val');
const nadePop = document.getElementById('nade-pop');
const hitmarker = document.getElementById('hitmarker');
const dmgFlash = document.getElementById('dmg-flash');
const healFlash = document.getElementById('heal-flash');
const healPop = document.getElementById('heal-pop');
const deathEl = document.getElementById('death');
const scopeOverlay = document.getElementById('scope-overlay');
const crosshairEl = document.getElementById('crosshair');
const deathMsg = document.getElementById('death-msg');
const retryBtn = document.getElementById('retry-btn');

// ─── Renderer / Scene / Camera ──────────────────────────────────────────────
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

// Pitch helper: camera.rotation.x = pitch, camera.rotation.y = yaw
let yaw = 0;
let pitch = 0;

// ─── Lights ─────────────────────────────────────────────────────────────────
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

// ─── Arena builders ─────────────────────────────────────────────────────────
/** Solid AABBs used for player collision (world-space min/max). */
const colliders = [];

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
  island = (SNOW ? buildSnow : buildIsland)(scene, { ...IS, keepClear, look: FX.look ? IS.look : null }, ASSETS, renderer, { water: FX.water, waterFx: FX.water === 'reflect' ? CFG.fx.water : null });
  for (const c of island.colliders) colliders.push(c);
  scene.add(sun.target);
  if (FX.look && IS.look) islandLook = setupIslandLook({ scene, renderer, camera, sun, island, cfg: IS.look, sc: SC, colliders: island.colliders });
} else buildArena();
const fx = createFx(scene, FX);
/** Ground height under (x, z): 0 in the camp, the terrain on the island. */
const groundAt = ISLAND ? island.heightAt : () => 0;
const onLand = ISLAND ? island.onLand : () => true;
// Doors between maps (CFG.doors); arriving through one (?from=<map>) spawns in front of the matching return door
const doors = createDoors({ scene, map: MAP, cfg: CFG.doors, groundAt, colliders, mapNames: CFG.mapNames });
const FROM = new URLSearchParams(location.search).get('from');
const ARRIVAL = FROM ? doors.arrival(FROM) : null;
const START = ARRIVAL ? [ARRIVAL.x, ARRIVAL.z] : ISLAND ? island.start : CFG.player.start;

// ─── Enemies (humanoid targets, see browser-fps_target.js) ──────────────────
const enemies = [];

function newTarget(spec) {
  const en = createTarget(spec);
  en.groundAt = groundAt;   // feet follow the terrain
  scene.add(en.group);
  colliders.push(en.collider);   // player can't walk through targets (skipped for bullets)
  enemies.push(en);
  return en;
}

/** Retry / start: hide every target, then place the initial ones at random far-half spots. */
function resetEnemies() {
  for (const en of enemies) {
    en.alive = false; en.dying = false; en.rising = 0; en.group.visible = false; en.collider.disabled = true;
  }
  placeInitialEnemies();
}

// ─── Timed spawning (random valid spot, rise-up animation, pooled) ─────────
const SP = CFG.spawn;
let spawnTimer = SP.interval;

function spotIsFree(x, z, gap = SP.targetGap) {
  const m = SP.coverMargin;
  for (const c of colliders) {
    if (c.disabled || c.target) continue;
    if (c.max.y <= 0.05) continue;                        // the floor
    if (x > c.min.x - m - 0.42 && x < c.max.x + m + 0.42 && z > c.min.z - m - 0.42 && z < c.max.z + m + 0.42) return false;
  }
  for (const en of enemies) {
    if (!en.alive) continue;
    const p = en.group.position;
    if (Math.hypot(p.x - x, p.z - z) < gap) return false;
  }
  if (!onLand(x, z, SP.edgeMargin)) return false;
  return Math.hypot(player.pos.x - x, player.pos.z - z) >= SP.minPlayerDist;
}

/** Random point in the far half of the arena (z from the far wall up to farHalfMaxZ). */
function randomFarSpot() {
  if (ISLAND) return island.randomSpot(Math.random, { zMax: SP.farHalfMaxZ, margin: SP.edgeMargin + 1 });
  const lim = ARENA.w / 2 - SP.edgeMargin;
  const zMin = -(ARENA.d / 2 - SP.edgeMargin);
  return [(Math.random() * 2 - 1) * lim, zMin + Math.random() * (SP.farHalfMaxZ - zMin)];
}

/** Try to spawn one target. Returns it, or null if capped / no valid spot. */
function spawnRandomTarget(rise = true, gap = SP.targetGap) {
  if (enemies.filter((e) => e.alive).length >= SP.maxAlive) return null;
  for (let i = 0; i < SP.tries; i++) {
    const [x, z] = randomFarSpot();
    if (!spotIsFree(x, z, gap)) continue;
    const yaw = Math.atan2(player.pos.x - x, player.pos.z - z);
    let en = enemies.find((e) => !e.alive && !e.dying);
    if (!en) {
      if (enemies.length >= SP.poolMax) return null;
      en = newTarget({ pos: [x, 1, z], color: SP.colors[enemies.length % SP.colors.length], hp: SP.hp, faceYaw: yaw });
    }
    en.respawn(x, z, yaw, SP.hp, rise);
    return en;
  }
  return null;
}

/** Initial enemies: random valid far-half spots, spaced apart, already standing (no rise). */
function placeInitialEnemies() {
  for (let i = 0; i < SP.initialEnemies; i++) {
    if (!spawnRandomTarget(false, SP.initialGap)) spawnRandomTarget(false, SP.targetGap);  // relax spacing if crowded
  }
}

function updateSpawning(dt) {
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnTimer += SP.interval;
    spawnRandomTarget();
  }
}


// ─── Player state ───────────────────────────────────────────────────────────
const player = {
  pos: new THREE.Vector3(START[0], PLAYER_HEIGHT + groundAt(START[0], START[1]), START[1]),
  vel: new THREE.Vector3(0, 0, 0),
  onGround: false,
  health: MAX_HEALTH,
  ammo: MAG_SIZE,
  reloading: false,
  reloadT: 0,
  fireCooldown: 0,
  grenades: CFG.grenades.start,
  nadeCd: 0,
};

const keys = Object.create(null);
let pointerLocked = false;
let shooting = false;
let aimHeld = false;   // right mouse button held
let aimT = 0;          // 0 = hip, 1 = fully scoped (smoothed)
/** Scoping is blocked / cancelled while reloading. */
const wantsAim = () => aimHeld && !player.reloading && !nadeAim.holding && !isDead();
const sensNow = () => MOUSE_SENS * (1 + (SCOPE.sensMult - 1) * aimT);

function clearInput() {
  for (const k of Object.keys(keys)) delete keys[k];
  shooting = false;
  aimHeld = false;
}

/** Always free the mouse — do not rely on the browser's default Esc alone. */
function unlockPointer() {
  clearInput();
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
  pointerLocked = false;
  overlay.classList.toggle('hidden', isDead());
  hud.classList.remove('visible');
}

function syncPointerLockUi() {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  overlay.classList.toggle('hidden', pointerLocked || isDead());
  hud.classList.toggle('visible', pointerLocked);
  if (!pointerLocked) clearInput();
}

// ─── Input ──────────────────────────────────────────────────────────────────
// Mute: M key, or the speaker buttons on the start/pause and death screens (no in-game buttons)
const muteBtns = document.querySelectorAll('.mute-btn');
function syncMuteUi(m) { muteBtns.forEach((b) => { b.textContent = m ? '🔇' : '🔊'; b.title = m ? 'Sound off (M)' : 'Sound on (M)'; }); }
audio.onMute = syncMuteUi; syncMuteUi(audio.muted);
muteBtns.forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); audio.unlock(); audio.toggleMute(); }));
// AudioContext is created / resumed on the first user gesture
for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, () => audio.unlock(), { capture: true });
// Map selector on the start screen (reloads the page to build the other map; choice saved in localStorage)
function setMap(m) {
  if (!MAPS.includes(m)) return;
  localStorage.setItem(CFG.maps.storageKey, m);
  const u = new URL(location.href); u.searchParams.delete('map');
  if (m !== MAP || u.href !== location.href) location.href = u.href;
}
document.querySelectorAll('.map-btn').forEach((b) => {
  b.classList.toggle('active', b.dataset.map === MAP);
  b.addEventListener('click', (e) => { e.stopPropagation(); setMap(b.dataset.map); });
});
overlay.addEventListener('click', () => {
  audio.unlock();
  renderer.domElement.requestPointerLock();
});
retryBtn.addEventListener('click', () => {
  restartGame();
  renderer.domElement.requestPointerLock();
});

document.addEventListener('pointerlockchange', syncPointerLockUi);
document.addEventListener('pointerlockerror', () => {
  unlockPointer();
});

// Remote/desktop viewers often swallow Esc before the page sees it — unlock on blur too.
window.addEventListener('blur', unlockPointer);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) unlockPointer();
});

document.addEventListener('mousemove', (e) => {
  if (!pointerLocked) return;
  yaw -= e.movementX * sensNow();
  pitch -= e.movementY * sensNow();
  const lim = Math.PI / 2 - CFG.player.pitchLimitPad;
  pitch = Math.max(-lim, Math.min(lim, pitch));
});

document.addEventListener('keydown', (e) => {
  // Multiple unlock keys: Esc can be stolen by a host/viewer; P and ` still reach the page.
  if (KEYS.unlock.includes(e.code)) {
    e.preventDefault();
    e.stopPropagation();
    unlockPointer();
    return;
  }
  if (KEYS.mute.includes(e.code) && !e.repeat) { audio.toggleMute(); return; }
  if (!pointerLocked) return;
  keys[e.code] = true;
  if (e.code === CFG.doors.key && !e.repeat && nearDoor && !isDead()) useDoor(nearDoor);
  if (KEYS.reload.includes(e.code) && !player.reloading && !nadeAim.holding && player.ammo < MAG_SIZE) startReload();
  if (KEYS.grenade.includes(e.code) && !e.repeat && !isDead()) holdGrenade();
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; if (KEYS.grenade.includes(e.code)) releaseGrenade(); });

document.addEventListener('mousedown', (e) => {
  if (!pointerLocked) return;
  if (e.button === 0) shooting = true;
  if (e.button === 2) { if (nadeAim.holding) cancelGrenade(); else aimHeld = true; }
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) shooting = false;
  if (e.button === 2) aimHeld = false;
});
// Right mouse button is aim: never open the context menu over the game
document.addEventListener('contextmenu', (e) => e.preventDefault());

/** Smooth scope in/out: FOV zoom + viewmodel pose. */
function updateScope(dt) {
  const target = wantsAim() ? 1 : 0;
  const step = dt / SCOPE.blendTime;
  aimT = target > aimT ? Math.min(target, aimT + step) : Math.max(target, aimT - step);
  const fov = SC.fov / (1 + (SCOPE.zoom - 1) * aimT);
  if (Math.abs(camera.fov - fov) > 1e-4) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  vm.setAim(aimT);
  // Overlay fades in near the end of the raise; the gun is hidden once the scope is up
  const o = Math.max(0, Math.min(1, (aimT - SCOPE.overlayStart) / (1 - SCOPE.overlayStart)));
  scopeOverlay.style.opacity = o.toFixed(3);
  crosshairEl.style.opacity = (1 - o).toFixed(3);
  vm.root.visible = aimT < SCOPE.hideGunAt;
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  vm.setAspect(window.innerWidth / window.innerHeight);
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Collision helpers (AABB vs player capsule approximated as AABB) ────────
const tmpMin = new THREE.Vector3();
const tmpMax = new THREE.Vector3();

function playerAABB(px, py, pz) {
  // Feet at py - PLAYER_HEIGHT, head at py; horizontal radius
  tmpMin.set(px - PLAYER_RADIUS, py - PLAYER_HEIGHT, pz - PLAYER_RADIUS);
  tmpMax.set(px + PLAYER_RADIUS, py, pz + PLAYER_RADIUS);
  return { min: tmpMin, max: tmpMax };
}

function aabbOverlap(a, b) {
  return (
    a.min.x < b.max.x && a.max.x > b.min.x &&
    a.min.y < b.max.y && a.max.y > b.min.y &&
    a.min.z < b.max.z && a.max.z > b.min.z
  );
}

/** Resolve player against world colliders; axis-separated sweep. */
function collideWorld(pos, vel, dt) {
  // Horizontal X
  pos.x += vel.x * dt;
  let box = playerAABB(pos.x, pos.y, pos.z);
  for (const c of colliders) {
    if (c.disabled || !aabbOverlap(box, c)) continue;
    if (vel.x > 0) pos.x = c.min.x - PLAYER_RADIUS - 0.001;
    else if (vel.x < 0) pos.x = c.max.x + PLAYER_RADIUS + 0.001;
    vel.x = 0;
    box = playerAABB(pos.x, pos.y, pos.z);
  }

  // Horizontal Z
  pos.z += vel.z * dt;
  box = playerAABB(pos.x, pos.y, pos.z);
  for (const c of colliders) {
    if (c.disabled || !aabbOverlap(box, c)) continue;
    if (vel.z > 0) pos.z = c.min.z - PLAYER_RADIUS - 0.001;
    else if (vel.z < 0) pos.z = c.max.z + PLAYER_RADIUS + 0.001;
    vel.z = 0;
    box = playerAABB(pos.x, pos.y, pos.z);
  }

  // Vertical Y
  pos.y += vel.y * dt;
  player.onGround = false;
  box = playerAABB(pos.x, pos.y, pos.z);

  // Ground: floor at y=0 (camp) or the terrain (island); snap down small steps so slopes don't go airborne
  const gy = groundAt(pos.x, pos.z);
  const feet = pos.y - PLAYER_HEIGHT;
  if (feet < gy || (ISLAND && player.wasGround && vel.y <= 0 && feet - gy < 0.35)) {
    pos.y = gy + PLAYER_HEIGHT;
    vel.y = 0;
    player.onGround = true;
    box = playerAABB(pos.x, pos.y, pos.z);
  }

  for (const c of colliders) {
    if (c.disabled || !aabbOverlap(box, c)) continue;
    // Standing on top
    if (vel.y <= 0 && (pos.y - PLAYER_HEIGHT) < c.max.y && (pos.y - PLAYER_HEIGHT - vel.y * dt) >= c.max.y - 0.15) {
      pos.y = c.max.y + PLAYER_HEIGHT;
      vel.y = 0;
      player.onGround = true;
    } else if (vel.y > 0 && pos.y > c.min.y) {
      // Hit ceiling
      pos.y = c.min.y;
      vel.y = 0;
    } else {
      // Side push while overlapping vertically — nudge out on smaller penetration
      const penX = Math.min(box.max.x - c.min.x, c.max.x - box.min.x);
      const penZ = Math.min(box.max.z - c.min.z, c.max.z - box.min.z);
      if (penX < penZ) {
        pos.x += box.min.x < c.min.x ? -penX : penX;
      } else {
        pos.z += box.min.z < c.min.z ? -penZ : penZ;
      }
    }
    box = playerAABB(pos.x, pos.y, pos.z);
  }

  // Soft arena bounds (inside outer walls already collide, but clamp as safety)
  if (ISLAND && island.clampPos) island.clampPos(pos);   // snow: soft square boundary up the snow banks
  else if (ISLAND) {   // ocean boundary: wade out a little, then blocked
    const r = Math.hypot(pos.x, pos.z), m = island.wadeR;
    if (r > m) { pos.x *= m / r; pos.z *= m / r; }
  } else {
    const lim = ARENA.w / 2 - PLAYER_RADIUS - 0.3;
    pos.x = Math.max(-lim, Math.min(lim, pos.x));
    pos.z = Math.max(-lim, Math.min(lim, pos.z));
  }
  player.wasGround = player.onGround;
}

// ─── Movement ───────────────────────────────────────────────────────────────
const wish = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();

function updateMovement(dt) {
  forward.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  right.set(Math.cos(yaw), 0, -Math.sin(yaw));

  wish.set(0, 0, 0);
  if (held(KEYS.forward)) wish.add(forward);
  if (held(KEYS.back)) wish.sub(forward);
  if (held(KEYS.right)) wish.add(right);
  if (held(KEYS.left)) wish.sub(right);
  if (wish.lengthSq() > 0) wish.normalize();

  const sprint = held(KEYS.sprint) && aimT === 0;          // no sprint while scoped
  const speed = MOVE_SPEED * (sprint ? SPRINT_MULT : 1) * (1 + (SCOPE.moveMult - 1) * aimT);
  const wade = ISLAND && groundAt(player.pos.x, player.pos.z) < IS.waterLevel - 0.15 ? IS.waterSlow : 1;
  player.vel.x = wish.x * speed * wade;
  player.vel.z = wish.z * speed * wade;

  if (held(KEYS.jump) && player.onGround) {
    player.vel.y = JUMP_VEL;
    player.onGround = false;
  }

  player.vel.y -= GRAVITY * dt;
  collideWorld(player.pos, player.vel, dt);

  camera.position.copy(player.pos);
  camera.rotation.x = pitch;
  camera.rotation.y = yaw;
}

// ─── Player damage / death ──────────────────────────────────────────────────
function isDead() { return player.health <= 0; }

function damagePlayer(n, flashMs) {
  if (isDead()) return;
  player.health = Math.max(0, player.health - n);
  if (player.health > 0) audio.play('hurt');
  hpVal.textContent = String(player.health);
  dmgFlash.classList.add('show');
  clearTimeout(damagePlayer._ft);
  damagePlayer._ft = setTimeout(() => dmgFlash.classList.remove('show'), flashMs);
  if (isDead()) { cancelGrenade(); showDeath(); }
}

function showDeath() {
  audio.play('playerDeath');
  shooting = false;
  const kills = player.kills || 0;
  deathMsg.textContent = `Targets down: ${kills}`;
  deathEl.classList.remove('hidden');
  overlay.classList.add('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}

function restartGame() {
  player.pos.set(START[0], PLAYER_HEIGHT + groundAt(START[0], START[1]), START[1]);
  player.vel.set(0, 0, 0);
  player.health = MAX_HEALTH;
  player.ammo = MAG_SIZE;
  player.reloading = false;
  player.fireCooldown = 0;
  player.kills = 0;
  yaw = 0; pitch = 0;
  hpVal.textContent = String(player.health);
  ammoVal.textContent = String(player.ammo);
  resetEnemies();
  spawnTimer = SP.interval;
  cancelGrenade();
  aimHeld = false; aimT = 0;
  camera.fov = SC.fov; camera.updateProjectionMatrix();
  vm.setAim(0);
  vm.root.visible = true;
  scopeOverlay.style.opacity = '0';
  crosshairEl.style.opacity = '1';
  pickups.reset();
  nadePickups.reset();
  fx.reset();
  grenades.reset();
  player.grenades = CFG.grenades.start; player.nadeCd = 0;
  nadeVal.textContent = String(player.grenades);
  syncCamera();
  deathEl.classList.add('hidden');
}

// ─── Enemy AI: face the player, shoot with line of sight ────────────────────
const AI = CFG.ai;
const aiFrom = new THREE.Vector3(), aiDir = new THREE.Vector3(), aiTo = new THREE.Vector3();
const playerHalf = new THREE.Vector3(PLAYER_RADIUS, PLAYER_HEIGHT / 2, PLAYER_RADIUS);
const playerCenter = new THREE.Vector3();

/** Distance along the ray to the nearest wall/cover (targets ignored), or Infinity. */
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
function wallHit(origin, dir) {
  let best = Infinity;
  for (const c of colliders) {
    if (c.target || c.disabled) continue;
    // walls / cover never move: cache centre + half extents
    if (!c._half) {
      c._half = new THREE.Vector3().subVectors(c.max, c.min).multiplyScalar(0.5);
      c._center = new THREE.Vector3().addVectors(c.min, c.max).multiplyScalar(0.5);
    }
    const t = rayAABB(origin, dir, c._center, c._half);
    if (t !== null && t > 0.05 && t < best) best = t;
  }
  return Math.min(best, terrainHit(origin, dir, Math.min(best, 100)));
}

/** Line of sight from an enemy's eyes to the player's head. */
function hasLineOfSight(en) {
  const p = en.group.position;
  aiFrom.set(p.x, p.y + AI.eyeHeight, p.z);
  aiDir.subVectors(player.pos, aiFrom);
  const dist = aiDir.length();
  aiDir.normalize();
  return wallHit(aiFrom, aiDir) > dist && !bushBlocks(aiFrom, aiDir, dist);
}

/** Distance falloff: damageNear at <= falloffNear, linearly down to damageFar at >= falloffFar. */
function damageAt(d) {
  const u = Math.max(0, Math.min(1, (d - AI.falloffNear) / (AI.falloffFar - AI.falloffNear)));
  return Math.round(AI.damageNear + (AI.damageFar - AI.damageNear) * u);
}

function enemyFire(en, spreadMult = 1) {
  const from = en.muzzleWorld(aiFrom);
  playerCenter.set(player.pos.x, player.pos.y - PLAYER_HEIGHT * 0.4, player.pos.z);
  aiDir.subVectors(playerCenter, from).normalize();
  // aim error
  const sp = AI.spread * spreadMult;
  const e = new THREE.Euler((Math.random() * 2 - 1) * sp, (Math.random() * 2 - 1) * sp, 0, 'YXZ');
  aiDir.applyEuler(e).normalize();
  const tWall = wallHit(from, aiDir);
  playerCenter.y = player.pos.y - PLAYER_HEIGHT / 2;
  const tPlayer = rayAABB(from, aiDir, playerCenter, playerHalf);
  const hit = tPlayer !== null && tPlayer > 0 && tPlayer < tWall;
  const dist = Math.min(hit ? tPlayer : tWall, W.tracerMaxDist);
  aiTo.copy(from).addScaledVector(aiDir, dist);
  spawnTracer(from, aiTo, AI.tracerColor);
  en.showMuzzleFlash();
  fx.enemyFlash(from);
  fx.muzzleSmoke(from, aiDir);
  sfxAt('enemyShot', from);
  if (hit) damagePlayer(damageAt(Math.hypot(player.pos.x - from.x, player.pos.z - from.z)), AI.flashMs);
}

// ─── Enemy movement: flow field toward the player + sliding collision ───────
// Grid over the arena; cells blocked by cover/walls (inflated by the enemy radius).
// BFS from the player's cell gives each free cell a step count; enemies walk downhill.
const GRID = AI.gridCell;
const GW = Math.ceil(ARENA.w / GRID), GD = Math.ceil(ARENA.d / GRID);
const blocked = new Uint8Array(GW * GD);
const field = new Int32Array(GW * GD);
let fieldT = 0;
const cellX = (x) => Math.max(0, Math.min(GW - 1, Math.floor((x + ARENA.w / 2) / GRID)));
const cellZ = (z) => Math.max(0, Math.min(GD - 1, Math.floor((z + ARENA.d / 2) / GRID)));
const cellCx = (i) => -ARENA.w / 2 + (i + 0.5) * GRID;
const cellCz = (j) => -ARENA.d / 2 + (j + 0.5) * GRID;

/** Static cover/wall boxes (not the floor, not targets). */
let solidCache = null;
function solidBoxes() {
  // cover / walls never change: cache the list once
  if (!solidCache) solidCache = colliders.filter((c) => !c.target && !c.disabled && c.max.y > 0.05);
  return solidCache;
}

/** Does a body of radius r at (x, z) overlap any cover/wall box? */
function hitsCover(x, z, r) {
  for (const c of solidBoxes()) {
    if (x + r > c.min.x && x - r < c.max.x && z + r > c.min.z && z - r < c.max.z) return true;
  }
  return false;
}

function buildBlocked() {
  const r = AI.radius + 0.05;
  for (let j = 0; j < GD; j++) for (let i = 0; i < GW; i++) {
    blocked[j * GW + i] = hitsCover(cellCx(i), cellCz(j), r) || !onLand(cellCx(i), cellCz(j), r + 0.3) ? 1 : 0;
  }
}

function buildField() {
  field.fill(-1);
  let pi = cellX(player.pos.x), pj = cellZ(player.pos.z);
  const q = new Int32Array(GW * GD);
  let head = 0, tail = 0;
  // if the player stands on/inside an inflated cell, seed from the nearest free neighbours
  const seed = (i, j) => { const k = j * GW + i; if (!blocked[k] && field[k] < 0) { field[k] = 0; q[tail++] = k; } };
  seed(pi, pj);
  for (let rr = 1; tail === 0 && rr < 6; rr++) {
    for (let dj = -rr; dj <= rr; dj++) for (let di = -rr; di <= rr; di++) {
      const i = pi + di, j = pj + dj;
      if (i >= 0 && j >= 0 && i < GW && j < GD) seed(i, j);
    }
  }
  while (head < tail) {
    const k = q[head++], i = k % GW, j = (k - i) / GW, d = field[k] + 1;
    if (i > 0 && !blocked[k - 1] && field[k - 1] < 0) { field[k - 1] = d; q[tail++] = k - 1; }
    if (i < GW - 1 && !blocked[k + 1] && field[k + 1] < 0) { field[k + 1] = d; q[tail++] = k + 1; }
    if (j > 0 && !blocked[k - GW] && field[k - GW] < 0) { field[k - GW] = d; q[tail++] = k - GW; }
    if (j < GD - 1 && !blocked[k + GW] && field[k + GW] < 0) { field[k + GW] = d; q[tail++] = k + GW; }
  }
}

/** Unit direction (dx, dz) to walk from (x, z) toward the player along the field. */
const steerOut = { x: 0, z: 0 };
function steer(x, z) {
  const i = cellX(x), j = cellZ(z), k = j * GW + i;
  let best = field[k] >= 0 ? field[k] : 1e9, bi = -1, bj = -1;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if (!di && !dj) continue;
    const ni = i + di, nj = j + dj;
    if (ni < 0 || nj < 0 || ni >= GW || nj >= GD) continue;
    const nk = nj * GW + ni;
    if (blocked[nk] || field[nk] < 0) continue;
    if (di && dj && (blocked[j * GW + ni] || blocked[nj * GW + i])) continue;   // no corner cutting
    const v = field[nk] + (di && dj ? 0.4 : 0);
    if (v < best) { best = v; bi = ni; bj = nj; }
  }
  if (bi < 0) {   // already at the bottom (or no path): head straight for the player
    steerOut.x = player.pos.x - x; steerOut.z = player.pos.z - z;
  } else {
    steerOut.x = cellCx(bi) - x; steerOut.z = cellCz(bj) - z;
  }
  const l = Math.hypot(steerOut.x, steerOut.z) || 1;
  steerOut.x /= l; steerOut.z /= l;
  return steerOut;
}

/** Is (x, z) free for enemy `self` (cover, walls, other enemies, the player)? */
function enemySpotFree(self, x, z) {
  const r = AI.radius;
  const lim = ARENA.w / 2 - r - 0.3, limZ = ARENA.d / 2 - r - 0.3;
  if (x < -lim || x > lim || z < -limZ || z > limZ || !onLand(x, z, r + 0.2)) return false;
  if (hitsCover(x, z, r + 0.02)) return false;
  for (const o of enemies) {
    if (o === self || !o.alive) continue;
    const p = o.group.position;
    if (Math.hypot(p.x - x, p.z - z) < r * 2 + 0.1) return false;
  }
  return Math.hypot(player.pos.x - x, player.pos.z - z) >= r + PLAYER_RADIUS + 0.3;
}

/** Slide: try the full move, else each axis separately. Returns distance actually moved. */
function moveEnemy(en, vx, vz, dt) {
  const p = en.group.position;
  const x0 = p.x, z0 = p.z;
  const nx = p.x + vx * dt, nz = p.z + vz * dt;
  if (enemySpotFree(en, nx, nz)) en.moveTo(nx, nz);
  else if (enemySpotFree(en, nx, p.z)) en.moveTo(nx, p.z);
  else if (enemySpotFree(en, p.x, nz)) en.moveTo(p.x, nz);
  return Math.hypot(p.x - x0, p.z - z0);
}

function updateEnemyAI(dt) {
  fieldT -= dt;
  if (fieldT <= 0) {
    fieldT = AI.fieldRefresh;
    buildField();
  }
  for (const en of enemies) {
    if (!en.alive || en.rising > 0) { en.walkSpeed = 0; continue; }   // corpses / risers don't move
    const p = en.group.position;
    const dist = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    if (en.shootCd > 0) en.shootCd -= dt;
    const sees = dist <= AI.range && hasLineOfSight(en);
    // Turn (eased, capped): face the player when in sight, else the walking direction
    const err = sees || !en.moveDirSet ? en.turnToward(player.pos.x, player.pos.z, AI.turnRate, dt)
      : en.turnToward(p.x + en.moveDx * 4, p.z + en.moveDz * 4, AI.turnRate, dt);
    en.seenT = sees ? en.seenT + dt : 0;

    // Movement: approach along the flow field until in position with line of sight, then strafe a little
    let moved = 0;
    const x0m = p.x, z0m = p.z;
    if (!sees || dist > AI.preferredDist) {
      const d = steer(p.x, p.z);
      // jog when far away and out of sight (run animation); walk otherwise
      const spd = AI.runSpeed && !sees && dist > AI.runDist ? AI.runSpeed : AI.walkSpeed;
      moved = moveEnemy(en, d.x * spd, d.z * spd, dt);
    } else {
      en.strafeT -= dt;
      if (en.strafeT <= 0) {
        en.strafeT = AI.strafeMinS + Math.random() * (AI.strafeMaxS - AI.strafeMinS);
        const r = Math.random();
        en.strafeDir = r < 0.4 ? -1 : r < 0.8 ? 1 : 0;   // sometimes stand still
      }
      const tx = (player.pos.z - p.z) / (dist || 1), tz = -(player.pos.x - p.x) / (dist || 1); // perpendicular
      let vx = tx * AI.strafeSpeed * en.strafeDir, vz = tz * AI.strafeSpeed * en.strafeDir;
      if (dist < AI.tooClose) {   // back off slowly
        vx -= (player.pos.x - p.x) / dist * AI.walkSpeed * 0.6;
        vz -= (player.pos.z - p.z) / dist * AI.walkSpeed * 0.6;
      }
      if (vx || vz) {
        moved = moveEnemy(en, vx, vz, dt);
        if (moved < 1e-4) en.strafeDir = -en.strafeDir;   // bumped into something: switch side
      }
    }
    if (moved > 1e-4 && !sees) {   // remember the smoothed walking direction for facing
      const k = Math.min(1, dt * 5), mx = (p.x - x0m) / moved, mz = (p.z - z0m) / moved;
      en.moveDx = en.moveDirSet ? en.moveDx + (mx - en.moveDx) * k : mx;
      en.moveDz = en.moveDirSet ? en.moveDz + (mz - en.moveDz) * k : mz;
      en.moveDirSet = true;
    } else if (sees) en.moveDirSet = false;
    const walking = moved / dt > 0.2;
    en.walkSpeed = moved / dt;

    // Shooting: from a standstill as before; while walking only sometimes, and less accurately
    if (sees && err <= AI.aimTolerance && en.seenT >= AI.reaction && en.shootCd <= 0) {
      if (!walking) {
        enemyFire(en);
        en.shootCd = AI.cooldownMin + Math.random() * AI.cooldownRandom;
      } else if (Math.random() < AI.moveFireChance) {
        enemyFire(en, AI.moveSpreadMult);
        en.shootCd = (AI.cooldownMin + Math.random() * AI.cooldownRandom) * 1.5;
      } else {
        en.shootCd = 0.5;   // decided not to shoot on the move; re-check shortly
      }
    }
  }
}

// ─── Weapon / hitscan ───────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const shootDir = new THREE.Vector3();
const muzzleFlashLight = new THREE.PointLight(W.flashColor, 0, W.flashRange);
scene.add(muzzleFlashLight);
let flashT = 0;

// Simple bullet tracer line
const tracerMat = new THREE.LineBasicMaterial({ color: W.tracerColor, transparent: true, opacity: W.tracerOpacity });
const tracers = [];

function spawnTracer(from, to, color) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const mat = tracerMat.clone();
  if (color !== undefined) mat.color.setHex(color);
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  tracers.push({ line, life: W.tracerLife });
}

function startReload() {
  vm.startReload(RELOAD_TIME);
  audio.play('reload');
  player.reloading = true;
  player.reloadT = RELOAD_TIME;
}

function showHitmarker() {
  hitmarker.classList.add('show');
  clearTimeout(showHitmarker._t);
  showHitmarker._t = setTimeout(() => hitmarker.classList.remove('show'), W.hitmarkerMs);
}

/** Player bullet damage by zone and distance (config weapon.damage): near value at <= falloffNear, linear to far. */
const WD = W.damage;
function bulletDamage(zone, d) {
  const u = Math.max(0, Math.min(1, (d - WD.falloffNear) / (WD.falloffFar - WD.falloffNear)));
  const [near, far] = zone === 'head' ? [WD.headNear, WD.headFar] : [WD.bodyNear, WD.bodyFar];
  return Math.round(near + (far - near) * u);
}

function damageEnemy(en, dmg, zone, dir) {
  if (!en.alive) return;
  en.lastDealt = en.hit(zone, dmg, dir, true);   // final damage (no head multiplier); flash, knockback, death
  audio.play(zone === 'head' ? 'hitHead' : 'hitBody');
  if (!en.alive) { player.kills = (player.kills || 0) + 1; sfxAt('enemyDeath', en.group.position); }
  showHitmarker();
}

// ─── Impact surfaces (for effects) ──────────────────────────────────────────
const fxPoint = new THREE.Vector3(), fxNormal = new THREE.Vector3();
/** Surface name for a bullet hit: a collider (camp floor / wall / cover, island rock / palm) or the island terrain (null). */
function surfaceOf(c, p) {
  if (!c) {
    if (!ISLAND) return 'concrete';
    if (island.surfaceAt) return island.surfaceAt(p);
    const r = Math.hypot(p.x, p.z);
    return r > IS.radius * IS.beachFrac - 1 ? 'sand' : r < IS.radius * 0.45 ? 'dirt' : 'grass';
  }
  if (c.prop === 'palm_tree' || c.prop === 'pine_tree' || c.prop === 'cabin') return 'wood';
  if (c.prop === 'rock_boulder') return 'rock';
  if (c.prop) return 'rock';
  if (c.max.y <= 0.05) return 'concrete';                                     // camp floor
  const hw = ARENA.w / 2, hd = ARENA.d / 2;
  return (c.max.x > hw || c.min.x < -hw || c.max.z > hd || c.min.z < -hd) ? 'brick' : 'concrete';   // outer walls / cover
}
/** Outward normal at p: nearest AABB face, or the terrain slope. */
function surfaceNormal(c, p) {
  if (!c) {
    if (!ISLAND) return fxNormal.set(0, 1, 0);
    const e = 0.25;
    return fxNormal.set(groundAt(p.x - e, p.z) - groundAt(p.x + e, p.z), 2 * e, groundAt(p.x, p.z - e) - groundAt(p.x, p.z + e)).normalize();
  }
  const d = [p.x - c.min.x, c.max.x - p.x, p.y - c.min.y, c.max.y - p.y, p.z - c.min.z, c.max.z - p.z];
  let k = 0; for (let i = 1; i < 6; i++) if (d[i] < d[k]) k = i;
  const n = [[-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1]][k];
  return fxNormal.set(n[0], n[1], n[2]);
}

function fire() {
  if (player.reloading || player.fireCooldown > 0 || nadeAim.holding) return;
  if (player.ammo <= 0) {
    audio.play('dryClick');
    startReload();
    return;
  }

  player.ammo--;
  player.fireCooldown = FIRE_RATE;
  ammoVal.textContent = String(player.ammo);
  audio.play('shot', { vol: aimT > 0.5 ? 0.95 : 1 });

  // Muzzle flash + tracer start at the viewmodel's barrel tip
  shootDir.set(0, 0, -1).applyQuaternion(camera.quaternion);
  // spread: wider from the hip, tight when scoped
  const spread = SCOPE.hipSpread + (SCOPE.scopedSpread - SCOPE.hipSpread) * aimT;
  shootDir.applyEuler(new THREE.Euler((Math.random() * 2 - 1) * spread, (Math.random() * 2 - 1) * spread, 0, 'YXZ')).normalize();
  camera.updateMatrixWorld();
  const muzzle = vm.muzzleWorld(camera);
  vm.onFire();
  muzzleFlashLight.position.copy(muzzle);
  muzzleFlashLight.intensity = W.flashIntensity;
  fx.muzzleSmoke(muzzle, shootDir);
  flashT = W.flashTime;

  raycaster.set(camera.position, shootDir);
  raycaster.far = W.range;

  // Hit enemies via AABB ray (more reliable than mesh for boxes)
  let bestT = Infinity;
  let bestEn = null;
  let bestZone = null;
  for (const en of enemies) {
    if (!en.alive) continue;
    const r = en.raycast(camera.position, shootDir);
    if (r && r.t > 0 && r.t < bestT) {
      bestT = r.t;
      bestEn = en;
      bestZone = r.zone;
    }
  }

  // Also check world colliders so bullets don't pass walls
  let wallT = Infinity, wallC = null;
  for (const c of colliders) {
    if (c.target || c.disabled) continue;   // target colliders are for movement only
    if (!c._half) {
      c._half = new THREE.Vector3().subVectors(c.max, c.min).multiplyScalar(0.5);
      c._center = new THREE.Vector3().addVectors(c.min, c.max).multiplyScalar(0.5);
    }
    const t = rayAABB(camera.position, shootDir, c._center, c._half);
    if (t !== null && t > 0.1 && t < wallT) { wallT = t; wallC = c; }
  }
  const tTerrain = terrainHit(camera.position, shootDir, Math.min(wallT, W.range));
  if (tTerrain < wallT) { wallT = tTerrain; wallC = null; }

  const hitDist = Math.min(bestT, wallT, W.tracerMaxDist);
  const hitPoint = camera.position.clone().add(shootDir.clone().multiplyScalar(hitDist));
  spawnTracer(muzzle, hitPoint);

  if (bestEn && bestT <= wallT) {
    fx.enemyHit(hitPoint, shootDir, bestZone === 'head');
    damageEnemy(bestEn, bulletDamage(bestZone, bestT), bestZone, shootDir);
  } else if (wallT <= W.range) {
    const pt = fxPoint.copy(camera.position).addScaledVector(shootDir, wallT);
    fx.impact(pt, surfaceNormal(wallC, pt), surfaceOf(wallC, pt), shootDir);
  }

  if (player.ammo <= 0) startReload();
}

/** Ray vs AABB (center + half-extents). Returns distance or null. */
function rayAABB(origin, dir, center, half) {
  const inv = new THREE.Vector3(
    dir.x !== 0 ? 1 / dir.x : 1e12,
    dir.y !== 0 ? 1 / dir.y : 1e12,
    dir.z !== 0 ? 1 / dir.z : 1e12
  );
  const t1 = (center.x - half.x - origin.x) * inv.x;
  const t2 = (center.x + half.x - origin.x) * inv.x;
  const t3 = (center.y - half.y - origin.y) * inv.y;
  const t4 = (center.y + half.y - origin.y) * inv.y;
  const t5 = (center.z - half.z - origin.z) * inv.z;
  const t6 = (center.z + half.z - origin.z) * inv.z;
  const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4), Math.min(t5, t6));
  const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4), Math.max(t5, t6));
  if (tmax < 0 || tmin > tmax) return null;
  return tmin >= 0 ? tmin : tmax;
}

function updateWeapon(dt) {
  if (player.fireCooldown > 0) player.fireCooldown -= dt;

  if (player.reloading) {
    player.reloadT -= dt;
    if (player.reloadT <= 0) {
      player.reloading = false;
      player.ammo = MAG_SIZE;
      ammoVal.textContent = String(player.ammo);
    }
  }

  if (shooting && pointerLocked) fire();

  if (flashT > 0) {
    flashT -= dt;
    if (flashT <= 0) muzzleFlashLight.intensity = 0;
  }

  for (let i = tracers.length - 1; i >= 0; i--) {
    const tr = tracers[i];
    tr.life -= dt;
    tr.line.material.opacity = Math.max(0, tr.life / W.tracerLife);
    if (tr.life <= 0) {
      scene.remove(tr.line);
      tr.line.geometry.dispose();
      tr.line.material.dispose();
      tracers.splice(i, 1);
    }
  }
}

// ─── Medkits ────────────────────────────────────────────────────────────────
const PK = CFG.pickups;
const reachable = new Uint8Array(GW * GD);
/** Static reachability from the player start over the cover grid (cover never moves). */
function buildReachable() {
  reachable.fill(0);
  const s0 = cellZ(START[1]) * GW + cellX(START[0]);
  const q = new Int32Array(GW * GD); let h = 0, t = 0;
  if (!blocked[s0]) { reachable[s0] = 1; q[t++] = s0; }
  while (h < t) {
    const k = q[h++], i = k % GW;
    for (const n of [i > 0 ? k - 1 : -1, i < GW - 1 ? k + 1 : -1, k - GW, k + GW]) {
      if (n < 0 || n >= GW * GD || blocked[n] || reachable[n]) continue;
      reachable[n] = 1; q[t++] = n;
    }
  }
}
function validPickupSpot(x, z) {
  const k = cellZ(z) * GW + cellX(x);
  if (!reachable[k] || hitsCover(x, z, PK.clearance)) return false;
  if (Math.abs(x) > ARENA.w / 2 - 1 || Math.abs(z) > ARENA.d / 2 - 1 || !onLand(x, z, 1.5)) return false;
  if (Math.hypot(player.pos.x - x, player.pos.z - z) < PK.minPlayerDist) return false;
  for (const it of pickups.items) if (Math.hypot(it.x - x, it.z - z) < 3) return false;
  return true;
}
let healTimers;
const pickups = createPickups(scene, PK, {
  groundAt,
  randomSpot() {
    for (let n = 0; n < 60; n++) {
      const x = (Math.random() - 0.5) * ARENA.w, z = (Math.random() - 0.5) * ARENA.d;
      if (validPickupSpot(x, z)) return [x, z];
    }
    return null;
  },
  canPick: () => player.health > 0 && player.health < MAX_HEALTH,
  onPick(amount) {
    const before = player.health;
    player.health = Math.min(MAX_HEALTH, player.health + amount);
    hpVal.textContent = String(player.health);
    healFlash.classList.add('show');
    clearTimeout(healTimers.f);
    healTimers.f = setTimeout(() => healFlash.classList.remove('show'), PK.flashMs);
    healPop.textContent = '+' + (player.health - before);   // actual amount healed (capped at max)
    pickups.lastHeal = player.health - before;
    audio.play('medkit');
    healPop.classList.remove('show'); void healPop.offsetWidth; healPop.classList.add('show');
    clearTimeout(healTimers.p);
    healTimers.p = setTimeout(() => healPop.classList.remove('show'), PK.popMs);
  },
}, ASSETS.medkit);
healTimers = { f: 0, p: 0 };

// ─── Grenades ───────────────────────────────────────────────────────────────
const GR = CFG.grenades;
const nadeFrom = new THREE.Vector3(), nadeDir = new THREE.Vector3(), nadeTmp = new THREE.Vector3();
function blastBlocked(from, to) {
  if (!GR.needsLineOfSight) return false;
  nadeDir.subVectors(to, from); const d = nadeDir.length(); if (d < 0.05) return false;
  nadeDir.divideScalar(d);
  nadeFrom.copy(from).addScaledVector(nadeDir, 0.02);
  return wallHit(nadeFrom, nadeDir) < d - 0.05;
}
const grenades = createGrenades(scene, GR, ASSETS.grenade, {
  solids: () => refreshNadeSolids(),
  onBounce: (p) => sfxAt('grenadeBounce', p),
  groundAt,
  onExplode(p) {
    sfxAt('explosion', p);
    const from = nadeTmp.copy(p).setY(Math.max(p.y, groundAt(p.x, p.z) + 0.3)).clone();
    for (const en of enemies) {
      if (!en.alive) continue;
      const c = en.group.position.clone(); c.y += 1.0;
      const d = c.distanceTo(from), k = grenades.falloff(d);
      if (k <= 0 || blastBlocked(from, c)) continue;
      const dir = new THREE.Vector3().subVectors(c, from).setY(0);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
      damageEnemy(en, Math.round(GR.damage * k), 'body', dir.normalize());
    }
    const pc = player.pos.clone().setY(player.pos.y - PLAYER_HEIGHT / 2);
    const k = grenades.falloff(pc.distanceTo(from));
    if (k > 0 && GR.selfDamage > 0 && !blastBlocked(from, pc)) damagePlayer(Math.round(GR.selfDamage * k), CFG.contact.flashMs * 2);
  },
});
// Hold-to-aim throw: preview arc (preallocated dots) + landing ring, both from grenades.predict (same sim as live)
const GP = GR.preview;
const nadeAim = { holding: false, count: 0, rest: new THREE.Vector3() };
const nadeOrigin = new THREE.Vector3(), nadeLook = new THREE.Vector3(), nadeDown = new THREE.Vector3(0, -0.15, 0);
const previewPos = new Float32Array(GP.points * 3);
const previewGeo = new THREE.BufferGeometry();
previewGeo.setAttribute('position', new THREE.BufferAttribute(previewPos, 3).setUsage(THREE.DynamicDrawUsage));
previewGeo.setDrawRange(0, 0);
const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.6, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c); })();
const previewDots = new THREE.Points(previewGeo, new THREE.PointsMaterial({ map: dotTex, alphaTest: 0.05, color: GP.color, size: GP.dotSize, sizeAttenuation: false, transparent: true, opacity: 0.95, depthWrite: false }));
previewDots.frustumCulled = false; previewDots.visible = false; previewDots.renderOrder = 5;
const ringGeo = new THREE.RingGeometry(GP.ringRadius * 0.7, GP.ringRadius, 32); ringGeo.rotateX(-Math.PI / 2);
const previewRing = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: GP.ringColor, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
previewRing.visible = false; previewRing.renderOrder = 5;
scene.add(previewDots, previewRing);
const nadeSolids = [];
function refreshNadeSolids() { nadeSolids.length = 0; for (const c of colliders) if (!c.target && !c.disabled) nadeSolids.push(c); return nadeSolids; }
vm.setNadeModel(ASSETS.grenade.build());

/** Throw origin + direction from the camera (shared by the preview and the real throw). */
function nadeLaunch() {
  camera.updateMatrixWorld();
  nadeLook.set(0, 0, -1).applyQuaternion(camera.quaternion);
  nadeOrigin.copy(camera.position).addScaledVector(nadeLook, 0.5).add(nadeDown);
}
function updateGrenadePreview() {
  if (!nadeAim.holding) return;
  nadeLaunch();
  const n = grenades.predict(nadeOrigin, nadeLook, player.vel, previewPos, GP.points, nadeAim.rest, refreshNadeSolids());
  nadeAim.count = n;
  previewGeo.setDrawRange(GP.skipNear, Math.max(0, n - GP.skipNear));   // first dots sit right at the hand
  previewGeo.attributes.position.needsUpdate = true;
  previewDots.visible = true;
  previewRing.position.copy(nadeAim.rest); previewRing.position.y = Math.max(nadeAim.rest.y - GR.radius, groundAt(nadeAim.rest.x, nadeAim.rest.z)) + 0.03;
  previewRing.visible = true;
}
function hidePreview() { previewDots.visible = false; previewRing.visible = false; }
function holdGrenade() {
  if (nadeAim.holding || isDead() || player.grenades <= 0 || player.nadeCd > 0 || player.reloading) return false;
  nadeAim.holding = true; shooting = false;
  vm.setNade('hold');
  updateGrenadePreview();
  return true;
}
function cancelGrenade() {
  if (!nadeAim.holding) return false;
  nadeAim.holding = false; hidePreview(); vm.setNade('none');
  return true;
}
function releaseGrenade() {
  if (!nadeAim.holding) return null;
  nadeAim.holding = false; hidePreview();
  if (isDead()) { vm.setNade('none'); return null; }
  vm.setNade('throw');
  return throwGrenade();
}
function throwGrenade() {
  if (player.grenades <= 0 || player.nadeCd > 0) return null;
  player.grenades--; player.nadeCd = GR.cooldown;
  nadeVal.textContent = String(player.grenades);
  audio.play('grenadeThrow');
  nadeLaunch();
  return grenades.throwFrom(nadeOrigin, nadeLook, player.vel);
}
let nadeTimer = 0;
const nadePickups = createPickups(scene, CFG.grenadePickups, {
  groundAt,
  randomSpot() {
    for (let n = 0; n < 60; n++) {
      const x = (Math.random() - 0.5) * ARENA.w, z = (Math.random() - 0.5) * ARENA.d;
      if (validPickupSpot(x, z) && !nadePickups.items.some((it) => Math.hypot(it.x - x, it.z - z) < 3)) return [x, z];
    }
    return null;
  },
  canPick: () => player.health > 0 && player.grenades < GR.max,
  onPick(amount) {
    const before = player.grenades;
    player.grenades = Math.min(GR.max, player.grenades + amount);
    nadeVal.textContent = String(player.grenades);
    nadePickups.lastGain = player.grenades - before;
    audio.play('grenadePickup');
    nadePop.textContent = '+' + (player.grenades - before);
    nadePop.classList.remove('show'); void nadePop.offsetWidth; nadePop.classList.add('show');
    clearTimeout(nadeTimer); nadeTimer = setTimeout(() => nadePop.classList.remove('show'), CFG.grenadePickups.popMs);
  },
}, ASSETS.grenadePickup);
nadeVal.textContent = String(player.grenades);

// ─── Main loop ──────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

/** One simulation step while playing (also used by the headless test hook). */
let stepDist = 0;
function gameStep(dt) {
  updateMovement(dt);
  // footsteps: one every audio.stepEvery units walked on the ground
  if (player.onGround) {
    stepDist += Math.hypot(player.vel.x, player.vel.z) * dt;
    if (stepDist >= CFG.audio.stepEvery) { stepDist = 0; audio.play(SNOW ? 'snowstep' : 'footstep'); }
  }
  updateWeapon(dt);
  updateDoors(dt);
  updateSpawning(dt);
  updateEnemyAI(dt);
  pickups.update(dt, player.pos, player.pos.y - PLAYER_HEIGHT);
  nadePickups.update(dt, player.pos, player.pos.y - PLAYER_HEIGHT);
  if (player.nadeCd > 0) player.nadeCd -= dt;
  grenades.update(dt);
  updateGrenadePreview();
  fx.update(dt);
  // Contact damage
  for (const en of enemies) {
    if (!en.alive) continue;
    if (en.touchCd > 0) en.touchCd -= dt;
    // Targets are solid, so contact = touching the collider (small margin)
    if (en.touches(player.pos, PLAYER_RADIUS, PLAYER_HEIGHT)) {
      if (!en.touchCd || en.touchCd <= 0) {
        damagePlayer(CFG.contact.damage, CFG.contact.flashMs);
        en.touchCd = CFG.contact.cooldown;
      }
    }
  }
}

// Frame-rate cap (CFG.scene.fpsCap, both maps): skip rAF callbacks until a frame interval has passed
let lastFrameMs = -1e9;
let frames = 0;
function tick(now = performance.now()) {
  requestAnimationFrame(tick);
  if (SC.fpsCap > 0 && now - lastFrameMs < 1000 / SC.fpsCap - 2) return;
  lastFrameMs = now;
  frames++;
  const dt = Math.min(clock.getDelta(), 0.05);
  if (ISLAND) {
    island.update(clock.elapsedTime, camera.position);
    // shadow box follows the player (island is bigger than the shadow camera)
    sun.target.position.set(player.pos.x, 0, player.pos.z);
    sun.position.set(player.pos.x + SC.sunPos[0], SC.sunPos[1], player.pos.z + SC.sunPos[2]);
    if (islandLook) islandLook.update(clock.elapsedTime, player.pos);
  }

  if (pointerLocked && !isDead()) {
    gameStep(dt);
  } else if (pointerLocked) {
    // Dead: still allow look, no move
    camera.rotation.x = pitch;
    camera.rotation.y = yaw;
  }

  updateScope(dt);   // always (also eases out of scope when paused / dead)
  for (const en of enemies) en.update(dt);
  vm.update(dt, {
    moving: pointerLocked && !isDead() && (held(KEYS.forward) || held(KEYS.back) || held(KEYS.left) || held(KEYS.right)),
    sprint: held(KEYS.sprint) && aimT === 0,
    onGround: player.onGround,
    yaw, pitch,
  });
  renderer.clear();
  renderer.render(scene, camera);
  if (islandLook && islandLook.flare) islandLook.flare.render();
  renderer.clearDepth();
  renderer.render(vm.scene, vm.camera);
}

/** Put the camera at the player's eye. Without this the start screen rendered from (0,0,0): the eye sat
 *  exactly in the floor's top plane, so the floor was edge-on and the sky/fog colour filled the lower half. */
function syncCamera() {
  camera.position.copy(player.pos);
  camera.rotation.set(pitch, yaw, 0);
}
// Arrived through a door: face away from it and restore carried state (health, ammo, grenades, score)
const doorFade = document.getElementById('door-fade'), doorPrompt = document.getElementById('door-prompt');
let arrivedState = null;
if (ARRIVAL) {
  yaw = ARRIVAL.yaw;
  const c = doors.takeCarry();
  if (c) {
    arrivedState = c;
    player.health = Math.max(1, Math.min(MAX_HEALTH, c.health | 0)); player.ammo = Math.max(0, Math.min(MAG_SIZE, c.ammo | 0));
    player.grenades = Math.max(0, Math.min(GR.max, c.grenades | 0)); player.kills = c.kills | 0;
    hpVal.textContent = String(player.health); ammoVal.textContent = String(player.ammo); nadeVal.textContent = String(player.grenades);
  }
  doorFade.classList.add('in'); requestAnimationFrame(() => { doorFade.classList.remove('in'); });   // fade in from black
}
let nearDoor = null;
function useDoor(d) {
  if (doors.going) return;
  doors.go(d, { health: player.health, ammo: player.ammo, grenades: player.grenades, kills: player.kills || 0 });
}
function updateDoors() {
  nearDoor = doors.update(0, player.pos, clock.elapsedTime);
  if (nearDoor && nearDoor.through && !doors.going) useDoor(nearDoor);
  const show = nearDoor && !doors.going;
  doorPrompt.classList.toggle('hidden', !show);
  if (show) doorPrompt.textContent = `E — go to ${CFG.mapNames[nearDoor.to] || nearDoor.to}`;
}
syncCamera();
buildBlocked();
buildReachable();
placeInitialEnemies();
tick();

// Expose a tiny debug hook in console
window.__fps = {
  player, enemies, colliders, scene, camera, fire, vm, startReload,
  map: MAP, island, doors, useDoor, get nearDoor() { return nearDoor; }, arrival: ARRIVAL, get arrivedState() { return arrivedState; }, get yaw() { return yaw; }, get islandLook() { return islandLook; }, fx, fxQuality: FXQ, surfaceOf, groundAt, get frames() { return frames; }, setMap,
  // test helpers: run game steps without pointer lock, spawning, line-of-sight
  step: (dt, n = 1) => { for (let i = 0; i < n; i++) { if (isDead()) break; updateScope(dt); gameStep(dt); for (const en of enemies) en.update(dt); } },
  spawnRandomTarget, hasLineOfSight, restartGame,
  get spawnTimer() { return spawnTimer; },
  damageAt, hitsCover, pickups, validPickupSpot,
  grenades, nadePickups, throwGrenade, holdGrenade, releaseGrenade, cancelGrenade, nadeAim, previewDots, previewRing, previewPos, bulletDamage, audio,
  assets: Object.fromEntries(Object.entries(ASSETS).map(([k, a]) => [k, k === 'textures'
    ? Object.fromEntries(Object.entries(a).map(([t, m]) => [t, m ? m.name : null])) : a.name])), assetLog: loadLog, renderer,
  setLook: (y, p) => { yaw = y; pitch = p; },
  setAimHeld: (v) => { aimHeld = v; },
  get aimT() { return aimT; },
  get sens() { return sensNow(); },
  get moveSpeedNow() { return Math.hypot(player.vel.x, player.vel.z); },
  keys,
};
