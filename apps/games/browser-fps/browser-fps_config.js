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
    start: [0, 17],       // spawn position [x, z]: south end near the wall, facing north (-z)
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

  // Scope / aim down sights (hold right mouse button)
  scope: {
    zoom: 4,              // FOV zoom factor when fully scoped (75 -> 18.75)
    blendTime: 0.2,       // seconds to raise the gun / go in or out of scope
    sensMult: 0.25,       // mouse sensitivity multiplier while scoped (~1 / zoom)
    overlayStart: 0.7,    // scope overlay fades in over the last 30% of the raise
    hideGunAt: 0.98,      // viewmodel hidden once the scope is (almost) fully up
    moveMult: 0.55,       // walk speed multiplier while scoped (no sprint)
    hipSpread: 0.012,     // shot spread from the hip (rad, each axis)
    scopedSpread: 0.0015, // shot spread while scoped
  },

  // Contact damage from enemies
  contact: {
    damage: 8,            // HP lost per touch
    cooldown: 0.8,        // seconds between touches per enemy
    rangeX: 0.7,          // (unused since humanoid targets: contact = touching the target collider)
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
    floorColor: 0xd6dad2, // floor tint (multiplies the procedural floor texture)
    floorTileSize: 2,     // world units per floor tile (texture has 4 tiles)
    wallColorNS: 0x9aa1aa,// north/south walls
    wallColorEW: 0x8e959e,// east/west walls
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

  // Enemies: humanoid targets (browser-fps_target.js). NOTE: specs below are no longer used for placement
  // (spawn.initialEnemies are placed randomly in the far half); kept for reference.
  enemies: {
    specs: [
      { pos: [8, 1, -8], color: 0xcc3333, hp: 100 },
      { pos: [-10, 1, 4], color: 0xdd4422, hp: 100 },
      { pos: [0, 1, -14], color: 0xbb2222, hp: 100 },
      { pos: [14, 1, 2], color: 0xee5533, hp: 80 },
      { pos: [-6, 1, 14], color: 0xaa1111, hp: 100 },
      { pos: [5, 1, 8], color: 0xff6644, hp: 60 },   // was floating at y 1.5
    ],
  },

  // Spawning: a new humanoid every `interval` seconds (initial ones above stay)
  spawn: {
    initialEnemies: 2,    // enemies placed at random valid spots when a game starts / on Retry
    initialGap: 3.5,      // min spacing between the initial enemies
    farHalfMaxZ: 0,       // enemies only appear where z <= this (the half away from the player's start)
    interval: 15,         // seconds between spawns
    maxAlive: 8,          // never more than this many alive
    poolMax: 16,          // total target objects ever created (bodies are reused only after their corpse time)
    minPlayerDist: 6,     // spawn at least this far from the player
    coverMargin: 0.6,     // keep this clear of cover / walls
    targetGap: 1.6,       // keep this far from other targets
    edgeMargin: 1.5,      // keep this far inside the outer walls
    tries: 60,            // random positions to try per spawn
    hp: 100,              // spawned target HP
    colors: [0xcc3333, 0xdd4422, 0xbb2222, 0xee5533, 0xaa1111, 0xff6644],
  },

  // Enemy shooting AI
  ai: {
    range: 24,            // only shoot within this distance
    turnRate: 3.2,        // rad/s turning toward the player
    aimTolerance: 0.25,   // must face within this angle (rad) to shoot
    reaction: 1.0,        // seconds of continuous sight before the first shot
    cooldownMin: 1.6,     // seconds between shots ...
    cooldownRandom: 0.8,  // ... plus up to this
    spread: 0.06,         // random aim error (rad, each axis) - not perfect aim
    damageNear: 12,       // HP per hit at <= falloffNear units ...
    damageFar: 3,         // ... falling linearly to this at >= falloffFar units
    falloffNear: 6,
    falloffFar: 24,
    // Movement
    walkSpeed: 1.9,       // u/s approaching (player walks at 12)
    strafeSpeed: 0.8,     // u/s side-steps once in position
    strafeMinS: 1.5,      // strafe direction changes every 1.5 ..
    strafeMaxS: 3.0,      // .. 3 s (sometimes pausing)
    preferredDist: 7,     // stop approaching at about this distance (with line of sight)
    tooClose: 5,          // back off slowly if closer than this
    radius: 0.42,         // body radius for steering / collisions (matches the target collider)
    gridCell: 0.5,        // flow-field cell size (world units)
    fieldRefresh: 0.3,    // seconds between flow-field rebuilds
    moveSpreadMult: 2.5,  // aim spread multiplier while walking
    moveFireChance: 0.35, // chance to take a ready shot while walking (else waits)
    eyeHeight: 1.6,       // line-of-sight check height on the enemy
    tracerColor: 0xff6a4a,// enemy tracer color
    flashMs: 140,         // red screen flash when hit
  },

  // Scene / camera / lights
  scene: {
    background: 0x9ec6e6, // sky / clear color (bright daytime)
    fogNear: 35,          // fog start
    fogFar: 110,          // fog end
    toneMappingExposure: 1.05, // ACES filmic exposure
    fov: 75,              // camera field of view
    near: 0.05,           // camera near plane
    far: 200,             // camera far plane
    maxPixelRatio: 2,     // renderer pixel ratio cap
    ambientColor: 0x8899aa, ambientIntensity: 0.9,    // ambient light
    sunColor: 0xfff0dd, sunIntensity: 2.6,            // directional light
    sunPos: [12, 28, 8],  // sun position
    shadowMapSize: 1024,  // shadow map resolution
    shadowExtent: 25,     // shadow camera half-size
    shadowFar: 60,        // shadow camera far plane
    hemiSky: 0xcfe6ff, hemiGround: 0x6b6250, hemiIntensity: 1.1, // hemisphere fill
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
  pickups: {
    interval: 20,      // seconds between medkit spawns
    firstDelay: 20,    // first medkit after this many seconds
    maxOnMap: 2,       // max medkits alive at once
    lifetime: 30,      // despawn after this many seconds
    blinkTime: 5,      // blink during the last N seconds
    blinkHz: 4,
    heal: 35,          // HP restored (capped at max health)
    pickRadius: 0.9,   // horizontal distance to pick up
    minPlayerDist: 4,  // don't spawn right on top of the player
    clearance: 0.6,    // keep this far from cover/walls
    hoverY: 0.35, bobAmp: 0.07, spinSpeed: 1.4,
    flashMs: 220, popMs: 900,
  },
};
