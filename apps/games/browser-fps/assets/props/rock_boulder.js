/**
 * Browser FPS asset (prop): rock_boulder — adapted from apps/lab/island-demo/objects/rock.js. Solid cover.
 * Prop interface: see palm_tree.js.
 */
import * as THREE from 'three';
export function build() {
  const g = new THREE.DodecahedronGeometry(0.6, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 1 + 0.12 * Math.sin(i * 12.9898); p.setXYZ(i, p.getX(i) * 1.3 * k, p.getY(i) * 0.8 * k, p.getZ(i) * k); }
  g.translate(0, 0.35, 0);
  g.computeVertexNormals();
  return {
    parts: [{ geometry: g, material: new THREE.MeshStandardMaterial({ color: 0x9a958c, roughness: 0.95, flatShading: true }), castShadow: true }],
    solid: { r: 0.62, h: 0.95 },
    conceal: null,
  };
}
export default { kind: 'prop', name: 'rock_boulder', build };
