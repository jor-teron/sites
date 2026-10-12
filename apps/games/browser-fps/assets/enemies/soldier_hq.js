/**
 * Browser FPS asset (enemy): soldier_hq — detailed low-poly soldier.
 * Same head/face as humanoid_basic (buildHead) and the SAME createTarget rig: identical hit zones
 * (head sphere + body boxes), collider, walk swing (hip pivots), hit flash, knockback, death fall,
 * corpse sink and gun muzzle anchor (MUZZLE_LOCAL 0.1, 1.3, 0.78).
 * Body: camo shirt + cargo trousers, plate-carrier vest with mag/radio pouches and straps, belt with
 * pouches, knee pads, boots, shaped upper/lower arms with elbows and shoulder pads, gloved hands on a
 * detailed rifle. Shared geometries + a shared camo texture; per-target materials (for the hit flash).
 * ~1.3k triangles per soldier.
 */
import * as THREE from 'three';
import { createTarget as createHumanoid, buildHead, HEAD_MULT } from './humanoid_basic.js';

// ─── Shared camo texture ────────────────────────────────────────────────────
function camoTexture() {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#6b7048'; g.fillRect(0, 0, S, S);
  let seed = 99;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const col of ['#4d5236', '#7d7650', '#3a3a2a', '#5f6640']) {
    g.fillStyle = col;
    for (let i = 0; i < 9; i++) {
      const x = r() * S, y = r() * S;
      g.beginPath();
      g.ellipse(x, y, 6 + r() * 16, 4 + r() * 9, r() * Math.PI, 0, Math.PI * 2);
      g.fill();
      // wrap so it tiles
      g.beginPath(); g.ellipse(x - S, y, 10, 6, 0, 0, Math.PI * 2); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const CAMO = camoTexture();

// ─── Shared geometry ────────────────────────────────────────────────────────
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const S = {
  thigh: B(0.2, 0.46, 0.22), pocket: B(0.05, 0.13, 0.13), knee: B(0.15, 0.11, 0.05),
  shin: B(0.17, 0.36, 0.19), boot: B(0.18, 0.13, 0.31), sole: B(0.19, 0.03, 0.32),
  pelvis: B(0.48, 0.2, 0.27), belt: B(0.5, 0.06, 0.29), buckle: B(0.07, 0.05, 0.02), beltPouch: B(0.08, 0.1, 0.07),
  shirt: B(0.5, 0.6, 0.28), vest: B(0.56, 0.44, 0.33), magPouch: B(0.1, 0.15, 0.05), radio: B(0.07, 0.17, 0.1),
  strap: B(0.08, 0.04, 0.33), collar: new THREE.CylinderGeometry(0.1, 0.12, 0.06, 10), antenna: new THREE.CylinderGeometry(0.006, 0.006, 0.25, 4),
  limb: new THREE.CylinderGeometry(0.85, 1, 1, 8),          // unit tapered limb, scaled per use
  joint: new THREE.SphereGeometry(1, 8, 6), shoulder: new THREE.SphereGeometry(1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  glove: B(0.085, 0.085, 0.1), finger: B(0.09, 0.03, 0.05),
  // rifle
  receiver: B(0.06, 0.08, 0.3), handguard: new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8),
  barrel: new THREE.CylinderGeometry(0.013, 0.013, 0.2, 6), brake: new THREE.CylinderGeometry(0.02, 0.02, 0.05, 6),
  mag: B(0.04, 0.15, 0.065), stock: B(0.05, 0.08, 0.17), grip: B(0.035, 0.09, 0.04),
  scope: new THREE.CylinderGeometry(0.022, 0.022, 0.16, 8), rail: B(0.03, 0.015, 0.26),
};
const GUN = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.55, metalness: 0.35 });
const GUN_POLY = new THREE.MeshStandardMaterial({ color: 0x3e4234, roughness: 0.85 });
const Y = new THREE.Vector3(0, 1, 0);

