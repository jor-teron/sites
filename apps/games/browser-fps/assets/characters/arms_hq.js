/**
 * Browser FPS asset (player arms): arms_hq — gloved hands with capsule fingers, cuffs and fabric sleeves.
 * Right hand: fingers wrap the pistol grip, index finger on the trigger, thumb over the top.
 * Left hand: fist around the vertical foregrip. Designed for rifle_hq's hand anchors and shifted to
 * whatever anchors the gun provides (see assets/README.md).
 */
import * as THREE from 'three';
import { wearTexture, capsule, limb } from '../wear.js';

const cloth = wearTexture('cloth', { base: 220, noise: 40, scratches: 0, spots: 10, color: true });
const M = {
  glove: new THREE.MeshStandardMaterial({ color: 0x34352f, roughness: 0.92, metalness: 0, map: cloth }),
  knuckle: new THREE.MeshStandardMaterial({ color: 0x24251f, roughness: 0.7, metalness: 0 }),
  sleeve: new THREE.MeshStandardMaterial({ color: 0x4a5668, roughness: 1, metalness: 0, map: cloth }),
};
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const R0 = V(0.012, -0.095, 0.065), L0 = V(0, -0.07, -0.36);
const FR = 0.0085;   // finger radius

function finger(p, pts, r = FR) {
  for (let i = 0; i < pts.length - 1; i++) p.add(capsule(pts[i], pts[i + 1], r * (1 - i * 0.08), M.glove, 6));
}

export function build(gun) {
  // ── Right hand on the pistol grip ──
  const right = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.08, 0.052), M.glove);
  palm.position.set(0.028, -0.1, 0.07); palm.rotation.x = 0.27; right.add(palm);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.034), M.glove);
  back.position.set(0.014, -0.052, 0.085); right.add(back);
  const kn = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.07, 0.02), M.knuckle);   // knuckle pad
  kn.position.set(0.04, -0.098, 0.052); kn.rotation.x = 0.27; right.add(kn);
  for (const y of [-0.078, -0.102, -0.126]) {
    const front = 0.05 + 0.03 * (-0.045 - y) / 0.11 - 0.024;
    finger(right, [V(0.03, y, front + 0.016), V(0.004, y, front - 0.006), V(-0.02, y - 0.003, front + 0.012)]);
  }
  finger(right, [V(0.026, -0.054, 0.046), V(0.012, -0.058, 0.012), V(0.003, -0.064, -0.004)]);   // index on trigger
  finger(right, [V(0.02, -0.046, 0.094), V(-0.02, -0.052, 0.07), V(-0.024, -0.066, 0.042)], 0.0095);   // thumb
  right.add(limb(V(0.03, -0.12, 0.1), V(0.055, -0.158, 0.18), 0.034, 0.036, M.glove));               // glove cuff
  right.add(limb(V(0.05, -0.15, 0.165), V(0.18, -0.35, 0.42), 0.044, 0.056, M.sleeve));             // sleeve
  right.position.copy(gun.hands.right).sub(R0);

  // ── Left hand around the foregrip (animated during reload) ──
  const left = new THREE.Group();
  const lp = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.07, 0.046), M.glove);
  lp.position.set(-0.026, -0.07, -0.35); left.add(lp);
  const lk = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.066, 0.008), M.knuckle);
  lk.position.set(-0.012, -0.07, -0.382); left.add(lk);
  for (const y of [-0.048, -0.07, -0.092]) finger(left, [V(-0.022, y, -0.374), V(0.0, y, -0.386), V(0.021, y - 0.002, -0.368)]);
  finger(left, [V(-0.02, -0.04, -0.336), V(0.012, -0.04, -0.34), V(0.022, -0.048, -0.354)], 0.0095);   // thumb
  left.add(limb(V(-0.03, -0.08, -0.335), V(-0.068, -0.118, -0.255), 0.031, 0.034, M.glove));
  left.add(limb(V(-0.06, -0.11, -0.27), V(-0.26, -0.32, 0.05), 0.044, 0.056, M.sleeve));
  left.position.copy(gun.hands.left).sub(L0);
  return { right, left };
}

export default { kind: 'arms', name: 'arms_hq', build };
