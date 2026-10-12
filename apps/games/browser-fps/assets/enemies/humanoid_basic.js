/**
 * Browser FPS asset (enemy): humanoid_basic — low-poly humanoid built from shared primitives.
 * Asset interface: default export { kind: 'enemy', name, createTarget(spec, opts) }.
 * opts.visual (optional THREE.Object3D, e.g. a loaded .glb scene): replaces the built body meshes;
 * hit zones, collider, knockback/death/walk-bob transforms and the gun muzzle flash are kept.
 *
 * createTarget(spec, opts) returns an object used by browser-fps_logic.js:
 *   group      THREE.Group, origin at the FEET (stands on y = spec.pos[1] - 1, i.e. the floor)
 *   collider   world AABB { min, max, target: true, disabled } pushed into the player colliders
 *   raycast(origin, dir) -> { t, zone: 'head' | 'body' } | null   (exact per-zone test)
 *   hit(zone, dmg, dir)  apply damage (head x HEAD_MULT), flash, knockback, death
 *   update(dt)           animations (flash, knockback, death fall)
 *   touches(pos, radius, height) -> bool  contact test against the collider (+ margin)
 */
import * as THREE from 'three';

export const HEAD_MULT = 2.5;       // head shots deal this many times the damage
const FLASH_TIME = 0.08;            // hit flash (s)
const KNOCK_DIST = 0.12;            // knockback offset (world units)
const KNOCK_RETURN = 10;            // knockback recovery rate (1/s)
const FALL_TIME = 0.45;             // death fall duration (s)
const CORPSE_TIME = 10;             // corpse stays on the floor this long after the fall (s)
const SINK_TIME = 1;                // then sinks into the floor over this long (s)
const SINK_DEPTH = 0.6;             // how far it sinks (body lies ~0.35 thick)
const CONTACT_MARGIN = 0.15;        // contact damage reach beyond the collider
const RISE_TIME = 0.6;              // spawn rise-up animation (s)
const RISE_DEPTH = 2.1;             // starts this far below the floor
const ENEMY_FLASH_TIME = 0.06;      // enemy muzzle flash (s)
const MUZZLE_LOCAL = new THREE.Vector3(0.1, 1.3, 0.78); // enemy gun barrel tip (local, facing +Z)

// ─── Shared geometry (one instance for all targets; exported for other humanoid models) ─────────────────────────
export const G = {
  head: new THREE.SphereGeometry(0.17, 10, 8),
  neck: new THREE.CylinderGeometry(0.06, 0.07, 0.1, 6),
  torso: new THREE.BoxGeometry(0.56, 0.6, 0.3),
  pelvis: new THREE.BoxGeometry(0.5, 0.2, 0.28),
  upperArm: new THREE.BoxGeometry(0.14, 0.4, 0.14),
  lowerArm: new THREE.BoxGeometry(0.12, 0.38, 0.12),
  leg: new THREE.BoxGeometry(0.2, 0.9, 0.22),
  panel: new THREE.CircleGeometry(0.15, 16),
  ring: new THREE.RingGeometry(0.05, 0.09, 16),
  forearm: new THREE.CylinderGeometry(0.055, 0.06, 1, 6),   // unit length, scaled per arm
  hand: new THREE.BoxGeometry(0.08, 0.08, 0.09),
  gunBody: new THREE.BoxGeometry(0.06, 0.09, 0.42),
  gunBarrel: new THREE.CylinderGeometry(0.014, 0.014, 0.18, 6),
  gunMag: new THREE.BoxGeometry(0.04, 0.12, 0.06),
  gunStock: new THREE.BoxGeometry(0.05, 0.07, 0.14),
  flash: new THREE.PlaneGeometry(0.18, 0.18),
};
export const GUN_MAT = new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.6, metalness: 0.3 });
const FLASH_MAT = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95,
  blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

// Hit zones in the target's local space (origin at feet, facing +Z)
const HEAD = { c: new THREE.Vector3(0, 1.84, 0), r: 0.19 };
const BODY_BOXES = [
  { min: new THREE.Vector3(-0.44, 0.88, -0.17), max: new THREE.Vector3(0.44, 1.7, 0.17) },   // torso + arms + pelvis
  { min: new THREE.Vector3(-0.24, 0.0, -0.13), max: new THREE.Vector3(0.24, 0.88, 0.13) },   // legs
];
// Player collider half-extents (x/z) and height
const COL_HALF = 0.42, COL_H = 2.02;

