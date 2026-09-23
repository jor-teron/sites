/**
 * Browser FPS starter — Assault Cube–style feel (placeholders only).
 * Three.js r170 via import map. No build step.
 */
import * as THREE from 'three';

// ─── Tunables ───────────────────────────────────────────────────────────────
const PLAYER_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.35;
const MOVE_SPEED = 12;       // fast FPS walk/run
const SPRINT_MULT = 1.35;
const JUMP_VEL = 9.5;        // floaty jump
const GRAVITY = 22;
const MOUSE_SENS = 0.0022;
const FIRE_RATE = 0.1;       // seconds between shots
const MAG_SIZE = 30;
const RELOAD_TIME = 1.4;
const HIT_DAMAGE = 34;
const MAX_HEALTH = 100;
const ARENA = { w: 40, d: 40, wallH: 6 };

// ─── DOM ────────────────────────────────────────────────────────────────────
const overlay = document.getElementById('overlay');
const hud = document.getElementById('hud');
const hpVal = document.getElementById('hp-val');
const ammoVal = document.getElementById('ammo-val');
const hitmarker = document.getElementById('hitmarker');
const dmgFlash = document.getElementById('dmg-flash');

// ─── Renderer / Scene / Camera ──────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1e24);
scene.fog = new THREE.Fog(0x1a1e24, 25, 70);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 200);
camera.rotation.order = 'YXZ';

// Pitch helper: camera.rotation.x = pitch, camera.rotation.y = yaw
let yaw = 0;
let pitch = 0;

// ─── Lights ─────────────────────────────────────────────────────────────────
const amb = new THREE.AmbientLight(0x8899aa, 0.55);
scene.add(amb);
const sun = new THREE.DirectionalLight(0xfff0dd, 1.1);
sun.position.set(12, 28, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 60;
sun.shadow.camera.left = -25;
sun.shadow.camera.right = 25;
sun.shadow.camera.top = 25;
sun.shadow.camera.bottom = -25;
scene.add(sun);
const fill = new THREE.HemisphereLight(0x6688aa, 0x334422, 0.35);
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
  const th = 0.5; // wall thickness

  // Floor
  addBox(ARENA.w, 0.4, ARENA.d, 0, -0.2, 0, 0x3a4a3a, { castShadow: false });

  // Outer walls
  addBox(ARENA.w + th * 2, ARENA.wallH, th, 0, ARENA.wallH / 2, -hd - th / 2, 0x555a62);
  addBox(ARENA.w + th * 2, ARENA.wallH, th, 0, ARENA.wallH / 2, hd + th / 2, 0x555a62);
  addBox(th, ARENA.wallH, ARENA.d, -hw - th / 2, ARENA.wallH / 2, 0, 0x4e535b);
  addBox(th, ARENA.wallH, ARENA.d, hw + th / 2, ARENA.wallH / 2, 0, 0x4e535b);

  // Cover boxes (low-poly crates / barriers)
  const covers = [
    [3, 1.4, 1.2, -8, 0.7, -6, 0x8b6914],
    [2.5, 2.2, 2.5, 6, 1.1, 5, 0x6b4423],
    [4, 1.2, 1, 0, 0.6, 10, 0x5a6a4a],
    [1.5, 1.8, 3, -12, 0.9, 8, 0x7a5c3a],
    [2, 1.5, 2, 10, 0.75, -10, 0x4a5560],
    [5, 1.0, 1.5, 4, 0.5, -2, 0x6a5a4a],
    [1.8, 2.5, 1.8, -4, 1.25, 0, 0x8a3a2a],
    [3, 1.3, 3, 12, 0.65, 12, 0x3a5a6a],
  ];
  for (const c of covers) addBox(...c);

  // Center ramp-like stack (visual interest)
  addBox(2, 0.5, 4, -2, 0.25, -12, 0x4a5a4a);
  addBox(2, 1.0, 3, -2, 0.5, -12.5, 0x4a5a4a);
  addBox(2, 1.5, 2, -2, 0.75, -13, 0x4a5a4a);
}

