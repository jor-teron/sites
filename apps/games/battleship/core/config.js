/*
 * Battleship — config (SHIP-2c). All tunable numbers live here.
 * Classic: two 10 x 10 grids, fleet 5-4-3-3-2, one shot per turn. Salvo: one shot per ship still afloat.
 * Skirmish is a smaller 4-3-2 fleet. Coordinates: x = 0..9 (A..J), y = 0..9 (rows 1..10). Cell = y * 10 + x.
 */
const BS_CONFIG = {
  size: 10,
  fleets: {
    classic: [
      { name: 'Carrier', size: 5 },
      { name: 'Battleship', size: 4 },
      { name: 'Cruiser', size: 3 },
      { name: 'Submarine', size: 3 },
      { name: 'Destroyer', size: 2 },
    ],
    skirmish: [
      { name: 'Battleship', size: 4 },
      { name: 'Cruiser', size: 3 },
      { name: 'Destroyer', size: 2 },
    ],
  },
  names: { 1: 'Player 1', 2: 'Player 2' },
  cpuDelayMs: 650,
  hardHitWeight: 25,
  hardBudgetMs: 12,                         // Hard config search time cap per shot
  difficultyToLevel: { easy: 'easy', normal: 'medium', hard: 'hard' },
  storeKey: 'battleship.state',
};
BS_CONFIG.fleet = BS_CONFIG.fleets.classic;  // default list, used by older callers
if (typeof globalThis !== 'undefined') globalThis.BS_CONFIG = BS_CONFIG;
