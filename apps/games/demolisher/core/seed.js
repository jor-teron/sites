/*
  File: core/seed.js
  Project: Demolisher (DM1a)
  Purpose: Level-number seeding in the style of the AoE RTS / LandCraft map generators and the
           Sling Birds seed.js. mapSeed(n) hashes the level number so neighbouring levels differ a
           lot. Every layer (terrain, materials, targets, enemies, hazards) has its own Park-Miller
           RNG seeded with mapSeed(n) XOR a layer constant, so a change in one layer never shifts
           the others. Pure (no DOM, no Matter): plain script in the page, require() in Node tests.
*/
(function (root) {
  'use strict';
  const MAX_LEVEL = 100;              // levels 01-100 are generated; 00 is the fixed Demo world

  function mapSeed(n) {
    let h = Math.imul(n + 1, 0x9E3779B1) >>> 0;
    h ^= h >>> 16; h = Math.imul(h, 0x85EBCA6B) >>> 0; h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35) >>> 0; h ^= h >>> 16;
    return ((h >>> 0) % 2147483646) + 1;
  }

  function parkMiller(seed) {
    let s = (seed >>> 0) % 2147483646 + 1;
    for (let i = 0; i < 5; i++) s = (s * 16807) % 2147483647;   // warm up like AoE
    return function () { return (s = (s * 16807) % 2147483647) / 2147483647; };
  }

  const LAYER = { terrain: 0x2F41, material: 0x5C13, targets: 0x7A85, enemies: 0x1E6B, hazards: 0x4D97 };

  /* RNG for one layer of level n. `attempt` re-rolls a level that failed validation (still deterministic). */
  function rngFor(n, layer, attempt) {
    return parkMiller((mapSeed(n) ^ LAYER[layer]) + Math.imul(attempt || 0, 0x9E3779B1) % 1000003);
  }

  const pad2 = (n) => String(n).padStart(2, '0');   // 7 -> "07", 100 -> "100"
  const isLevelNumber = (n) => Number.isInteger(n) && n >= 0 && n <= MAX_LEVEL;

  const api = { MAX_LEVEL, mapSeed, parkMiller, LAYER, rngFor, pad2, isLevelNumber };
  root.DemolisherSeed = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
