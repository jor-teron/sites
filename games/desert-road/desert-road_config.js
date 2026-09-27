/*
 * Desert Drive (desert-road) — configuration.
 * Speeds, difficulty ramp, car, obstacles, colors, ranks, keys and text.
 * desert-road_logic.js reads everything from DESERT_ROAD_CONFIG.
 */
const DESERT_ROAD_CONFIG = {
  // Goal
  winScore: 100,                 // points needed to finish

  // Starting values
  start: {
    score: 0,                    // initial score
    speed: 4,                    // initial scroll speed (px per frame at 60fps)
    spawnInterval: 50,           // frames between spawns when a run starts
    idleSpawnInterval: 45,       // spawn interval value before the first run
  },

  // Difficulty ramp (applied every frame from elapsed seconds)
  difficulty: {
    speedPerSecond: 0.08,        // scroll speed gained per second
    maxExtraSpeed: 3,            // cap on extra speed
    spawnDecayPerSecond: 0.4,    // spawn interval shrinks this much per second
    minSpawnInterval: 28,        // fastest spawn interval (frames)
    spawnChance: 0.85,           // chance an obstacle actually spawns on each interval
  },

  // Player car
  car: {
    width: 46,                   // car width in px
    height: 70,                  // car height in px
    bottomOffset: 130,           // car center distance from bottom of screen
    moveSpeed: 7,                // target x change per frame while steering
    follow: 0.25,                // smoothing factor toward target x (0..1)
    edgeMargin: 8,               // keep car this far from screen edges
    cornerRadius: 8,             // body corner radius
    windshieldInset: 8,          // windshield side inset
    windshieldTop: 10,           // windshield distance from car top
    windshieldHeight: 20,        // windshield height
  },

  // Obstacles
  obstacles: {
    spawnMargin: 30,             // keep spawns this far from screen sides
    spawnAbove: 10,              // extra px above the top edge when spawning
    hitPad: 6,                   // collision forgiveness in px (both boxes)
    // Types — family friendly, desert themed
    types: [
      { emoji: '🌵', w: 34, h: 48, points: 1 },
      { emoji: '🐫', w: 48, h: 46, points: 2 },
      { emoji: '🐍', w: 36, h: 26, points: 2 },
      { emoji: '🪨', w: 40, h: 34, points: 1 },
      { emoji: '🦂', w: 34, h: 26, points: 3 },
    ],
  },

  // Road drawing
  road: {
    widthFraction: 0.9,          // road width as fraction of screen width
    maxWidth: 520,               // road width cap in px
    stripePeriod: 60,            // center stripe scroll period (px)
    idleScroll: 2,               // stripe scroll speed on the idle screen
    edgeDash: [12, 10],          // road edge dash pattern
    edgeWidth: 3,                // road edge line width
    stripeDash: [26, 34],        // center stripe dash pattern
    stripeWidth: 5,              // center stripe line width
  },

  // Colors
  colors: {
    sandTop: '#e8b96a',          // background gradient top
    sandBottom: '#d99f52',       // background gradient bottom
    road: '#c98a45',             // road surface
    roadEdge: '#8a5a2b',         // dashed road edges
    stripe: '#f4e0b0',           // center stripe
    carShadow: 'rgba(0,0,0,0.25)', // car shadow
    carBody: '#d63c3c',          // car body
    windshield: '#8fd0ff',       // car windshield
  },

  // Ranks by finish time (first match wins)
  ranks: [
    { maxSeconds: 20, rank: '🥇 Gold', message: 'Lightning fast!' },
    { maxSeconds: 30, rank: '🥈 Silver', message: 'Great driving!' },
    { maxSeconds: 45, rank: '🥉 Bronze', message: 'Nice work!' },
    { maxSeconds: Infinity, rank: '🏁 Finished', message: 'You made it!' },
  ],

  // Key bindings — matched against KeyboardEvent.code OR .key.
  // Hub / phone controller: D-pad = arrows, A = Space, Start = Enter, Select = Escape
  keys: {
    left: ['ArrowLeft', 'KeyA', 'a', 'A'],    // steer left (hold)
    right: ['ArrowRight', 'KeyD', 'd', 'D'],  // steer right (hold)
    start: ['Enter', 'Space', ' '],           // start a run; Enter also pauses / resumes (Start / A)
    pause: ['Enter', 'KeyP', 'p', 'P'],       // pause / resume while driving (Start / P)
    restart: ['Escape', 'KeyR', 'r', 'R'],    // restart the run (Select / R)
  },


  // On-screen text (HTML allowed)
  text: {
    winTitle: 'You made it! 🎉',      // overlay heading on win
    winButton: 'Drive Again',         // button on win
    crashTitle: '💥 Crash!',          // overlay heading on crash
    crashBody: 'You scored <strong>{score}</strong> points.<br>Try again!', // {score} replaced
    crashButton: 'Try Again',         // button on crash
    paused: 'PAUSED — Enter to resume', // canvas label while paused
  },
};
