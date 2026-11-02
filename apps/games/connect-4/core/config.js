/*
 * Connect 4 — config (C4-1). All tunable numbers live here.
 */
const C4_CONFIG = {
  cols: 7, rows: 6,
  dropGravity: 9000,       // px/s² for the falling disc (real elapsed time)
  maxFps: 30,              // animation cap (lowered further by the shared fpsLimit only if below 30)
  cpuDelayMs: 350,         // pause before the computer moves, so it feels natural
  hardDepth: 7,            // minimax plies for Hard (alpha-beta + centre-first ordering)
  hardTimeMs: 600,         // iterative deepening stops after this budget (weak phones)
  easyRandom: 0.85,        // Easy: chance of a random move when no win is available
  // shared "difficulty" setting → default CPU level used the first time
  difficultyToLevel: { easy: 'easy', normal: 'medium', hard: 'hard' },
  storeKey: 'connect-4.state', // score + mode (prefixed by folder name, see settings README rule 7)
};
