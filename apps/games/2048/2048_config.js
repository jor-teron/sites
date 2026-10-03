/*
  ============================================================
  File:        2048_config.js
  Project:     2048
  Purpose:     Tunables read by 2048_logic.js: phone rumble
               (inside the sites hub), key mappings and
               localStorage keys. Colours / grid live in the
               logic + CSS on purpose (not configurable).
  Location:    apps/games/2048/2048_config.js
  ============================================================
*/
const G2048_CONFIG = {
  // App info for the sites hub header (hub bridge)
  APP: { name: '2048', version: '1.1' },

  // Phone rumble, sent to the hub → paired phone controller (only inside the hub).
  // ms number, or an array = vibrate pattern. 0 = off.
  rumble: {
    bigTileMin: 512,             // making a tile of at least this value ...
    bigTileMs: 30,               // ... buzzes this long
    winPattern: [100, 60, 100],  // reaching 2048
    gameOverMs: 400,             // no moves left
  },

  // Keys (KeyboardEvent.key). The hub's phone gamepad sends: D-pad / stick = arrows,
  // A = ' ' (Space), Start = 'Enter', B = 'x', Select = 'Escape', X = 'z', Y = 'c'.
  keys: {
    up: ['ArrowUp', 'w', 'W'],
    down: ['ArrowDown', 's', 'S'],
    left: ['ArrowLeft', 'a', 'A'],
    right: ['ArrowRight', 'd', 'D'],
    confirm: ['Enter', ' '],                         // close the overlay: Keep going / New game
    undo: ['Escape', 'Backspace', 'x', 'X', 'u', 'U'], // B on the phone gamepad = 'x'
    newGame: ['n', 'N'],
  },

  // localStorage keys
  storage: {
    best: '2048_best',           // best score (same key as before: old bests are kept)
    game: '2048_game',           // current game (board, score, win state) restored on reload
  },
};
