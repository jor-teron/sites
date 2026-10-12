/**
 * Browser FPS asset (enemy): soldier_mk3 — organic, realistically proportioned soldier (~8 heads tall).
 * Smooth lathe-built body parts with smooth normals instead of boxes: tapered torso (broad chest, narrow waist),
 * rounded sloped shoulders (deltoids), thigh -> knee -> calf -> ankle and upper arm -> forearm -> wrist tapers,
 * ball joints at knees / elbows / shoulders / hips so bends never show gaps, shaped boots, hands with four curled
 * fingers + thumb wrapped around the grip and handguard. Gear (plate carrier, pouches, belt) and the full-face
 * helmet + visor + jaw guard reuse soldier_mk2's shared 512×512 code-painted textures.
 *
 * Same createTarget rig as humanoid_basic / soldier_hq / soldier_mk2 (hit zones incl. head sphere c(0,1.84,0)
 * r 0.17, collider, muzzle anchor). Works with browser-fps_enemy_anim.js: hip pivots (thigh on the hip, parts
 * below -0.4 go to the knee), meshes at y 1.1..1.69 / groups go to the spine (torso, arms, hands, rifle),
 * meshes at y >= 1.69 to the head. Per-soldier materials only for the hit flash. ~4k triangles.
 */
import * as THREE from 'three';
import { createTarget as createHumanoid, HEAD_MULT } from './humanoid_basic.js';
import { mk2Textures, MK2_GEO } from './soldier_mk2.js';

const V2 = (r, y) => new THREE.Vector2(r, y);
const Y = new THREE.Vector3(0, 1, 0);
/** Lathe from [radius, y] pairs (y relative to the part origin); smooth normals. */
const lathe = (prof, seg = 12) => { const g = new THREE.LatheGeometry(prof.map(([r, y]) => V2(Math.max(0.001, r), y)), seg); g.computeVertexNormals(); return g; };
/** Limb lathe along +Y of length 1 (scaled to the bone length), radii profile over t in 0..1 */
const limbGeo = (radii, seg = 8) => lathe(radii.map(([r, t]) => [r, t]), seg);

// ─── Shared geometry ────────────────────────────────────────────────────────
const G = {
  // torso: waist 1.08 -> chest 1.45 -> shoulders 1.6 -> neck base 1.68 (origin at y 1.3; ellipse via scale.z)
  torso: lathe([[0.0, -0.24], [0.14, -0.235], [0.15, -0.18], [0.145, -0.1], [0.16, 0.0], [0.19, 0.1], [0.205, 0.17], [0.2, 0.24], [0.17, 0.3], [0.11, 0.35], [0.065, 0.38], [0.0, 0.385]], 12),
  pelvis: lathe([[0.0, -0.12], [0.1, -0.12], [0.155, -0.08], [0.165, 0.0], [0.15, 0.08], [0.0, 0.1]], 10),     // origin y 0.95
  vest: lathe([[0.17, -0.2], [0.185, -0.12], [0.215, 0.0], [0.228, 0.1], [0.222, 0.16], [0.19, 0.2]], 12),      // open tube, origin y 1.4
  belt: lathe([[0.158, -0.03], [0.162, 0.0], [0.158, 0.03]], 10),
  // limbs: unit length (scaled), radius profile along the bone
  thigh: limbGeo([[0.098, 0], [0.1, 0.12], [0.088, 0.45], [0.072, 0.8], [0.062, 1]]),
  calf: limbGeo([[0.06, 0], [0.066, 0.18], [0.064, 0.35], [0.05, 0.7], [0.042, 0.92], [0.04, 1]]),
  upperArm: limbGeo([[0.06, 0], [0.062, 0.2], [0.055, 0.6], [0.046, 1]], 7),
  forearm: limbGeo([[0.046, 0], [0.05, 0.2], [0.042, 0.65], [0.034, 1]], 7),
  joint: new THREE.SphereGeometry(1, 8, 6),
  deltoid: new THREE.SphereGeometry(1, 8, 6),
  // boots: rounded toe shell + ankle cuff + sole
  bootFoot: new THREE.SphereGeometry(1, 10, 6),
  bootCuff: lathe([[0.05, 0], [0.056, 0.04], [0.055, 0.12], [0.05, 0.14]], 8),
  sole: new THREE.CapsuleGeometry(0.05, 0.19, 2, 6),
  // hands
  palm: new THREE.CapsuleGeometry(0.03, 0.045, 2, 6),
  finger: new THREE.CapsuleGeometry(0.0115, 0.03, 1, 4),
  thumb: new THREE.CapsuleGeometry(0.013, 0.035, 1, 5),
  pouch: new THREE.CapsuleGeometry(0.035, 0.08, 1, 6),
  neck: lathe([[0.065, 0], [0.06, 0.06], [0.064, 0.12]], 8),
};

