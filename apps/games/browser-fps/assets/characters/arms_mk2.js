/**
 * Browser FPS asset (player arms): arms_mk2 — arms_hq's hand poses with soldier_mk2/mk3 textures.
 * Camo sleeves (same shared 512×512 camo as the enemies), stitched gloves with seams + raised knuckle pads,
 * ribbed elastic cuffs, a wristwatch on the left wrist (strap, case, painted dial). Smoother hands: rounded palm
 * capsules, three-segment tapered fingers wrapping the grip, index finger on the trigger, thumb over the top;
 * left hand wraps the foregrip. Shifted to whatever hand anchors the gun provides (see assets/README.md).
 */
import * as THREE from 'three';
import { capsule, limb } from '../wear.js';
import { mk2Textures } from '../enemies/soldier_mk2.js';

const N = 512;
function cv(draw) { const c = document.createElement('canvas'); c.width = c.height = N; draw(c.getContext('2d')); return c; }
function tx(c) { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
const T = mk2Textures();
const dial = tx(cv((g) => {
  g.fillStyle = '#111'; g.fillRect(0, 0, N, N);
  g.fillStyle = '#1d2420'; g.beginPath(); g.arc(256, 256, 240, 0, 7); g.fill();
  g.strokeStyle = '#c8d0c0'; g.lineWidth = 8;
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, r0 = i % 3 ? 200 : 170; g.beginPath(); g.moveTo(256 + Math.sin(a) * r0, 256 - Math.cos(a) * r0); g.lineTo(256 + Math.sin(a) * 225, 256 - Math.cos(a) * 225); g.stroke(); }
  g.fillStyle = '#7dffb0'; for (let i = 0; i < 12; i += 3) { const a = i / 12 * Math.PI * 2; g.beginPath(); g.arc(256 + Math.sin(a) * 150, 256 - Math.cos(a) * 150, 12, 0, 7); g.fill(); }   // lume dots
  g.strokeStyle = '#e8e8e0'; g.lineCap = 'round';
  g.lineWidth = 16; g.beginPath(); g.moveTo(256, 256); g.lineTo(256 + 110, 256 - 60); g.stroke();      // hour
  g.lineWidth = 10; g.beginPath(); g.moveTo(256, 256); g.lineTo(256 - 40, 256 - 190); g.stroke();      // minute
  g.strokeStyle = '#ff6a3a'; g.lineWidth = 4; g.beginPath(); g.moveTo(256, 256); g.lineTo(256 + 150, 256 + 130); g.stroke();
}));
const cuffTex = tx(cv((g) => {   // ribbed elastic cuff
  g.fillStyle = '#2a2b26'; g.fillRect(0, 0, N, N);
  for (let x = 0; x < N; x += 16) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x, 0, 5, N); g.fillStyle = 'rgba(120,120,110,0.18)'; g.fillRect(x + 7, 0, 3, N); }
}));
const M = {
  glove: new THREE.MeshStandardMaterial({ map: T.glove, roughnessMap: T.rCloth, roughness: 0.95, metalness: 0 }),
  knuckle: new THREE.MeshStandardMaterial({ color: 0x2c2e28, map: T.mask, roughness: 0.55, metalness: 0.05 }),
  sleeve: new THREE.MeshStandardMaterial({ map: T.camo, roughnessMap: T.rCloth, roughness: 1, metalness: 0 }),
  cuff: new THREE.MeshStandardMaterial({ map: cuffTex, roughness: 0.9, metalness: 0 }),
  strap: new THREE.MeshStandardMaterial({ color: 0x24261f, roughness: 0.75, metalness: 0 }),
  case: new THREE.MeshStandardMaterial({ color: 0x6a6e70, roughness: 0.3, metalness: 0.85 }),
  dial: new THREE.MeshStandardMaterial({ map: dial, roughness: 0.15, metalness: 0.1, emissive: 0x0a140c }),
};
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const R0 = V(0.012, -0.095, 0.065), L0 = V(0, -0.07, -0.36);
const FR = 0.0088;

