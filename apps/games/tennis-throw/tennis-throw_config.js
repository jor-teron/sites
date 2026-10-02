/*
 * Tennis Ball Blitz — configuration.
 * All tunable numbers, colors, target pool, ranks, keys and text.
 * tennis-throw_logic.js reads everything from TENNIS_THROW_CONFIG.
 */
const TENNIS_THROW_CONFIG = {
  // Goal
  targetScore: 100,          // points needed to finish a run

  // Starting values
  start: {
    score: 0,                // initial score
    aimAngle: 45,            // initial aim angle in degrees (0 = right, 180 = left)
    aimPower: 0.5,           // initial power (0..1)
  },

  // Physics
  physics: {
    gravity: 0.35,           // added to ball vy every frame
    ballSpeed: 12,           // speed at full power
  },

  // Aim controls
  aim: {
    angleMin: 0,             // minimum angle (degrees)
    angleMax: 180,           // maximum angle (degrees)
    angleStep: 2,            // degrees per input tick
    powerMin: 0.1,           // minimum power
    powerMax: 1,             // maximum power
    powerStep: 0.02,         // power change per input tick
    inputIntervalMs: 30,     // how often held keys are applied
    previewLength: 150,      // aim line length in pixels
    crosshairSize: 20,       // half-size of the crosshair
    powerBarWidth: 60,       // width of the power bar
    powerBarHeight: 8,       // height of the power bar
    powerBarOffsetY: 30,     // distance of power bar below launch point
  },

  // Ball
  ball: {
    radius: 8,               // drawn ball radius
    hitRadius: 10,           // added to target radius for hit test
    launchOffsetY: 40,       // launch point distance from canvas bottom
    maxTrail: 20,            // trail length in points
  },

  // Target spawning
  targets: {
    marginX: 30,             // keep targets this far from left/right edge
    marginTop: 50,           // minimum y
    bottomReserve: 200,      // space kept free above the bottom (launch area)
    radius: 25,              // default target radius
    starRadius: 15,          // radius for 'star' targets
    // Pool: how many of each target type are on screen, their points and look
    pool: [
      { type: 'balloon', points: 5, emoji: '🎈', count: 4 },
      { type: 'bullseye', points: 10, emoji: '◎', count: 2 },
      { type: 'bird', points: 15, emoji: '🐦', count: 2, speed: 1 },
      { type: 'star', points: 20, emoji: '⭐', count: 2 },
      { type: 'gift', points: 25, emoji: '🎁', count: 1 },
    ],
  },

  // Ranks by finish time (first match wins)
  ranks: [
    { maxSeconds: 30, name: 'GOLD', emoji: '🥇' },
    { maxSeconds: 45, name: 'SILVER', emoji: '🥈' },
    { maxSeconds: 60, name: 'BRONZE', emoji: '🥉' },
    { maxSeconds: Infinity, name: 'FINISHED', emoji: '⭐' },
  ],

  // Colors
  colors: {
    skyTop: '#87CEEB',                    // background gradient top (and clear color)
    skyBottom: '#E0F6FF',                 // background gradient bottom
    trail: 'rgba(255, 200, 0, 0.5)',      // ball trail
    ball: '#FFD700',                      // ball fill
    ballOutline: '#FFA500',               // ball outline
    crosshair: 'rgba(255, 255, 255, 0.6)',// crosshair lines
    aimLine: 'rgba(255, 255, 100, 0.7)',  // aim direction line
    powerBarOutline: 'rgba(255, 255, 255, 0.8)', // power bar border
    targetFont: 'Arial',                  // font used for emoji targets
  },

  // Key bindings — matched against KeyboardEvent.code OR .key.
  // Hub / phone controller: D-pad = arrows, A = Space, Start = Enter, Select = Escape
  keys: {
    throw: ['Space', ' ', 'a', 'A'],  // throw ball / play again when finished (A)
    start: ['Enter', 'KeyP', 'p', 'P'], // pause / resume; play again when finished (Start / P)
    restart: ['Escape'],              // new game (Select)
    resetAim: ['KeyR', 'r', 'R'],     // reset aim angle and power
    aimLeft: ['ArrowLeft'],           // decrease angle (hold)
    aimRight: ['ArrowRight'],         // increase angle (hold)
    powerUp: ['ArrowUp'],             // more power (hold)
    powerDown: ['ArrowDown'],         // less power (hold)
  },

  // On-screen text
  text: {
    paused: 'PAUSED — ENTER to resume',                                   // canvas label while paused
    controls: '← → aim | ↑ ↓ power | SPACE throw | ENTER pause | R reset aim | ESC new game', // hint under canvas
    restart: 'Press SPACE / ENTER to play again',                            // end screen hint
  },
};
