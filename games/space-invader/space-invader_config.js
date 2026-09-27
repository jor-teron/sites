/*
  Space Invaders Clone — configuration.
  Sizes, speeds, difficulty, colors, keys and on-screen text.
  space-invader_logic.js reads everything from SPACE_INVADER_CONFIG.
*/
const SPACE_INVADER_CONFIG = {
  // Logical playfield (scaled to screen)
  width: 480,                // playfield width
  height: 640,               // playfield height
  maxDpr: 2,                 // device pixel ratio cap
  maxDtMs: 40,               // clamp frame delta (ms)

  // Starting values
  start: {
    score: 0,                // initial score
    lives: 3,                // initial / max lives
    wave: 1,                 // initial wave
  },

  // Player
  player: {
    w: 36,                   // ship width
    h: 18,                   // ship height
    speed: 4.2,              // px per frame at 60fps
    bottomOffset: 50,        // ship y = height - this
    shotCooldownMs: 280,     // ms between shots
    invulnMs: 1500,          // invincibility after a hit
    blinkMs: 80,             // blink period while invincible
  },

  // Bullets
  bullets: {
    speed: 8,                // player bullet speed (up)
    enemySpeedFactor: 0.7,   // enemy bullet speed = speed * this
    w: 4,                    // bullet width
    h: 10,                   // bullet height
  },

  // Invaders
  invaders: {
    w: 28,                   // cell width
    h: 20,                   // cell height
    cols: 8,                 // columns
    rows: 5,                 // rows
    gapX: 12,                // horizontal gap
    gapY: 14,                // vertical gap
    startY: 70,              // y of the top row
    drop: 16,                // drop when hitting a wall
    edgeMargin: 8,           // turn around this far from the edges
    landMargin: 8,           // game over when this close to the player line
    speedBase: 0.55,         // march speed = base + wave * perWave
    speedPerWave: 0.18,
    shotChanceBase: 0.008,   // per-frame shot chance = base + wave * perWave
    shotChancePerWave: 0.002,
    pointsPerType: 10,       // score = (type + 1) * this (type 2 = top row)
  },

  // Starfield
  stars: {
    count: 60,               // number of stars
    minSize: 0.3,            // min star size
    sizeRange: 1.4,          // random extra size
    minSpeed: 0.1,           // min drift speed
    speedRange: 0.4,         // random extra speed
  },

  // Colors
  colors: {
    bg: "#050508",           // background
    star: "#ffffff",         // stars
    ground: "#1a3a1a",       // ground line
    groundOffset: 28,        // ground line distance from bottom
    invaderTop: "#ff6b6b",   // type 2 (top row)
    invaderMid: "#7cff7c",   // type 1
    invaderLow: "#7cc8ff",   // type 0
    player: "#e8f0ff",       // player ship
    playerTip: "#7cff7c",    // player cannon tip
    bullet: "#fff8a0",       // player bullets
    enemyBullet: "#ff6b6b",  // enemy bullets
  },

  // Key bindings — matched against KeyboardEvent.code OR .key.
  // Hub / phone controller: D-pad = arrows, A = Space, Start = Enter, Select = Escape
  keys: {
    left: ["ArrowLeft", "KeyA"],   // move left (hold)
    right: ["ArrowRight", "KeyD"], // move right (hold)
    shoot: ["Space", " "],         // shoot (hold) / start / resume (A)
    start: ["Enter"],              // start / pause / resume / retry (Start)
    pause: ["KeyP", "p", "P"],     // pause / resume
    restart: ["Escape", "KeyR", "r", "R"], // back to the start screen (Select / R)
  },


  // On-screen text
  text: {
    menu: "Press SPACE / ENTER or TAP to start",
    paused: "PAUSED — SPACE / ENTER to resume",
    gameOver: "GAME OVER — SPACE / TAP to retry",
    landed: "THEY LANDED — SPACE / TAP to retry",
  },
};
