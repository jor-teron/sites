/*
 * Blockade — config (BLKD-1). All tunable numbers live here.
 * Classic 1975 wall game: 11 x 14 grid, 2 pawns each, 9 green (vertical) + 9 blue (horizontal) walls each.
 * Coordinates: x = 0..10 left to right, y = 0..13 top to bottom. Player 1 sits at the bottom and moves first.
 */
const BK_CONFIG = {
  cols: 11, rows: 14,
  walls: 9,                          // per player, of EACH colour
  homes: { 1: [[3, 10], [7, 10]],    // Player 1 start squares (classic d4 / h4)
           2: [[3, 3], [7, 3]] },    // Player 2 start squares (classic d11 / h11)
  names: { 1: 'Orange', 2: 'Purple' },
  cpuDelayMs: 300,                   // pause before the computer moves
  aiCapMs: 600,                      // hard cap for any computer turn (weak phones)
  hardBudgetMs: 420,                 // Hard: look-ahead time inside the cap
  hardMoves: 6, hardWalls: 7,        // Hard: best pawn moves x best walls tried
  easyBest: 0.55,                    // Easy: chance of taking the shortest-path move
  easyWall: 0.3,                     // Easy: chance of placing a random wall
  difficultyToLevel: { easy: 'easy', normal: 'medium', hard: 'hard' },
  storeKey: 'blockade.state',        // wins, mode and the game in progress (prefix = folder name)
};
