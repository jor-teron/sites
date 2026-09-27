/**
 * Browser FPS starter — Assault Cube–style feel (placeholders only).
 * Three.js r170 via import map. No build step.
 */
import * as THREE from 'three';

// ─── Tunables (from browser-fps_config.js) ──────────────────────────────────
const CFG = window.BROWSER_FPS_CONFIG;
const PLAYER_HEIGHT = CFG.player.height;
const PLAYER_RADIUS = CFG.player.radius;
const MOVE_SPEED = CFG.player.moveSpeed;
const SPRINT_MULT = CFG.player.sprintMult;
const JUMP_VEL = CFG.player.jumpVel;
const GRAVITY = CFG.player.gravity;
const MOUSE_SENS = CFG.player.mouseSens;
const FIRE_RATE = CFG.weapon.fireRate;
const MAG_SIZE = CFG.weapon.magSize;
const RELOAD_TIME = CFG.weapon.reloadTime;
const HIT_DAMAGE = CFG.weapon.hitDamage;
const MAX_HEALTH = CFG.player.maxHealth;
const ARENA = CFG.arena;
const SC = CFG.scene;
const W = CFG.weapon;
const KEYS = CFG.keys;
const held = (list) => list.some((c) => keys[c]);

// ─── DOM ────────────────────────────────────────────────────────────────────
const overlay = document.getElementById('overlay');
const hud = document.getElementById('hud');
const hpVal = document.getElementById('hp-val');
const ammoVal = document.getElementById('ammo-val');
const hitmarker = document.getElementById('hitmarker');
const dmgFlash = document.getElementById('dmg-flash');

// ─── Renderer / Scene / Camera ──────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, SC.maxPixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(SC.background);
scene.fog = new THREE.Fog(SC.background, SC.fogNear, SC.fogFar);

const camera = new THREE.PerspectiveCamera(SC.fov, window.innerWidth / window.innerHeight, SC.near, SC.far);
camera.rotation.order = 'YXZ';

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

  // Floor
  addBox(ARENA.w, 0.4, ARENA.d, 0, -0.2, 0, ARENA.floorColor, { castShadow: false });

  // Outer walls
  addBox(ARENA.w + th * 2, ARENA.wallH, th, 0, ARENA.wallH / 2, -hd - th / 2, ARENA.wallColorNS);
  addBox(ARENA.w + th * 2, ARENA.wallH, th, 0, ARENA.wallH / 2, hd + th / 2, ARENA.wallColorNS);
  addBox(th, ARENA.wallH, ARENA.d, -hw - th / 2, ARENA.wallH / 2, 0, ARENA.wallColorEW);
  addBox(th, ARENA.wallH, ARENA.d, hw + th / 2, ARENA.wallH / 2, 0, ARENA.wallColorEW);

  // Cover boxes (low-poly crates / barriers) + center stack
  for (const c of ARENA.covers) addBox(...c);
}

buildArena();

// ─── Enemies (static colored boxes) ─────────────────────────────────────────
const enemies = [];

