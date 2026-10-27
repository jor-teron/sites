/*
 * Tennis Ball Blitz — configuration.
 * All tunable numbers, colors, target pool, ranks, keys and text.
 * All modules read everything from TENNIS_THROW_CONFIG (TB2: speeds are per second).
 */
const TENNIS_THROW_CONFIG = {
  // TB8: goals are per round (see rounds / difficulty below)

  // Starting values
  start: {
    score: 0,                // initial score
    aimAngle: 45,            // initial aim angle in degrees (0 = right, 180 = left)
    aimPower: 0.75,          // TB8: initial power (0..1); the default throw reaches the target band
  },

  // Physics
  physics: {
    // TB6: per-second units, slower and floatier than TB2 (1260/1260).
    // Apex rise = speed²/(2·gravity) ≈ 645px at full power straight up.
    gravity: 700,            // px/s² added to ball vy
    ballSpeed: 950,          // px/s at full power
    wallBounce: 0.6,         // TB6: side walls reflect vx times this (damping)
    reachFraction: 0.85,     // TB1: targets spawn no higher than this share of the max rise, so all are reachable
  },

  // Aim controls
  aim: {
    angleMin: 10,            // TB5: minimum angle (degrees), no flat throws
    angleMax: 170,           // TB5: maximum angle (degrees)
    angleSpeed: 90,          // TB5: degrees per second while an aim key is held
    powerMin: 0.1,           // minimum power
    powerMax: 1,             // maximum power
    powerSpeed: 1.0,         // TB5: power per second while a power key is held
    previewSeconds: 1.0,     // TB6: dotted arc shows this much flight time
    previewDotEvery: 0.05,   // TB2: one dot per this many seconds of flight
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
    marginTop: 60,           // minimum y (under the HUD)
    minRiseAbove: 110,       // TB8: lowest targets sit this far above the launch point
    bobAmp: 28,              // TB8: px up/down for bobbing targets (later rounds)
    bobSpeed: 1.6,           // TB8: radians per second of the bob
    radius: 25,              // default target radius
    starRadius: 15,          // radius for 'star' targets
    // Pool: how many of each target type are on screen, their points and look
    minGap: 70,              // TB3: minimum distance between target centres
    birdClearance: 45,       // TB3: non-bird targets keep this far (vertically) from bird flight rows
    spawnTries: 30,          // TB3: random positions tried before accepting the last one
    pool: [
      { type: 'balloon', points: 5, emoji: '🎈', count: 4 },
      { type: 'bullseye', points: 10, emoji: '◎', count: 2 },
      { type: 'bird', points: 15, emoji: '🐦', count: 2, speed: 60 }, // TB2: speed in px/s (was 1 px/frame),
      { type: 'star', points: 20, emoji: '⭐', count: 2 },
      { type: 'gift', points: 25, emoji: '🎁', count: 1 },
    ],
  },

  // TB2: frame clock
  loop: {
    fps: 30,                 // fixed simulation and draw rate (TB4/GS1: default; Games settings fpsLimit overrides)
    maxCatchUpSteps: 5,      // after a stall, simulate at most this many steps at once
  },

  // TB2: touch / mouse drag-to-aim
  drag: {
    style: 'slingshot',      // TB5: 'slingshot' = pull back, throw goes opposite the drag; 'forward' = legacy TB2 drag-forward
    minPx: 15,               // shorter drags are taps (no throw)
    bandMaxPx: 120,          // TB5: longest pull-back band drawn from the launch point
    fullPowerPx: 220,        // drag length (canvas px) that gives full power
    lineColor: 'rgba(255,255,255,0.7)',
  },

  // TB1: throw limits (stop Space spam)
  throwing: {
    cooldownMs: 250,         // minimum time between throws
    maxBallsInAir: 2,        // no new throw while this many balls are flying
  },

  // TB4/GS1: Games settings 'difficulty' (apps/games/common/settings). Applied at each new game.
  // TB8: goalScale scales each round's goal, roundSeconds is the time per round.
  difficulty: {
    easy:   { goalScale: 0.8, roundSeconds: 40, birdSpeedScale: 0.6, extraCount: { balloon: 1 } },
    normal: { goalScale: 1.0, roundSeconds: 35, birdSpeedScale: 1.0, extraCount: {} },
    hard:   { goalScale: 1.3, roundSeconds: 30, birdSpeedScale: 1.4, extraCount: { balloon: -1 } },
  },

  // TB8: rounds. Goal for round n = (goalBase + goalStep·(n-1)) · goalScale.
  rounds: {
    goalBase: 60,            // points needed in round 1 (normal)
    goalStep: 25,            // extra points per later round
    bobFromRound: 2,         // balloons / bullseyes / stars bob up and down from this round
    birdSpeedPerRound: 0.15, // birds get this much faster each round (×)
    bobPerRound: 0.2,        // bob speed grows this much each round (×)
    betweenSeconds: 1.8,     // 'Round n' banner time before play resumes
  },

  // TB8: combo multiplier. Consecutive hits raise it; a ball that misses resets it.
  combo: { step: 0.5, max: 3 },  // ×1, ×1.5, ×2 ... up to ×3

  // TB9: hit effects (kept modest for weak phones) and sound
  fx: { particlesPerHit: 10, maxParticles: 40, particleSpeed: 220, particleLife: 0.6, textLife: 0.9 },
  sound: { volume: 0.25 },   // × Games settings masterVolume

  bestKey: 'tennisThrow.best',   // TB8: localStorage key for the best score

  // TB4/GS1: hit feedback and dark theme (theme 'dark' in Games settings)
  vibrateMs: 30,             // navigator.vibrate length on a hit (if 'vibration' is on)
  darkColors: { skyTop: '#0b1a33', skyBottom: '#2a3f66' },

  // TB8: ranks by the round reached (first match wins)
  ranks: [
    { minRound: 8, name: 'GOLD', emoji: '🥇' },
    { minRound: 5, name: 'SILVER', emoji: '🥈' },
    { minRound: 3, name: 'BRONZE', emoji: '🥉' },
    { minRound: 0, name: 'GOOD TRY', emoji: '🎾' },
  ],

  // Colors
  colors: {
    skyTop: '#87CEEB',                    // background gradient top (and clear color)
    skyBottom: '#E0F6FF',                 // background gradient bottom
    trail: 'rgba(255, 200, 0, 0.5)',      // ball trail
    ball: '#FFD700',                      // ball fill
    ballOutline: '#FFA500',               // ball outline
    crosshair: 'rgba(255, 255, 255, 0.6)',// crosshair lines
    aimLine: 'rgba(255, 255, 100, 0.85)', // TB3: dotted predicted arc
    powerBarOutline: 'rgba(255, 255, 255, 0.8)', // power bar border
    targetFont: 'Arial',                  // font used for emoji targets
    ground: '#3f9b4a',                    // TB9: grass strip
    court: '#c96b3c',                     // TB9: clay court at the launcher
    courtLine: 'rgba(255,255,255,0.85)',  // TB9: court lines
    seam: '#ffffff',                      // TB9: tennis ball seam
    cloud: 'rgba(255,255,255,0.7)',       // TB9: clouds
  },

  // Key bindings — matched against KeyboardEvent.code OR .key.
  // Hub / phone controller: D-pad = arrows, A = Space, Start = Enter, Select = Escape
  keys: {
    throw: ['Space', ' ', 'a', 'A'],  // throw ball / play again when finished (A)
    start: ['Enter', 'KeyP', 'p', 'P'], // pause / resume; play again when finished (Start / P)
    restart: ['Escape'],              // new game (Select)
    resetAim: ['KeyR', 'r', 'R'],     // reset aim angle and power
    aimLeft: ['ArrowLeft'],           // aim further left = raise angle (hold)
    aimRight: ['ArrowRight'],         // aim further right = lower angle (hold)
    powerUp: ['ArrowUp'],             // more power (hold)
    powerDown: ['ArrowDown'],         // less power (hold)
  },

  // On-screen text
  text: {
    paused: 'PAUSED — ENTER to resume',
    pausedHint: 'ESC for a new game',                                      // TB3: second line on the pause screen
    pausedTouch: 'Tap to resume',                                          // TB2: touch hint on the pause screen
    startTouch: 'Pull back (drag away from the targets) and release to throw', // TB5: shown for the first seconds
    startHintSeconds: 4,                                                   // TB2: how long the start hint shows
    controls: '← → aim | ↑ ↓ power | SPACE throw | ENTER pause | R reset aim | ESC new game | Touch: pull back and release', // hint under canvas
    gameOver: 'TIME UP!',                                                  // TB8
    newBest: 'NEW BEST!',                                                  // TB8
    restart: 'Press SPACE / ENTER or tap to play again',                     // end screen hint (TB2: tap)
  },
};
