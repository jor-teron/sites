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
    grenade: ['KeyG'],                  // hold to aim a grenade (arc preview), release to throw; right-click cancels
    mute: ['KeyN'],                     // toggle sound (M is now Explore/Fight)
    mode: ['KeyM'],                     // toggle Explore / Fight (where the map allows both)
    fpsCounter: ['F3'],                 // show / hide the FPS counter
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
    simStep: 1 / 120,  // fixed physics step (s) — live grenades and the aim preview use the same sim
    // Hold G to aim (rifle lowers, grenade raised, arc preview); release throws, right-click cancels
    preview: {
      points: 48,          // preallocated dots along the predicted arc (until the fuse)
      dotSize: 7,          // dot size in pixels (constant on screen)
      skipNear: 2,         // don't draw the first N dots (too close to the camera)
      color: 0xfff1b0,
      ringRadius: 0.6,     // landing ring at the predicted detonation point
      ringColor: 0xffb347,
    },
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
    palmDensity: 0.0096, rockDensity: 0.006, bushDensity: 0.012,   // per m² (scales with area). Was 0.016 / 0.02 (Map Visuals 1: ~40% fewer)
    // Open areas with no palms / bushes (rocks still allowed). x, z, r are fractions of radius; paths are segments of width w (m).
    clearings: [{ x: 0, z: 0.05, r: 0.2 }, { x: -0.45, z: -0.3, r: 0.16 }, { x: 0.42, z: 0.32, r: 0.14 }],
    paths: [{ from: [0, 0.86], to: [0, 0.05], w: 4 }, { from: [0, 0.05], to: [-0.45, -0.3], w: 3.5 }, { from: [0, 0.05], to: [0.42, 0.32], w: 3 }],
    wind: { strength: 0.22, bushStrength: 0.06, speed: 1.4, gust: 0.35 },   // vertex sway (m at the top), 0 = off
    propShadows: true,   // palms / rocks / bushes cast shadows (shadow box follows the player)
    // Map Visuals 2 (island only). Each block can be switched off with enabled: false.
    look: {
      softShadows: true, shadowRadius: 3, shadowBias: -0.0004, shadowNormalBias: 0.04, shadowSnap: true,   // PCFSoft, texel-snapped follow
      sky: { enabled: true, top: 0x3f86d0, horizon: 0xbfd9ea, sunGlow: 0xffe6b0, glowSize: 0.12, glowStrength: 0.6 },   // dome; horizon = fog colour
      flare: { enabled: true, size: 260, color: 0xfff1d0, ghosts: 4, ghostAlpha: 0.22, maxAlpha: 0.9 },   // sun glare sprites (fade when occluded / off-axis)
      grass: { enabled: true, clumps: 3600, flowers: 380, radius: 24, cell: 0.7, fadeStart: 15, height: 0.45, sway: 0.08,
               colors: [0x5f9a3a, 0x77ad44, 0x4c8530], flowerColors: [0xffffff, 0xffd84a, 0xff7aa8, 0xc49bff] },
    },
    colors: { sand: 0xe8d6a6, wetSand: 0xb39b6e, seabed: 0x2f8f8c, grass: 0x7fb24e, forest: 0x4a7a32, water: 0x1f9eb8 },
    scene: {             // overrides for scene.* on this map (island-demo look)
      // Map Visuals 2: warm low-ish sun to the north (start view faces it), soft shadows, haze that matches the sky horizon
      background: 0xbfd9ea, fogNear: 28, fogFar: 135,
      sunColor: 0xffd59a, sunIntensity: 3.1, sunPos: [16, 22, -30], hemiSky: 0xbfe0ff, hemiGround: 0x8a7650, hemiIntensity: 0.85,
      ambientIntensity: 0.35, toneMappingExposure: 1.0,
      shadowMapSize: 2048, shadowExtent: 32, shadowFar: 90,
    },
  },
  // Snow map (?map=snow): ~100×100 m valley, soft snow-bank boundary. Same look system as the island (look.*).
  snow: {
    half: 50,            // half size of the playable square (m)
    seed: 2026,
    bankWidth: 7, bankHeight: 6, walkIntoBank: 2.5,   // edge banks/cliffs: width, height; player can climb this far into them
    hillHeight: 3.4, terrainCell: 1, apron: 22,
    radius: 50, wade: 0, beachFrac: 0.86, waterLevel: -99,   // shared-code fields (world box, wading off)
    startFrac: 0.78, startClear: 6,
    lake: { x: -14, z: -4, r: 11, shore: 6, iceY: 0.05 },
    ice: { color: 0xdff2ff, roughness: 0.12, reflect: 1.0, texRepeat: 3, skyTop: 0x6d93c4, skyHorizon: 0xd8e6f2 },
    cabins: [{ x: 14, z: 6, w: 5, d: 4, yaw: 0 }, { x: 22, z: -14, w: 4.5, d: 3.8, yaw: Math.PI / 2 }, { x: -24, z: 22, w: 5.5, d: 4.2, yaw: Math.PI }, { x: 6, z: -28, w: 4.5, d: 4, yaw: -Math.PI / 2 }],
    pineDensity: 0.0075, bankPines: 70, rockDensity: 0.0028,   // per m² of the 100×100 square
    propShadows: true,
    wind: { strength: 0.16, speed: 1.1, gust: 0.4 },
    snowfall: { enabled: true, count: 2600, box: [36, 18, 36], speed: 1.1, drift: 0.35, size: 0.09, alpha: 0.95 },
    colors: { snow: 0xf4f8fc, snowShade: 0xb9cbe0, cliff: 0x6e7680, rock: 0x7d828a },
    scene: {             // cold blue-white light, soft shadows, haze
      background: 0xd3dfea, fogNear: 18, fogFar: 95,
      sunColor: 0xe6efff, sunIntensity: 2.2, sunPos: [-18, 20, -26], hemiSky: 0xd6e6ff, hemiGround: 0x9aa6b8, hemiIntensity: 1.0,
      ambientIntensity: 0.35, toneMappingExposure: 0.95, shadowMapSize: 2048, shadowExtent: 32, shadowFar: 90,
    },
    look: {
      softShadows: true, shadowRadius: 4, shadowBias: -0.0004, shadowNormalBias: 0.04, shadowSnap: true,
      sky: { enabled: true, top: 0x7c9cc8, horizon: 0xd3dfea, sunGlow: 0xf2f6ff, glowSize: 0.18, glowStrength: 0.35 },
      flare: { enabled: true, size: 200, color: 0xeef4ff, ghosts: 3, ghostAlpha: 0.12, maxAlpha: 0.6 },
      grass: { enabled: false },
    },
  },
  // Forest map (?map=forest): procedural 1 × 1 km summer forest (browser-fps_forest.js). Change `seed` for a new layout.
  forest: {
    seed: 4242,
    half: 500,           // half size of the 1 km square (m)
    apron: 90,           // terrain continues this far past the square (boundary hills, fog hides the end)
    fence: 482, fenceStep: 4, walkLimit: 478,   // post-and-rail fence line; the player is clamped just inside it
    radius: 500, wade: 0, beachFrac: 0.9,       // shared-code fields (world box)
    waterLevel: 0, waterSlow: 0.55,             // walking speed multiplier in the stream
    hills: { height: 10, scale: 230, octaves: 4 },   // gentle value-noise hills
    boundary: { start: 445, height: 38 },            // hills rise past this distance from the centre
    // stream: centre x = x + amp1·sin(z·2π/len1) + amp2·sin(z·2π/len2); half width width ± widthVar
    river: { x: 0, amp1: 70, len1: 520, amp2: 18, len2: 140, width: 3.2, widthVar: 1.3, depth: 0.75, bank: 3, valley: 55,
             floor: 0.55, edgeY: -0.04, waterY: 0 },
    water: { color: 0x3f8a92, opacity: 0.7, roughness: 0.18, reflect: 0.45, flow: 0.18, skyTop: 0x5f97d0, skyHorizon: 0xc6dcea },
    tracks: [{ z: -150, amp: 38, len: 420, w: 1.8 }, { z: 220, amp: 50, len: 560, w: 1.7 }],   // dirt tracks (east-west), half width w
    bridge: { width: 3.2, lift: 0.22, overhang: 1.5 },
    startBack: 38,       // start on the first track this far west of its bridge, facing it
    startClear: 10,
    clearings: [[-160, 40, 26], [180, -60, 30], [60, 330, 22], [-260, -300, 28], [300, 260, 24]],   // [x, z, r]
    trees: { pines: 380, broadleaf: 260, bushes: 520, rocks: 190, boundaryPines: 260,
             clusterScale: 120, clusterAt: 0.52, loneChance: 0.03 },   // groves where cluster noise > clusterAt
    // Terrain chunks + LOD: cell size (m) by distance from the camera (m). Chunks past viewDist are hidden.
    chunk: 64,
    lod: [{ dist: 40, cell: 1 }, { dist: 110, cell: 2 }, { dist: 220, cell: 4 }, { dist: 1e9, cell: 8 }],
    viewDist: 250, buildPerFrame: 1, buildMs: 3, freeFactor: 1.6, skirt: 1.5,   // build >= 1 chunk per frame, more while under buildMs
    propTile: 160, propViewDist: 215,    // props are instanced per tile; tiles past propViewDist are skipped
    aiWindow: 96, aiGridCell: 1, aiRecentre: 18,   // enemy flow-field window (m) + cell size around the player (Fight mode)
    spawnRing: [22, 42], despawnDist: 110,           // enemies appear 22–42 m away; ones left 110 m behind are recycled
    wind: { strength: 0.18, bushStrength: 0.05, speed: 1.2, gust: 0.35 },
    propShadows: true,
    colors: { grass: 0x6f9e45, grassDry: 0x9aa456, forestFloor: 0x4a6a2e, sand: 0xd9c690, bed: 0x8a7a55, dirt: 0x8a6c48, rock: 0x7f7a70,
              bush: 0x3d7a33, wood: 0x6b4a2e, deck: 0x8a6440 },
    look: {
      softShadows: true, shadowRadius: 3, shadowBias: -0.0004, shadowNormalBias: 0.04, shadowSnap: true,
      sky: { enabled: true, top: 0x4a8ad0, horizon: 0xc2d8e6, sunGlow: 0xfff0c8, glowSize: 0.14, glowStrength: 0.5 },
      flare: { enabled: true, size: 220, color: 0xfff4d8, ghosts: 3, ghostAlpha: 0.16, maxAlpha: 0.75 },
      grass: { enabled: false },   // island grass clumps are off here (cost scales with collider count)
    },
    scene: {
      background: 0xc2d8e6, fogNear: 55, fogFar: 240, far: 320,
      sunColor: 0xffe7c0, sunIntensity: 2.9, sunPos: [24, 30, -18], hemiSky: 0xcfe6ff, hemiGround: 0x5f6a3a, hemiIntensity: 0.9,
      ambientIntensity: 0.35, toneMappingExposure: 1.0, shadowMapSize: 1024, shadowExtent: 30, shadowFar: 90,
    },
  },
  maps: { default: 'camp', storageKey: 'browser-fps-map' },   // 'camp' | 'island' | 'snow' | 'forest'
  // Game modes per map: explore = no enemies/pickups/score, fight = full game. ?mode=explore|fight overrides.
  modes: {
    storageKey: 'browser-fps-mode',
    perMap: { island: { allowed: ['explore', 'fight'], default: 'explore' }, snow: { allowed: ['explore', 'fight'], default: 'explore' }, forest: { allowed: ['explore', 'fight'], default: 'explore' }, camp: { allowed: ['fight'], default: 'fight' } },
  },
  fpsCounter: { storageKey: 'browser-fps-show-fps', every: 0.5 },
  mapNames: { camp: 'Training Camp', island: 'Island', snow: 'Snow', forest: 'Forest' },
  // Doors between maps: each entry is one gate on `map` leading to `to`. The return spot on arrival is the gate on the
  // destination map whose `to` is the map you came from. pos [x, z] (m); face = direction the gate opens toward (player
  // spawns there, looking that way). Add rows here to link new maps.
  doors: {
    promptRadius: 3.2, triggerDepth: 0.35, spawnDist: 3, fadeMs: 600, key: 'KeyE', clear: 4,   // clear: no props this close
    styles: { tiki: { width: 2.2, height: 3.2, glow: 0xffb24a }, stone: { width: 2.4, height: 3.2, glow: 0x8fd8ff }, metal: { width: 2.4, height: 3.0, glow: 0x5cff9a } },
    list: [
      { id: 'island-snow', map: 'island', to: 'snow', pos: [-30, 22], face: [30, -22], style: 'tiki' },
      { id: 'island-camp', map: 'island', to: 'camp', pos: [30, 22], face: [-30, -22], style: 'tiki' },
      { id: 'snow-island', map: 'snow', to: 'island', pos: [-40, 28], face: [1, 0], style: 'stone' },
      { id: 'camp-island', map: 'camp', to: 'island', pos: [18.4, 3], face: [-1, 0], style: 'metal' },
    ],
  },

  // Effects (both maps). quality: 'high' | 'low' (phones) — or ?quality=low in the URL. Presets override the base values.
  fx: {
    quality: 'high',
    presets: {
      high: { maxParticles: 600, particleMult: 1, maxDecals: 48, water: 'reflect', look: true },
      low:  { maxParticles: 220, particleMult: 0.5, maxDecals: 0, water: 'simple', look: false },   // look: island grass / flare / sky dome
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
      snow:     { layers: [{ count: 10, speed: 1.5, spread: 0.8, up: 0.9, size: 0.17, life: 0.8, gravity: 1.2, drag: 3, grow: 1.8, alpha: 0.8, colors: [0xffffff, 0xeef4fa, 0xdfe8f2] },
                           { count: 6, speed: 3, spread: 0.6, up: 1.0, size: 0.03, life: 0.5, gravity: 8, drag: 0.5, colors: [0xffffff] }],
                  mark: { color: 0x8a9aae, opacity: 0.45 } },
      ice:      { layers: [{ count: 7, speed: 4, spread: 0.8, up: 0.5, size: 0.04, life: 0.5, gravity: 9, drag: 0.4, colors: [0xe8f6ff, 0xbfe2f2, 0xffffff] },
                           { count: 3, speed: 0.8, spread: 0.6, up: 0.4, size: 0.18, life: 0.6, gravity: 0.3, drag: 3, grow: 2, alpha: 0.5, colors: [0xf0f8ff] }],
                  mark: { color: 0xf4fbff, opacity: 0.7 } },
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
      skyTop: 0x5fa8e0, skyHorizon: 0xa8d4ee, sunDir: [0.39, 0.54, -0.74], shimmer: 0.07, shimmerSpeed: 1.2, roughness: 0.06, opacity: 0.9, reflect: 0.75,
      shallow: 0x46d6c8, deep: 0x0b4f7a, deepDist: 14,   // depth colour: turquoise at the shore -> deep blue deepDist m out
      shoreAlpha: 0.45, foam: 0.85, foamWidth: 1.3, fresnel: 0.3,   // see-through shallows, shoreline foam band, extra sky at grazing angles
    },
  },

  // Sound (Web Audio, procedural). N toggles mute (saved in localStorage).
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
    gun: 'guns/rifle_mk3',                // or 'guns/rifle_mk2' / 'guns/rifle_hq' / 'guns/rifle_basic'
    arms: 'characters/arms_mk2',          // or 'characters/arms_hq' / 'characters/arms_basic'
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
