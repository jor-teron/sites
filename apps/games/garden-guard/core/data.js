/* GG-1a: original art / names. Data tables are the extension point for GG-1b. */
(function (root) {
  'use strict';
  const G = root.GardenGuard = root.GardenGuard || {};
  G.ROWS = 5; G.COLS = 9; G.STEP = 1 / 60;
  G.PLANTS = {
    sun:   { name: 'Sun Flower',    cost: 50,  cooldown: 5,  hp: 150, sunEvery: 13, color: '#f9c841' },
    pea:   { name: 'Pea Shooter',   cost: 100, cooldown: 5,  hp: 150, period: 1.5, damage: 24, color: '#62cc70' },
    wall:  { name: 'Bark Guard',    cost: 50,  cooldown: 12, hp: 950, color: '#bb8754' },
    bomb:  { name: 'Berry Burst',   cost: 150, cooldown: 22, hp: 150, fuse: 1.2, damage: 1300, color: '#f16f91' },
    frost: { name: 'Frost Shooter', cost: 175, cooldown: 7,  hp: 150, period: 1.8, damage: 24, slow: 4, color: '#72d9f1' }
  };
  G.INVADERS = {
    basic: { name: 'Drifter',  hp: 120, speed: .16, bite: 36, color: '#aab582' },
    cone:  { name: 'Ridgecap', hp: 260, speed: .15, bite: 40, color: '#c5ad83' },
    bucket:{ name: 'Ironhelm', hp: 520, speed: .13, bite: 44, color: '#9da7b5' }
  };
  if (typeof module !== 'undefined') module.exports = G;
})(typeof window === 'undefined' ? globalThis : window);
