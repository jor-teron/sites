/*
 * Orbito — config (ORB-1). All tunable numbers live here.
 * 4 x 4 board, squares numbered 0..15 left to right, top to bottom (i = y * 4 + x).
 * Two players, 8 marbles each: 1 = Black (moves first), 2 = White.
 * Rings are listed clockwise; the board turns counter-clockwise, so a marble on ring[k] goes to ring[k - 1].
 */
const ORB_CONFIG = {
  n: 4,
  marbles: 8,
  outer: [0, 1, 2, 3, 7, 11, 15, 14, 13, 12, 8, 4],   // outer ring of 12, clockwise from the top left
  inner: [5, 6, 10, 9],                                // inner ring of 4, clockwise
  finalTurns: 5,                // board full and no winner: turn it up to this many more times
  names: { 1: 'Black', 2: 'White' },
  rotateMs: 520,                // one turn of the board (animation)
  slideMs: 220,                 // a marble moved to the square next to it
  animFps: 30,                  // animation frame cap
  cpuDelayMs: 450,              // pause before the computer starts its turn
  cpuStepMs: 520,               // pause between the computer's marble move and its placement
  aiCapMs: 700,                 // Hard: time cap
  difficultyToLevel: { easy: 'easy', normal: 'medium', hard: 'hard' }, // shared setting -> first CPU level
  storeKey: 'orbito.state',     // score, mode and the game in progress (prefix = folder name)
};
