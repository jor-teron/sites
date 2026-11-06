/** HEX-7 helper: build an InstancedMesh from transform lists (static scenery). */
import { InstancedMesh, Object3D } from './three.js';

const _dummy = new Object3D();

/**
 * @param {BufferGeometry} geometry
 * @param {Material} material
 * @param {Array<{x,y,z, ry?:number, sx?:number, sy?:number, sz?:number}>} items
 */
export function makeInstanced(geometry, material, items) {
  const mesh = new InstancedMesh(geometry, material, items.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = true;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    _dummy.position.set(it.x, it.y, it.z);
    _dummy.rotation.set(0, it.ry || 0, 0);
    _dummy.scale.set(it.sx || 1, it.sy || 1, it.sz || 1);
    _dummy.updateMatrix();
    mesh.setMatrixAt(i, _dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.count = items.length;
  return mesh;
}

export function setInstanceAt(mesh, index, { x, y, z, ry = 0, sx = 1, sy = 1, sz = 1 }) {
  _dummy.position.set(x, y, z);
  _dummy.rotation.set(0, ry, 0);
  _dummy.scale.set(sx, sy, sz);
  _dummy.updateMatrix();
  mesh.setMatrixAt(index, _dummy.matrix);
  mesh.instanceMatrix.needsUpdate = true;
}
