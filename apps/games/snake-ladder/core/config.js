/* config.js — every tunable in one place. No magic numbers elsewhere. */

const CONFIG = {
  // geometry
  SIZE: 10,                 // 10 x 10 = cells 0..99
  START_CELL: 0,
  FINISH_CELL: 99,

  // procedural board density, scaled to board area (99 playable cells)
  LADDERS: 9,
  SNAKES: 8,

  // constraints
  MIN_JUMP: 4,              // smallest allowed connector span
  NO_CONNECT_ON: [0, 99],   // start and finish stay clean
  NO_ADJACENT_ENDS: true,   // two connectors may not touch cells
  MAX_CHAIN: 1,             // arriving on a connector end moves once only

  // tokens
  PLAYER_COLORS: ['p1', 'p2', 'p3', 'p4'],
  PLAYER_NAMES: ['Red', 'Green', 'Yellow', 'Purple'],
  TOKEN_LAYOUT: [           // offsets inside a cell, as fraction of cell size
    [-0.18, -0.18],
    [ 0.18, -0.18],
    [-0.18,  0.18],
    [ 0.18,  0.18],
  ],
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 4,

  // rules
  EXACT_ROLL_TO_FINISH: true,  // overshoot = no move
  SIX_ROLLS_AGAIN: false,      // disabled by default
  REQUIRED_TO_START: false,    // 1 = every player starts on the board

  // feel
  HOP_MS: 130,                 // time per cell when walking
  DICE_MS: 420               // dice flicker duration
};
