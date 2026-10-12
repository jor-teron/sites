/**
 * Browser FPS asset (prop): rock_boulder — adapted from apps/lab/island-demo/objects/rock.js. Solid cover.
 * Prop interface: see palm_tree.js.
 */
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
export function build() {
  // Merge shared corners first, then dent by position so neighbouring faces move together (no cracks).
  const base = new THREE.DodecahedronGeometry(0.6, 1);
  base.deleteAttribute('normal'); base.deleteAttribute('uv');
  const g = mergeVertices(base);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.12 * Math.sin(x * 12.9898 + y * 78.233 + z * 37.719);
    p.setXYZ(i, x * 1.3 * k, y * 0.8 * k, z * k);
  }
  g.translate(0, 0.35, 0);
  g.computeVertexNormals();
  return {
    parts: [{ geometry: g, material: new THREE.MeshStandardMaterial({ color: 0x9a958c, roughness: 0.95, flatShading: true }), castShadow: true }],
    solid: { r: 0.62, h: 0.95 },
    conceal: null,
  };
}
export default { kind: 'prop', name: 'rock_boulder', build };