function spawnEnemies() {
  const specs = CFG.enemies.specs;
  const [ew, eh, ed] = CFG.enemies.size;
  for (const s of specs) {
    const geo = new THREE.BoxGeometry(ew, eh, ed);
    const mat = new THREE.MeshStandardMaterial({ color: s.color, roughness: 0.7 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(s.pos[0], s.pos[1], s.pos[2]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    enemies.push({
      mesh,
      hp: s.hp,
      maxHp: s.hp,
      alive: true,
      baseColor: s.color,
      // AABB for hitscan
      half: new THREE.Vector3(ew / 2, eh / 2, ed / 2),
    });
  }
}

spawnEnemies();

// ─── Player state ───────────────────────────────────────────────────────────
const player = {
  pos: new THREE.Vector3(CFG.player.start[0], PLAYER_HEIGHT, CFG.player.start[1]),
  vel: new THREE.Vector3(0, 0, 0),
  onGround: false,
  health: MAX_HEALTH,
  ammo: MAG_SIZE,
  reloading: false,
  reloadT: 0,
  fireCooldown: 0,
};

const keys = Object.create(null);
let pointerLocked = false;
let shooting = false;

function clearInput() {
  for (const k of Object.keys(keys)) delete keys[k];
  shooting = false;
}

/** Always free the mouse — do not rely on the browser's default Esc alone. */
function unlockPointer() {
  clearInput();
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
  pointerLocked = false;
  overlay.classList.remove('hidden');
  hud.classList.remove('visible');
}

function syncPointerLockUi() {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  overlay.classList.toggle('hidden', pointerLocked);
  hud.classList.toggle('visible', pointerLocked);
  if (!pointerLocked) clearInput();
}

// ─── Input ──────────────────────────────────────────────────────────────────
overlay.addEventListener('click', () => {
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
  yaw -= e.movementX * MOUSE_SENS;
  pitch -= e.movementY * MOUSE_SENS;
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
  if (!pointerLocked) return;
  keys[e.code] = true;
  if (KEYS.reload.includes(e.code) && !player.reloading && player.ammo < MAG_SIZE) startReload();
});
document.addEventListener('keyup', (e) => { keys[e.code] = false; });

document.addEventListener('mousedown', (e) => {
  if (!pointerLocked) return;
  if (e.button === 0) shooting = true;
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) shooting = false;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
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
    if (!aabbOverlap(box, c)) continue;
    if (vel.x > 0) pos.x = c.min.x - PLAYER_RADIUS - 0.001;
    else if (vel.x < 0) pos.x = c.max.x + PLAYER_RADIUS + 0.001;
    vel.x = 0;
    box = playerAABB(pos.x, pos.y, pos.z);
  }

  // Horizontal Z
  pos.z += vel.z * dt;
  box = playerAABB(pos.x, pos.y, pos.z);
  for (const c of colliders) {
    if (!aabbOverlap(box, c)) continue;
    if (vel.z > 0) pos.z = c.min.z - PLAYER_RADIUS - 0.001;
    else if (vel.z < 0) pos.z = c.max.z + PLAYER_RADIUS + 0.001;
    vel.z = 0;
    box = playerAABB(pos.x, pos.y, pos.z);
  }

  // Vertical Y
  pos.y += vel.y * dt;
  player.onGround = false;
  box = playerAABB(pos.x, pos.y, pos.z);

  // Floor at y=0
  const feet = pos.y - PLAYER_HEIGHT;
  if (feet < 0) {
    pos.y = PLAYER_HEIGHT;
    vel.y = 0;
    player.onGround = true;
    box = playerAABB(pos.x, pos.y, pos.z);
  }

  for (const c of colliders) {
    if (!aabbOverlap(box, c)) continue;
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
  const lim = ARENA.w / 2 - PLAYER_RADIUS - 0.3;
  pos.x = Math.max(-lim, Math.min(lim, pos.x));
  pos.z = Math.max(-lim, Math.min(lim, pos.z));
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

  const sprint = held(KEYS.sprint);
  const speed = MOVE_SPEED * (sprint ? SPRINT_MULT : 1);
  player.vel.x = wish.x * speed;
  player.vel.z = wish.z * speed;

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

// ─── Weapon / hitscan ───────────────────────────────────────────────────────
const raycaster = new THREE.Raycaster();
const shootDir = new THREE.Vector3();
const muzzleFlashLight = new THREE.PointLight(W.flashColor, 0, W.flashRange);
scene.add(muzzleFlashLight);
let flashT = 0;

// Simple bullet tracer line
const tracerMat = new THREE.LineBasicMaterial({ color: W.tracerColor, transparent: true, opacity: W.tracerOpacity });
const tracers = [];

function spawnTracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const line = new THREE.Line(geo, tracerMat.clone());
  scene.add(line);
  tracers.push({ line, life: W.tracerLife });
}

function startReload() {
  player.reloading = true;
  player.reloadT = RELOAD_TIME;
}

function showHitmarker() {
  hitmarker.classList.add('show');
  clearTimeout(showHitmarker._t);
  showHitmarker._t = setTimeout(() => hitmarker.classList.remove('show'), W.hitmarkerMs);
}

function damageEnemy(en, dmg) {
  if (!en.alive) return;
  en.hp -= dmg;
  // Flash whitish then tint by remaining HP
  const t = Math.max(0, en.hp / en.maxHp);
  en.mesh.material.color.setRGB(0.9, 0.9 * t, 0.85 * t);
  showHitmarker();
  if (en.hp <= 0) {
    en.alive = false;
    en.mesh.visible = false;
  }
}

function fire() {
  if (player.reloading || player.fireCooldown > 0) return;
  if (player.ammo <= 0) {
    startReload();
    return;
  }

  player.ammo--;
  player.fireCooldown = FIRE_RATE;
  ammoVal.textContent = String(player.ammo);

  // Muzzle flash near camera
  shootDir.set(0, 0, -1).applyQuaternion(camera.quaternion);
  const muzzle = camera.position.clone().add(shootDir.clone().multiplyScalar(0.6));
  muzzle.y -= 0.15;
  muzzleFlashLight.position.copy(muzzle);
  muzzleFlashLight.intensity = W.flashIntensity;
  flashT = W.flashTime;

  raycaster.set(camera.position, shootDir);
  raycaster.far = W.range;

  // Hit enemies via AABB ray (more reliable than mesh for boxes)
  let bestT = Infinity;
  let bestEn = null;
  for (const en of enemies) {
    if (!en.alive) continue;
    const t = rayAABB(camera.position, shootDir, en.mesh.position, en.half);
    if (t !== null && t < bestT && t > 0) {
      bestT = t;
      bestEn = en;
    }
  }

  // Also check world colliders so bullets don't pass walls
  let wallT = Infinity;
  for (const c of colliders) {
    const half = new THREE.Vector3(
      (c.max.x - c.min.x) / 2,
      (c.max.y - c.min.y) / 2,
      (c.max.z - c.min.z) / 2
    );
    const center = new THREE.Vector3().addVectors(c.min, c.max).multiplyScalar(0.5);
    const t = rayAABB(camera.position, shootDir, center, half);
    if (t !== null && t > 0.1 && t < wallT) wallT = t;
  }

  const hitDist = Math.min(bestT, wallT, W.tracerMaxDist);
  const hitPoint = camera.position.clone().add(shootDir.clone().multiplyScalar(hitDist));
  spawnTracer(muzzle, hitPoint);

  if (bestEn && bestT <= wallT) {
    damageEnemy(bestEn, HIT_DAMAGE);
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

// ─── Main loop ──────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);

  if (pointerLocked && player.health > 0) {
    updateMovement(dt);
    updateWeapon(dt);
    // Contact damage with real dt
    for (const en of enemies) {
      if (!en.alive) continue;
      if (en.touchCd > 0) en.touchCd -= dt;
      const dx = player.pos.x - en.mesh.position.x;
      const dz = player.pos.z - en.mesh.position.z;
      const dy = (player.pos.y - PLAYER_HEIGHT / 2) - en.mesh.position.y;
      if (Math.abs(dx) < CFG.contact.rangeX && Math.abs(dz) < CFG.contact.rangeZ && Math.abs(dy) < CFG.contact.rangeY) {
        if (!en.touchCd || en.touchCd <= 0) {
          player.health = Math.max(0, player.health - CFG.contact.damage);
          hpVal.textContent = String(player.health);
          dmgFlash.classList.add('show');
          clearTimeout(tick._ft);
          tick._ft = setTimeout(() => dmgFlash.classList.remove('show'), CFG.contact.flashMs);
          en.touchCd = CFG.contact.cooldown;
        }
      }
    }
  } else if (pointerLocked) {
    // Dead: still allow look, no move
    camera.rotation.x = pitch;
    camera.rotation.y = yaw;
  }

  renderer.render(scene, camera);
}

tick();

// Expose a tiny debug hook in console
window.__fps = { player, enemies, colliders, scene };
