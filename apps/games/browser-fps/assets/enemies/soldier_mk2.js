/**
 * Browser FPS asset (enemy): soldier_mk2 — soldier_hq upgraded with 512×512 code-painted textures and a
 * full-face helmet (no visible face). Same createTarget rig as humanoid_basic / soldier_hq: identical hit zones
 * (head sphere c(0,1.84,0) r 0.17 + body boxes), collider, muzzle anchor, and the animation parts used by
 * browser-fps_enemy_anim.js (hip pivots with thigh + knee parts, torso / arms / rifle on the spine, head parts
 * at y >= 1.69 on the head group).
 * Textures (generated once, shared by every soldier): camo uniform (fine digital-woodland pattern, weave,
 * seams/stitching), dirty camo (knees / elbows / shins), plate carrier (webbing rows, stitching), gloves (seams),
 * boots (laces, scuffs), helmet shell (matte, scratches, rail), visor (dark tint + reflection streaks).
 * Roughness maps keep cloth matte; buckles / metal / visor are slightly shiny. Per-soldier materials only for the
 * hit flash (they share the textures). ~1.8k triangles per soldier.
 */
import * as THREE from 'three';
import { createTarget as createHumanoid, HEAD_MULT } from './humanoid_basic.js';

// ─── 512×512 canvas textures (shared) ───────────────────────────────────────
const N = 512;
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function canvas() { const c = document.createElement('canvas'); c.width = c.height = N; return [c, c.getContext('2d')]; }
function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** fine fabric weave: alternating light/dark thread lines */
function weave(g, a = 0.08, step = 3) {
  for (let y = 0; y < N; y += step) { g.fillStyle = `rgba(255,255,255,${a})`; g.fillRect(0, y, N, 1); }
  for (let x = 0; x < N; x += step) { g.fillStyle = `rgba(0,0,0,${a})`; g.fillRect(x, 0, 1, N); }
}
/** dashed stitch line */
function stitch(g, x0, y0, x1, y1, col = 'rgba(30,30,20,0.7)', w = 1.5) {
  g.save(); g.strokeStyle = col; g.lineWidth = w; g.setLineDash([5, 4]);
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.restore();
}
function grime(g, r, n, rad, col) {
  for (let i = 0; i < n; i++) {
    const x = r() * N, y = r() * N, s = rad * (0.4 + r());
    const grd = g.createRadialGradient(x, y, 0, x, y, s);
    grd.addColorStop(0, col); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(x - s, y - s, s * 2, s * 2);
  }
}
/** roughness map: base grey + noise (green channel is what three reads) */
function roughMap(base, noise, seed, extra) {
  const [c, g] = canvas(), r = rng(seed);
  const v = Math.round(base * 255); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 9000; i++) { const d = Math.round((r() - 0.5) * noise * 255); const w = Math.max(0, Math.min(255, v + d)); g.fillStyle = `rgb(${w},${w},${w})`; g.fillRect(r() * N, r() * N, 2, 2); }
  if (extra) extra(g, r);
  return tex(c, false);
}

