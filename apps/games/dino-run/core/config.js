/**
 * Dino Run — configuration.
 * Physics, speeds, spawn rates, sizes, keys and on-screen text (colors now live in assets/themes).
 * core/logic.js reads everything from DINO_RUN_CONFIG.
 */
const DINO_RUN_CONFIG = {
  bestKey: 'dino-run-best',    // localStorage key for the high score
  scoreDigits: 5,              // score is zero-padded to this many digits

  // Physics (pixels / second)
  physics: {
    gravity: 2200,             // downward acceleration
    jumpVelocity: -780,        // initial jump velocity
    jumpHold: -120,            // extra upward push while jump is held
    duckFastFall: 1800,        // extra gravity while holding down in the air
    moveSpeed: 220,            // left/right move speed
    minXFrac: 0.08,            // leftmost dino x (fraction of width)
    maxXFrac: 0.42,            // rightmost dino x (fraction of width)
    maxDt: 0.05,               // clamp frame delta
  },

  // World
  groundYFrac: 0.72,           // ground line as fraction of screen height

  // Dino
  dino: {
    width: 44,                 // standing width
    height: 48,                // standing height
    duckHeight: 28,            // height while ducking
    startXFrac: 0.18,          // start x (fraction of width)
    hitPad: 6,                 // hitbox inset
  },

  // Shield (B button)
  shield: {
    duration: 0.7,             // seconds of invulnerability
    cooldown: 3.2,             // seconds before it can be used again
  },

  // Starting values
  start: {
    score: 0,                  // initial score
    speed: 320,                // initial run speed
    spawnDelay: 0.8,           // seconds before the first obstacle
  },

  // Speed / scoring curve
  speed: {
    max: 720,                  // speed cap
    perDistance: 0.012,        // speed gained per unit of distance
    scorePerDistance: 0.05,    // score = distance * this
  },

  // Obstacle spawning
  spawn: {
    cactusChance: 0.62,        // chance the next obstacle is cactus (else bird)
    cactusExtra1: 0.4,         // chance of a 2nd cactus in the cluster
    cactusExtra2: 0.15,        // chance of a 3rd cactus
    cactusMinH: 34,            // min cactus height
    cactusRandH: 28,           // random extra height
    cactusMinW: 14,            // min cactus width
    cactusRandW: 8,            // random extra width
    cactusGap: 4,              // gap between cacti in a cluster
    birdW: 42,                 // bird width
    birdH: 28,                 // bird height
    intervalBase: 0.9,         // base seconds between spawns
    intervalRandom: 1.1,       // random extra seconds
    intervalSpeedDiv: 1400,    // interval shrinks by speed / this ...
    intervalSpeedMax: 0.5,     // ... up to this many seconds
    clouds: 4,                 // number of clouds
  },

  // Look & feel: dinos live in assets/models/dinos, themes (colors, background, obstacle looks) in assets/themes.
  // Choices are cosmetic only — hitboxes and physics never change.
  dinoKey: 'dino-run.dino',    // localStorage key for the chosen dino
  themeKey: 'dino-run.theme',  // localStorage key for the chosen theme
  defaultDino: 'classic',      // dino id used when nothing (valid) is saved
  defaultTheme: 'classic',     // theme id used when nothing (valid) is saved

  // Input
  input: {
    // After a tap/click starts the game, an Enter within this window is treated
    // as "start" (ignored) instead of pausing immediately. Clicking to focus the
    // hub iframe and then pressing Start would otherwise pause the new game.
    clickStartGraceMs: 1500,
  },

  // Key bindings — matched against KeyboardEvent.code OR .key.
  // Phone D-pad: arrows, A=Space, B=KeyX, Start=Enter, Select=Escape
  keys: {
    jump: ['ArrowUp', 'Space', 'KeyW'],  // jump (hold for higher)
    duck: ['ArrowDown', 'KeyS'],         // duck / fast fall
    left: ['ArrowLeft', 'KeyA'],         // move left
    right: ['ArrowRight', 'KeyD'],       // move right
    shield: ['KeyX'],                    // shield
    start: ['Enter', 'KeyP'],            // start / pause / resume (Start / P)
    restart: ['Escape', 'KeyR'],         // back to title (Select / R)
  },

  // On-screen text
  text: {
    title: 'DINO RUN',                   // title card heading
    pressStart: 'Press Start / Enter',   // title / pause message
    titleSub: 'or tap / click',          // title sub line
    paused: 'PAUSED',                    // pause heading
    gameOver: 'GAME OVER',               // game over heading
    help: '↑/A jump · ↓ duck · ←→ move · B shield · Start pause · Select restart', // help line
  },
};
