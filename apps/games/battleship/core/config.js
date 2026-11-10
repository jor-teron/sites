/*
 * Battleship — config (SHIP-2a). All tunable numbers live here.
 * The classic paper game: two 10 x 10 grids, a fleet of 5 ships (5, 4, 3, 3, 2), one shot per turn.
 * Coordinates: x = 0..9 (columns A..J), y = 0..9 (rows 1..10). Cell index = y * 10 + x.
 */
const BS_CONFIG = {
  size: 10,
  fleet: [                                 // classic fleet (ships may touch, but not overlap)
    { name: 'Carrier', size: 5 },
    { name: 'Battleship', size: 4 },
    { name: 'Cruiser', size: 3 },
    { name: 'Submarine', size: 3 },
    { name: 'Destroyer', size: 2 },
  ],
  names: { 1: 'Player 1', 2: 'Player 2' },
  cpuDelayMs: 650,                         // pause before the computer fires
  hardHitWeight: 25,                       // Hard: how strongly placements through a live hit count
  difficultyToLevel: { easy: 'easy', normal: 'medium', hard: 'hard' },
  storeKey: 'battleship.state',            // wins, mode and the game in progress (prefix = folder name)
};