/** three-segment tapered finger with rounded joints */
function finger(p, pts, r = FR) {
  for (let i = 0; i < pts.length - 1; i++) p.add(capsule(pts[i], pts[i + 1], r * (1 - i * 0.1), M.glove, 8));
}
/** rounded palm block from a capsule scaled into a slab */
function palmBlock(p, x, y, z, sx, sy, sz, rx = 0, mat = M.glove) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 0.6, 3, 10), mat);
  m.scale.set(sx, sy / 1.6, sz); m.position.set(x, y, z); m.rotation.x = rx; p.add(m); return m;
}

export function build(gun) {
  // ── Right hand on the pistol grip ──
  const right = new THREE.Group();
  palmBlock(right, 0.028, -0.1, 0.07, 0.024, 0.085, 0.054, 0.27);
  palmBlock(right, 0.014, -0.052, 0.085, 0.042, 0.032, 0.036);
  palmBlock(right, 0.041, -0.098, 0.052, 0.01, 0.072, 0.022, 0.27, M.knuckle);   // knuckle pad
  for (const y of [-0.078, -0.102, -0.126]) {
    const front = 0.05 + 0.03 * (-0.045 - y) / 0.11 - 0.024;
    finger(right, [V(0.032, y, front + 0.018), V(0.012, y, front - 0.004), V(-0.008, y - 0.002, front - 0.002), V(-0.021, y - 0.004, front + 0.014)]);
  }
  finger(right, [V(0.027, -0.054, 0.048), V(0.016, -0.057, 0.022), V(0.007, -0.061, 0.004), V(0.002, -0.066, -0.006)]);   // index on the trigger
  finger(right, [V(0.02, -0.046, 0.094), V(-0.006, -0.049, 0.08), V(-0.02, -0.054, 0.065), V(-0.024, -0.066, 0.044)], 0.0098);   // thumb over the top
  right.add(limb(V(0.03, -0.12, 0.1), V(0.055, -0.158, 0.18), 0.034, 0.037, M.glove, 14));
  right.add(limb(V(0.05, -0.15, 0.165), V(0.075, -0.185, 0.215), 0.04, 0.042, M.cuff, 14));          // elastic cuff
  right.add(limb(V(0.07, -0.18, 0.205), V(0.18, -0.35, 0.42), 0.046, 0.058, M.sleeve, 14));           // camo sleeve
  right.position.copy(gun.hands.right).sub(R0);

  // ── Left hand around the foregrip (animated during reload) + wristwatch ──
  const left = new THREE.Group();
  palmBlock(left, -0.026, -0.07, -0.35, 0.024, 0.074, 0.048);
  palmBlock(left, -0.012, -0.07, -0.383, 0.032, 0.068, 0.01, 0, M.knuckle);
  for (const y of [-0.048, -0.07, -0.092]) finger(left, [V(-0.022, y, -0.374), V(-0.008, y, -0.386), V(0.008, y, -0.384), V(0.021, y - 0.002, -0.368)]);
  finger(left, [V(-0.02, -0.04, -0.336), V(0.0, -0.039, -0.338), V(0.014, -0.041, -0.343), V(0.022, -0.048, -0.354)], 0.0098);
  left.add(limb(V(-0.03, -0.08, -0.335), V(-0.068, -0.118, -0.255), 0.031, 0.035, M.glove, 14));
  left.add(limb(V(-0.062, -0.112, -0.268), V(-0.09, -0.142, -0.21), 0.038, 0.04, M.cuff, 14));
  left.add(limb(V(-0.085, -0.137, -0.22), V(-0.26, -0.32, 0.05), 0.045, 0.058, M.sleeve, 14));
  // watch on the wrist (just above the cuff): strap ring, case, dial facing up / out
  const w = new THREE.Group(); w.position.set(-0.058, -0.106, -0.278);
  const dir = V(-0.038, -0.038, 0.08).normalize();
  w.quaternion.setFromUnitVectors(V(0, 1, 0), dir);
  const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.014, 16, 1, true), M.strap); w.add(strap);
  const cs = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.015, 0.008, 18), M.case); cs.rotation.z = Math.PI / 2; cs.position.set(-0.035, 0, 0); w.add(cs);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.012, 18), M.dial); face.position.set(-0.04, 0, 0); face.rotation.y = -Math.PI / 2; w.add(face);
  left.add(w);
  left.position.copy(gun.hands.left).sub(L0);
  return { right, left };
}

export default { kind: 'arms', name: 'arms_mk2', build };
