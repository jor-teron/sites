/**
 * Browser FPS asset (player arms): arms_basic — box gloves, cylinder wrists and sleeves (Lambert).
 * Asset interface: default export { kind: 'arms', name, build(gun) -> { right, left } }
 *   Both are Object3Ds in gun space. `left` is animated by the reload (moved as a whole).
 *   Built around the gun's hand anchors (gun.hands.right = grip, gun.hands.left = handguard/foregrip).
 */
import * as THREE from 'three';

const M = {
  sleeve: new THREE.MeshLambertMaterial({ color: 0x3d4a5c }),
  glove: new THREE.MeshLambertMaterial({ color: 0x5a4a3c }),
  skin: new THREE.MeshLambertMaterial({ color: 0xc89878 }),
};
function box(w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
export function limb(a, b, r0, r1, mat, seg = 7) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, dir.length(), seg), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const R0 = V(0.012, -0.085, 0.055), L0 = V(0, -0.05, -0.3);   // anchors this model was designed for

export function build(gun) {
  const right = new THREE.Group();
  const rHand = box(0.05, 0.075, 0.06, M.glove, 0.012, -0.085, 0.055);
  rHand.rotation.x = 0.35; right.add(rHand);
  right.add(box(0.035, 0.022, 0.03, M.glove, 0.0, -0.045, 0.0));     // trigger finger
  right.add(limb(V(0.03, -0.12, 0.1), V(0.05, -0.15, 0.17), 0.032, 0.03, M.skin));
  right.add(limb(V(0.05, -0.15, 0.16), V(0.18, -0.35, 0.42), 0.042, 0.05, M.sleeve));
  right.position.copy(gun.hands.right).sub(R0);

  const left = new THREE.Group();
  left.add(box(0.075, 0.045, 0.07, M.glove, 0, -0.05, -0.3));
  left.add(box(0.02, 0.05, 0.06, M.glove, -0.04, -0.02, -0.3));      // thumb
  left.add(limb(V(-0.02, -0.07, -0.28), V(-0.06, -0.11, -0.2), 0.03, 0.028, M.skin));
  left.add(limb(V(-0.06, -0.11, -0.21), V(-0.26, -0.32, 0.05), 0.042, 0.05, M.sleeve));
  left.position.copy(gun.hands.left).sub(L0);
  return { right, left };
}

export default { kind: 'arms', name: 'arms_basic', build };
