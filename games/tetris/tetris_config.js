/* =============================================================================
 * TETRIS — configuration
 * Every tunable value (board, colors, timing, shapes, scoring, keys, text).
 * tetris_logic.js reads everything from TETRIS_CONFIG.
 * ============================================================================= */
var TETRIS_CONFIG = {
  /* Board size and drawing scale */
  board: {
    cols: 10,   /* columns in the well (classic 10) */
    rows: 20,   /* visible rows (classic 20) */
    cell: 24,   /* pixel size of one cell; 24 * 10 = 240 wide */
    spawnX: 3,  /* grid column where new pieces appear */
    spawnY: 0   /* grid row where new pieces appear */
  },

  /* Theme colors (B/W only) */
  colors: {
    bg: "#000000",     /* empty cell / canvas background */
    block: "#ffffff",  /* locked and falling blocks */
    ghost: "#555555",  /* ghost piece (landing preview) */
    grid: "#222222"    /* grid lines */
  },

  /* Timing (milliseconds) */
  timing: {
    baseMs: 800,       /* fall interval at level 1 */
    softMs: 50,        /* soft-drop interval while holding down */
    levelStepMs: 70,   /* ms subtracted per level */
    minMs: 80          /* fastest fall interval */
  },

  /* Starting values */
  start: {
    score: 0,  /* initial score */
    lines: 0,  /* initial lines cleared */
    level: 1   /* initial level */
  },

  /* Scoring and progression */
  scoring: {
    lineTable: [0, 100, 300, 500, 800],  /* points for 0/1/2/3/4 lines (x level) */
    linesPerLevel: 10,                   /* lines needed per level up */
    hardDropPerCell: 2,                  /* points per cell for hard drop */
    softDropPerCell: 1                   /* points per gravity step while soft dropping */
  },

  /* Next-piece preview */
  preview: {
    cellSize: 20  /* pixel size of a cell in the NEXT box */
  },

  /* Piece shapes: each piece is a list of rotation states,
   * each state a list of [x, y] cells (grid units). */
  shapes: {
    /* I: long bar */
    I: [
      [[0, 1], [1, 1], [2, 1], [3, 1]],
      [[2, 0], [2, 1], [2, 2], [2, 3]],
      [[0, 2], [1, 2], [2, 2], [3, 2]],
      [[1, 0], [1, 1], [1, 2], [1, 3]]
    ],
    /* O: 2x2 square */
    O: [
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [2, 1]]
    ],
    /* T: three across plus one in the middle */
    T: [
      [[1, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [1, 2]],
      [[1, 0], [0, 1], [1, 1], [1, 2]]
    ],
    /* S: right snake */
    S: [
      [[1, 0], [2, 0], [0, 1], [1, 1]],
      [[1, 0], [1, 1], [2, 1], [2, 2]],
      [[1, 1], [2, 1], [0, 2], [1, 2]],
      [[0, 0], [0, 1], [1, 1], [1, 2]]
    ],
    /* Z: left snake */
    Z: [
      [[0, 0], [1, 0], [1, 1], [2, 1]],
      [[2, 0], [1, 1], [2, 1], [1, 2]],
      [[0, 1], [1, 1], [1, 2], [2, 2]],
      [[1, 0], [0, 1], [1, 1], [0, 2]]
    ],
    /* J: stem plus foot on the left */
    J: [
      [[0, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [2, 0], [1, 1], [1, 2]],
      [[0, 1], [1, 1], [2, 1], [2, 2]],
      [[1, 0], [1, 1], [0, 2], [1, 2]]
    ],
    /* L: stem plus foot on the right */
    L: [
      [[2, 0], [0, 1], [1, 1], [2, 1]],
      [[1, 0], [1, 1], [1, 2], [2, 2]],
      [[0, 1], [1, 1], [2, 1], [0, 2]],
      [[0, 0], [1, 0], [1, 1], [1, 2]]
    ]
  },

  /* Names used when filling the 7-bag */
  pieceNames: ["I", "O", "T", "S", "Z", "J", "L"],

  /* Wall-kick offsets tried after a rotate fails in place */
  kicks: [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0]],

  /* Key bindings (KeyboardEvent.key). Phone D-pad: arrows, A=Space, B=x */
  keys: {
    left: ["ArrowLeft"],            /* move left */
    right: ["ArrowRight"],          /* move right */
    softDrop: ["ArrowDown"],        /* hold for soft drop */
    rotate: ["ArrowUp", "x", "X"],  /* rotate clockwise */
    hardDrop: [" "],                /* slam to floor */
    pause: ["p", "P"],              /* toggle pause */
    restart: ["r", "R"]             /* new game */
  },

  /* On-screen text */
  text: {
    title: "TETRIS",                              /* sidebar heading */
    paused: "PAUSED",                             /* status while paused */
    gameOver: "GAME OVER — R to restart",         /* status on game over */
    helpHtml:                                     /* controls help (HTML) */
      '<kbd>←</kbd> <kbd>→</kbd> move<br />' +
      '<kbd>↑</kbd> / <kbd>X</kbd> rotate<br />' +
      '<kbd>↓</kbd> soft drop<br />' +
      '<kbd>SPACE</kbd> hard drop<br />' +
      '<kbd>P</kbd> pause<br />' +
      '<kbd>R</kbd> restart'
  }
};