buildArena();

// ─── Enemies (static colored boxes) ─────────────────────────────────────────
const enemies = [];

function spawnEnemies() {
  const specs = [
    { pos: [8, 1, -8], color: 0xcc3333, hp: 100 },
    { pos: [-10, 1, 4], color: 0xdd4422, hp: 100 },
    { pos: [0, 1, -14], color: 0xbb2222, hp: 100 },
    { pos: [14, 1, 2], color: 0xee5533, hp: 80 },
    { pos: [-6, 1, 14], color: 0xaa1111, hp: 100 },
    { pos: [5, 1.5, 8], color: 0xff6644, hp: 60 },
  ];
  for (const s of specs) {
    const geo = new THREE.BoxGeometry(0.9, 2, 0.7);
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
      half: new THREE.Vector3(0.45, 1, 0.35),
    });
  }
}

spawnEnemies();

// ─── Player state ───────────────────────────────────────────────────────────
const player = {
  pos: new THREE.Vector3(0, PLAYER_HEIGHT, 8),
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
  const lim = Math.PI / 2 - 0.05;
  pitch = Math.max(-lim, Math.min(lim, pitch));
});

document.addEventListener('keydown', (e) => {
  // Multiple unlock keys: Esc can be stolen by a host/viewer; P and ` still reach the page.
  if (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'Backquote') {
    e.preventDefault();
    e.stopPropagation();
    unlockPointer();
    return;
  }
  if (!pointerLocked) return;
  keys[e.code] = true;
  if (e.code === 'KeyR' && !player.reloading && player.ammo < MAG_SIZE) startReload();
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
  if (keys['KeyW']) wish.add(forward);
  if (keys['KeyS']) wish.sub(forward);
  if (keys['KeyD']) wish.add(right);
  if (keys['KeyA']) wish.sub(right);
  if (wish.lengthSq() > 0) wish.normalize();

  const sprint = keys['ShiftLeft'] || keys['ShiftRight'];
  const speed = MOVE_SPEED * (sprint ? SPRINT_MULT : 1);
  player.vel.x = wish.x * speed;
  player.vel.z = wish.z * speed;

  if (keys['Space'] && player.onGround) {
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
const muzzleFlashLight = new THREE.PointLight(0xffaa44, 0, 8);
scene.add(muzzleFlashLight);
let flashT = 0;

// Simple bullet tracer line
const tracerMat = new THREE.LineBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.85 });
const tracers = [];

function spawnTracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from.clone(), to.clone()]);
  const line = new THREE.Line(geo, tracerMat.clone());
  scene.add(line);
  tracers.push({ line, life: 0.06 });
}

function startReload() {
  player.reloading = true;
  player.reloadT = RELOAD_TIME;
}

function showHitmarker() {
  hitmarker.classList.add('show');
  clearTimeout(showHitmarker._t);
  showHitmarker._t = setTimeout(() => hitmarker.classList.remove('show'), 80);
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
  muzzleFlashLight.intensity = 4;
  flashT = 0.05;

  raycaster.set(camera.position, shootDir);
  raycaster.far = 100;

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

  const hitDist = Math.min(bestT, wallT, 80);
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
    tr.line.material.opacity = Math.max(0, tr.life / 0.06);
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
      if (Math.abs(dx) < 0.7 && Math.abs(dz) < 0.6 && Math.abs(dy) < 1.4) {
        if (!en.touchCd || en.touchCd <= 0) {
          player.health = Math.max(0, player.health - 8);
          hpVal.textContent = String(player.health);
          dmgFlash.classList.add('show');
          clearTimeout(tick._ft);
          tick._ft = setTimeout(() => dmgFlash.classList.remove('show'), 120);
          en.touchCd = 0.8;
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
