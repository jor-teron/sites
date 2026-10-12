/**
 * Browser FPS — humanoid target (low-poly, built from shared primitives).
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
const HIDE_AFTER = 0.35;            // stay on the ground this long, then hide (s)
const CONTACT_MARGIN = 0.15;        // contact damage reach beyond the collider

// ─── Shared geometry (one instance for all targets) ─────────────────────────
const G = {
  head: new THREE.SphereGeometry(0.17, 10, 8),
  neck: new THREE.CylinderGeometry(0.06, 0.07, 0.1, 6),
  torso: new THREE.BoxGeometry(0.56, 0.6, 0.3),
  pelvis: new THREE.BoxGeometry(0.5, 0.2, 0.28),
  upperArm: new THREE.BoxGeometry(0.14, 0.4, 0.14),
  lowerArm: new THREE.BoxGeometry(0.12, 0.38, 0.12),
  leg: new THREE.BoxGeometry(0.2, 0.9, 0.22),
  panel: new THREE.CircleGeometry(0.15, 16),
  ring: new THREE.RingGeometry(0.05, 0.09, 16),
};

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

/**
 * @param {{pos:number[], color:number, hp:number, faceYaw?:number}} spec
 */
export function createTarget(spec) {
  const bodyMat = new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(spec.color).multiplyScalar(0.55), roughness: 0.8 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xd9b38c, roughness: 0.8 });
  const panelMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
  const mats = [bodyMat, darkMat, skinMat, panelMat, ringMat];

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
  part(G.leg, darkMat, -0.12, 0.45, 0);
  part(G.leg, darkMat, 0.12, 0.45, 0);
  part(G.pelvis, darkMat, 0, 0.98, 0);
  part(G.torso, bodyMat, 0, 1.38, 0);
  part(G.upperArm, bodyMat, -0.36, 1.48, 0);
  part(G.upperArm, bodyMat, 0.36, 1.48, 0);
  part(G.lowerArm, skinMat, -0.36, 1.1, 0.02);
  part(G.lowerArm, skinMat, 0.36, 1.1, 0.02);
  part(G.neck, skinMat, 0, 1.71, 0);
  part(G.head, skinMat, 0, 1.84, 0);
  // Bullseye on the chest (front = +Z)
  const p = part(G.panel, panelMat, 0, 1.4, 0.151); p.castShadow = false;
  const r = part(G.ring, ringMat, 0, 1.4, 0.152); r.castShadow = false;

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
      _inv.copy(group.matrixWorld).invert();
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

    update(dt) {
      if (this.flash > 0) {
        this.flash -= dt;
        if (this.flash <= 0) for (const m of mats) m.emissive.setRGB(0, 0, 0);
      }
      // knockback offset in world space -> convert to the group's local frame
      if (this.knock > 0) this.knock = Math.max(0, this.knock - KNOCK_RETURN * dt * this.knock - dt);
      const k = this.knock * KNOCK_DIST;
      const c = Math.cos(group.rotation.y), s = Math.sin(group.rotation.y);
      const kx = this.knockDir.x * k, kz = this.knockDir.z * k;
      pivot.position.set(kx * c - kz * s, 0, kx * s + kz * c);
      if (this.dying) {
        this.deathT += dt;
        const f = Math.min(1, this.deathT / FALL_TIME);
        const ease = f * f;                                   // accelerate like falling
        pivot.rotation.x = this.fallSign * ease * (Math.PI / 2 - 0.05);
        if (this.deathT >= FALL_TIME + HIDE_AFTER) {
          this.dying = false;
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
