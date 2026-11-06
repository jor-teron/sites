/* ============================================================
 * File:        core/rng.js
 * Project:     Osmos OSM1b
 * Purpose:     Tiny seeded PRNG (mulberry32) for deterministic levels.
 * ============================================================ */
function OsmosRng(seed) {
  var s = (seed >>> 0) || 1;
  this.next = function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    var t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  this.range = function (a, b) { return a + this.next() * (b - a); };
  this.int = function (a, b) { return Math.floor(this.range(a, b + 1)); };
}
