/**
 * Snake — configuration.
 * Grid, speeds, colors, keys, touch and on-screen text.
 * snake_logic.js reads everything from SNAKE_CONFIG.
 * APP = name / version / author / category (page title + sites hub header).
 */
const SNAKE_CONFIG = {
  // App info (page title, and the sites hub header via the hub bridge)
  APP: { name: 'Snake', version: '1.1', author: 'Jor Teron', category: 'Games' },

  // Wrap-around walls: true = leave one edge, enter from the opposite one (only
  // running into yourself kills); false = hitting a wall ends the game.
  // B / X still toggles it during a game.
  WRAP_WALLS: true,

  // Phone rumble on death (ms), sent to the hub → paired phone controller.
  // Only inside the hub; 0 = off. An array is a vibrate pattern, e.g. [200, 100, 200].
  DIE_VIBRATE_MS: 500,

  // Short phone buzz each time the snake eats food (ms). Only inside the hub; 0 = off.
  EAT_VIBRATE_MS: 100,

  bestKey: 'snake-best',       // localStorage key for the best score

  // Grid
  grid: {
    cols: 24,                  // board columns
    rows: 18,                  // board rows
    startLength: 3,            // initial snake length
    startDir: 'right',         // initial direction
  },

  // Timing (seconds per cell)
  timing: {
    baseStep: 0.14,            // normal speed
    boostStep: 0.07,           // speed while boost (A / Space) is held
    maxDt: 0.05,               // clamp frame delta to avoid jumps
  },

  // Starting values
  start: {
    score: 0,                  // initial score (wrap at start: WRAP_WALLS above)
  },

  // Scoring
  scoring: {
    food: 1,                   // points per food
    foodBoosted: 2,            // points per food while boosting
  },

  // Input
  input: {
    queueSize: 2,              // max buffered turns between steps (one is used per step;
                               // a reverse of the last queued turn is ignored)
    // After a tap/click starts the game, an Enter within this window is treated
    // as "start" (ignored) instead of pausing immediately.
    clickStartGraceMs: 1500,
  },

  // Touch / mouse (pointer events anywhere on screen)
  touch: {
    swipeMinPx: 24,            // movement that counts as a swipe (a turn is queued at once,
                               // no need to lift; keep moving for another swipe)
    tapMaxMs: 300,             // a tap: released within this time ...
    tapMaxMovePx: 12,          // ... and moved less than this (start / pause / restart)
    showDpad: false,           // on-screen D-pad shown by default (toggle is remembered)
    dpadKey: 'snake-dpad',     // localStorage key for the D-pad toggle
  },

  // Colors / drawing
  colors: {
    bg: '#0c1016',                     // page / canvas background
    board: '#141a22',                  // board background
    grid: 'rgba(255,255,255,0.03)',    // grid lines
    food: '#f87171',                   // food
    head: '#86efac',                   // snake head
    bodyR: 40,                         // body color red channel
    bodyB: 80,                         // body color blue channel
    bodyGMin: 80,                      // body green at tail
    bodyGRange: 140,                   // extra green toward head
    boostTint: 'rgba(110,168,254,0.12)', // board tint while boosting
  },
  sizes: {
    foodPad: 0.18,             // food inset (fraction of cell)
    headPad: 0.08,             // head inset (fraction of cell)
    bodyPad: 0.14,             // body inset (fraction of cell)
    foodRadius: 4,             // food corner radius (px)
    segRadius: 3,              // segment corner radius (px)
  },

  // Key bindings — matched against KeyboardEvent.code OR .key.
  // Phone D-pad (via the hub): arrows, A=Space, B=KeyX, X=KeyZ, Start=Enter, Select=Escape
  keys: {
    up: ['ArrowUp', 'KeyW'],         // turn up
    down: ['ArrowDown', 'KeyS'],     // turn down
    left: ['ArrowLeft', 'KeyA'],     // turn left
    right: ['ArrowRight', 'KeyD'],   // turn right
    pause: ['Space'],                // A: pause / resume
    boost: ['ShiftLeft', 'ShiftRight', 'KeyZ'], // hold to boost (Shift / phone X)
    wrap: ['KeyX'],                  // B: toggle wrap walls
    start: ['Enter', 'KeyP'],        // Start / P: new game (title, game over) · pause / resume
    restart: ['Escape', 'KeyR'],     // Select / R: back to title
  },

  // On-screen text
  text: {
    title: 'SNAKE',                  // title card heading
    pressStart: 'Press Start / Enter', // title / pause message
    titleSub: 'or tap · swipe to turn', // title sub line
    paused: 'PAUSED',                // pause heading
    gameOver: 'GAME OVER',           // game over heading
    help: '←→↑↓ move · A/Space pause · Shift boost · B/X wrap · Start/Enter new game · Select/Esc title', // help line
    statScore: 'Score',              // hub header stat labels / button
    statBest: 'Best',
    newGame: 'New Game',
    hubDpadOn: 'D-pad: On',          // hub bar D-pad toggle button
    hubDpadOff: 'D-pad: Off',
    dpadShow: 'Show D-pad',          // standalone toggle tooltip
    dpadHide: 'Hide D-pad',
  },
};
