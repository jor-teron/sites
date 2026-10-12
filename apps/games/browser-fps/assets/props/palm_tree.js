/**
 * Browser FPS asset (prop): palm_tree — adapted from apps/lab/island-demo/objects/palm.js (low-poly, instanced).
 * Prop interface: default export { kind: 'prop', name, build() -> { parts: [{ geometry, material, castShadow }],
 *   solid: { r, h } | null   (collider half-width / height: blocks movement, bullets, sight, blasts),
 *   conceal: { r, y } | null  (sphere that hides the player from enemies; no collision) } }
 * Geometry is in local space, feet at y = 0; the map instances it with random yaw / scale.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function build() {
  const trunk = new THREE.CylinderGeometry(0.11, 0.18, 3.4, 7, 3);
  // gentle curve: bend the upper trunk
  const p = trunk.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) + 1.7; p.setX(i, p.getX(i) + 0.035 * y * y); }
  trunk.translate(0, 1.7, 0);
  trunk.computeVertexNormals();
  const leaves = [];
  for (let i = 0; i < 7; i++) {
    const l = new THREE.ConeGeometry(0.2, 1.8, 4);
    l.rotateZ(1.2 + (i % 2) * 0.15);
    l.translate(0, 0, 0);
    const m = new THREE.Matrix4().makeRotationY((i / 7) * Math.PI * 2).setPosition(0.4, 3.35, 0);
    l.applyMatrix4(new THREE.Matrix4().makeTranslation(-0.75, 0, 0)).applyMatrix4(m);
    leaves.push(l);
  }
  const nut = new THREE.SphereGeometry(0.09, 6, 4);
  const nuts = [0, 1, 2].map((i) => nut.clone().translate(0.4 + Math.cos(i * 2.1) * 0.12, 3.2, Math.sin(i * 2.1) * 0.12));
  return {
    parts: [
      { geometry: trunk, material: new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.85 }), castShadow: true },
      { geometry: mergeGeometries(leaves), material: new THREE.MeshStandardMaterial({ color: 0x2f8f4e, roughness: 0.7, side: THREE.DoubleSide }), castShadow: true },
      { geometry: mergeGeometries(nuts), material: new THREE.MeshStandardMaterial({ color: 0x5a4022, roughness: 0.8 }), castShadow: false },
    ],
    solid: { r: 0.22, h: 3.4 },
    conceal: null,
  };
}
export default { kind: 'prop', name: 'palm_tree', build };