function camoCanvas(dirty) {
  const [c, g] = canvas(), r = rng(dirty ? 41 : 17);
  g.fillStyle = '#6f7350'; g.fillRect(0, 0, N, N);
  // finer camo: many small blobs + pixel clusters (digital-woodland feel), tiling-safe wrap
  const cols = ['#555a3b', '#848059', '#3d3f2c', '#6a7046', '#9a9068'];
  for (const col of cols) {
    g.fillStyle = col;
    for (let i = 0; i < 70; i++) {
      const x = r() * N, y = r() * N, rx = 6 + r() * 22, ry = 4 + r() * 12, a = r() * Math.PI;
      for (const [ox, oy] of [[0, 0], [-N, 0], [N, 0], [0, -N], [0, N]]) { g.beginPath(); g.ellipse(x + ox, y + oy, rx, ry, a, 0, Math.PI * 2); g.fill(); }
    }
    for (let i = 0; i < 260; i++) { const s = 3 + ((r() * 3) | 0) * 3; g.fillRect(((r() * N) / 3 | 0) * 3, ((r() * N) / 3 | 0) * 3, s, s); }
  }
  weave(g, 0.07, 3);
  // seams / stitching
  g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 254, N, 4); g.fillRect(254, 0, 4, N);
  stitch(g, 0, 250, N, 250); stitch(g, 0, 262, N, 262); stitch(g, 250, 0, 250, N); stitch(g, 262, 0, 262, N);
  if (dirty) { grime(g, r, 26, 70, 'rgba(70,55,35,0.45)'); grime(g, r, 40, 25, 'rgba(50,40,25,0.4)'); }
  else grime(g, r, 10, 60, 'rgba(70,60,40,0.18)');
  return c;
}
function vestCanvas() {
  const [c, g] = canvas(), r = rng(23);
  g.fillStyle = '#525a3a'; g.fillRect(0, 0, N, N);
  weave(g, 0.1, 2);
  // MOLLE webbing rows with stitching
  for (let y = 40; y < N; y += 64) {
    g.fillStyle = '#434a2f'; g.fillRect(0, y, N, 22);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, y + 22, N, 2);
    stitch(g, 0, y + 3, N, y + 3, 'rgba(20,22,14,0.8)'); stitch(g, 0, y + 19, N, y + 19, 'rgba(20,22,14,0.8)');
    for (let x = 0; x < N; x += 42) { g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x, y, 3, 22); }
  }
  // edge binding
  g.strokeStyle = '#2f3422'; g.lineWidth = 10; g.strokeRect(5, 5, N - 10, N - 10);
  stitch(g, 14, 14, N - 14, 14); stitch(g, 14, N - 14, N - 14, N - 14); stitch(g, 14, 14, 14, N - 14); stitch(g, N - 14, 14, N - 14, N - 14);
  grime(g, r, 14, 50, 'rgba(60,50,30,0.25)');
  return c;
}
function gloveCanvas() {
  const [c, g] = canvas(), r = rng(31);
  g.fillStyle = '#2a2b26'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 6000; i++) { const v = 30 + r() * 25; g.fillStyle = `rgba(${v},${v},${v - 4},0.6)`; g.fillRect(r() * N, r() * N, 2, 2); }
  // knuckle pad + finger seams
  g.fillStyle = '#3a3c34'; g.fillRect(60, 60, 392, 150);
  stitch(g, 60, 60, 452, 60, 'rgba(110,110,100,0.6)'); stitch(g, 60, 210, 452, 210, 'rgba(110,110,100,0.6)');
  for (let x = 128; x < N; x += 128) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, 0, 3, N); stitch(g, x + 6, 0, x + 6, N, 'rgba(90,90,80,0.6)'); }
  return c;
}
function bootCanvas() {
  const [c, g] = canvas(), r = rng(37);
  g.fillStyle = '#4a3f30'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 7000; i++) { const v = 55 + r() * 30; g.fillStyle = `rgba(${v},${v - 8},${v - 18},0.5)`; g.fillRect(r() * N, r() * N, 2, 2); }
  // laces criss-cross down the middle
  g.fillStyle = '#1c1a16'; g.fillRect(200, 0, 112, N * 0.75);
  g.strokeStyle = '#b5ab90'; g.lineWidth = 7;
  for (let y = 20; y < N * 0.72; y += 38) { g.beginPath(); g.moveTo(205, y); g.lineTo(307, y + 30); g.moveTo(307, y); g.lineTo(205, y + 30); g.stroke(); }
  for (let y = 20; y < N * 0.75; y += 38) for (const x of [196, 316]) { g.fillStyle = '#9a9a92'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); }
  // toe cap seam + scuffs
  g.fillStyle = '#3a3126'; g.fillRect(0, N * 0.78, N, N * 0.22);
  stitch(g, 0, N * 0.78 + 6, N, N * 0.78 + 6, 'rgba(160,150,120,0.6)');
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(170,160,140,${0.2 + r() * 0.3})`; g.lineWidth = 1 + r() * 2; const x = r() * N, y = r() * N; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 12); g.stroke(); }
  return c;
}
function helmetCanvas() {
  const [c, g] = canvas(), r = rng(43);
  g.fillStyle = '#56603e'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 12000; i++) { const v = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,240,0.08)'; g.fillStyle = v; g.fillRect(r() * N, r() * N, 2, 2); }   // matte grain
  grime(g, r, 18, 60, 'rgba(40,40,25,0.25)');
  for (let i = 0; i < 70; i++) { g.strokeStyle = `rgba(200,200,180,${0.15 + r() * 0.25})`; g.lineWidth = 1; const x = r() * N, y = r() * N; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30); g.stroke(); }  // scratches
  // side rail band + bolts, rim edge
  g.fillStyle = '#2e3324'; g.fillRect(0, 300, N, 26);
  for (let x = 16; x < N; x += 64) { g.fillStyle = '#8a8c84'; g.beginPath(); g.arc(x, 313, 5, 0, 7); g.fill(); }
  g.fillStyle = '#20241a'; g.fillRect(0, N - 30, N, 30);
  return c;
}
function visorCanvas() {
  const [c, g] = canvas();
  const grd = g.createLinearGradient(0, 0, 0, N);
  grd.addColorStop(0, '#2a3440'); grd.addColorStop(0.45, '#0d1218'); grd.addColorStop(1, '#05080b');
  g.fillStyle = grd; g.fillRect(0, 0, N, N);
  // reflection streaks
  g.fillStyle = 'rgba(180,210,235,0.22)';
  g.beginPath(); g.moveTo(90, 60); g.lineTo(170, 60); g.lineTo(110, 300); g.lineTo(60, 300); g.fill();
  g.fillStyle = 'rgba(180,210,235,0.12)';
  g.beginPath(); g.moveTo(200, 60); g.lineTo(225, 60); g.lineTo(175, 260); g.lineTo(160, 260); g.fill();
  // frame edge
  g.strokeStyle = '#151a12'; g.lineWidth = 18; g.strokeRect(0, 0, N, N);
  return c;
}
function maskCanvas() {   // ballistic lower mask (mouth / jaw guard) with vents
  const [c, g] = canvas(), r = rng(53);
  g.fillStyle = '#2b2f26'; g.fillRect(0, 0, N, N);
  for (let i = 0; i < 8000; i++) { g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.05)'; g.fillRect(r() * N, r() * N, 2, 2); }
  for (let y = 180; y < 360; y += 28) for (let x = 150; x < 370; x += 36) { g.fillStyle = '#0c0d0a'; g.fillRect(x, y, 24, 10); }
  stitch(g, 20, 20, N - 20, 20, 'rgba(150,150,130,0.4)');
  return c;
}

let T = null;   // textures, built lazily on the first soldier (then shared)
function textures() {
  if (T) return T;
  T = {
    camo: tex(camoCanvas(false)), camoDirty: tex(camoCanvas(true)), vest: tex(vestCanvas()), glove: tex(gloveCanvas()),
    boot: tex(bootCanvas()), helmet: tex(helmetCanvas()), visor: tex(visorCanvas()), mask: tex(maskCanvas()),
    rCloth: roughMap(0.92, 0.15, 61), rVest: roughMap(0.85, 0.2, 62),
    rHelmet: roughMap(0.7, 0.3, 63), rBoot: roughMap(0.75, 0.25, 64),
  };
  return T;
}

// ─── Shared geometry (low-poly) ─────────────────────────────────────────────
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const S = {
  thigh: B(0.2, 0.46, 0.22), pocket: B(0.05, 0.13, 0.13), knee: B(0.15, 0.11, 0.05),
  shin: B(0.17, 0.36, 0.19), boot: B(0.18, 0.13, 0.31), sole: B(0.19, 0.03, 0.32),
  pelvis: B(0.48, 0.2, 0.27), belt: B(0.5, 0.06, 0.29), buckle: B(0.07, 0.05, 0.02), beltPouch: B(0.08, 0.1, 0.07),
  shirt: B(0.5, 0.6, 0.28), vest: B(0.56, 0.44, 0.33), magPouch: B(0.1, 0.15, 0.05), radio: B(0.07, 0.17, 0.1),
  strap: B(0.08, 0.04, 0.33), collar: new THREE.CylinderGeometry(0.1, 0.12, 0.06, 10), antenna: new THREE.CylinderGeometry(0.006, 0.006, 0.25, 4),
  limb: new THREE.CylinderGeometry(0.85, 1, 1, 8),
  joint: new THREE.SphereGeometry(1, 8, 6), shoulder: new THREE.SphereGeometry(1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  glove: B(0.085, 0.085, 0.1), finger: B(0.09, 0.03, 0.05),
  // full-face helmet (head hit zone stays the sphere c(0,1.84,0) r 0.17)
  neck: new THREE.CylinderGeometry(0.07, 0.08, 0.12, 8),
  shellTop: new THREE.SphereGeometry(0.198, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.36),              // dome + brow
  shellBack: new THREE.SphereGeometry(0.195, 12, 6, Math.PI * 0.83, Math.PI * 1.34, Math.PI * 0.3, Math.PI * 0.32),  // sides + back (open at the face)
  liner: new THREE.SphereGeometry(0.172, 12, 8),
  visor: new THREE.SphereGeometry(0.188, 14, 8, Math.PI * 0.16, Math.PI * 0.68, Math.PI * 0.34, Math.PI * 0.27),
  mask: new THREE.SphereGeometry(0.18, 12, 6, Math.PI * 0.12, Math.PI * 0.76, Math.PI * 0.6, Math.PI * 0.27),
  rail: B(0.03, 0.035, 0.2), nvg: B(0.09, 0.05, 0.04), earCup: new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10),
  // rifle
  receiver: B(0.06, 0.08, 0.3), handguard: new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8),
  barrel: new THREE.CylinderGeometry(0.013, 0.013, 0.2, 6), brake: new THREE.CylinderGeometry(0.02, 0.02, 0.05, 6),
  mag: B(0.04, 0.15, 0.065), stock: B(0.05, 0.08, 0.17), grip: B(0.035, 0.09, 0.04),
  scope: new THREE.CylinderGeometry(0.022, 0.022, 0.16, 8), srail: B(0.03, 0.015, 0.26),
};
const GUN = new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.45, metalness: 0.45 });
const GUN_POLY = new THREE.MeshStandardMaterial({ color: 0x3e4234, roughness: 0.85 });
const Y = new THREE.Vector3(0, 1, 0);

function mk2Body(k) {
  const { part, pivot } = k;
  const t = textures();
  const M = (o) => new THREE.MeshStandardMaterial(o);
  const camo = M({ map: t.camo, roughnessMap: t.rCloth, roughness: 1, metalness: 0 });
  const camoDirty = M({ map: t.camoDirty, roughnessMap: t.rCloth, roughness: 1, metalness: 0 });
  const vest = M({ map: t.vest, roughnessMap: t.rVest, roughness: 1 });
  const glove = M({ map: t.glove, roughnessMap: t.rCloth, roughness: 0.9 });
  const boot = M({ map: t.boot, roughnessMap: t.rBoot, roughness: 1 });
  const helmet = M({ map: t.helmet, roughnessMap: t.rHelmet, roughness: 1, metalness: 0.05 });
  const visor = M({ map: t.visor, roughness: 0.12, metalness: 0.6, envMapIntensity: 1 });
  const mask = M({ map: t.mask, roughness: 0.55, metalness: 0.15 });
  const metal = M({ color: 0x8a8c84, roughness: 0.35, metalness: 0.8 });   // buckles, bolts
  const pad = M({ color: 0x3a3c33, roughness: 0.6 });
  const mats = [camo, camoDirty, vest, glove, boot, helmet, visor, mask, metal, pad];
  const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const limb = (a, b, r, mat) => {
    const d = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(S.limb, mat);
    m.scale.set(r, d.length(), r); m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(Y, d.normalize()); m.castShadow = true; pivot.add(m); return m;
  };
  const ball = (p, r, mat, geo = S.joint) => { const m = add(pivot, geo, mat, p.x, p.y, p.z); m.scale.setScalar(r); return m; };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ── Legs (hip pivots at y 0.9; parts below -0.4 go on the knee) ──
  const hip = (x, side) => {
    const h = new THREE.Group(); h.position.set(x, 0.9, 0); pivot.add(h);
    add(h, S.thigh, camo, 0, -0.23, 0);
    add(h, S.pocket, camo, side * 0.12, -0.28, 0.01);
    add(h, S.knee, pad, 0, -0.49, 0.105);
    add(h, S.shin, camoDirty, 0, -0.66, 0);
    add(h, S.boot, boot, 0, -0.835, 0.04);
    add(h, S.sole, pad, 0, -0.885, 0.04);
    return h;
  };
  const legL = hip(-0.12, -1), legR = hip(0.12, 1);

  // ── Hips + belt ──
  part(S.pelvis, camo, 0, 0.98, 0);
  part(S.belt, vest, 0, 1.06, 0);
  part(S.buckle, metal, 0, 1.06, 0.15);
  part(S.beltPouch, vest, -0.2, 1.02, 0.12);
  part(S.beltPouch, vest, 0.2, 1.02, 0.12);
  part(S.beltPouch, vest, -0.25, 1.02, -0.06);

  // ── Torso ──
  part(S.shirt, camo, 0, 1.38, 0);
  part(S.vest, vest, 0, 1.43, 0);
  for (const x of [-0.13, 0, 0.13]) part(S.magPouch, vest, x, 1.33, 0.185);
  part(S.radio, pad, -0.3, 1.4, -0.06);
  const ant = part(S.antenna, pad, -0.3, 1.6, -0.08); ant.rotation.z = 0.15;
  for (const x of [-0.17, 0.17]) part(S.strap, vest, x, 1.66, 0);
  part(S.collar, camo, 0, 1.67, 0);

  // ── Arms (dirty elbows) ──
  const arm = (sh, el, hand, rotY) => {
    ball(sh, 0.09, vest, S.shoulder);
    limb(sh, el, 0.068, camo);
    ball(el, 0.062, camoDirty);
    limb(el, hand, 0.055, camoDirty);
    const g = add(pivot, S.glove, glove, hand.x, hand.y, hand.z); g.rotation.y = rotY;
    const f = add(pivot, S.finger, glove, hand.x, hand.y - 0.04, hand.z + 0.02); f.rotation.y = rotY;
  };
  arm(V(-0.33, 1.6, 0), V(-0.34, 1.33, 0.08), V(0.06, 1.23, 0.44), 0.4);
  arm(V(0.33, 1.6, 0), V(0.37, 1.32, -0.02), V(0.13, 1.21, 0.16), -0.3);

  // ── Rifle (muzzle at MUZZLE_LOCAL 0.1, 1.3, 0.78) ──
  part(S.receiver, GUN, 0.1, 1.3, 0.3);
  const hg = part(S.handguard, GUN_POLY, 0.1, 1.305, 0.54); hg.rotation.x = Math.PI / 2;
  const br = part(S.barrel, GUN, 0.1, 1.31, 0.69); br.rotation.x = Math.PI / 2;
  const mb = part(S.brake, GUN, 0.1, 1.31, 0.76); mb.rotation.x = Math.PI / 2;
  const mg = part(S.mag, GUN, 0.1, 1.2, 0.36); mg.rotation.x = 0.25;
  const gp = part(S.grip, GUN_POLY, 0.1, 1.23, 0.2); gp.rotation.x = -0.35;
  part(S.stock, GUN_POLY, 0.1, 1.28, 0.07);
  part(S.srail, GUN, 0.1, 1.348, 0.36);
  const sc = part(S.scope, GUN, 0.1, 1.385, 0.31); sc.rotation.x = Math.PI / 2;

  // ── Full-face helmet: every part at y >= 1.69 so the rig puts it on the head group ──
  part(S.neck, camo, 0, 1.71, 0);                           // balaclava neck
  part(S.liner, mask, 0, 1.84, 0);                          // inner hood fills the head sphere (no skin anywhere)
  part(S.shellTop, helmet, 0, 1.845, -0.005);              // shell: dome + brow over the visor
  part(S.shellBack, helmet, 0, 1.845, -0.005);             // shell: sides + back
  part(S.visor, visor, 0, 1.85, 0.005);                     // dark tinted visor across the eyes (front = +Z)
  part(S.mask, mask, 0, 1.845, 0.005);                      // ballistic jaw guard
  for (const sx of [-1, 1]) {
    const r = part(S.rail, pad, sx * 0.19, 1.86, -0.01);    // side rails
    const e = part(S.earCup, pad, sx * 0.175, 1.81, -0.01); e.rotation.z = Math.PI / 2;
  }
  part(S.nvg, metal, 0, 1.99, 0.15);                        // NVG mount
  return { mats, legL, legR };
}

export function createTarget(spec, opts = {}) { return createHumanoid(spec, opts, mk2Body); }
export default { kind: 'enemy', name: 'soldier_mk2', createTarget, HEAD_MULT };
