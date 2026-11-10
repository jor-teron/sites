/* Star Colony SC-1a. Original names and code-drawn art. Classic scripts + Node. */
(function (root) {
  'use strict';
  const buildings = {
    dome:    { name: 'Habitat Dome', glyph: '⌂', cost: { ore: 12 }, work: 12, power: 0, capacity: 5 },
    oxygen:  { name: 'Oxygen Generator', glyph: 'O₂', cost: { ore: 10 }, work: 10, power: 2 },
    solar:   { name: 'Solar Panel', glyph: '☀', cost: { ore: 8 }, work: 8, power: 0 },
    battery: { name: 'Battery', glyph: '▥', cost: { ore: 10 }, work: 8, power: 0 },
    farm:    { name: 'Hydroponic Farm', glyph: '♧', cost: { ore: 12, water: 4 }, work: 12, power: 2 },
    drill:   { name: 'Ice Drill', glyph: '❄', cost: { ore: 8 }, work: 10, power: 1, deposit: 'ice' },
    mine:    { name: 'Ore Mine', glyph: '⛏', cost: { ore: 8 }, work: 10, power: 1, deposit: 'ore' },
    storage: { name: 'Storage', glyph: '▣', cost: { ore: 6 }, work: 8, power: 0 },
    corridor:{ name: 'Corridor', glyph: '·', cost: { ore: 1 }, work: 2, power: 0 }
  };
  const data = { W: 48, H: 32, STEP: 0.25, DAY: 180, buildings, resources: ['ore', 'water', 'food'] };
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  else root.SCData = data;
})(typeof globalThis !== 'undefined' ? globalThis : this);
