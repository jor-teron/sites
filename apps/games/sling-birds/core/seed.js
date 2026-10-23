// Sling Birds SB1a: level-number seeding, modelled on the AoE RTS / LandCraft map generators.
// mapSeed(n) hashes the number so neighbouring levels differ a lot; every layer (layout, materials,
// pigs, birds, terrain) has its own Park-Miller RNG seeded with mapSeed(n) xor a layer constant, so
// changing how one layer draws numbers never shifts the others. Pure module (no DOM, no Matter).
export const MAX_LEVEL = 50;          // levels are numbered 00 (demo) to 50
export const LEVEL_COUNT = MAX_LEVEL + 1;

export function mapSeed(n) {
  let h = Math.imul(n + 1, 0x9E3779B1) >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35) >>> 0; h ^= h >>> 16;
  return ((h >>> 0) % 2147483646) + 1;
}

export function parkMiller(seed) {
  let s = (seed >>> 0) % 2147483646 + 1;
  for (let i = 0; i < 5; i++) s = (s * 16807) % 2147483647;   // warm up like AoE
  return function () { return (s = (s * 16807) % 2147483647) / 2147483647; };
}

export const LAYER = { layout: 0x5B1D, material: 0x3C77, pigs: 0x71A9, birds: 0x2E94, terrain: 0x6D03 };

// RNG for one layer of level n. `attempt` re-rolls a level that failed validation (still deterministic).
export function rngFor(n, layer, attempt = 0) {
  return parkMiller((mapSeed(n) ^ LAYER[layer]) + Math.imul(attempt, 0x9E3779B1) % 1000003);
}

export const pad2 = (n) => String(n).padStart(2, '0');
export const isLevelNumber = (n) => Number.isInteger(n) && n >= 0 && n <= MAX_LEVEL;