function mk3Body(k) {
  const { part, pivot } = k;
  const t = mk2Textures(), Sg = MK2_GEO;
  const M = (o) => new THREE.MeshStandardMaterial(o);
  const camo = M({ map: t.camo, roughnessMap: t.rCloth, roughness: 1 });
  const camoDirty = M({ map: t.camoDirty, roughnessMap: t.rCloth, roughness: 1 });
  const vest = M({ map: t.vest, roughnessMap: t.rVest, roughness: 1, side: THREE.DoubleSide });
  const glove = M({ map: t.glove, roughnessMap: t.rCloth, roughness: 0.9 });
  const boot = M({ map: t.boot, roughnessMap: t.rBoot, roughness: 1 });
  const helmet = M({ map: t.helmet, roughnessMap: t.rHelmet, roughness: 1, metalness: 0.05 });
  const visor = M({ map: t.visor, roughness: 0.12, metalness: 0.6 });
  const mask = M({ map: t.mask, roughness: 0.55, metalness: 0.15 });
  const metal = M({ color: 0x8a8c84, roughness: 0.35, metalness: 0.8 });
  const pad = M({ color: 0x3a3c33, roughness: 0.6 });
  const gun = M({ color: 0x24262a, roughness: 0.45, metalness: 0.45 });
  const gunPoly = M({ color: 0x3e4234, roughness: 0.85 });
  const mats = [camo, camoDirty, vest, glove, boot, helmet, visor, mask, metal, pad, gun, gunPoly];
  const mesh = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; m.receiveShadow = true; return m; };
  const add = (parent, geo, mat, x, y, z) => { const m = mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  /** tapered limb from a to b (in `parent` space) */
  const bone = (parent, geo, mat, a, b) => {
    const d = new THREE.Vector3().subVectors(b, a), L = d.length(), m = mesh(geo, mat);
    m.scale.set(1, L, 1); m.position.copy(a); m.quaternion.setFromUnitVectors(Y, d.normalize());
    parent.add(m); return m;
  };
  const ball = (parent, p, r, mat, sx = 1, sy = 1, sz = 1) => { const m = add(parent, G.joint, mat, p.x, p.y, p.z); m.scale.set(r * sx, r * sy, r * sz); return m; };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ── Legs: hip pivot at y 0.9; knee at local -0.46 (parts below -0.4 ride on the knee) ──
  const hip = (x) => {
    const h = new THREE.Group(); h.position.set(x, 0.9, 0); pivot.add(h);
    // thigh (top hidden in the pelvis) down to just above the knee
    bone(h, G.thigh, camo, V(0, 0.04, 0), V(0, -0.44, 0.005));
    // knee: ball joint + pad (both on the knee part), calf, ankle, boot
    const kb = ball(h, V(0, -0.46, 0.0), 0.064, camoDirty); kb.scale.z = 0.066;
    add(h, G.joint, pad, 0, -0.465, 0.05).scale.set(0.055, 0.06, 0.03);              // knee pad
    const calf = bone(h, G.calf, camoDirty, V(0, -0.47, 0), V(0, -0.83, -0.005));
    calf.position.y = -0.47;                                                            // origin below -0.4 -> knee
    add(h, G.bootCuff, boot, 0, -0.87, -0.005);
    const foot = add(h, G.bootFoot, boot, 0, -0.85, 0.045); foot.scale.set(0.062, 0.05, 0.135);
    const sole = add(h, G.sole, pad, 0, -0.885, 0.045); sole.rotation.x = Math.PI / 2; sole.scale.set(1.25, 1, 0.35);
    return h;
  };
  const legL = hip(-0.1), legR = hip(0.1);

  // ── Pelvis + belt (hips group) ──
  const pel = part(G.pelvis, camo, 0, 0.95, 0); pel.geometry = G.pelvis; pel.scale.set(1, 1, 0.68);
  const belt = part(G.belt, vest, 0, 1.05, 0); belt.scale.set(1.02, 1, 0.72);
  part(Sg.buckle, metal, 0, 1.05, 0.118);
  for (const [x, z] of [[-0.14, 0.085], [0.14, 0.085], [-0.15, -0.07]]) { const p = part(G.pouch, vest, x, 1.0, z); p.scale.set(1, 0.8, 0.85); }

  // ── Torso (spine): smooth tapered chest / waist, deltoids, neck ──
  const torso = part(G.torso, camo, 0, 1.3, 0); torso.scale.set(1, 1, 0.62);
  const v = part(G.vest, vest, 0, 1.4, 0.005); v.scale.set(1.0, 1, 0.66);
  for (const x of [-0.11, 0, 0.11]) { const p = part(G.pouch, vest, x, 1.33, 0.13); p.scale.set(1.15, 0.95, 0.7); }
  const rad = part(G.pouch, pad, -0.2, 1.42, -0.06); rad.scale.set(0.9, 1.1, 1);
  const ant = part(Sg.antenna, pad, -0.2, 1.62, -0.08); ant.rotation.z = 0.15;
  for (const sx of [-1, 1]) {
    const d = part(G.deltoid, camo, sx * 0.2, 1.57, 0); d.scale.set(0.085, 0.075, 0.08);       // rounded sloped shoulder
    const st = part(Sg.strap, vest, sx * 0.13, 1.62, 0); st.scale.set(0.9, 1, 0.82); st.rotation.z = sx * 0.25;
  }

  // ── Arms + hands (groups -> spine) ──
  const arm = (sh, el, wr) => {
    const g = new THREE.Group(); pivot.add(g);
    bone(g, G.upperArm, camo, sh, el);
    ball(g, el, 0.05, camoDirty);
    bone(g, G.forearm, camoDirty, el, wr);
    ball(g, wr, 0.034, glove);
    return g;
  };
  /** hand wrapped around a bar (axis direction ax, through point c) — palm on one side, fingers curled round */
  const hand = (c, ax, side, palmDir) => {
    const g = new THREE.Group(); g.position.copy(c); pivot.add(g);
    // local frame: x = bar axis, y = palm side normal; build then orient
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), ax.clone().normalize());
    const inner = new THREE.Group(); inner.quaternion.copy(q); g.add(inner);
    const frame = new THREE.Group(); frame.rotation.x = palmDir; inner.add(frame);
    const palm = add(frame, G.palm, glove, 0, 0.05, 0); palm.rotation.z = Math.PI / 2; palm.scale.set(1.05, 1, 0.75);
    for (let i = 0; i < 4; i++) {                               // four fingers curled around the bar
      const x = -0.033 + i * 0.022;
      for (let s = 0; s < 2; s++) {
        const a = -0.2 - s * 1.25, r = 0.04;
        const f = add(frame, G.finger, glove, x, Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9 + (s ? 0 : 0.008) * side);
        f.rotation.x = a + Math.PI / 2;
      }
    }
    const th = add(frame, G.thumb, glove, 0.045 * side, 0.025, -0.03); th.rotation.set(0.6, 0, side * 0.9);
    return g;
  };
  // left hand under the handguard, right hand on the pistol grip
  arm(V(-0.2, 1.555, 0.0), V(-0.2, 1.29, 0.22), V(0.03, 1.27, 0.47));
  hand(V(0.08, 1.29, 0.52), V(0, 0, 1), -1, Math.PI * 0.5 + 0.5);
  arm(V(0.2, 1.555, 0.0), V(0.3, 1.27, -0.04), V(0.15, 1.24, 0.17));
  const rh = hand(V(0.1, 1.22, 0.2), V(0, -0.94, 0.34), 1, 0);

  // ── Rifle (same as mk2; muzzle at MUZZLE_LOCAL 0.1, 1.3, 0.78) ──
  part(Sg.receiver, gun, 0.1, 1.3, 0.3);
  const hg = part(Sg.handguard, gunPoly, 0.1, 1.305, 0.54); hg.rotation.x = Math.PI / 2;
  const br = part(Sg.barrel, gun, 0.1, 1.31, 0.69); br.rotation.x = Math.PI / 2;
  const mb = part(Sg.brake, gun, 0.1, 1.31, 0.76); mb.rotation.x = Math.PI / 2;
  const mg = part(Sg.mag, gun, 0.1, 1.2, 0.36); mg.rotation.x = 0.25;
  const gp = part(Sg.grip, gunPoly, 0.1, 1.23, 0.2); gp.rotation.x = -0.35;
  part(Sg.stock, gunPoly, 0.1, 1.28, 0.07);
  part(Sg.srail, gun, 0.1, 1.348, 0.36);
  const sc = part(Sg.scope, gun, 0.1, 1.385, 0.31); sc.rotation.x = Math.PI / 2;

  // ── Neck + full-face helmet (head group: y >= 1.69) ──
  part(G.neck, camo, 0, 1.69, 0);
  part(Sg.liner, mask, 0, 1.84, 0);
  part(Sg.shellTop, helmet, 0, 1.845, -0.005);
  part(Sg.shellBack, helmet, 0, 1.845, -0.005);
  part(Sg.visor, visor, 0, 1.85, 0.005);
  part(Sg.mask, mask, 0, 1.845, 0.005);
  for (const sx of [-1, 1]) {
    part(Sg.rail, pad, sx * 0.19, 1.86, -0.01);
    const e = part(Sg.earCup, pad, sx * 0.175, 1.81, -0.01); e.rotation.z = Math.PI / 2;
  }
  part(Sg.nvg, metal, 0, 1.99, 0.15);
  return { mats, legL, legR };
}

export function createTarget(spec, opts = {}) { return createHumanoid(spec, opts, mk3Body); }
export default { kind: 'enemy', name: 'soldier_mk3', createTarget, HEAD_MULT };
