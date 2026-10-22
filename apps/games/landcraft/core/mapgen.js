// LandCraft L2a map generator. Map numbers 00-99, modelled on AoE RTS mapgen: mapSeed(n) hashes the
// number so neighbouring maps differ, and every layer (height, water, sand, trees) has its own
// Park-Miller RNG seeded with mapSeed(n) xor a layer constant, so the layers are independent.
// Map 00 is the flat test world; 01-99 are generated and grow in bands of 25 like AoE map sizes.
import { World } from './world.js';
import { CS, CH } from './chunk.js';
import { GRASS, DIRT, STONE, LOG, LEAVES, SAND, WATER } from './blocks.js';

export const SEA = 12; // water fills every column whose ground is below this y

export function mapSeed(n) {
  let h = Math.imul(n + 1, 0x9E3779B1) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35) >>> 0; h ^= h >>> 16;
  return ((h >>> 0) % 2147483646) + 1;
}
function parkMiller(seed) {
  let s = (seed >>> 0) % 2147483646 + 1;
  for (let i = 0; i < 5; i++) s = (s * 16807) % 2147483647; // warm up like AoE
  return function () { return (s = (s * 16807) % 2147483647) / 2147483647; };
}
const LAYER = { height: 0x48E1, water: 0x7A7E, sand: 0x5A4D, trees: 0x7EE5 };

// Smooth 2-D value noise from a hashed lattice; fbm sums octaves. Each noise gets its seed from its layer RNG.
function valueNoise(seed) {
  function lat(ix, iz) {
    let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ seed;
    h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  return function (x, z) {
    const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
    const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
    const a = lat(ix, iz), b = lat(ix + 1, iz), c = lat(ix, iz + 1), d = lat(ix + 1, iz + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}
function fbm(rand, octaves) {
  const ns = [];
  for (let i = 0; i < octaves; i++) ns.push(valueNoise(Math.floor(rand() * 2147483647)));
  return function (x, z) {
    let sum = 0, amp = 1, f = 1, norm = 0;
    for (let i = 0; i < octaves; i++) { sum += ns[i](x * f, z * f) * amp; norm += amp; amp *= 0.5; f *= 2; }
    return sum / norm;
  };
}

// World half-size in chunks: maps 01-24 are 6x6 chunks (96 blocks), then 8x8, 10x10, 12x12 for 75-99.
export function mapRadius(n) { return 3 + Math.floor(n / 25); }

export function generate(n) {
  if (n === 0) { const w = World.flat(2); w.spawn = { x: 5.5, y: 8, z: 1.5 }; return w; }
  const seed = mapSeed(n), w = new World(), r = mapRadius(n) * CS;
  const hR = parkMiller(seed ^ LAYER.height), wR = parkMiller(seed ^ LAYER.water);
  const sR = parkMiller(seed ^ LAYER.sand), tR = parkMiller(seed ^ LAYER.trees);
  const hills = fbm(hR, 4), lakes = fbm(wR, 3), beach = fbm(sR, 2), forest = fbm(tR, 2);
  const tSeed = Math.floor(tR() * 2147483647), scale = 0.4 + hR() * 0.6; // per-map hilliness
  const height = new Int16Array(4 * r * r), at = function (x, z) { return (z + r) * 2 * r + (x + r); };
  for (let z = -r; z < r; z++) for (let x = -r; x < r; x++) {
    let h = SEA + 1 + (hills(x / 40, z / 40) - 0.45) * 30 * scale;
    h -= Math.max(0, lakes(x / 50, z / 50) - 0.55) * 40;                     // lake / sea basins
    h = Math.max(3, Math.min(CH - 8, Math.round(h)));
    height[at(x, z)] = h;
    const sandy = h <= SEA + 1 && beach(x / 12, z / 12) > 0.3 || h < SEA;   // beaches and sea floor
    for (let y = 0; y <= h; y++) w.set(x, y, z, y < h - 3 ? STONE : y < h ? (sandy ? SAND : DIRT) : sandy ? SAND : GRASS);
    for (let y = h + 1; y <= SEA - 1; y++) w.set(x, y, z, WATER);
  }
  // Trees: at most one per 5x5 cell (jittered by a hash of the cell), only on grass in forested areas.
  for (let cz = -r; cz < r; cz += 5) for (let cx = -r; cx < r; cx += 5) {
    let k = Math.imul(cx, 73856093) ^ Math.imul(cz, 19349663) ^ tSeed;
    k = Math.imul(k ^ (k >>> 15), 2246822519) >>> 0;
    const x = cx + 1 + (k % 3), z = cz + 1 + ((k >>> 8) % 3);
    if (x < -r + 2 || z < -r + 2 || x > r - 3 || z > r - 3) continue;
    const h = height[at(x, z)];
    if (w.get(x, h, z) !== GRASS || forest(x / 30, z / 30) < 0.42 || ((k >>> 16) & 255) < 90) continue;
    const top = h + 4 + ((k >>> 24) & 1);
    for (let y = top - 2; y <= top + 1; y++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
      const rr = y > top ? 1 : 2;
      if (Math.abs(dx) + Math.abs(dz) <= rr + (y === top - 2 ? 1 : 0) && !(Math.abs(dx) === 2 && Math.abs(dz) === 2)) w.set(x + dx, y, z + dz, LEAVES);
    }
    for (let y = h + 1; y <= top; y++) w.set(x, y, z, LOG);
  }
  // Spawn: nearest dry grass/sand column to the centre with open space around it (spiral search).
  w.spawn = { x: 0.5, y: CH, z: 0.5 };
  const clear = function (x, h, z) { // the 3x3 around the spawn column is open for two blocks (no trunk in your face)
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (w.get(x + dx, h + 1, z + dz) || w.get(x + dx, h + 2, z + dz)) return false;
    return true;
  };
  for (let d = 0; d < r - 1; d++) {
    let found = null;
    for (let z = -d; z <= d && !found; z++) for (let x = -d; x <= d && !found; x++) {
      if (Math.max(Math.abs(x), Math.abs(z)) !== d) continue;
      const h = height[at(x, z)], top = w.get(x, h, z);
      if (h >= SEA && (top === GRASS || top === SAND) && clear(x, h, z)) found = { x: x + 0.5, y: h + 1, z: z + 0.5 };
    }
    if (found) { w.spawn = found; break; }
  }
  return w;
}

// FNV-1a over every chunk's blocks in sorted key order: same map number => same hash.
export function worldHash(w) {
  let h = 2166136261;
  for (const k of Array.from(w.chunks.keys()).sort()) {
    for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 16777619);
    const d = w.chunks.get(k).data;
    for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