function soldierBody(k) {
  const { part, pivot } = k;
  const camo = new THREE.MeshStandardMaterial({ color: 0xffffff, map: CAMO, roughness: 0.9 });
  const vest = new THREE.MeshStandardMaterial({ color: 0x4f5638, roughness: 0.85 });
  const gear = new THREE.MeshStandardMaterial({ color: 0x23241f, roughness: 0.75 });
  const pad = new THREE.MeshStandardMaterial({ color: 0x3a3c33, roughness: 0.6 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9b38c, roughness: 0.8 });   // same as humanoid_basic
  const mats = [camo, vest, gear, pad, skin];
  const add = (parent, geo, mat, x, y, z) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
    parent.add(m); return m;
  };
  /** tapered limb from a to b with radius r (unit geometry scaled) */
  const limb = (a, b, r, mat) => {
    const d = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(S.limb, mat);
    m.scale.set(r, d.length(), r);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(Y, d.normalize());
    m.castShadow = true; pivot.add(m); return m;
  };
  const ball = (p, r, mat, geo = S.joint) => { const m = add(pivot, geo, mat, p.x, p.y, p.z); m.scale.setScalar(r); return m; };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ── Legs (hip pivots at y 0.9 — swung by the walk cycle) ──
  const hip = (x, side) => {
    const h = new THREE.Group(); h.position.set(x, 0.9, 0); pivot.add(h);
    add(h, S.thigh, camo, 0, -0.23, 0);
    add(h, S.pocket, camo, side * 0.12, -0.28, 0.01);       // cargo pocket
    add(h, S.knee, pad, 0, -0.49, 0.105);                   // knee pad
    add(h, S.shin, camo, 0, -0.66, 0);
    add(h, S.boot, gear, 0, -0.835, 0.04);
    add(h, S.sole, pad, 0, -0.885, 0.04);
    return h;
  };
  const legL = hip(-0.12, -1), legR = hip(0.12, 1);

  // ── Hips + belt ──
  part(S.pelvis, camo, 0, 0.98, 0);
  part(S.belt, gear, 0, 1.06, 0);
  part(S.buckle, pad, 0, 1.06, 0.15);
  part(S.beltPouch, vest, -0.2, 1.02, 0.12);
  part(S.beltPouch, vest, 0.2, 1.02, 0.12);
  part(S.beltPouch, vest, -0.25, 1.02, -0.06);

  // ── Torso: shirt, plate carrier, pouches, straps, radio ──
  part(S.shirt, camo, 0, 1.38, 0);
  part(S.vest, vest, 0, 1.43, 0);
  for (const x of [-0.13, 0, 0.13]) part(S.magPouch, vest, x, 1.33, 0.185);
  part(S.radio, gear, -0.3, 1.4, -0.06);
  const ant = part(S.antenna, gear, -0.3, 1.6, -0.08); ant.rotation.z = 0.15;
  for (const x of [-0.17, 0.17]) part(S.strap, gear, x, 1.66, 0);
  part(S.collar, camo, 0, 1.67, 0);

  // ── Arms: shoulder pad, upper arm, elbow, forearm, glove (holding the rifle) ──
  const arm = (sh, el, hand, gloveRotY) => {
    ball(sh, 0.09, vest, S.shoulder);
    limb(sh, el, 0.068, camo);
    ball(el, 0.058, camo);
    limb(el, hand, 0.055, camo);
    const g = add(pivot, S.glove, gear, hand.x, hand.y, hand.z); g.rotation.y = gloveRotY;
    const f = add(pivot, S.finger, gear, hand.x, hand.y - 0.04, hand.z + 0.02); f.rotation.y = gloveRotY;
  };
  arm(V(-0.33, 1.6, 0), V(-0.34, 1.33, 0.08), V(0.06, 1.23, 0.44), 0.4);   // left hand on the handguard
  arm(V(0.33, 1.6, 0), V(0.37, 1.32, -0.02), V(0.13, 1.21, 0.16), -0.3);   // right hand on the grip

  // ── Rifle (points +Z; muzzle at MUZZLE_LOCAL 0.1, 1.3, 0.78) ──
  part(S.receiver, GUN, 0.1, 1.3, 0.3);
  const hg = part(S.handguard, GUN_POLY, 0.1, 1.305, 0.54); hg.rotation.x = Math.PI / 2;
  const br = part(S.barrel, GUN, 0.1, 1.31, 0.69); br.rotation.x = Math.PI / 2;
  const mb = part(S.brake, GUN, 0.1, 1.31, 0.76); mb.rotation.x = Math.PI / 2;
  const mg = part(S.mag, GUN, 0.1, 1.2, 0.36); mg.rotation.x = 0.25;
  const gp = part(S.grip, GUN_POLY, 0.1, 1.23, 0.2); gp.rotation.x = -0.35;
  part(S.stock, GUN_POLY, 0.1, 1.28, 0.07);
  part(S.rail, GUN, 0.1, 1.348, 0.36);
  const sc = part(S.scope, GUN, 0.1, 1.385, 0.31); sc.rotation.x = Math.PI / 2;

  // ── Head (identical to humanoid_basic) ──
  buildHead(part, skin);
  return { mats, legL, legR };
}

export function createTarget(spec, opts = {}) {
  return createHumanoid(spec, opts, soldierBody);
}

export default { kind: 'enemy', name: 'soldier_hq', createTarget, HEAD_MULT };
