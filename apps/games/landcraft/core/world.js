// LandCraft world: a map of chunks plus block get/set in world coordinates.
import { Chunk, CS, CH } from './chunk.js';
import { AIR, GRASS, DIRT, STONE, LOG, LEAVES, SAND, GLASS } from './blocks.js';

export const GROUND = 8; // y of the walkable grass surface in the flat test world

export class World {
  constructor() { this.chunks = new Map(); this.orig = new Map(); this.bounds = Infinity; }
  // L2c: edits are tracked against the generated world (first original id per cell), and kept inside the map.
  inBounds(x, y, z) { const b = this.bounds; return y >= 0 && y < CH && x >= -b && x < b && z >= -b && z < b; }
  track(x, y, z, b) {
    const k = x + ',' + y + ',' + z;
    if (!this.orig.has(k)) this.orig.set(k, this.get(x, y, z));
    this.set(x, y, z, b);
  }
  // Changed cells as a flat [x, y, z, id, ...] list (cells edited back to their generated block are left out).
  diff() {
    const out = [];
    for (const [k, o] of this.orig) {
      const p = k.split(',').map(Number), b = this.get(p[0], p[1], p[2]);
      if (b !== o) out.push(p[0], p[1], p[2], b);
    }
    return out;
  }
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
    for (let x = 2; x <= 4; x++) for (let z = 12; z <= 14; z++) w.set(x, GROUND - 1, z, SAND);    // sand patch
    for (let x = -1; x <= 1; x++) for (let h = 0; h < 2; h++) w.set(x, GROUND + h, -6, GLASS);    // glass window
    for (let x = -12; x <= -8; x++) for (let z = 8; z <= 12; z++) for (let h = 3; h <= 4; h++)     // tree canopy
      if (Math.abs(x + 10) + Math.abs(z - 10) < 4) w.set(x, GROUND + h, z, LEAVES);
    for (let h = 0; h < 5; h++) w.set(-10, GROUND + h, 10, LOG);                                    // tree trunk
    w.set(-10, GROUND + 5, 10, LEAVES);
    return w;
  }
  buildAll(scene, materials) {
    this.scene = scene; this.materials = materials;
    for (const c of this.chunks.values()) scene.add(c.build(this, materials));
  }
  // Load radius: mesh unbuilt chunks within `radius` chunks of (x, z), nearest first, at most `max` per call.
  // LC3: meshes already built but now beyond `radius` (render distance lowered, or walked away) are hidden.
  buildNear(scene, materials, x, z, radius, max) {
    this.scene = scene; this.materials = materials;
    const pcx = Math.floor(x / CS), pcz = Math.floor(z / CS), todo = [];
    for (const c of this.chunks.values()) {
      const d = Math.max(Math.abs(c.cx - pcx), Math.abs(c.cz - pcz));
      if (!c.mesh) { if (d <= radius) todo.push([d, c]); }
      else c.mesh.visible = d <= radius;
    }
    todo.sort(function (a, b) { return a[0] - b[0]; });
    for (let i = 0; i < Math.min(max, todo.length); i++) scene.add(todo[i][1].build(this, materials));
    return todo.length;
  }
  // Change one block and remesh only its chunk, plus the neighbour chunk when it sits on a border.
  edit(x, y, z, b) {
    if (!this.inBounds(x, y, z)) return false; // L2c: no building past the map edge
    this.track(x, y, z, b);
    const lx = x - Math.floor(x / CS) * CS, lz = z - Math.floor(z / CS) * CS, todo = [[x, z]];
    if (lx === 0) todo.push([x - 1, z]); else if (lx === CS - 1) todo.push([x + 1, z]);
    if (lz === 0) todo.push([x, z - 1]); else if (lz === CS - 1) todo.push([x, z + 1]);
    for (const t of todo) {
      const c = this.chunkAt(t[0], t[1], false);
      if (!c) continue;
      const fresh = !c.mesh, mesh = c.build(this, this.materials);
      if (fresh) this.scene.add(mesh);
    }
    return true;
  }
}
