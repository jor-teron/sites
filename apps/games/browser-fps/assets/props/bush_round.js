/**
 * Browser FPS asset (prop): bush_round — clump of low-poly leaf balls. Conceals (blocks enemy sight), no collision,
 * bullets pass through. Prop interface: see palm_tree.js.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
export function build() {
  const balls = [[0, 0.55, 0, 0.62], [0.45, 0.42, 0.15, 0.45], [-0.4, 0.4, -0.1, 0.48], [0.1, 0.38, -0.45, 0.42], [-0.1, 0.9, 0.1, 0.4]]
    .map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 0).translate(x, y, z));
  return {
    parts: [{ geometry: mergeGeometries(balls), material: new THREE.MeshStandardMaterial({ color: 0x3f7f35, roughness: 0.9, flatShading: true }), castShadow: false }],
    solid: null,
    conceal: { r: 0.85, y: 0.6 },
  };
}
export default { kind: 'prop', name: 'bush_round', build };
