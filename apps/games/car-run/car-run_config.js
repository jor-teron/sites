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
    // How much of the screen height the road (ground) takes, from the bottom.
    // 0.60 = horizon 40% from the top. Change this to move the horizon (e.g. 0.5 or 0.7).
    roadScreenFrac: 0.60,
    // Camera height is worked out per screen so the player car's rear bumper (on the
    // ground) sits near playerScreenFrac (fraction of screen height from the top), kept
    // between the min and max below. Higher camera = more roof visible.
    // Tall portrait screens hit the max, so there the car sits higher.
    playerScreenFrac: 0.94,
    cameraHeightMin: 1.1,      // world units
    cameraHeightMax: 2.6,      // world units (above this the cars look too stretched)
    projScaleX: 0.55,          // horizontal projection scale (x U, U = min(W, H * aspect))
    projScaleY: 0.44,          // vertical projection scale (x U); 0.44 * 1.6 = old 0.7 x H on a 16:10 screen
    aspect: 1.6,               // U = min(W, H * aspect): one scale for both axes, so portrait doesn't stretch
    nearClip: 0.15,            // don't draw closer than this (world z)
    playerAhead: 2.2,          // player z distance in front of the camera (closer = bigger car)
  },

  // Starting values
  start: {
    lane: 1,                   // starting lane (0 = left)
    speed: 12,                 // initial speed (world units/s; a car is ~1 unit long)
    nitro: 1,                  // nitro tank (0..1)
    coins: 0,                  // coins collected
    distance: 0,               // distance travelled
    spawnZ: 55,                // first spawn position
  },

  // Speed control
  speed: {
    max: 26,                   // max base speed
    min: 8,                    // min base speed when braking
    accel: 8,                  // base speed gained per second while holding up
    brake: 16,                 // base speed lost per second while holding down / swipe-down
    cruiseAccel: 0.4,          // passive speed gain per second (~35 s to cruise max)
    distanceBonusRate: 0.002,  // extra speed per unit of distance
    distanceBonusMax: 8,       // cap on distance speed bonus (normal top ~34)
    kmhFactor: 6,              // speed -> km/h display factor
  },

  // Nitro
  nitro: {
    multiplier: 1.3,           // speed multiplier while nitro is on (peak ~44)
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
    // Gaps are in SECONDS of driving at the current speed (z gap = speed * time)
    gapTimeBase: 0.9,          // base time gap between spawns
    gapTimeRandom: 0.8,        // random extra time
    gapTimeShrinkPerDist: 3000,// gap shrinks by distance / this ...
    gapTimeShrinkMax: 0.4,     // ... up to this many seconds
    gapTimeMin: 0.5,           // never closer than this
    gapMinZ: 3,                // and never closer than this many world units
  },

  // Collisions & scoring
  // Hitboxes come from the world sizes below (length along z, width along x).
  hitWidthFactor: 0.8,         // x overlap needed, as a fraction of the combined half widths (forgiveness)
  coinScore: 25,               // score per coin (score = distance + coins * this)

  // Sizes in WORLD UNITS (projected with the road math; lane spacing is 0.72)
  sizes: {
    coinRadius: 0.14,          // coin radius
    coinLen: 0.3,              // coin pickup length (z)
    coinMinRadius: 3,          // minimum coin radius on screen (px)
    coinHeight: 0.35,          // coin float height
    barrierW: 0.65,            // barrier width
    barrierH: 0.35,            // barrier height
    barrierLen: 0.4,           // barrier length (z)
    carW: 0.6,                 // traffic car width
    carH: 0.4,                 // traffic car height
    carLen: 1.0,               // traffic car length (z)
    playerW: 0.62,             // player car width (~15% of screen width at playerAhead 2.2)
    playerH: 0.42,             // player car height
    playerLen: 1.0,            // player car length (z)
    laneMarkWidth: 0.012,      // lane mark width
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
    sunY: 0.16,                // sun y as fraction of height (keep inside the sky: < 1 - roadScreenFrac)
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
    car: '#3b82f6',            // traffic car body (fallback)
    trafficPalette: ['#3b82f6', '#e5e7eb', '#22c55e', '#facc15', '#a855f7', '#475569'], // random traffic colours
    player: '#ef4444',         // player body
    playerNitro: '#f97316',    // player body while nitro is on
  },

  // Crash smoke: on crash the car bursts smoke, then keeps smoking while the
  // CRASH! screen shows. A new run starts clean. Offsets are relative to the car.
  smoke: {
    puffs: 7,                  // puffs per crash
    life: 1.0,                 // seconds each puff lives
    lifeRandom: 0.25,          // + up to this many extra seconds
    spreadX: 0.35,             // random horizontal start offset (world units)
    startY: 0.35,              // start height above the road
    offsetZ: 0.4,              // start ahead of the car centre (toward the hit)
    riseSpeed: 0.9,            // upward drift (units / s)
    driftX: 0.35,              // random sideways drift (units / s)
    radius: 0.14,              // start radius (world units)
    growth: 0.35,              // radius gained per second
    minRadius: 1.5,            // px floor so far puffs stay visible
    alpha: 0.55,               // start opacity, fades to 0
    color: '120,120,128',      // puff RGB
    maxPuffs: 40,              // cap on live puffs
    // Continuous smoke from the crashed car while the crash screen is up.
    trailInterval: 0.12,       // seconds between trail puffs
    trailScale: 0.6,           // trail puffs are this fraction of burst puff size
    trailZ: 0.9,               // trail puffs start at the hood (ahead of car centre)
  },

  // Input
  input: {
    // Touch / mouse gestures (pointer events, no on-screen buttons)
    swipeMin: 30,              // px of movement to count as a swipe
    holdMs: 220,               // press this long without moving = nitro (while held)
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
    help: '←→ lane · ↑ accel · ↓ brake · A nitro · B jump · Start pause · Select restart · Touch: swipe ←→ lane · swipe ↑ jump · swipe ↓ brake · hold nitro', // help line
  },
};
