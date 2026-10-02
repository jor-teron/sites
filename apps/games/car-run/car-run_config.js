/**
 * Car Run — configuration.
 * Speeds, lanes, jump/nitro, spawn rates, sizes, colors, keys and text.
 * car-run_logic.js reads everything from CAR_RUN_CONFIG.
 */
const CAR_RUN_CONFIG = {
  bestKey: 'car-run-best',     // localStorage key for the best score

  // Track / camera
  track: {
    lanes: 3,                  // number of lanes
    laneSpacing: 0.72,         // world units between lane centers
    drawDist: 80,              // how many road segments to draw ahead
    roadHalfWidth: 1.0,        // half road width in world units
    cameraHeight: 1.15,        // camera Y in world units
    horizonFrac: 0.55,         // vanishing point Y as fraction of screen height
    projScaleX: 0.55,          // horizontal projection scale (x W)
    projScaleY: 0.7,           // vertical projection scale (x H)
    nearClip: 0.15,            // don't draw closer than this (world z)
    playerAhead: 3.2,          // player z distance in front of the camera
  },

  // Starting values
  start: {
    lane: 1,                   // starting lane (0 = left)
    speed: 28,                 // initial speed
    nitro: 1,                  // nitro tank (0..1)
    coins: 0,                  // coins collected
    distance: 0,               // distance travelled
    spawnZ: 55,                // first spawn position
  },

  // Speed control
  speed: {
    max: 55,                   // max base speed
    min: 14,                   // min base speed when braking
    accel: 18,                 // base speed gained per second while holding up
    brake: 28,                 // base speed lost per second while holding down
    cruiseAccel: 2,            // passive speed gain per second
    distanceBonusRate: 0.004,  // extra speed per unit of distance
    distanceBonusMax: 18,      // cap on distance speed bonus
    kmhFactor: 3.2,            // speed -> km/h display factor
  },

  // Nitro
  nitro: {
    multiplier: 1.55,          // speed multiplier while nitro is on
    drain: 0.35,               // tank drained per second
    refill: 0.08,              // tank refilled per second when off
  },

  // Jump
  jump: {
    duration: 0.55,            // seconds in the air
    cooldown: 1.1,             // seconds before next jump
    height: 0.85,              // peak height in world units
    clearHeight: 0.35,         // must be higher than this to clear obstacles
  },

  // Lane change smoothing
  laneAnimRate: 12,            // higher = snappier lane change

  // Spawning (difficulty)
  spawn: {
    lookAhead: 20,             // spawn this far past the draw distance
    obstacleChance: 0.45,      // roll below this -> obstacle
    coinChance: 0.85,          // roll below this (and above obstacle) -> coin row
    carVsBarrier: 0.5,         // chance an obstacle is a car (else barrier)
    coinRowMin: 3,             // minimum coins in a row
    coinRowExtra: 3,           // up to this many extra coins (random)
    coinSpacing: 1.4,          // z gap between coins
    gapBase: 10,               // base z gap between spawns
    gapRandom: 12,             // random extra gap
    gapShrinkPerDist: 800,     // gap shrinks by distance / this ...
    gapShrinkMax: 4,           // ... up to this much
  },

  // Collisions & scoring
  hitDepth: 1.1,               // z distance that counts as a hit / pickup
  coinScore: 25,               // score per coin (score = distance + coins * this)

  // Sizes (pixels at scale 1)
  sizes: {
    coinRadius: 28,            // coin radius
    coinMinRadius: 3,          // minimum coin radius on screen
    coinHeight: 0.35,          // coin float height (world units)
    barrierW: 70,              // barrier width
    barrierH: 50,              // barrier height
    carW: 80,                  // traffic car width
    carH: 55,                  // traffic car height
    playerW: 90,               // player car width
    playerH: 70,               // player car height
    playerScale: 2.2,          // extra size multiplier for the player car (visibility)
    laneMarkWidth: 6,          // lane mark width
    laneMarkLength: 1.2,       // lane mark length (world units)
    laneMarkEvery: 3,          // draw lane marks every N segments
    laneMarkX: [-0.36, 0.36],  // lane mark x positions (world units)
  },

  // Colors
  colors: {
    skyTop: '#0f172a',         // sky gradient top
    skyMid: '#1e293b',         // sky gradient middle
    skyBottom: '#334155',      // sky gradient at the horizon
    sunGlow: 'rgba(251,191,36,0.35)', // sun glow center
    sunGlowOuter: 'rgba(251,191,36,0)', // sun glow edge
    sunX: 0.7,                 // sun x as fraction of width
    sunY: 0.22,                // sun y as fraction of height
    sunRadius: 120,            // sun glow radius
    ground: '#14532d',         // ground fill below the horizon
    grassA: '#14532d',         // grass stripe A
    grassB: '#166534',         // grass stripe B
    roadA: '#1f2937',          // road stripe A
    roadB: '#111827',          // road stripe B
    laneMark: 'rgba(251,191,36,0.55)', // lane marks
    coin: '#fbbf24',           // coin outer
    coinInner: '#f59e0b',      // coin inner
    barrier: '#ef4444',        // barrier
    barrierStripe: '#fef3c7',  // barrier stripe
    car: '#3b82f6',            // traffic car body
    carGlass: '#93c5fd',       // traffic car glass
    carWheel: '#0f172a',       // traffic car wheels
    playerShadow: 'rgba(0,0,0,0.35)', // player shadow
    player: '#ef4444',         // player body
    playerNitro: '#f97316',    // player body while nitro is on
    playerGlass: 'rgba(147,197,253,0.85)', // player windshield
    playerOutline: 'rgba(255,255,255,0.75)', // player outline (visibility)
    nitroFlame: 'rgba(96,165,250,0.8)', // nitro flame
  },

  // Input
  input: {
    // After a tap/click starts the game, an Enter within this window is treated
    // as "start" (ignored) instead of pausing immediately. Clicking to focus the
    // hub iframe and then pressing Start would otherwise pause the new game.
    clickStartGraceMs: 1500,
  },

  // Key bindings — matched against KeyboardEvent.code OR .key. Phone D-pad: arrows, A=Space, B=KeyX, Start=Enter, Select=Escape
  keys: {
    left: ['ArrowLeft', 'KeyA'],     // lane left
    right: ['ArrowRight', 'KeyD'],   // lane right
    accel: ['ArrowUp', 'KeyW'],      // accelerate (hold)
    brake: ['ArrowDown', 'KeyS'],    // brake (hold)
    nitro: ['Space'],                // nitro (hold)
    jump: ['KeyX'],                  // jump
    start: ['Enter', 'KeyP'],        // start / pause / resume (Start / P)
    restart: ['Escape', 'KeyR'],     // back to title (Select / R)
  },

  // On-screen text
  text: {
    title: 'CAR RUN',                                   // title card heading
    pressStart: 'Press Start / Enter',                  // title / pause message
    titleSub: 'or tap / click',                         // title sub line
    paused: 'PAUSED',                                   // pause heading
    crash: 'CRASH!',                                    // game over heading
    help: '←→ lane · ↑ accel · ↓ brake · A nitro · B jump · Start pause · Select restart', // help line
  },
};
