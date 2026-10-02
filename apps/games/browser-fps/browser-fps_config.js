/**
 * Browser FPS — configuration (classic script, loaded before the ES module).
 * browser-fps_logic.js (module, Three.js via import map) reads window.BROWSER_FPS_CONFIG.
 * Colors are hex numbers (0xRRGGBB) as used by Three.js.
 */
window.BROWSER_FPS_CONFIG = {
  // Player
  player: {
    height: 1.7,          // eye height (world units)
    radius: 0.35,         // collision radius
    moveSpeed: 12,        // walk/run speed
    sprintMult: 1.35,     // speed multiplier while Shift is held
    jumpVel: 9.5,         // jump velocity (floaty)
    gravity: 22,          // gravity
    mouseSens: 0.0022,    // mouse look sensitivity (radians per pixel)
    pitchLimitPad: 0.05,  // keep pitch this far from straight up/down
    maxHealth: 100,       // starting / max health
    start: [0, 8],        // spawn position [x, z]
  },

  // Weapon
  weapon: {
    fireRate: 0.1,        // seconds between shots
    magSize: 30,          // rounds per magazine
    reloadTime: 1.4,      // seconds to reload
    hitDamage: 34,        // damage per hit
    range: 100,           // raycast max distance
    tracerMaxDist: 80,    // tracer length cap
    tracerLife: 0.06,     // tracer lifetime (s)
    tracerColor: 0xffee88,// tracer color
    tracerOpacity: 0.85,  // tracer opacity
    flashColor: 0xffaa44, // muzzle flash light color
    flashIntensity: 4,    // muzzle flash intensity
    flashRange: 8,        // muzzle flash light distance
    flashTime: 0.05,      // muzzle flash duration (s)
    hitmarkerMs: 80,      // hitmarker display time
  },

  // Contact damage from enemies
  contact: {
    damage: 8,            // HP lost per touch
    cooldown: 0.8,        // seconds between touches per enemy
    rangeX: 0.7,          // touch distance on x
    rangeZ: 0.6,          // touch distance on z
    rangeY: 1.4,          // touch distance on y
    flashMs: 120,         // red damage flash time
  },

  // Arena
  arena: {
    w: 40,                // arena width
    d: 40,                // arena depth
    wallH: 6,             // outer wall height
    wallThickness: 0.5,   // outer wall thickness
    floorColor: 0x3a4a3a, // floor
    wallColorNS: 0x555a62,// north/south walls
    wallColorEW: 0x4e535b,// east/west walls
    // Cover boxes: [w, h, d, x, y, z, color]
    covers: [
      [3, 1.4, 1.2, -8, 0.7, -6, 0x8b6914],
      [2.5, 2.2, 2.5, 6, 1.1, 5, 0x6b4423],
      [4, 1.2, 1, 0, 0.6, 10, 0x5a6a4a],
      [1.5, 1.8, 3, -12, 0.9, 8, 0x7a5c3a],
      [2, 1.5, 2, 10, 0.75, -10, 0x4a5560],
      [5, 1.0, 1.5, 4, 0.5, -2, 0x6a5a4a],
      [1.8, 2.5, 1.8, -4, 1.25, 0, 0x8a3a2a],
      [3, 1.3, 3, 12, 0.65, 12, 0x3a5a6a],
      // Center ramp-like stack
      [2, 0.5, 4, -2, 0.25, -12, 0x4a5a4a],
      [2, 1.0, 3, -2, 0.5, -12.5, 0x4a5a4a],
      [2, 1.5, 2, -2, 0.75, -13, 0x4a5a4a],
    ],
  },

  // Enemies (static boxes)
  enemies: {
    size: [0.9, 2, 0.7],  // box size [w, h, d]
    specs: [
      { pos: [8, 1, -8], color: 0xcc3333, hp: 100 },
      { pos: [-10, 1, 4], color: 0xdd4422, hp: 100 },
      { pos: [0, 1, -14], color: 0xbb2222, hp: 100 },
      { pos: [14, 1, 2], color: 0xee5533, hp: 80 },
      { pos: [-6, 1, 14], color: 0xaa1111, hp: 100 },
      { pos: [5, 1.5, 8], color: 0xff6644, hp: 60 },
    ],
  },

  // Scene / camera / lights
  scene: {
    background: 0x1a1e24, // sky / clear color
    fogNear: 25,          // fog start
    fogFar: 70,           // fog end
    fov: 75,              // camera field of view
    near: 0.05,           // camera near plane
    far: 200,             // camera far plane
    maxPixelRatio: 2,     // renderer pixel ratio cap
    ambientColor: 0x8899aa, ambientIntensity: 0.55,   // ambient light
    sunColor: 0xfff0dd, sunIntensity: 1.1,            // directional light
    sunPos: [12, 28, 8],  // sun position
    shadowMapSize: 1024,  // shadow map resolution
    shadowExtent: 25,     // shadow camera half-size
    shadowFar: 60,        // shadow camera far plane
    hemiSky: 0x6688aa, hemiGround: 0x334422, hemiIntensity: 0.35, // hemisphere fill
  },

  // Key bindings (KeyboardEvent.code)
  keys: {
    forward: ['KeyW'],                  // move forward
    back: ['KeyS'],                  // move back
    left: ['KeyA'],                  // strafe left
    right: ['KeyD'],                  // strafe right
    jump: ['Space'],                    // jump
    sprint: ['ShiftLeft', 'ShiftRight'],// sprint
    reload: ['KeyR'],                   // reload
    unlock: ['Escape', 'KeyP', 'Backquote'], // free the mouse
  },
};