const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _inv = new THREE.Matrix4();

function raySphere(o, d, c, r) {
  const ox = o.x - c.x, oy = o.y - c.y, oz = o.z - c.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const cc = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t = -b - s >= 0 ? -b - s : -b + s;
  return t >= 0 ? t : null;
}

function rayBox(o, d, min, max) {
  let tmin = -Infinity, tmax = Infinity;
  for (const a of ['x', 'y', 'z']) {
    if (Math.abs(d[a]) < 1e-12) {
      if (o[a] < min[a] || o[a] > max[a]) return null;
    } else {
      let t1 = (min[a] - o[a]) / d[a], t2 = (max[a] - o[a]) / d[a];
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  if (tmax < 0) return null;
  return tmin >= 0 ? tmin : tmax;
}

/** Head + neck (shared by every humanoid model so the head hit zone always matches). */
export function buildHead(part, skinMat) {
  part(G.neck, skinMat, 0, 1.71, 0);
  part(G.head, skinMat, 0, 1.84, 0);
}

/**
 * Body builder for the basic humanoid. A body builder gets
 *   k = { spec, pivot, part(geo, mat, x, y, z), G, THREE }
 * and returns { mats (per-target materials, flashed white on hit), legL, legR (hip pivots at y 0.9) }.
 * Must call buildHead(). Hit zones / collider / animation live in createTarget and stay identical.
 */
export function buildBasicBody(k) {
  const { spec, part } = k;
  const bodyMat = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.color).multiplyScalar(0.55), roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd9b38c, roughness: 0.8 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
  const mats = [bodyMat, darkMat, skinMat, panelMat, ringMat];

  // Legs hang from hip pivots so they can swing while walking
  const hip = (x) => {
    const h = new THREE.Group();
    h.position.set(x, 0.9, 0);
    const m = new THREE.Mesh(G.leg, darkMat);
    m.position.y = -0.45;
    m.castShadow = true; m.receiveShadow = true;
    h.add(m);
    k.pivot.add(h);
    return h;
  };
  const legL = hip(-0.12), legR = hip(0.12);
  part(G.pelvis, darkMat, 0, 0.98, 0);
  part(G.torso, bodyMat, 0, 1.38, 0);
  part(G.upperArm, bodyMat, -0.36, 1.48, 0);
  part(G.upperArm, bodyMat, 0.36, 1.48, 0);
  // Forearms reach forward to hold the gun
  const forearm = (from, to) => {
    const dir = new THREE.Vector3().subVectors(to, from);
    const m = new THREE.Mesh(G.forearm, skinMat);
    m.scale.y = dir.length();
    m.position.copy(from).addScaledVector(dir, 0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    m.castShadow = true;
    k.pivot.add(m);
  };
  forearm(new THREE.Vector3(-0.36, 1.3, 0.02), new THREE.Vector3(0.04, 1.24, 0.42));  // left hand on the handguard
  forearm(new THREE.Vector3(0.36, 1.3, 0.02), new THREE.Vector3(0.14, 1.22, 0.16));   // right hand on the grip
  part(G.hand, skinMat, 0.06, 1.23, 0.44);
  part(G.hand, skinMat, 0.13, 1.21, 0.16);
  // Gun (points +Z, the way the target faces)
  part(G.gunBody, GUN_MAT, 0.1, 1.3, 0.38);
  const brl = part(G.gunBarrel, GUN_MAT, 0.1, 1.31, 0.68); brl.rotation.x = Math.PI / 2;
  part(G.gunMag, GUN_MAT, 0.1, 1.2, 0.36);
  part(G.gunStock, GUN_MAT, 0.1, 1.27, 0.12);
  buildHead(part, skinMat);
  // Bullseye on the chest (front = +Z)
  const p = part(G.panel, panelMat, 0, 1.4, 0.151); p.castShadow = false;
  const r = part(G.ring, ringMat, 0, 1.4, 0.152); r.castShadow = false;

  return { mats, legL, legR };
}

/**
 * @param {{pos:number[], color:number, hp:number, faceYaw?:number}} spec
 * @param {{visual?: THREE.Object3D}} [opts]
 * @param {Function} [body]  body builder (default buildBasicBody)
 */
export function createTarget(spec, opts = {}, body = buildBasicBody) {
  const group = new THREE.Group();     // positioned at the feet; knockback/death move `pivot`
  const pivot = new THREE.Group();
  group.add(pivot);

  const part = (geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    pivot.add(m);
    return m;
  };
  const { mats, legL, legR } = body({ spec, pivot, part, G, THREE });
  const flashA = new THREE.Mesh(G.flash, FLASH_MAT), flashB = new THREE.Mesh(G.flash, FLASH_MAT);
  flashB.rotation.y = Math.PI / 2;
  const muzzleFlash = new THREE.Group();
  muzzleFlash.add(flashA, flashB);
  muzzleFlash.position.copy(MUZZLE_LOCAL);
  muzzleFlash.visible = false;
  pivot.add(muzzleFlash);
  if (opts.visual) {
    // Swap the visuals: hide the built meshes (legs too), keep the muzzle flash, add the model (feet at origin, facing +Z)
    for (const c of pivot.children) if (c !== muzzleFlash) c.visible = false;
    const v = opts.visual.clone(true);
    v.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    pivot.add(v);
  }

  const feetY = spec.pos[1] - 1;       // spec positions were box centres (2 tall)
  group.position.set(spec.pos[0], feetY, spec.pos[2]);
  group.rotation.y = spec.faceYaw || 0;
  group.updateMatrixWorld(true);

  const collider = {
    min: new THREE.Vector3(spec.pos[0] - COL_HALF, feetY, spec.pos[2] - COL_HALF),
    max: new THREE.Vector3(spec.pos[0] + COL_HALF, feetY + COL_H, spec.pos[2] + COL_HALF),
    target: true,
    disabled: false,
  };

  const t = {
    spec,
    rising: 0,            // > 0 while the spawn rise animation plays
    shootCd: 0,           // AI: seconds until it may fire again
    seenT: 0,             // AI: how long the player has been in sight (reaction delay)
    muzzleT: 0,
    walkSpeed: 0,         // current walking speed (u/s) -> animation
    walkPhase: 0,
    strafeDir: 1,         // AI strafe direction (+1 / -1)
    strafeT: 0,           // AI time until the strafe direction changes
    group,
    mesh: group,          // compatibility with code that reads en.mesh.position
    collider,
    hp: spec.hp,
    maxHp: spec.hp,
    alive: true,
    flash: 0,
    knock: 0,
    knockDir: new THREE.Vector3(),
    dying: false,
    deathT: 0,
    fallSign: 1,

    raycast(origin, dir) {
      if (!this.alive) return null;
      group.updateMatrixWorld(true);
      _inv.copy(pivot.matrixWorld).invert();   // pivot carries rise/knockback offsets
      _o.copy(origin).applyMatrix4(_inv);
      _d.copy(dir).transformDirection(_inv);
      let best = null;
      const th = raySphere(_o, _d, HEAD.c, HEAD.r);
      if (th !== null) best = { t: th, zone: 'head' };
      for (const b of BODY_BOXES) {
        const tb = rayBox(_o, _d, b.min, b.max);
        if (tb !== null && (!best || tb < best.t)) best = { t: tb, zone: 'body' };
      }
      return best;   // scale is 1, so local t == world t
    },

    hit(zone, dmg, dir) {
      if (!this.alive) return 0;
      const dealt = zone === 'head' ? dmg * HEAD_MULT : dmg;
      this.hp -= dealt;
      this.flash = FLASH_TIME;
      for (const m of mats) m.emissive.setRGB(1, 1, 1);
      this.knock = 1;
      this.knockDir.set(dir.x, 0, dir.z).normalize();
      if (this.hp <= 0) {
        this.alive = false;
        this.dying = true;
        this.deathT = 0;
        collider.disabled = true;
        // Fall away from the shooter: compare shot direction with the target's facing (+Z local)
        const fwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), group.rotation.y);
        this.fallSign = fwd.dot(this.knockDir) > 0 ? 1 : -1;
      }
      return dealt;
    },

    /** Reuse this target (pool) at a new place, rising out of the floor. */
    respawn(x, z, faceYaw, hp, rise = true) {
      this.hp = this.maxHp = hp;
      this.alive = true;
      this.dying = false;
      this.deathT = 0;
      this.flash = 0;
      this.knock = 0;
      this.shootCd = 0;
      this.seenT = 0;
      for (const m of mats) m.emissive.setRGB(0, 0, 0);
      group.position.set(x, 0, z);
      group.rotation.y = faceYaw;
      group.visible = true;
      pivot.rotation.set(0, 0, 0);
      this.rising = rise ? RISE_TIME : 0;
      pivot.position.set(0, rise ? -RISE_DEPTH : 0, 0);
      collider.min.set(x - COL_HALF, 0, z - COL_HALF);
      collider.max.set(x + COL_HALF, COL_H, z + COL_HALF);
      collider.disabled = false;
    },

    /** Move the feet to (x, z) and keep the collider in sync. */
    moveTo(x, z) {
      group.position.x = x;
      group.position.z = z;
      collider.min.set(x - COL_HALF, 0, z - COL_HALF);
      collider.max.set(x + COL_HALF, COL_H, z + COL_HALF);
    },

    /** Turn toward a world point at most `rate` rad/s. Returns remaining angle error (rad). */
    turnToward(px, pz, rate, dt) {
      const want = Math.atan2(px - group.position.x, pz - group.position.z);
      let d = want - group.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const step = Math.max(-rate * dt, Math.min(rate * dt, d));
      group.rotation.y += step;
      return Math.abs(d - step);
    },

    /** World position of the gun's barrel tip. */
    muzzleWorld(out = new THREE.Vector3()) {
      group.updateMatrixWorld(true);
      return out.copy(MUZZLE_LOCAL).applyMatrix4(pivot.matrixWorld);
    },

    showMuzzleFlash() {
      this.muzzleT = ENEMY_FLASH_TIME;
      muzzleFlash.visible = true;
      muzzleFlash.rotation.z = Math.random() * Math.PI;
    },

    update(dt) {
      if (this.muzzleT > 0) { this.muzzleT -= dt; if (this.muzzleT <= 0) muzzleFlash.visible = false; }
      if (this.flash > 0) {
        this.flash -= dt;
        if (this.flash <= 0) for (const m of mats) m.emissive.setRGB(0, 0, 0);
      }
      // knockback offset in world space -> convert to the group's local frame
      if (this.knock > 0) this.knock = Math.max(0, this.knock - KNOCK_RETURN * dt * this.knock - dt);
      const k = this.knock * KNOCK_DIST;
      const c = Math.cos(group.rotation.y), s = Math.sin(group.rotation.y);
      const kx = this.knockDir.x * k, kz = this.knockDir.z * k;
      let riseY = 0;
      if (this.rising > 0) {
        this.rising = Math.max(0, this.rising - dt);
        const u = 1 - this.rising / RISE_TIME;
        riseY = -RISE_DEPTH * (1 - u) * (1 - u);          // ease out of the floor
      }
      // walk cycle: legs swing from the hips, body bobs a little (corpses / risers don't walk)
      // cadence scales with speed (stride ~1.3 u per cycle), so slower enemies take slower steps
      const walking = this.alive && this.rising <= 0 ? Math.min(1, this.walkSpeed / 0.9) : 0;
      this.walkPhase += dt * this.walkSpeed * 4.8 * (walking > 0 ? 1 : 0);
      const swing = Math.sin(this.walkPhase) * 0.55 * walking;
      legL.rotation.x = swing;
      legR.rotation.x = -swing;
      const bob = Math.abs(Math.cos(this.walkPhase)) * 0.04 * walking;
      pivot.position.set(kx * c - kz * s, riseY + bob, kx * s + kz * c);
      if (this.dying) {
        this.deathT += dt;
        const f = Math.min(1, this.deathT / FALL_TIME);
        const ease = f * f;                                   // accelerate like falling
        pivot.rotation.x = this.fallSign * ease * (Math.PI / 2 - 0.05);
        // Corpse: lie still for CORPSE_TIME, then sink out of sight and return to the pool
        const sinkT = this.deathT - FALL_TIME - CORPSE_TIME;
        if (sinkT > 0) pivot.position.y -= SINK_DEPTH * Math.min(1, sinkT / SINK_TIME);
        if (sinkT >= SINK_TIME) {
          this.dying = false;          // pool may reuse it now
          group.visible = false;
        }
      }
    },

    touches(pos, radius, height) {
      if (!this.alive) return false;
      const m = CONTACT_MARGIN;
      return pos.x + radius > collider.min.x - m && pos.x - radius < collider.max.x + m &&
             pos.z + radius > collider.min.z - m && pos.z - radius < collider.max.z + m &&
             pos.y > collider.min.y && pos.y - height < collider.max.y;
    },
  };
  return t;
}

export default { kind: 'enemy', name: 'humanoid_basic', createTarget: (spec, opts) => createTarget(spec, opts), HEAD_MULT };
