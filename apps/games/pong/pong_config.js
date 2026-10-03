/*
 * Ping Pong — configuration.
 * All tunable numbers, colors, key bindings and on-screen text live here.
 * pong_logic.js reads everything from PONG_CONFIG.
 * APP = name / version / author / category (page title + sites hub header).
 */
const PONG_CONFIG = {
  // App info (own bar / page title, and the sites hub header via the hub bridge)
  APP: { name: "Ping Pong", version: "1.1", author: "Jor Teron", category: "Games" },

  // First side to reach this score wins the match (0 = endless)
  WIN_SCORE: 5,

  // On-screen text
  text: {
    pausedSuffix: "  ·  PAUSED",                           // appended to HUD while paused
    scoreSeparator: " — ",                                 // between left and right score
    paused: "PAUSED",                                      // drawn on the court while paused
    youWin: "YOU WIN!",                                    // match won by the player
    cpuWins: "CPU WINS",                                   // match won by the AI
    playAgain: "Start / Enter — play again",               // under the win message
    statLeft: "You",                                       // hub header score labels / button
    statRight: "CPU",
    newGame: "New Game",
    // Two players on one device (touch on the right half takes the right paddle)
    p1Wins: "P1 WINS",
    p2Wins: "P2 WINS",
    statP1: "P1",
    statP2: "P2",
    twoPlayerTag: "2P",                                    // shown in the own bar
    tapAgain: "Tap / Enter — play again",                  // under the win message (touch device)
    pauseTitle: "Pause",
    resumeTitle: "Resume",
  },

  // Touch / mouse on the court (pointer events)
  touch: {
    follow: "glide",       // 'glide' = move toward the finger at glideSpeed x playerSpeed,
                           // 'instant' = paddle centre jumps to the finger
    glideSpeed: 2.2,       // glide speed multiplier (x paddle.playerSpeed)
    twoPlayer: true,       // a touch on the RIGHT half takes the right paddle (CPU off
                           // until the match is restarted)
    mouse: true,           // PC: moving the mouse over the LEFT half moves the left paddle
    tapMaxMs: 300,         // a tap: released within this time ...
    tapMaxMovePx: 12,      // ... and moved less than this (CSS px): start / resume / new match
  },

  // Court in game units. Width is fixed; height follows the free space
  // (height / width kept between minAspect and maxAspect), then the whole court
  // is scaled to fit the page (or the hub frame). Paddle height and speeds scale
  // with the court height (their values below are for height = baseHeight).
  court: {
    width: 800,        // playfield width (game units)
    baseHeight: 480,   // reference height for paddle size / speeds
    minAspect: 0.45,   // flattest court (height / width), wide screens
    maxAspect: 1.0,    // tallest court (height / width), portrait phones
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
    message: "#e8eef5", // win / pause text on the court
    shade: "rgba(0, 0, 0, 0.45)", // court dimming behind a message
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
    start: ["Enter", "KeyP", "p", "P"],            // Start / P: pause / resume; after a win: new match
    pause: ["Space", " "],                         // A / Space: pause / resume
    restart: ["Escape", "KeyR", "r", "R"],         // Select / R: full match reset
  },
};
