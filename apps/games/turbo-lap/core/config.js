/* Turbo Lap — every tunable lives here. Units: world units (road half-width = roadWidth), seconds. */
window.TL = window.TL || {};
TL.CFG = {
  storagePrefix: 'turbo-lap.',

  // Road / camera
  segmentLength: 200,      // world length of one road segment
  rumbleLength: 3,         // segments per rumble-strip colour band
  roadWidth: 2000,         // half the road width
  lanes: 3,
  fieldOfView: 100,        // degrees
  cameraHeight: 1000,
  drawDistance: 300,       // segments drawn ahead
  fogDensity: 5,

  // Player physics (speeds in world units per second)
  maxSpeed: 12000,         // ~ one segment per 1/60 s
  accel: 12000 / 5,        // 0 -> max in ~5 s
  braking: -12000,
  decel: -12000 / 5,       // coasting
  offRoadDecel: -12000 / 2,
  offRoadLimit: 12000 / 4,
  steerRate: 2.0,          // road half-widths per second at full speed
  centrifugal: 0.3,
  maxOffset: 2.4,          // how far off the road (in half-widths) the car may wander
  kmhAtMax: 240,           // displayed speed at maxSpeed

  // Nitro
  nitro: {
    boost: 1.3,            // top-speed multiplier while active
    accelBoost: 2.2,       // acceleration multiplier while active
    burnRate: 0.5,         // tank fraction used per second (full tank = 2 s)
    rechargeRate: 0.12,    // tank fraction refilled per second when not boosting
    minToStart: 0.15       // need at least this much to light it
  },

  // Bumps
  bump: {
    carWidth: 0.25,        // car width as a fraction of road half-width (collision)
    playerSlow: 0.75,      // player speed multiplier on rear-ending a car
    aiSlow: 0.85,          // AI speed multiplier when bumped
    sideKick: 0.12,        // lateral push on a side bump
    sprite: 0.35           // speed multiplier on hitting a roadside object
  },

  // Themes (TLQ1b): ten code-drawn looks (assets/themes/). Storage key 'theme' = 'auto' or a theme id.
  // Auto picks by circuit number: the theme at index (circuit mod 10) of `cycle`. Circuit 50 (Coastline Loop) = Coastline.
  themes: {
    auto: 'auto',
    cycle: ['coast', 'desert', 'snow', 'night', 'autumn', 'tropical', 'volcano', 'canyon', 'space', 'candy'],
    handMadeCircuit: 50, handMadeTheme: 'coast'
  },

  // Circuits: 100 generated tracks (core/circuits.js). Circuit 50 is the hand-made Coastline Loop.
  circuits: {
    count: 100,
    defaultCircuit: 0,       // first visit: circuit 00 (attract mode)
    handMade: 50,            // circuit number that uses TL.TRACKS[0] (Coastline Loop) as-is
    lengthMin: 0.4,          // length at circuit 00, as a multiple of the Coastline Loop
    lengthMax: 1.6,          // length at circuit 99
    // [last circuit, laps]
    laps: [[9, 1], [29, 2], [54, 3], [79, 4], [99, 5]],
    podium: 3,               // finishing this high counts as a win
    curveMax: [2, 6, 7],     // strongest bend at circuit 00 / 50 / 99
    hillMax: [15, 40, 70],   // biggest hill (segments of height) at circuit 00 / 50 / 99
    slopeMax: [0.16, 0.28, 0.42],   // steepest average grade allowed (height segments per segment)
    // Opponents at circuit 50 are exactly CFG.opponents / CFG.ai; they move by these amounts across the range
    speedPer: 0.0011, skillPer: 0.0045, speedCap: [0.78, 0.99], skillCap: [0.25, 0.98],
    rubber: [0.02, 0.04, 0.08]
  },

  // Race
  laps: 2,                 // fallback only; each circuit sets its own lap count
  countdownStep: 0.9,      // seconds per 3-2-1 step
  gridSpacing: 5,          // segments between grid rows
  finishOverlayDelay: 1.6,

  // Opponents: speed = fraction of player maxSpeed, skill 0..1 (cornering + racing line)
  opponents: [
    { name: 'BLAZE', color: '#e8322d', speed: 0.93, skill: 0.85 },
    { name: 'VOLT',  color: '#2f6fe0', speed: 0.91, skill: 0.75 },
    { name: 'LIME',  color: '#3cbf3a', speed: 0.89, skill: 0.65 },
    { name: 'SUN',   color: '#f2c12e', speed: 0.87, skill: 0.55 }
  ],
  playerColor: '#f5f5f5',
  playerAccent: '#d01c8b',
  ai: {
    lookAhead: 20,         // segments to look ahead for cars to avoid
    curveSlow: 0.035,      // speed lost per unit curve, reduced by skill
    rubberBand: 0.04,      // max +/- speed adjustment based on gap to player
    steerRate: 1.2         // offset change per second
  },

  // Touch / phone controls
  touch: {
    autoGasDefaultTouch: true,   // auto-accelerate default on touch devices
    autoGasDefaultDesktop: false,
    pauseOnPortrait: true,
    hudTopCentreSpeed: true      // move the speed/nitro panel to the top centre so it clears the pedals
  },

  // Display / timing
  fpsDefault: 30,
  fpsOptions: [30, 60],
  maxDt: 0.1,

  colors: {
    skyTop: '#2a6fd6', skyBottom: '#a8d8ff',
    fog: '#c9e4f5',
    light: { road: '#6b6b6b', grass: '#3fa83a', rumble: '#e8e8e8', lane: '#e8e8e8' },
    dark:  { road: '#646464', grass: '#37992f', rumble: '#c8202a', lane: null },
    start: { road: '#ffffff', grass: '#3fa83a', rumble: '#ffffff', lane: null },
    mountainsFar: '#7b9cc8', mountainsNear: '#4f7a5a', hills: '#3c8a3a'
  }
};
