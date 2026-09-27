/*
 * Pong — configuration.
 * All tunable numbers, colors, key bindings and on-screen text live here.
 * pong_logic.js reads everything from PONG_CONFIG.
 */
const PONG_CONFIG = {
  // On-screen text
  text: {
    title: "Pong",                                        // heading above the court
    hint: "W/S or ↑/↓ move · Enter/Space pause · Esc/R restart",    // controls reminder
    pausedSuffix: "  ·  PAUSED",                           // appended to HUD while paused
    scoreSeparator: " — ",                                 // between left and right score
  },

  // Court (canvas) size in pixels
  court: {
    width: 800,   // playfield width
    height: 480,  // playfield height
  },

  // Paddles
  paddle: {
    width: 12,        // paddle width in pixels
    height: 88,       // paddle height in pixels
    margin: 24,       // distance from side wall to paddle
    playerSpeed: 7,   // human paddle speed (px per frame)
    aiSpeed: 5.2,     // max AI paddle speed (px per frame)
    aiDeadZone: 6,    // AI ignores offsets smaller than this (anti-jitter)
  },

  // Ball
  ball: {
    radius: 7,             // ball radius in pixels
    speed: 5.4,            // serve speed
    speedBump: 0.28,       // speed added on each paddle hit
    speedMax: 12,          // hard speed cap
    serveMaxVY: 3,         // random vertical speed on serve is in [-this, +this]
    maxBounceAngle: 0.6,   // radians of spin at paddle edge
    serveDelayMs: 700,     // pause after a point before the next serve
    firstServeDir: 1,      // +1 = serve toward AI, -1 = toward player
  },

  // Starting values for game state
  start: {
    scoreLeft: 0,     // player score
    scoreRight: 0,    // AI score
    paused: false,    // start unpaused
  },

  // Colors
  colors: {
    court: "#111820",   // court background (canvas clear)
    net: "#2a3644",     // dashed center line
    pieces: "#d7e2ee",  // paddles and ball
  },

  // Center net drawing
  net: {
    lineWidth: 3,       // stroke width
    dash: [10, 12],     // dash pattern [on, off]
  },

  // Key bindings — matched against KeyboardEvent.code OR .key.
  // Hub / phone controller: D-pad = arrows, A = Space, Start = Enter, Select = Escape.
  keys: {
    up: ["ArrowUp", "KeyW", "w", "W"],             // move paddle up (hold)
    down: ["ArrowDown", "KeyS", "s", "S"],         // move paddle down (hold)
    pause: ["Enter", "Space", " ", "KeyP", "p", "P"], // toggle pause (Start / A / P)
    restart: ["Escape", "KeyR", "r", "R"],         // full match reset (Select / R)
  },
};
