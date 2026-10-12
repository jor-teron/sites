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
    hitDamage: 34,        // (legacy, unused) — see weapon.damage
    // Player bullet damage vs enemies (enemy HP 100). Same distance bands as the enemies' falloff:
    // full value at <= falloffNear units, linear down to the far value at >= falloffFar.
    damage: { bodyNear: 20, bodyFar: 10, headNear: 50, headFar: 15, falloffNear: 6, falloffFar: 24 },
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
    walkSpeed: 1.14,      // u/s approaching (player walks at 12)
    runSpeed: 2.2,        // u/s jog when far (> runDist) and out of sight; 0 = never run
    runDist: 12,
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
    fpsCap: 30,           // frame-rate cap (both maps); 0 = uncapped
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
    grenade: ['KeyG'],                  // throw a grenade
    mute: ['KeyM'],                     // toggle sound
    unlock: ['Escape', 'KeyP', 'Backquote'], // free the mouse
  },
  pickups: {
    interval: 60,      // seconds between medkit spawns
    firstDelay: 60,    // first medkit after this many seconds
    maxOnMap: 2,       // max medkits alive at once
    lifetime: 60,      // despawn after this many seconds
    blinkTime: 5,      // blink during the last N seconds
    blinkHz: 4,
    heal: 30,          // HP restored (capped at max health)
    pickRadius: 0.9,   // horizontal distance to pick up
    minPlayerDist: 4,  // don't spawn right on top of the player
    clearance: 0.6,    // keep this far from cover/walls
    hoverY: 0.35, bobAmp: 0.07, spinSpeed: 1.4,
    flashMs: 220, popMs: 900,
  },
  // Grenades (G to throw)
  grenades: {
    start: 5,          // grenades at game start / Retry
    max: 10,           // carry cap
    throwSpeed: 15,    // launch speed (u/s) along the look direction ...
    throwUp: 3.5,      // ... plus this much upward
    cooldown: 0.6,     // seconds between throws
    gravity: 20,
    radius: 0.09,      // physics radius
    bounce: 0.38,      // restitution on floor / walls / cover
    friction: 0.72,    // horizontal speed kept per floor bounce
    fuse: 2.5,         // seconds from throw to boom
    blastRadius: 4,    // damage radius (world units)
    fullRadius: 1.2,   // full damage inside this radius, linear falloff to 0 at blastRadius
    damage: 150,       // enemy damage at the centre (enemy HP 100)
    selfDamage: 35,    // player damage at the centre (modest), same falloff
    needsLineOfSight: true, // walls / cover block the blast
    fxTime: 0.6,       // explosion effect duration
  },
  grenadePickups: {
    interval: 45, firstDelay: 45, maxOnMap: 2, lifetime: 60, blinkTime: 5, blinkHz: 4,
    amount: 2,         // grenades per pickup (capped at grenades.max)
    pickRadius: 0.9, minPlayerDist: 4, clearance: 0.6,
    hoverY: 0.3, bobAmp: 0.07, spinSpeed: 1.4, flashMs: 220, popMs: 900,
  },
  // Island map (start screen: Training Camp | Island). Everything scales from `radius`.
  island: {
    radius: 40,          // shoreline radius (m). Try 50 for a bigger island.
    seed: 1337,          // prop layout / hills seed
    beachFrac: 0.8,      // beach ring starts at radius * beachFrac
    beachHeight: 0.45,   // beach height at its inner edge (slopes to 0 at the waterline)
    hillHeight: 3.2,     // max extra height of inland hills
    wetWidth: 1.6,       // wet-sand strip width at the waterline
    seaSlope: 0.28, seaDepth: 1.6, seaApron: 10,   // underwater slope outside the shore
    wade: 2.2,           // player can wade this far into the sea, then is blocked
    waterSlow: 0.6,      // move speed multiplier while wading
    terrainCell: 1,      // terrain mesh resolution (m)
    waterLevel: 0, waterSegments: 40, oceanExtra: 90, waveHeight: 0.06,
    startFrac: 0.86,     // player starts on the south beach at z = radius * startFrac, facing north
    startClear: 5,       // no props this close to the start
    palmDensity: 0.016, rockDensity: 0.006, bushDensity: 0.02,   // per m² (scales with area)
    propShadows: true,   // palms / rocks cast shadows (shadow box follows the player)
    colors: { sand: 0xe8d6a6, wetSand: 0xb39b6e, seabed: 0x2f8f8c, grass: 0x7fb24e, forest: 0x4a7a32, water: 0x1f9eb8 },
    scene: {             // overrides for scene.* on this map (island-demo look)
      background: 0x8ec8ea, fogNear: 30, fogFar: 120,
      sunColor: 0xffe2b8, sunIntensity: 2.8, hemiSky: 0xcfeaff, hemiGround: 0x7a6a48, hemiIntensity: 1.0,
      ambientIntensity: 0.6,
    },
  },
  maps: { default: 'camp', storageKey: 'browser-fps-map' },   // 'camp' | 'island'

  // Effects (both maps). quality: 'high' | 'low' (phones) — or ?quality=low in the URL. Presets override the base values.
  fx: {
    quality: 'high',
    presets: {
      high: { maxParticles: 600, particleMult: 1, maxDecals: 48, water: 'reflect' },
      low:  { maxParticles: 220, particleMult: 0.5, maxDecals: 0, water: 'simple' },
    },
    decalSize: 0.06, decalLife: 12,                 // bullet marks: radius (m), seconds before fading out
    enemyLights: 2, enemyFlashColor: 0xffb060, enemyFlashIntensity: 3, enemyFlashRange: 7, enemyFlashTime: 0.06,
    muzzleSmoke: { count: 3, speed: 0.7, spread: 0.5, up: 0.4, size: 0.07, life: 0.4, gravity: -0.4, drag: 2.5, grow: 2.2, alpha: 0.22, colors: [0xcfcfcf, 0xb8b8b8] },
    // Impact layers by surface: count, speed (m/s), spread, up bias, size (m), life (s), gravity, drag, grow, alpha, colors
    surfaces: {
      sand:     { layers: [{ count: 9, speed: 1.6, spread: 0.7, up: 0.8, size: 0.16, life: 0.7, gravity: 1.5, drag: 3, grow: 1.8, alpha: 0.7, colors: [0xe2cf9c, 0xd4bf88, 0xf0e2b8] },
                           { count: 6, speed: 3.2, spread: 0.6, up: 1.0, size: 0.03, life: 0.45, gravity: 9, drag: 0.5, colors: [0xcbb47c] }],
                  mark: { color: 0x9c8658, opacity: 0.55 } },
      dirt:     { layers: [{ count: 8, speed: 1.4, spread: 0.7, up: 0.7, size: 0.15, life: 0.7, gravity: 1.2, drag: 3, grow: 1.8, alpha: 0.65, colors: [0x8a7458, 0x7a6448, 0x9a8668] },
                           { count: 5, speed: 3, spread: 0.6, up: 0.9, size: 0.03, life: 0.45, gravity: 9, drag: 0.5, colors: [0x5a4a36] }],
                  mark: { color: 0x2a2218, opacity: 0.6 } },
      grass:    { layers: [{ count: 7, speed: 1.3, spread: 0.7, up: 0.7, size: 0.14, life: 0.6, gravity: 1.2, drag: 3, grow: 1.6, alpha: 0.6, colors: [0x8a7a58, 0x7a6a4a] },
                           { count: 6, speed: 2.6, spread: 0.8, up: 1.0, size: 0.035, life: 0.6, gravity: 6, drag: 1, colors: [0x5f9a3c, 0x4a7f2c, 0x77ad4a] }],
                  mark: { color: 0x2c3a1c, opacity: 0.5 } },
      rock:     { layers: [{ count: 6, speed: 4.5, spread: 0.8, up: 0.4, size: 0.055, life: 0.6, gravity: 9, drag: 0.4, colors: [0x8d887f, 0x6e6a62, 0xaaa59b] },
                           { count: 3, speed: 6, spread: 0.9, size: 0.04, life: 0.14, gravity: 2, drag: 1, colors: [0xffe9a0, 0xffc860] },
                           { count: 3, speed: 0.8, spread: 0.6, up: 0.4, size: 0.2, life: 0.75, gravity: 0.3, drag: 3, grow: 2, alpha: 0.6, colors: [0xb5b0a6] }],
                  mark: { color: 0x2e2c28, opacity: 0.75 } },
      concrete: { layers: [{ count: 6, speed: 4, spread: 0.8, up: 0.4, size: 0.055, life: 0.6, gravity: 9, drag: 0.4, colors: [0xb8bab4, 0x9a9c96] },
                           { count: 3, speed: 6, spread: 0.9, size: 0.04, life: 0.14, gravity: 2, drag: 1, colors: [0xffe9a0, 0xffc860] },
                           { count: 4, speed: 0.8, spread: 0.6, up: 0.4, size: 0.22, life: 0.8, gravity: 0.3, drag: 3, grow: 2, alpha: 0.65, colors: [0xcfd0ca] }],
                  mark: { color: 0x34322e, opacity: 0.75 } },
      brick:    { layers: [{ count: 7, speed: 4, spread: 0.8, up: 0.4, size: 0.055, life: 0.6, gravity: 9, drag: 0.4, colors: [0xa04a32, 0x8a3a26, 0xc06a4a] },
                           { count: 2, speed: 6, spread: 0.9, size: 0.04, life: 0.14, gravity: 2, drag: 1, colors: [0xffe0a0] },
                           { count: 4, speed: 0.8, spread: 0.6, up: 0.4, size: 0.22, life: 0.8, gravity: 0.3, drag: 3, grow: 2, alpha: 0.65, colors: [0xc89a84] }],
                  mark: { color: 0x2a1a14, opacity: 0.75 } },
      wood:     { layers: [{ count: 7, speed: 3.2, spread: 0.8, up: 0.5, size: 0.055, life: 0.7, gravity: 8, drag: 0.6, colors: [0x6a4a2a, 0x8a6a45, 0xb08a5a] },
                           { count: 2, speed: 0.6, spread: 0.6, up: 0.3, size: 0.1, life: 0.5, gravity: 0.5, drag: 3, grow: 1.5, alpha: 0.4, colors: [0xa89070] }],
                  mark: { color: 0x2a1c10, opacity: 0.8 } },
    },
    hit: {   // enemy hit puffs (no gore): body = grey-white fabric dust, head = brighter + a quick white/yellow spark ring
      body: [{ count: 6, speed: 1.2, spread: 0.8, up: 0.3, size: 0.12, life: 0.4, gravity: 0.5, drag: 3, grow: 1.5, alpha: 0.6, colors: [0xd8d8d0, 0xbfbfb5] }],
      head: [{ count: 8, speed: 1.6, spread: 0.9, up: 0.4, size: 0.14, life: 0.45, gravity: 0.5, drag: 3, grow: 1.7, alpha: 0.75, colors: [0xffffff, 0xe8e8e0] },
             { count: 6, speed: 4, spread: 1.2, size: 0.03, life: 0.18, gravity: 1, drag: 1, colors: [0xfff4b0, 0xffffff] }],
    },
    water: {   // island ocean ('reflect' quality): sky reflection + shimmer
      skyTop: 0x5fa8e0, skyHorizon: 0xa8d4ee, sunDir: [0.45, 0.55, 0.3], shimmer: 0.05, shimmerSpeed: 1.2, roughness: 0.1, opacity: 0.88, reflect: 0.45,
    },
  },

  // Sound (Web Audio, procedural). M toggles mute (saved in localStorage).
  audio: {
    masterVolume: 0.7,
    storageKey: 'browser-fps-muted',
    maxVoices: 14,      // max sounds playing at once (oldest cut)
    refDist: 3,         // positional sounds: full volume within this distance ...
    maxDist: 45,        // ... silent beyond this
    stepEvery: 2.6,     // footstep every N units walked
    volumes: { shot: 0.55, dryClick: 0.6, reload: 0.6, enemyShot: 0.5, hitBody: 0.5, hitHead: 0.6, enemyDeath: 0.5,
      hurt: 0.7, playerDeath: 0.8, grenadeThrow: 0.6, grenadeBounce: 0.5, explosion: 1.0, medkit: 0.6, grenadePickup: 0.6, footstep: 0.25 },
    minGap: { shot: 0.05, grenadeBounce: 0.06, hurt: 0.08, footstep: 0.12, dryClick: 0.15 },          // per-sound rate limit (s)
    voiceLen: { reload: 1.4, explosion: 1.3, playerDeath: 2, enemyDeath: 0.8 },                     // voice slot hold time (s)
  },
  // Which model module to use for each asset slot (see assets/README.md).
  // A value is a built-in id ('guns/rifle_hq') or { glb: 'assets/…/model.glb', fallback: 'guns/rifle_hq', scale: 1 }.
  assets: {
    gun: 'guns/rifle_hq',
    arms: 'characters/arms_hq',
    enemy: 'enemies/soldier_mk3',         // or 'enemies/soldier_mk2' / 'enemies/soldier_hq' / 'enemies/humanoid_basic'
    medkit: 'pickups/medkit_basic',
    grenade: 'weapons/grenade_frag',           // thrown grenade
    grenadePickup: 'pickups/grenade_crate',    // grenade pickup on the map
    sounds: 'sounds/procedural',
    palm: 'props/palm_tree', bush: 'props/bush_round', rock: 'props/rock_boulder',   // island props               // sound pack (Web Audio synth, no files)
    // Procedural textures (assets/textures/*); null = plain colours
    textures: {
      floor: 'textures/floor_concrete',
      wall: 'textures/wall_brick',
      cover: 'textures/cover_concrete_block',
      island: 'textures/island_ground',   // island terrain grain (over vertex colours)
    },
  },
};
