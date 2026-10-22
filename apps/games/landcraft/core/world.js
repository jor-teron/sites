// LandCraft world: a map of chunks plus block get/set in world coordinates.
import { Chunk, CS, CH } from './chunk.js';
import { AIR, GRASS, DIRT, STONE } from './blocks.js';

export const GROUND = 8; // y of the walkable grass surface in the flat test world

export class World {
  constructor() { this.chunks = new Map(); }
  key(cx, cz) { return cx + ',' + cz; }
  chunkAt(x, z, create) {
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS), k = this.key(cx, cz);
    let c = this.chunks.get(k);
    if (!c && create) { c = new Chunk(cx, cz); this.chunks.set(k, c); }
    return c;
  }
  get(x, y, z) {
    if (y < 0) return STONE; // bedrock below the world: never draw bottom faces
    if (y >= CH) return AIR;
    const c = this.chunkAt(x, z, false);
    return c ? c.get(x - c.cx * CS, y, z - c.cz * CS) : AIR;
  }
  set(x, y, z, b) {
    if (y < 0 || y >= CH) return;
    const c = this.chunkAt(x, z, true);
    c.set(x - c.cx * CS, y, z - c.cz * CS, b);
  }
  // Flat test world over (2r x 2r) chunks around the origin, plus a few shapes to test against.
  static flat(r) {
    const w = new World(), n = r * CS;
    for (let x = -n; x < n; x++) for (let z = -n; z < n; z++) {
      for (let y = 0; y < GROUND; y++) w.set(x, y, z, y < 4 ? STONE : y < GROUND - 1 ? DIRT : GRASS);
    }
    for (let x = 3; x <= 9; x++) { w.set(x, GROUND, -4, STONE); w.set(x, GROUND + 1, -4, STONE); } // 2-high wall
    for (let i = 0; i < 4; i++) for (let h = 0; h <= i; h++) w.set(-3 - i, GROUND + h, 3, DIRT);   // staircase
    for (let h = 0; h < 5; h++) w.set(7, GROUND + h, 6, STONE);                                    // pillar
    for (let x = -8; x <= -6; x++) for (let z = -8; z <= -6; z++) w.set(x, GROUND, z, STONE);      // 1-high platform
    return w;
  }
  buildAll(scene, material) {
    for (const c of this.chunks.values()) scene.add(c.build(this, material));
  }
}
