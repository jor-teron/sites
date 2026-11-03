/*
 * Go — config (GO-1). All tunable numbers and text live here.
 * Used by core/rules.js, core/ai.js, ui/render.js and core/game.js.
 */
const GO_CONFIG = {
  sizes: [9, 13, 19],
  defaultSize: 9,
  komi: 6.5,                // points given to White (area / Chinese scoring)
  stars: {                  // star points (hoshi), as [x, y] pairs counted from 0
    9: [[2, 2], [6, 2], [4, 4], [2, 6], [6, 6]],
    13: [[3, 3], [9, 3], [6, 6], [3, 9], [9, 9]],
    19: [[3, 3], [9, 3], [15, 3], [3, 9], [9, 9], [15, 9], [3, 15], [9, 15], [15, 15]],
  },
  cpuDelayMs: 250,          // pause before the computer moves, so it feels natural
  aiCapMs: 600,             // hard cap for any computer move (weak phones)
  hardBudgetMs: 430,        // Hard: Monte Carlo playout time inside the cap
  hardCandidates: { 9: 14, 13: 12, 19: 10 }, // Hard: best heuristic moves tried by playouts
  smallRegion: 6,           // empty area this small and walled by one colour counts as settled
  confirmBelowPx: 28,       // Tap "Auto": ask for a second tap when a board square is smaller than this (touch)
  difficultyToLevel: { easy: 'easy', normal: 'medium', hard: 'hard' }, // shared setting -> first CPU level
  storeKey: 'go.state',     // score, mode, size, tap choice and the game in progress (prefix = folder name)
};
