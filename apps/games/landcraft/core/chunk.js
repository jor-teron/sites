// LandCraft chunk: 16 x 16 columns, CH blocks tall. Meshing emits only faces not hidden by an opaque
// neighbour. One geometry, three index groups -> materials: [0] opaque (+ cutout leaves), [2] water, [1] glass.
// LC4: water has its own group and material (double-sided, so the surface shows from below). Groups are
// ordered opaque, water, glass: three draws a chunk's transparent groups in that order, so glass is always
// drawn after the water behind it (before, both shared one group and drew in block-scan order).
import * as THREE from 'three';
import { tileUV } from '../assets/textures/atlas.js';
import { FACE_TILES } from '../assets/models/block_models.js';
import { GLASS, WATER, opaque } from './blocks.js';

export const CS = 16, CH = 32;

// Each face: outward direction, its 4 corners, matching UVs, and a fixed shade so sides read apart.
const FACES = [
  { dir: [-1, 0, 0], shade: 0.8, corners: [[0, 1, 0], [0, 0, 0], [0, 1, 1], [0, 0, 1]], uv: [[0, 1], [0, 0], [1, 1], [1, 0]] },
  { dir: [1, 0, 0], shade: 0.8, corners: [[1, 1, 1], [1, 0, 1], [1, 1, 0], [1, 0, 0]], uv: [[0, 1], [0, 0], [1, 1], [1, 0]] },
  { dir: [0, -1, 0], shade: 0.55, corners: [[1, 0, 1], [0, 0, 1], [1, 0, 0], [0, 0, 0]], uv: [[1, 0], [0, 0], [1, 1], [0, 1]] },
  { dir: [0, 1, 0], shade: 1, corners: [[0, 1, 1], [1, 1, 1], [0, 1, 0], [1, 1, 0]], uv: [[1, 1], [0, 1], [1, 0], [0, 0]] },
  { dir: [0, 0, -1], shade: 0.68, corners: [[1, 0, 0], [0, 0, 0], [1, 1, 0], [0, 1, 0]], uv: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { dir: [0, 0, 1], shade: 0.68, corners: [[0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]], uv: [[0, 0], [1, 0], [0, 1], [1, 1]] }
];

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx; this.cz = cz;
    this.data = new Uint8Array(CS * CS * CH);
    this.mesh = null;
    this.builds = 0; // remesh counter (handy for checking that edits rebuild only what they touch)
  }
  idx(x, y, z) { return (y * CS + z) * CS + x; }
  get(x, y, z) { return this.data[this.idx(x, y, z)]; }
  set(x, y, z, b) { this.data[this.idx(x, y, z)] = b; }

  // Build (or rebuild) this chunk's mesh; world.get() looks across chunk borders.
  build(world, materials) {
    const pos = [], nor = [], uvs = [], col = [], ind = [], waterInd = [], glassInd = [];
    this.builds++;
    const ox = this.cx * CS, oz = this.cz * CS;
    for (let y = 0; y < CH; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const b = this.get(x, y, z);
      if (!b) continue;
      for (const f of FACES) {
        const nb = world.get(ox + x + f.dir[0], y + f.dir[1], oz + z + f.dir[2]);
        if (opaque(nb) || (nb === b && (b === GLASS || b === WATER))) continue; // hidden face
        const t = FACE_TILES[b], tile = f.dir[1] > 0 ? t[0] : f.dir[1] < 0 ? t[1] : t[2];
        const r = tileUV(tile), n = pos.length / 3;
        for (let i = 0; i < 4; i++) {
          const c = f.corners[i];
          pos.push(x + c[0], y + c[1], z + c[2]);
          nor.push(f.dir[0], f.dir[1], f.dir[2]);
          uvs.push(f.uv[i][0] ? r[2] : r[0], f.uv[i][1] ? r[3] : r[1]);
          col.push(f.shade, f.shade, f.shade);
        }
        (b === WATER ? waterInd : b === GLASS ? glassInd : ind).push(n, n + 1, n + 2, n + 2, n + 1, n + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(ind.concat(waterInd, glassInd));
    geo.addGroup(0, ind.length, 0);
    geo.addGroup(ind.length, waterInd.length, 2);
    geo.addGroup(ind.length + waterInd.length, glassInd.length, 1);
    geo.computeBoundingSphere();
    if (this.mesh) { this.mesh.geometry.dispose(); this.mesh.geometry = geo; }
    else { this.mesh = new THREE.Mesh(geo, materials); this.mesh.position.set(ox, 0, oz); }
    return this.mesh;
  }
}
