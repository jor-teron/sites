/**
 * Snake — configuration.
 * Grid, speeds, colors, keys and on-screen text.
 * snake_logic.js reads everything from SNAKE_CONFIG.
 */
const SNAKE_CONFIG = {
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
    score: 0,                  // initial score
    wrap: false,               // wrap walls off at start
  },

  // Scoring
  scoring: {
    food: 1,                   // points per food
    foodBoosted: 2,            // points per food while boosting
  },

  // Input
  input: {
    queueSize: 2,              // max buffered turns between steps
    // After a tap/click starts the game, an Enter within this window is treated
    // as "start" (ignored) instead of pausing immediately.
    clickStartGraceMs: 1500,
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

  // Key bindings (KeyboardEvent.code). Phone D-pad: arrows, A=Space, B=KeyX, Start=Enter, Select=Escape
  keys: {
    up: ['ArrowUp', 'KeyW'],         // turn up
    down: ['ArrowDown', 'KeyS'],     // turn down
    left: ['ArrowLeft', 'KeyA'],     // turn left
    right: ['ArrowRight', 'KeyD'],   // turn right
    boost: ['Space'],                // hold to boost
    wrap: ['KeyX'],                  // toggle wrap walls
    start: ['Enter'],                // start / pause / resume
    restart: ['Escape'],             // back to title
  },

  // On-screen text
  text: {
    title: 'SNAKE',                  // title card heading
    pressStart: 'Press Start / Enter', // title / pause message
    titleSub: 'or tap / click',      // title sub line
    paused: 'PAUSED',                // pause heading
    gameOver: 'GAME OVER',           // game over heading
    help: '←→↑↓ move · A/Space boost · B/X wrap · Start/Enter pause · Select/Esc restart', // help line
  },
};
