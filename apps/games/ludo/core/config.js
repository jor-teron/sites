/*
 * Ludo — config (LUDO-1a). All tunable numbers live here.
 * LUDO-1b: computer seats (seats, seatNames, levels, cpu pauses, Hard weights in `ai`).
 * Classic 15 x 15 cross board: 4 home yards (red top-left, green top-right, yellow bottom-right,
 * blue bottom-left), a 52-square track, a 5-square home column per colour and the centre home.
 * Colour order = turn order (clockwise). Coordinates: x = column 0..14, y = row 0..14 from the top left.
 * 1c turns house rules on through `rules`.
 */
const LD_CONFIG = {
  colors: ['red', 'green', 'yellow', 'blue'],
  names: { red: 'Red', green: 'Green', yellow: 'Yellow', blue: 'Blue' },
  hex: { red: '#dc2626', green: '#16a34a', yellow: '#eab308', blue: '#2563eb' },
  light: { red: '#fecaca', green: '#bbf7d0', yellow: '#fef08a', blue: '#bfdbfe' },
  start: { red: 0, green: 13, yellow: 26, blue: 39 },   // track index of each colour's start square
  stars: [8, 21, 34, 47],                                 // star squares (start squares are safe too)
  trackLen: 52,
  homeCol: 5,                                             // squares in each home column
  goal: 56,                                               // steps from the start square to the centre
  opposite: { red: 'yellow', yellow: 'red', green: 'blue', blue: 'green' },
  rules: {                       // classic rules; 1c adds house-rule switches here
    threeSixes: true,            // a third 6 in a row loses the turn
    captureBonus: true,          // sending a token home earns another roll
    homeBonus: true,             // reaching the centre earns another roll
  },
  seats: { human: 'human', easy: 'easy', medium: 'medium', hard: 'hard' },
  seatNames: { human: 'Person', easy: 'Computer: Easy', medium: 'Computer: Medium', hard: 'Computer: Hard' },
  levels: ['easy', 'medium', 'hard'],
  difficultyToLevel: { easy: 'easy', normal: 'medium', hard: 'hard' },   // shared Difficulty = first level a seat switches to
  cpuRollMs: 700,                // computer seats: pause before rolling
  cpuMoveMs: 650,                // ... and between the roll and the move, so people can follow
  ai: {                          // Hard weights (core/ai.js)
    capture: 60, captureProgress: 1.5, exit: 35, home: 40, enterColumn: 25, progress: 1,
    danger: 2, dangerBase: 8, escape: 1.6, block: 12, threaten: 2,
  },
  autoDelayMs: 450,              // pause before moving the only legal token (when Auto-move is on)
  passDelayMs: 900,              // pause after "no move" / "three 6s" before the next player
  storeKey: 'ludo.state',        // wins, options and the game in progress (prefix = folder name)
};
