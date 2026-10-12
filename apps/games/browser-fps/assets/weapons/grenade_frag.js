/**
 * Browser FPS asset (weapon): grenade_frag — olive frag grenade with spoon, cap and pin ring.
 * Asset interface: default export { kind: 'grenade', name, build() -> THREE.Group }  (origin at the centre, ~0.09 radius)
 */
import * as THREE from 'three';

const G = {
  body: new THREE.SphereGeometry(0.085, 14, 10),
  band: new THREE.TorusGeometry(0.085, 0.008, 6, 16),
  cap: new THREE.CylinderGeometry(0.03, 0.035, 0.045, 10),
  spoon: new THREE.BoxGeometry(0.022, 0.12, 0.012),
  ring: new THREE.TorusGeometry(0.022, 0.004, 6, 12),
};
const M = {
  body: new THREE.MeshStandardMaterial({ color: 0x4f5a2e, roughness: 0.75, metalness: 0.1 }),
  metal: new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.4, metalness: 0.7 }),
};

export function build() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(G.body, M.body);
  body.scale.set(1, 1.2, 1);
  body.castShadow = true;
  g.add(body);
  for (const y of [-0.04, 0.02]) { const b = new THREE.Mesh(G.band, M.body); b.rotation.x = Math.PI / 2; b.position.y = y; b.scale.setScalar(y < 0 ? 0.95 : 0.98); g.add(b); }
  const cap = new THREE.Mesh(G.cap, M.metal); cap.position.y = 0.115; g.add(cap);
  const spoon = new THREE.Mesh(G.spoon, M.metal); spoon.position.set(0.05, 0.07, 0); spoon.rotation.z = -0.35; g.add(spoon);
  const ring = new THREE.Mesh(G.ring, M.metal); ring.position.set(-0.03, 0.13, 0); ring.rotation.y = Math.PI / 2; g.add(ring);
  return g;
}

export default { kind: 'grenade', name: 'grenade_frag', build };
