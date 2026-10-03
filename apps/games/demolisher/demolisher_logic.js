/*
  File: demolisher_logic.js
  Project: Demolisher
  Purpose: Destructible-terrain sandbox. Matter.js moves the player and enemies.
           Terrain is a tile grid. Only nearby solid runs become static bodies.
           Every tunable value lives in demolisher_config.js (DEMOLISHER_CONFIG).
  Input:   keyboard / hub controller (arrows move, Up/W jump, Space fire, Q/E aim,
           X next weapon, 1-4 pick, Enter pause / start, Esc menu, hub-stick aim),
           mouse (aim + click fire), touch (floating sticks, FIRE / JUMP / pause).
  Hub:     sites hub bridge at the bottom (stats, buttons, rumble; body.in-hub).
  Depends: vendor/matter.min.js (Matter 0.19, local copy), demolisher.html ids, demolisher.css.
*/

(() => {
  'use strict';

  /* Matter pieces used by the sim. Engine drives contacts. Bodies are player and enemies. */
  const { Engine, Composite, Bodies, Body, Events } = Matter;

  /* ============================================================
     CONFIG (from demolisher_config.js)
     ============================================================ */
  const CFG = DEMOLISHER_CONFIG;
  const TX = CFG.text;
  const RUMBLE = CFG.rumble || {};
  const APP = CFG.APP || { name: 'Demolisher', version: '' };
  if (APP.name) document.title = APP.name;
  const fmt = (t, o) => String(t).replace(/\{(\w+)\}/g, (m, k) => (o && o[k] !== undefined ? o[k] : m));

  const WORLD_W = CFG.world.width;
  const WORLD_H = CFG.world.height;
  const TILE = CFG.world.tile;
  const GRID_W = Math.ceil(WORLD_W / TILE);
  const GRID_H = Math.ceil(WORLD_H / TILE);
  const GRAVITY = CFG.world.gravity;
  const PLAYER_W = CFG.player.w;
  const PLAYER_H = CFG.player.h;
  const PLAYER_SPEED = CFG.player.speed;
  const PLAYER_JUMP = CFG.player.jump;
  const MAX_HP = CFG.player.maxHp;
  /* Fixed sim step in seconds. Render stays on requestAnimationFrame. */
  const FIXED_DT = 1 / 60;
  const CHUNK = CFG.world.chunk;
  const MAX_CHUNK_REBUILDS = CFG.world.maxChunkRebuilds;
  /* Material ids. Zero is empty. */
  const MAT = { AIR: 0, DIRT: 1, GRASS: 2, STONE: 3, WATER: 4, CRATE: 5, METAL: 6, LAVA: 7, TARGET: 8 };
  const MAT_NAMES = { 1: 'dirt', 2: 'grass', 3: 'stone', 4: 'water', 5: 'crate', 6: 'metal', 7: 'lava', 8: 'target' };
  /* Per-material paint and durability. solid false means no chunk body. */
  const MAT_INFO = {};
  for (const id in MAT_NAMES) MAT_INFO[id] = CFG.materials[MAT_NAMES[id]];
  /* Weapon table (name added from the key). */
  const WEAPON_ORDER = CFG.weaponOrder;
  const WEAPONS = {};
  for (const k of WEAPON_ORDER) WEAPONS[k] = Object.assign({ name: k }, CFG.weapons[k]);
  function startAmmo() {
    const a = {};
    for (const k of WEAPON_ORDER) a[k] = WEAPONS[k].ammo === undefined ? Infinity : WEAPONS[k].ammo;
    return a;
  }

  /* ============================================================
     DOM
     ============================================================ */

  /* Main view. */
  const canvas = document.getElementById('game');
  /* 2D context. Device pixel ratio is applied in resize. */
  const ctx = canvas.getContext('2d');
  /* Stage box used to size the canvas. */
  const stage = document.getElementById('stage');
  /* HP number. */
  const hudHp = document.getElementById('hud-hp');
  /* Score number. */
  const hudScore = document.getElementById('hud-score');
  /* Remaining targets. */
  const hudTargets = document.getElementById('hud-targets');
  /* Living enemies. */
  const hudEnemies = document.getElementById('hud-enemies');
  /* HP chip. Gets class low under 30. */
  const statHealth = document.getElementById('stat-health');
  /* Ammo labels keyed by weapon id. */
  const ammoEls = {};
  for (const k of WEAPON_ORDER) ammoEls[k] = document.getElementById('ammo-' + k);
  /* Weapon bar buttons. */
  const weaponBtns = document.querySelectorAll('.weapon');
  /* Reset button. Reloads the current mode. */
  const resetBtn = document.getElementById('btn-reset');
  /* Toast element. */
  const hintEl = document.getElementById('hint');
  /* Full-stage card. */
  const overlay = document.getElementById('overlay');
  /* Card title. */
  const overlayTitle = document.getElementById('overlay-title');
  /* Card body line. */
  const overlayLine = document.getElementById('overlay-line');
  /* Controls line. */
  const overlayKeys = document.getElementById('overlay-keys');
  /* Primary card button. */
  const overlayBtn = document.getElementById('overlay-btn');
  /* Secondary card button. */
  const overlayBtn2 = document.getElementById('overlay-btn2');
  /* Touch control layer. */
  const mobileCtrls = document.getElementById('mobile-controls');
  /* Move stick. */
  const joyMove = document.getElementById('joy-move');
  /* Move stick knob. */
  const joyMoveKnob = document.getElementById('joy-move-knob');
  /* Aim stick. */
  const joyAim = document.getElementById('joy-aim');
  /* Aim stick knob. */
  const joyAimKnob = document.getElementById('joy-aim-knob');
  /* Touch fire. */
  const btnFire = document.getElementById('btn-fire');
  /* Touch jump. */
  const btnJump = document.getElementById('btn-jump');
  /* Pause button (top-right of the stage). */
  const btnPause = document.getElementById('btn-pause');

  /* ============================================================
     VIEW
     ============================================================ */

  /* CSS pixel width of the canvas. */
  let CW = 0;
  /* CSS pixel height of the canvas. */
  let CH = 0;
  /* Visible world width. Matches CW so 1 world pixel is 1 CSS pixel. */
  let VIEW_W = 800;
  /* Visible world height. */
  let VIEW_H = 500;
  /* Camera left in world pixels. */
  let camX = 0;
  /* Camera top in world pixels. */
  let camY = 0;

  /*
    Size the canvas to the stage and the device pixel ratio.
    View size in world units stays equal to CSS pixels.
  */
  function resize() {
    const rect = stage.getBoundingClientRect();
    CW = Math.max(40, Math.floor(rect.width));
    CH = Math.max(40, Math.floor(rect.height));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(CW * dpr);
    canvas.height = Math.floor(CH * dpr);
    canvas.style.width = CW + 'px';
    canvas.style.height = CH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    VIEW_W = CW;
    VIEW_H = CH;
  }

  /* ============================================================
     ENGINE
     ============================================================ */

  /* Matter engine. Gravity set once. Reset does not call Engine.clear. */
  const engine = Engine.create();
  engine.gravity.y = GRAVITY;

  /* ============================================================
     TERRAIN
     ============================================================ */

  /* Material id per tile. Length GRID_W * GRID_H. */
  let terrain = null;
  /* Remaining HP per tile. */
  let terrainHp = null;
  /* Offscreen 1 pixel per tile. Blitted scaled into the view. */
  let terrainCanvas = null;
  /* Context for the offscreen terrain. */
  let terrainCtx = null;
  /* True when the whole offscreen image must be rebuilt (new world). */
  let terrainDirty = true;
  /* Damaged tile rectangle still to repaint (tile coords, inclusive); null = none. */
  let dirtyRect = null;
  function markDirty(x, y) {
    if (!dirtyRect) dirtyRect = { x0: x, y0: y, x1: x, y1: y };
    else {
      if (x < dirtyRect.x0) dirtyRect.x0 = x;
      if (x > dirtyRect.x1) dirtyRect.x1 = x;
      if (y < dirtyRect.y0) dirtyRect.y0 = y;
      if (y > dirtyRect.y1) dirtyRect.y1 = y;
    }
  }

  /*
    Allocate grids and the offscreen canvas.
    Called at the start of every world generate.
  */
  function initTerrain() {
    terrain = new Uint8Array(GRID_W * GRID_H);
    terrainHp = new Float32Array(GRID_W * GRID_H); // float: hits below 0 must not wrap
    terrainCanvas = document.createElement('canvas');
    terrainCanvas.width = GRID_W;
    terrainCanvas.height = GRID_H;
    terrainCtx = terrainCanvas.getContext('2d', { willReadFrequently: true });
    terrainCtx.imageSmoothingEnabled = false;
    terrainDirty = true;
    dirtyRect = null;
  }

  /*
    Flat index for a tile column and row.
  */
  function ti(x, y) {
    return y * GRID_W + x;
  }

  /*
    True if the tile column and row sit inside the grid.
  */
  function inBounds(x, y) {
    return x >= 0 && x < GRID_W && y >= 0 && y < GRID_H;
  }

  /*
    Material at a tile, or AIR outside the grid.
  */
  function getMat(x, y) {
    if (!inBounds(x, y)) return MAT.AIR;
    return terrain[ti(x, y)];
  }

  /*
    Write a material and reset its HP from the table.
  */
  function setMat(x, y, m) {
    if (!inBounds(x, y)) return;
    const i = ti(x, y);
    terrain[i] = m;
    terrainHp[i] = m ? MAT_INFO[m].hp : 0;
    markDirty(x, y);
  }

  /*
    True if the tile blocks movement and should be part of a chunk body.
  */
  function isSolid(x, y) {
    const m = getMat(x, y);
    if (m === MAT.AIR) return false;
    return MAT_INFO[m].solid;
  }

  /*
    Parse #rrggbb into channels.
  */
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    return {
      r: parseInt(h.substring(0, 2), 16),
      g: parseInt(h.substring(2, 4), 16),
      b: parseInt(h.substring(4, 6), 16)
    };
  }

  /* Precomputed paint: per material, COLOR_STEPS+1 shades from dark (0 hp) to intact. */
  const COLOR_STEPS = 16;
  const SHADES = {};
  for (const id in MAT_INFO) {
    const c = hexToRgb(MAT_INFO[id].color), d = hexToRgb(MAT_INFO[id].dark);
    const arr = [];
    for (let k = 0; k <= COLOR_STEPS; k++) {
      const f = k / COLOR_STEPS;
      arr.push([Math.round(d.r + (c.r - d.r) * f), Math.round(d.g + (c.g - d.g) * f), Math.round(d.b + (c.b - d.b) * f)]);
    }
    SHADES[id] = arr;
  }
  /* Shade for a tile: [r, g, b]. */
  function tileShade(m, hp) {
    const k = Math.max(0, Math.min(1, hp / MAT_INFO[m].hp));
    return SHADES[m][Math.round(k * COLOR_STEPS)];
  }

  /* ============================================================
     WORLD GENERATION
     ============================================================ */

  /*
    Fill rolling hills, pockets of stone and metal, valley water, and a lava cut.
    Sandbox also stacks crates and a metal bunker.
  */
  function generateWorld(mode) {
    initTerrain();
    const surfaceY = Math.floor(GRID_H * 0.45);
    for (let x = 0; x < GRID_W; x++) {
      const wave = Math.sin(x * 0.03) * 4 + Math.sin(x * 0.11) * 2;
      const top = surfaceY + Math.floor(wave);
      for (let y = top; y < GRID_H; y++) {
        let m = MAT.DIRT;
        if (y === top) m = MAT.GRASS;
        else if (y > top + 4 && Math.random() < 0.08) m = MAT.STONE;
        if (y > top + 20 && Math.random() < 0.02) m = MAT.METAL;
        setMat(x, y, m);
      }
    }
    for (let x = 0; x < GRID_W; x++) {
      const wave = Math.sin(x * 0.03) * 4 + Math.sin(x * 0.11) * 2;
      const top = surfaceY + Math.floor(wave);
      if (top > surfaceY + 3) {
        for (let y = top - 2; y < top; y++) {
          if (getMat(x, y) === MAT.AIR) setMat(x, y, MAT.WATER);
        }
      }
    }
    /* Lava trench so the fluid actually matters. */
    const lavaX = Math.floor(GRID_W * 0.62);
    for (let x = lavaX; x < lavaX + 10; x++) {
      for (let y = surfaceY + 1; y < surfaceY + 6; y++) {
        setMat(x, y, MAT.LAVA);
      }
    }
    if (mode === 'sandbox') {
      spawnCrateStack(20, surfaceY - 4);
      spawnCrateStack(40, surfaceY - 2);
      spawnCrateStack(60, surfaceY - 6);
      for (let y = surfaceY - 8; y < surfaceY; y++) {
        setMat(80, y, MAT.STONE);
        setMat(81, y, MAT.STONE);
      }
      for (let x = 100; x < 110; x++) {
        for (let y = surfaceY - 6; y < surfaceY; y++) setMat(x, y, MAT.METAL);
      }
      for (let x = 102; x < 108; x++) {
        for (let y = surfaceY - 5; y < surfaceY - 1; y++) setMat(x, y, MAT.AIR);
      }
      for (let i = 0; i < CFG.world.crates; i++) {
        const x = Math.floor(Math.random() * GRID_W);
        const y = surfaceY - Math.floor(Math.random() * 6) - 1;
        if (getMat(x, y) === MAT.AIR) setMat(x, y, MAT.CRATE);
      }
    }
    terrainDirty = true;
  }

  /*
    2 by 3 crate block used by sandbox dressing.
  */
  function spawnCrateStack(gx, gy) {
    for (let y = gy; y < gy + 3; y++) {
      for (let x = gx; x < gx + 2; x++) {
        if (inBounds(x, y) && getMat(x, y) === MAT.AIR) setMat(x, y, MAT.CRATE);
      }
    }
  }

  /*
    Nominal surface row. Used for spawn height.
  */
  function surfaceRow() {
    return Math.floor(GRID_H * 0.45);
  }

  /* ============================================================
     CHUNK BODIES
     ============================================================ */

  /* Map key "cx,cy" to { body, needsRebuild }. */
  let chunkBodies = new Map();

  /*
    Drop every terrain body. Used on mode reset.
  */
  function rebuildAllChunks() {
    for (const entry of chunkBodies.values()) {
      if (entry.body) Composite.remove(engine.world, entry.body);
    }
    chunkBodies.clear();
  }

  /*
    Mark chunks touching a world point dirty so the next step rebuilds them.
  */
  function invalidateChunksAround(wx, wy) {
    const chX = Math.floor(wx / (TILE * CHUNK));
    const chY = Math.floor(wy / (TILE * CHUNK));
    for (let cy = chY - 1; cy <= chY + 1; cy++) {
      for (let cx = chX - 1; cx <= chX + 1; cx++) {
        const key = cx + ',' + cy;
        if (chunkBodies.has(key)) chunkBodies.get(key).needsRebuild = true;
      }
    }
  }

  /*
    Keep chunk bodies for the view plus one chunk of margin.
    Rebuilds are capped so explosions spread the cost.
  */
  function rebuildChunksInView() {
    const span = TILE * CHUNK;
    const cxMin = Math.max(0, Math.floor((camX - span) / span));
    const cxMax = Math.min(Math.ceil(GRID_W / CHUNK) - 1, Math.floor((camX + VIEW_W + span) / span));
    const cyMin = Math.max(0, Math.floor((camY - span) / span));
    const cyMax = Math.min(Math.ceil(GRID_H / CHUNK) - 1, Math.floor((camY + VIEW_H + span) / span));
    const wanted = new Set();
    for (let cy = cyMin; cy <= cyMax; cy++) {
      for (let cx = cxMin; cx <= cxMax; cx++) wanted.add(cx + ',' + cy);
    }
    for (const [key, entry] of chunkBodies) {
      if (!wanted.has(key)) {
        if (entry.body) Composite.remove(engine.world, entry.body);
        chunkBodies.delete(key);
      }
    }
    let rebuilt = 0;
    for (const key of wanted) {
      if (!chunkBodies.has(key)) {
        const parts = key.split(',').map(Number);
        const body = buildChunkBody(parts[0], parts[1]);
        chunkBodies.set(key, { body, needsRebuild: false });
        if (body) Composite.add(engine.world, body);
      } else if (chunkBodies.get(key).needsRebuild && rebuilt < MAX_CHUNK_REBUILDS) {
        const entry = chunkBodies.get(key);
        if (entry.body) Composite.remove(engine.world, entry.body);
        const parts = key.split(',').map(Number);
        entry.body = buildChunkBody(parts[0], parts[1]);
        entry.needsRebuild = false;
        if (entry.body) Composite.add(engine.world, entry.body);
        rebuilt++;
      }
    }
  }

  /*
    One static rectangle per horizontal run of solid tiles in the chunk.
    Runs are parts of a single compound so Matter treats the chunk as one body.
  */
  function buildChunkBody(chunkX, chunkY) {
    const tiles = [];
    const x0 = chunkX * CHUNK;
    const y0 = chunkY * CHUNK;
    const x1 = Math.min(GRID_W, x0 + CHUNK);
    const y1 = Math.min(GRID_H, y0 + CHUNK);
    for (let y = y0; y < y1; y++) {
      let runStart = -1;
      for (let x = x0; x <= x1; x++) {
        const solid = x < x1 && isSolid(x, y);
        if (solid && runStart < 0) runStart = x;
        if ((!solid || x === x1) && runStart >= 0) {
          const len = x - runStart;
          const w = len * TILE;
          const h = TILE;
          const cx = runStart * TILE + w / 2;
          const cy = y * TILE + h / 2;
          tiles.push(Bodies.rectangle(cx, cy, w, h, {
            isStatic: true,
            friction: 0.8,
            restitution: 0,
            label: 'terrain'
          }));
          runStart = -1;
        }
      }
    }
    if (tiles.length === 0) return null;
    if (tiles.length === 1) return tiles[0];
    return Body.create({
      parts: tiles,
      isStatic: true,
      friction: 0.8,
      restitution: 0,
      label: 'terrain'
    });
  }

  /* ============================================================
     PLAYER
     ============================================================ */

  /* Player record: Matter body, HP, ground flag, facing, timers. */
  let player = null;
  /* Keyboard state: KeyboardEvent.code (and .key) → held. */
  const keys = {};
  const KEYS = CFG.keys;
  /* True if any binding of an action is held. */
  function held(action) {
    const list = KEYS[action] || [];
    for (let i = 0; i < list.length; i++) if (keys[list[i]]) return true;
    return false;
  }
  function matches(action, e) {
    const list = KEYS[action] || [];
    return list.indexOf(e.code) !== -1 || list.indexOf(e.key) !== -1;
  }
  /* Left stick axes, -1 to 1. */
  let joyMoveAxis = { x: 0, y: 0 };
  /* Right stick axes. */
  let joyAimAxis = { x: 0, y: 0 };
  /* Touch / mouse JUMP button held. Hold-jump uses jumpLock on the player. */
  let jumpHeld = false;

  /*
    Create the player body. Rotation is locked.
  */
  function spawnPlayer(x, y) {
    if (player) Composite.remove(engine.world, player.body);
    const body = Bodies.rectangle(x, y, PLAYER_W, PLAYER_H, {
      friction: 0.05,
      frictionAir: 0.02,
      frictionStatic: 0.1,
      restitution: 0,
      density: 0.002,
      label: 'player',
      inertia: Infinity
    });
    Body.setInertia(body, Infinity);
    Composite.add(engine.world, body);
    player = {
      body,
      hp: MAX_HP,
      onGround: false,
      facing: 1,
      fireCooldown: 0,
      lavaTick: 0,
      jumpLock: 0
    };
  }

  /*
    Read keyboard and stick into a desired horizontal speed.
    Holding jump hops again after a short lock, once the body is grounded.
  */
  function updatePlayerInput() {
    if (!player) return;
    const b = player.body;
    let input = 0;
    if (held('left') || joyMoveAxis.x < -0.3) input -= 1;
    if (held('right') || joyMoveAxis.x > 0.3) input += 1;
    if (input !== 0) player.facing = input;
    const want = input * PLAYER_SPEED;
    const vx = b.velocity.x + (want - b.velocity.x) * (player.onGround ? 0.35 : 0.12);
    Body.setVelocity(b, { x: vx, y: b.velocity.y });
    if (player.jumpLock > 0) player.jumpLock -= FIXED_DT;
    /* No stick-up jump: diagonal thumbs made accidental hops. JUMP button / keys only. */
    const jumpPressed = held('jump') || jumpHeld;
    if (jumpPressed && player.onGround && player.jumpLock <= 0) {
      Body.setVelocity(b, { x: b.velocity.x, y: -PLAYER_JUMP });
      player.onGround = false;
      player.jumpLock = CFG.player.jumpLock;
    }
  }

  /*
    Matter contact. Grounded when a terrain normal pushes the player upward.
    Matter Y is down, so an upward push has negative Y on the player side.
  */
  function onCollisionActive(ev) {
    if (!player) return;
    for (const pair of ev.pairs) {
      const a = pair.bodyA;
      const b = pair.bodyB;
      const aPlayer = a.label === 'player' || (a.parent && a.parent.label === 'player');
      const bPlayer = b.label === 'player' || (b.parent && b.parent.label === 'player');
      if (!aPlayer && !bPlayer) continue;
      const n = pair.collision.normal;
      const ny = aPlayer ? n.y : -n.y;
      const support = pair.collision.supports;
      const foot = player.body.position.y + PLAYER_H * 0.35;
      if (support && support.some(s => s.y >= foot)) player.onGround = true;
      if (ny < -0.45) player.onGround = true;
    }
  }

  /*
    Water slows horizontal speed. Lava ticks damage.
  */
  function applyFluids(dt) {
    if (!player) return;
    const b = player.body;
    const gx = Math.floor(b.position.x / TILE);
    const gy = Math.floor(b.position.y / TILE);
    const m = getMat(gx, gy);
    if (m === MAT.WATER) {
      Body.setVelocity(b, { x: b.velocity.x * 0.82, y: Math.min(b.velocity.y, 2.2) });
    }
    if (m === MAT.LAVA) {
      player.lavaTick -= dt;
      if (player.lavaTick <= 0) {
        player.lavaTick = CFG.lava.tick;
        hurtPlayer(CFG.lava.damage, b.position.x, b.position.y - 24, null);
        const now = performance.now();
        if (now - lastLavaRumble >= (RUMBLE.lavaEveryMs || 0)) { lastLavaRumble = now; hubRumble(RUMBLE.lava); }
      }
    }
  }

  /* Last lava rumble time (throttle). */
  let lastLavaRumble = 0;

  /*
    Apply damage, float a red number, refresh HUD. rumble: value sent to the phone.
  */
  function hurtPlayer(amount, x, y, rumble) {
    if (!player || gameState !== 'playing') return;
    player.hp = Math.max(0, player.hp - amount);
    if (rumble) hubRumble(rumble);
    addFloater(x, y, '-' + Math.ceil(amount), '#FF5B5B');
    updateHud();
  }

  /* ============================================================
     WEAPONS
     ============================================================ */

  /* Active weapon id. */
  let currentWeapon = 'pistol';
  /* Remaining shots. Pistol stays Infinity. */
  let ammoRemaining = startAmmo();
  /* Live shots. */
  const projectiles = [];
  /* Expanding blasts. flash true is a muzzle pop. */
  const explosions = [];
  /* Short-lived sparks and debris. */
  const particles = [];
  /* Rising numbers. */
  const floaters = [];
  /* Aim radians. 0 is right. */
  let aimAngle = 0;
  /* Last mouse position in canvas CSS pixels. */
  let mouseScreenPos = { x: 0, y: 0 };
  /* True while primary button is down. */
  let mouseDown = false;
  /* True after the mouse has moved, so aim is not stuck at origin. */
  let mouseAimReady = false;
  /* Aim source: 'facing' (keys / no mouse: aimRel relative to facing), 'mouse',
     'touch' (aim stick), 'stick' (hub analog stick). */
  let aimMode = 'facing';
  /* Facing-relative aim elevation in radians (+ = up). Q / E change it. */
  let aimRel = 0;
  /* Hub analog stick (from hub-stick messages). */
  let hubStick = { x: 0, y: 0 };
  /* Space (fire key) held. */
  let fireKeyHeld = false;
  /* Touch fire held. */
  let fireHeld = false;

  /*
    Convert a canvas CSS point to world pixels.
  */
  function screenToWorld(sx, sy) {
    return { x: sx + camX, y: sy + camY };
  }

  /*
    Turn an absolute aim angle into facing + elevation, so the aim keeps its tilt
    and flips with the player (used when a stick is released).
  */
  function absorbAim(angle) {
    if (!player) return;
    const cx = Math.cos(angle), sy = Math.sin(angle);
    player.facing = cx >= 0 ? 1 : -1;
    aimRel = Math.max(-CFG.aim.maxDown, Math.min(CFG.aim.maxUp, Math.atan2(-sy, Math.abs(cx))));
    aimMode = 'facing';
  }

  /*
    Update aimAngle from the current source: Q / E (relative to facing), hub
    stick, touch stick, or the mouse.
  */
  function updateAim(dt) {
    if (!player) return;
    const up = held('aimUp'), down = held('aimDown');
    if (up || down) {
      if (aimMode !== 'facing') absorbAim(aimAngle);
      aimRel += (up ? 1 : -1) * CFG.aim.keyRate * dt;
      aimRel = Math.max(-CFG.aim.maxDown, Math.min(CFG.aim.maxUp, aimRel));
    }
    const sm = Math.hypot(hubStick.x, hubStick.y);
    if (sm > CFG.aim.stickDead) {
      aimMode = 'stick';
      aimAngle = Math.atan2(hubStick.y, hubStick.x);
      return;
    } else if (aimMode === 'stick') {
      absorbAim(aimAngle);
    }
    if (aimMode === 'touch') return;          // set by the aim stick handler
    if (aimMode === 'mouse' && mouseAimReady) {
      const w = screenToWorld(mouseScreenPos.x, mouseScreenPos.y);
      aimAngle = Math.atan2(w.y - (player.body.position.y - 4), w.x - player.body.position.x);
      return;
    }
    aimAngle = player.facing > 0 ? -aimRel : Math.PI + aimRel;
  }

  /*
    Spawn a projectile if cooldown and ammo allow.
  */
  function fire() {
    if (!player || gameState !== 'playing') return;
    if (player.fireCooldown > 0) return;
    const w = WEAPONS[currentWeapon];
    if (ammoRemaining[currentWeapon] <= 0) {
      player.fireCooldown = 0.4;
      showHint(TX.noAmmo, 700);
      hubRumble(RUMBLE.outOfAmmo);
      return;
    }
    player.fireCooldown = w.cooldown;
    if (ammoRemaining[currentWeapon] !== Infinity) {
      ammoRemaining[currentWeapon]--;
      updateAmmoUI();
    }
    const angle = aimAngle;
    const ox = player.body.position.x + Math.cos(angle) * 22;
    const oy = player.body.position.y - 4 + Math.sin(angle) * 22;
    projectiles.push({
      x: ox,
      y: oy,
      vx: Math.cos(angle) * w.speed,
      vy: Math.sin(angle) * w.speed,
      weapon: w,
      life: w.fuse,
      trail: []
    });
    for (let i = 0; i < 5; i++) {
      const a = angle + (Math.random() - 0.5) * 0.8;
      particles.push({
        x: ox, y: oy,
        vx: Math.cos(a) * (80 + Math.random() * 140),
        vy: Math.sin(a) * (80 + Math.random() * 140),
        life: 0.25, maxLife: 0.25, size: 2, color: w.color, gravity: 0
      });
    }
    explosions.push({ x: ox, y: oy, r: 8, life: 0.06, maxLife: 0.06, flash: true });
    Body.setVelocity(player.body, {
      x: player.body.velocity.x - Math.cos(angle) * 1.2,
      y: player.body.velocity.y - Math.sin(angle) * 0.4
    });
  }

  /*
    Step shots in substeps. Speeds are pixels per second.
    Direct hits damage a tile, an enemy, or a target. Blasts call doExplosion.
  */
  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= dt;
      if (p.life <= 0) {
        if (p.weapon.explosion > 0) doExplosion(p.x, p.y, p.weapon.explosion, p.weapon.damage);
        projectiles.splice(i, 1);
        continue;
      }
      p.vy += p.weapon.gravity * dt;
      const speed = Math.hypot(p.vx, p.vy);
      const steps = Math.max(1, Math.ceil((speed * dt) / 6));
      let hit = false;
      for (let s = 0; s < steps; s++) {
        p.x += (p.vx * dt) / steps;
        p.y += (p.vy * dt) / steps;
        const gx = Math.floor(p.x / TILE);
        const gy = Math.floor(p.y / TILE);
        if (isSolid(gx, gy)) {
          if (p.weapon.explosion > 0) doExplosion(p.x, p.y, p.weapon.explosion, p.weapon.damage);
          else {
            damageTile(gx, gy, p.weapon.damage);
            invalidateChunksAround(p.x, p.y);
            spark(p.x, p.y, p.weapon.color, 4);
          }
          hit = true;
          break;
        }
        for (const e of enemies) {
          if (!e.alive) continue;
          const dx = p.x - e.body.position.x;
          const dy = p.y - e.body.position.y;
          const rr = e.radius + p.weapon.radius;
          if (dx * dx + dy * dy < rr * rr) {
            if (p.weapon.explosion > 0) doExplosion(p.x, p.y, p.weapon.explosion, p.weapon.damage);
            else {
              e.hp -= p.weapon.damage;
              addFloater(e.body.position.x, e.body.position.y - 20, '-' + p.weapon.damage, '#FFD700');
              if (e.hp <= 0) killEnemy(e);
            }
            hit = true;
            break;
          }
        }
        if (hit) break;
        for (const t of targets) {
          if (t.destroyed) continue;
          const dx = p.x - t.x;
          const dy = p.y - t.y;
          if (dx * dx + dy * dy < (t.r + p.weapon.radius) * (t.r + p.weapon.radius)) {
            if (p.weapon.explosion > 0) doExplosion(p.x, p.y, p.weapon.explosion, p.weapon.damage);
            else damageTarget(t, p.weapon.damage);
            hit = true;
            break;
          }
        }
        if (hit) break;
      }
      if (hit) {
        projectiles.splice(i, 1);
        continue;
      }
      if (p.weapon.name !== 'pistol') {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 8) p.trail.shift();
      }
    }
  }

  /*
    Small burst used by direct impacts.
  */
  function spark(x, y, color, n) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      particles.push({
        x, y,
        vx: Math.cos(a) * 90,
        vy: Math.sin(a) * 90,
        life: 0.25, maxLife: 0.25, size: 2, color, gravity: 0
      });
    }
  }

  /* ============================================================
     EXPLOSIONS AND TILE DAMAGE
     ============================================================ */

  /*
    Carve a circle, hurt actors inside it, knock the player, pop targets.
  */
  function doExplosion(x, y, radiusPx, damage) {
    explosions.push({ x, y, r: radiusPx, life: 0.4, maxLife: 0.4, flash: false });
    for (let i = 0; i < 22; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 220;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.55, maxLife: 0.55, size: 3,
        color: Math.random() < 0.5 ? '#FFD700' : '#FF8C42',
        gravity: 180
      });
    }
    const rTiles = Math.ceil(radiusPx / TILE);
    const gx = Math.floor(x / TILE);
    const gy = Math.floor(y / TILE);
    let tilesDestroyed = 0;
    for (let dy = -rTiles; dy <= rTiles; dy++) {
      for (let dx = -rTiles; dx <= rTiles; dx++) {
        const tx = gx + dx;
        const ty = gy + dy;
        if (!inBounds(tx, ty)) continue;
        const distPx = Math.hypot(dx * TILE, dy * TILE);
        if (distPx > radiusPx) continue;
        const m = terrain[ti(tx, ty)];
        if (m === MAT.AIR || m === MAT.WATER || m === MAT.LAVA) continue;
        const falloff = 1 - distPx / radiusPx;
        const dmg = damage * (0.4 + falloff * 0.6);
        if (damageTile(tx, ty, dmg)) {
          tilesDestroyed++;
          if (Math.random() < 0.12) {
            const a = Math.random() * Math.PI * 2;
            particles.push({
              x: tx * TILE + TILE / 2,
              y: ty * TILE + TILE / 2,
              vx: Math.cos(a) * (60 + Math.random() * 120),
              vy: Math.sin(a) * (60 + Math.random() * 120) - 80,
              life: 0.45, maxLife: 0.45, size: 2.5,
              color: MAT_INFO[m].color,
              gravity: 400
            });
          }
        }
      }
    }
    if (tilesDestroyed > 0) invalidateChunksAround(x, y);
    for (const e of enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.body.position.x - x, e.body.position.y - y);
      if (d < radiusPx + e.radius) {
        const falloff = 1 - d / (radiusPx + e.radius);
        e.hp -= damage * (0.5 + falloff * 0.8);
        if (e.hp <= 0) killEnemy(e);
      }
    }
    if (player) {
      const d = Math.hypot(player.body.position.x - x, player.body.position.y - y);
      if (d < radiusPx + 20) {
        const falloff = 1 - d / (radiusPx + 20);
        hurtPlayer(damage * CFG.selfBlast * falloff, player.body.position.x, player.body.position.y - 30, RUMBLE.selfBlast);
        const ang = Math.atan2(player.body.position.y - y, player.body.position.x - x);
        Body.setVelocity(player.body, {
          x: player.body.velocity.x + Math.cos(ang) * 8,
          y: player.body.velocity.y + Math.sin(ang) * 8 - 2
        });
      } else if (d < (RUMBLE.nearExplosionPx || 0) && gameState === 'playing') {
        hubRumble(RUMBLE.nearExplosion);
      }
    }
    for (const t of targets) {
      if (t.destroyed) continue;
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < radiusPx + t.r) damageTarget(t, damage);
    }
  }

  /*
    Subtract HP. Returns true if the tile became air.
    Target tiles also clear the matching mission marker.
  */
  function damageTile(gx, gy, dmg) {
    if (!inBounds(gx, gy)) return false;
    const i = ti(gx, gy);
    const m = terrain[i];
    if (m === MAT.AIR || m === MAT.WATER || m === MAT.LAVA) return false;
    const left = terrainHp[i] - dmg;
    markDirty(gx, gy);
    if (left > 0) { terrainHp[i] = left; return false; }   // destroyed at <= 0
    const wx = gx * TILE + TILE / 2;
    const wy = gy * TILE + TILE / 2;
    terrain[i] = MAT.AIR;
    terrainHp[i] = 0;
    if (m === MAT.TARGET) {
      for (const t of targets) {
        if (!t.destroyed && Math.hypot(t.x - wx, t.y - wy) < TILE * 2) {
          t.destroyed = true;
          score += CFG.mission.targetScore;
          addFloater(t.x, t.y - 20, '+' + CFG.mission.targetScore, '#FFD700');
          hubRumble(RUMBLE.target);
          updateHud();
        }
      }
    }
    return true;
  }

  /*
    Direct hit on a mission marker. Pistol and laser can finish it.
  */
  function damageTarget(t, dmg) {
    if (t.destroyed) return;
    t.hp -= dmg;
    addFloater(t.x, t.y - 16, '-' + Math.ceil(dmg), '#FF8C42');
    if (t.hp <= 0) {
      t.destroyed = true;
      score += CFG.mission.targetScore;
      addFloater(t.x, t.y - 28, '+' + CFG.mission.targetScore, '#FFD700');
      hubRumble(RUMBLE.target);
      doExplosion(t.x, t.y, 28, 10);
      updateHud();
    }
  }

  /* ============================================================
     ENEMIES
     ============================================================ */

  /* Living and dead enemy records. Dead ones are skipped. */
  const enemies = [];
  /* Enemy bullets. Speeds are pixels per second. */
  const enemyProjectiles = [];

  /*
    Spawn a walker. Rotation locked. homeX is unused walk anchor.
  */
  function spawnEnemy(x, y) {
    const body = Bodies.rectangle(x, y, 24, 30, {
      friction: 0.4,
      restitution: 0,
      density: 0.002,
      label: 'enemy',
      inertia: Infinity
    });
    Body.setInertia(body, Infinity);
    Composite.add(engine.world, body);
    enemies.push({
      body,
      hp: CFG.enemies.hp,
      maxHp: CFG.enemies.hp,
      alive: true,
      radius: 16,
      facing: -1,
      lastShot: 0.6,
      alerted: false,
      walkDir: Math.random() < 0.5 ? -1 : 1
    });
  }

  /*
    Patrol, turn at walls and ledges, shoot when the player is close.
  */
  function updateEnemies(dt) {
    for (const e of enemies) {
      if (!e.alive) continue;
      const b = e.body;
      const dx = player ? player.body.position.x - b.position.x : 0;
      const dy = player ? player.body.position.y - b.position.y : 0;
      const dist = Math.hypot(dx, dy);
      e.alerted = dist < CFG.enemies.alertDist;
      e.facing = e.alerted ? (dx > 0 ? 1 : -1) : e.walkDir;
      const speed = e.alerted ? CFG.enemies.alertSpeed : CFG.enemies.walkSpeed;
      const dir = e.alerted ? e.facing : e.walkDir;
      Body.setVelocity(b, { x: dir * speed, y: b.velocity.y });
      const lookX = b.position.x + dir * 16;
      const gxA = Math.floor(lookX / TILE);
      const gyFoot = Math.floor((b.position.y + 20) / TILE);
      const gyBody = Math.floor(b.position.y / TILE);
      if (isSolid(gxA, gyBody) || !isSolid(gxA, gyFoot)) e.walkDir *= -1;
      e.lastShot -= dt;
      if (e.alerted && e.lastShot <= 0 && dist < CFG.enemies.shootDist && dist > 24 && gameState === 'playing') {
        e.lastShot = CFG.enemies.reload + Math.random() * CFG.enemies.reloadJitter;
        const angle = Math.atan2(dy, dx);
        enemyProjectiles.push({
          x: b.position.x + Math.cos(angle) * 18,
          y: b.position.y + Math.sin(angle) * 18,
          vx: Math.cos(angle) * CFG.enemies.bulletSpeed,
          vy: Math.sin(angle) * CFG.enemies.bulletSpeed,
          life: 2.2,
          damage: CFG.enemies.bulletDamage
        });
      }
    }
  }

  /*
    Step enemy shots in pixels per second. They chip tiles and the player.
  */
  function updateEnemyProjectiles(dt) {
    for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
      const p = enemyProjectiles[i];
      p.life -= dt;
      if (p.life <= 0) {
        enemyProjectiles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const gx = Math.floor(p.x / TILE);
      const gy = Math.floor(p.y / TILE);
      if (isSolid(gx, gy)) {
        damageTile(gx, gy, 4);
        invalidateChunksAround(p.x, p.y);
        enemyProjectiles.splice(i, 1);
        continue;
      }
      if (player) {
        const dx = p.x - player.body.position.x;
        const dy = p.y - player.body.position.y;
        if (dx * dx + dy * dy < 18 * 18) {
          hurtPlayer(p.damage, player.body.position.x, player.body.position.y - 28, RUMBLE.hit);
          enemyProjectiles.splice(i, 1);
        }
      }
    }
  }

  /*
    Remove the body, add score, burst red sparks.
  */
  function killEnemy(e) {
    if (!e.alive) return;
    e.alive = false;
    score += CFG.enemies.score;
    addFloater(e.body.position.x, e.body.position.y - 26, '+' + CFG.enemies.score, '#FFD700');
    hubRumble(RUMBLE.enemyKill);
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 50 + Math.random() * 110;
      particles.push({
        x: e.body.position.x,
        y: e.body.position.y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 0.45, maxLife: 0.45, size: 2, color: '#FF5B5B', gravity: 80
      });
    }
    Composite.remove(engine.world, e.body);
    updateHud();
  }

  /* ============================================================
     TARGETS
     ============================================================ */

  /* Mission markers. Also backed by TARGET tiles so blasts carve them. */
  const targets = [];

  /*
    Place a ring and a small target-tile block under it.
  */
  function spawnTarget(x, y) {
    targets.push({ x, y, r: 22, hp: CFG.mission.targetHp, maxHp: CFG.mission.targetHp, destroyed: false });
    const gx = Math.floor(x / TILE);
    const gy = Math.floor(y / TILE);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (getMat(gx + dx, gy + dy) !== MAT.WATER && getMat(gx + dx, gy + dy) !== MAT.LAVA) {
          setMat(gx + dx, gy + dy, MAT.TARGET);
        }
      }
    }
  }

  /* ============================================================
     MODE SETUP
     ============================================================ */

  /* sandbox or mission. */
  let currentMode = 'sandbox';
  /* Points from kills and targets. */
  let score = 0;
  /* menu, playing, paused, dead, won, exit. Overlay is derived from this. */
  let gameState = 'menu';
  /* Last "gate locked" hint time (throttle). */
  let lastGateHint = 0;

  /*
    Remove actors. Does not call Engine.clear, which drops engine state.
  */
  function resetWorld() {
    Composite.clear(engine.world, false);
    engine.gravity.y = GRAVITY;
    chunkBodies.clear();
    enemies.length = 0;
    enemyProjectiles.length = 0;
    targets.length = 0;
    projectiles.length = 0;
    explosions.length = 0;
    particles.length = 0;
    floaters.length = 0;
    player = null;
  }

  /*
    Left wall and floor so the body cannot leave the map.
    The right edge is the exit, checked in checkGameConditions.
  */
  function addWorldBounds() {
    const wall = 48;
    Composite.add(engine.world, [
      Bodies.rectangle(-wall / 2, WORLD_H / 2, wall, WORLD_H * 2, { isStatic: true, label: 'bounds' }),
      Bodies.rectangle(WORLD_W / 2, WORLD_H + wall / 2, WORLD_W + 400, wall, { isStatic: true, label: 'bounds' })
    ]);
  }

  /*
    Snap the camera and build nearby chunk bodies before the first step.
    Otherwise the player falls through air until the loop catches up.
  */
  function warmChunks() {
    if (!player) return;
    camX = player.body.position.x - VIEW_W / 2;
    camY = player.body.position.y - VIEW_H / 2 - 30;
    const maxX = Math.max(0, WORLD_W - VIEW_W);
    const maxY = Math.max(0, WORLD_H - VIEW_H);
    camX = Math.max(0, Math.min(maxX, camX));
    camY = Math.max(0, Math.min(maxY, camY));
    rebuildChunksInView();
    rebuildChunksInView();
  }
  function resetLoadout() {
    currentWeapon = WEAPON_ORDER[0];
    ammoRemaining = startAmmo();
    updateAmmoUI();
    for (const btn of weaponBtns) btn.classList.toggle('active', btn.dataset.w === currentWeapon);
  }
  /* Fresh aim / input state for a new run. */
  function resetAim() {
    aimMode = mouseAimReady ? 'mouse' : 'facing';
    aimRel = 0;
    aimAngle = 0;
    accumulator = 0;
  }

  /*
    Open sandbox: hills, crates, no objectives.
  */
  function setupSandbox() {
    currentMode = 'sandbox';
    score = 0;
    resetWorld();
    generateWorld('sandbox');
    addWorldBounds();
    const sy = surfaceRow();
    spawnPlayer(GRID_W * 0.18 * TILE, (sy - 4) * TILE);
    warmChunks();
    resetLoadout();
    resetAim();
    gameState = 'playing';
    updateHud();
    hideOverlay();
    showHint(TX.sandboxHint, 2600);
    hubSendApp();
  }

  /*
    Open mission: targets and a line of walkers.
  */
  function setupMission() {
    currentMode = 'mission';
    score = 0;
    resetWorld();
    generateWorld('mission');
    addWorldBounds();
    const sy = surfaceRow();
    spawnPlayer(GRID_W * 0.12 * TILE, (sy - 4) * TILE);
    warmChunks();
    resetLoadout();
    resetAim();
    for (const f of CFG.mission.targets) {
      const tx = Math.floor(GRID_W * f);
      spawnTarget(tx * TILE, (sy - 3) * TILE);
    }
    for (let i = 0; i < CFG.enemies.count; i++) {
      spawnEnemy((0.32 + i * 0.08) * WORLD_W, (sy - 3) * TILE);
    }
    gameState = 'playing';
    updateHud();
    hideOverlay();
    showHint(TX.missionHint, 2600);
    hubSendApp();
  }

  /* Start (or restart) a mode. */
  function startMode(mode) {
    if (mode === 'mission') setupMission();
    else setupSandbox();
  }
  /* New run in the current mode (RESET / hub New Game). */
  function newGame() { startMode(currentMode); }
  /* Switch Sandbox <-> Mission and start it (hub Mode button). */
  function cycleMode() { startMode(currentMode === 'mission' ? 'sandbox' : 'mission'); }

  /* Pause / resume a running game. */
  function togglePause() {
    if (gameState === 'playing') {
      gameState = 'paused';
      clearInput();
      showOverlay('paused');
    } else if (gameState === 'paused') {
      gameState = 'playing';
      accumulator = 0;
      hideOverlay();
    }
    updatePauseBtn();
  }
  /* Enter / Start / tap on the card: start from the menu or an end card, else pause. */
  function primaryAction() {
    if (gameState === 'menu') startMode(currentMode);
    else if (gameState === 'playing' || gameState === 'paused') togglePause();
    else startMode(currentMode);            // dead / won / exit: play again
  }
  /* Escape / Select: back to the menu. */
  function toMenu() {
    if (gameState === 'menu') return;
    gameState = 'menu';
    clearInput();
    showOverlay('menu');
    updatePauseBtn();
  }

  /* ============================================================
     HUD AND OVERLAY
     ============================================================ */

  function targetsLeft() { return targets.filter(t => !t.destroyed).length; }
  function enemiesLeft() { return enemies.filter(e => e.alive).length; }

  /*
    Push HP, score, and counts into the chips (and the hub bar).
  */
  function updateHud() {
    if (player) {
      hudHp.textContent = Math.max(0, Math.floor(player.hp));
      statHealth.classList.toggle('low', player.hp < 30);
    }
    hudScore.textContent = score;
    hudTargets.textContent = targetsLeft();
    hudEnemies.textContent = enemiesLeft();
    hubSendStats();
  }

  /*
    Write ammo counts and grey empty weapons.
  */
  function updateAmmoUI() {
    for (const k of WEAPON_ORDER) {
      if (ammoEls[k]) ammoEls[k].textContent = ammoRemaining[k] === Infinity ? '∞' : ammoRemaining[k];
    }
    for (const btn of weaponBtns) {
      const ammo = ammoRemaining[btn.dataset.w];
      btn.classList.toggle('empty', ammo !== Infinity && ammo <= 0);
    }
  }

  /* Hint timer id. */
  let hintTimer = 0;

  /*
    Show a short toast. duration 0 leaves it up.
  */
  function showHint(text, duration) {
    hintEl.textContent = text;
    hintEl.classList.add('show');
    clearTimeout(hintTimer);
    if (duration > 0) hintTimer = setTimeout(() => hintEl.classList.remove('show'), duration);
  }

  /*
    Hide the card. Play state owns the stage.
  */
  function hideOverlay() {
    overlay.classList.add('hidden');
    updatePauseBtn();
  }

  /* Pause button glyph; hidden while a card is up. */
  function updatePauseBtn() {
    if (!btnPause) return;
    btnPause.textContent = gameState === 'paused' ? '▶' : '❚❚';
    btnPause.hidden = !(gameState === 'playing' || gameState === 'paused');
  }

  /*
    Fill the card from state. Buttons are never removed, only relabeled.
  */
  function showOverlay(state) {
    const keysText = IS_TOUCH ? TX.keysTouch : TX.keysPc;
    if (state === 'menu') {
      overlayTitle.textContent = TX.title;
      overlayLine.innerHTML = TX.tagline;
      overlayKeys.textContent = keysText;
      overlayBtn.textContent = TX.sandbox;
      overlayBtn2.textContent = TX.mission;
    } else if (state === 'paused') {
      overlayTitle.textContent = TX.paused;
      overlayLine.textContent = 'Score: ' + score;
      overlayKeys.textContent = keysText;
      overlayBtn.textContent = TX.resume;
      overlayBtn2.textContent = TX.menu;
    } else if (state === 'dead') {
      overlayTitle.textContent = TX.died;
      overlayLine.textContent = 'Score: ' + score;
      overlayKeys.textContent = TX.endKeys;
      overlayBtn.textContent = TX.retry;
      overlayBtn2.textContent = TX.menu;
    } else if (state === 'won' || state === 'exit') {
      overlayTitle.textContent = state === 'exit' ? TX.exit : TX.won;
      overlayLine.textContent = fmt(state === 'exit' ? TX.exitLine : TX.wonLine, { score });
      overlayKeys.textContent = TX.endKeys;
      overlayBtn.textContent = TX.playAgain;
      overlayBtn2.textContent = TX.menu;
    }
    overlay.classList.remove('hidden');
    updatePauseBtn();
  }

  /*
    Rising combat text.
  */
  function addFloater(x, y, text, color) {
    floaters.push({ x, y, text, color: color || '#FFD700', life: 0.8, maxLife: 0.8 });
  }

  /* True while Mission targets remain (the east gate is locked). */
  function gateLocked() {
    return currentMode === 'mission' && targetsLeft() > 0;
  }

  /*
    Death, mission-clear and east-gate checks.
  */
  function checkGameConditions() {
    if (!player || gameState !== 'playing') return;
    if (player.hp <= 0) {
      gameState = 'dead';
      clearInput();
      hubRumble(RUMBLE.death);
      showOverlay('dead');
      return;
    }
    if (currentMode === 'mission' && targets.length > 0 && targets.every(t => t.destroyed)) {
      gameState = 'won';
      clearInput();
      hubRumble(RUMBLE.missionComplete);
      showOverlay('won');
      return;
    }
    if (player.body.position.y > WORLD_H - 30) {
      Body.setPosition(player.body, { x: player.body.position.x, y: WORLD_H - 80 });
      Body.setVelocity(player.body, { x: player.body.velocity.x, y: 0 });
    }
    const gateX = WORLD_W - 40;
    if (gateLocked() && player.body.position.x > gateX - 30) {
      // Locked: push back and say why
      Body.setPosition(player.body, { x: gateX - 30, y: player.body.position.y });
      Body.setVelocity(player.body, { x: Math.min(0, player.body.velocity.x), y: player.body.velocity.y });
      const now = performance.now();
      if (now - lastGateHint > 1500) {
        lastGateHint = now;
        showHint(fmt(TX.gateLocked, { n: targetsLeft() }), 1600);
      }
      return;
    }
    if (player.body.position.x > gateX) {
      Body.setPosition(player.body, { x: gateX, y: player.body.position.y });
      Body.setVelocity(player.body, { x: 0, y: player.body.velocity.y });
      gameState = 'exit';
      clearInput();
      showOverlay('exit');
    }
  }

  /* ============================================================
     INPUT
     ============================================================ */

  /* Touch-capable device: show the touch layer and touch help text. */
  const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

  /*
    Select a weapon if it still has ammo.
  */
  function selectWeapon(name) {
    if (!WEAPONS[name]) return;
    if (ammoRemaining[name] <= 0) {
      showHint(TX.noAmmo, 700);
      hubRumble(RUMBLE.outOfAmmo);
      return;
    }
    const changed = currentWeapon !== name;
    currentWeapon = name;
    for (const btn of weaponBtns) btn.classList.toggle('active', btn.dataset.w === name);
    if (changed) {
      showHint(WEAPONS[name].label || name, 600);
      hubSendApp();
    }
  }
  /* X / B / hub Weapon button: next weapon that still has ammo. */
  function nextWeapon() {
    const n = WEAPON_ORDER.length;
    let i = WEAPON_ORDER.indexOf(currentWeapon);
    for (let k = 1; k <= n; k++) {
      const w = WEAPON_ORDER[(i + k) % n];
      if (ammoRemaining[w] > 0) { selectWeapon(w); return; }
    }
  }

  /* Drop everything held (focus lost, tab hidden, pause, end card). */
  function clearInput() {
    for (const k in keys) keys[k] = false;
    mouseDown = false;
    fireHeld = false;
    jumpHeld = false;
    fireKeyHeld = false;
    hubStick.x = 0; hubStick.y = 0;
    joyMoveAxis.x = 0; joyMoveAxis.y = 0;
    joyAimAxis.x = 0; joyAimAxis.y = 0;
    releaseStick(sticks.move);
    releaseStick(sticks.aim);
    btnFire.classList.remove('held');
    btnJump.classList.remove('held');
  }

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const game = ['left', 'right', 'jump', 'fire', 'aimUp', 'aimDown', 'nextWeapon', 'pause', 'menu', 'weapons'].some(a => matches(a, e));
    if (game || e.key === ' ' || e.key.indexOf('Arrow') === 0) e.preventDefault(); // also stops focused buttons re-firing
    if (e.code) keys[e.code] = true;
    keys[e.key] = true;
    if (e.repeat) return;
    if (matches('fire', e)) {
      fireKeyHeld = true;
      if (gameState === 'playing') { updateAim(0); fire(); }
    } else if (matches('nextWeapon', e)) {
      nextWeapon();
    } else if (matches('pause', e)) {
      primaryAction();
    } else if (matches('menu', e)) {
      toMenu();
    } else {
      const wi = KEYS.weapons.indexOf(e.code);
      const wk = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].indexOf(e.key);
      const idx = wi >= 0 ? wi : wk;
      if (idx >= 0 && WEAPON_ORDER[idx]) selectWeapon(WEAPON_ORDER[idx]);
    }
  });
  window.addEventListener('keyup', (e) => {
    if (e.code) keys[e.code] = false;
    keys[e.key] = false;
    if (matches('fire', e)) fireKeyHeld = false;
  });
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    clearInput();
    if (gameState === 'playing') togglePause();
  });

  /* Mouse: aim with the pointer, click to fire (touch uses the sticks below). */
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseScreenPos.x = e.clientX - rect.left;
    mouseScreenPos.y = e.clientY - rect.top;
    mouseAimReady = true;
    aimMode = 'mouse';
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    mouseScreenPos.x = e.clientX - rect.left;
    mouseScreenPos.y = e.clientY - rect.top;
    mouseAimReady = true;
    aimMode = 'mouse';
    mouseDown = true;
    updateAim(0);
    fire();
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseDown = false;
  });
  /* No context menu / selection / double-tap zoom anywhere on the page. */
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('selectstart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());

  /*
    Floating touch sticks: a thumb on the left half of the stage = MOVE stick, on
    the right half = AIM stick; the stick base jumps to where the thumb lands.
    Released sticks go back to their resting spot (CSS).
  */
  const TOUCH = CFG.touch;
  const sticks = {
    move: { el: joyMove, knob: joyMoveKnob, id: null, bx: 0, by: 0 },
    aim: { el: joyAim, knob: joyAimKnob, id: null, bx: 0, by: 0 },
  };
  function stickAt(st, x, y) {
    st.bx = x; st.by = y;
    st.el.style.left = (x - TOUCH.stick / 2) + 'px';
    st.el.style.top = (y - TOUCH.stick / 2) + 'px';
    st.el.style.right = 'auto';
    st.el.style.bottom = 'auto';
    st.el.classList.add('active');
  }
  function releaseStick(st) {
    if (!st) return;
    st.id = null;
    st.el.style.left = st.el.style.top = st.el.style.right = st.el.style.bottom = '';
    st.el.classList.remove('active');
    st.knob.style.transform = '';
  }
  function stickMove(st, x, y) {
    let dx = x - st.bx, dy = y - st.by;
    const len = Math.hypot(dx, dy), R = TOUCH.range;
    if (len > R) { dx = dx / len * R; dy = dy / len * R; }
    st.knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    return { x: dx / R, y: dy / R };
  }
  function stagePoint(e) {
    const r = stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width };
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || gameState !== 'playing') return;
    e.preventDefault();                               // no emulated mouse events
    const p = stagePoint(e);
    const st = p.x < p.w / 2 ? sticks.move : sticks.aim;
    if (st.id !== null) return;
    st.id = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    stickAt(st, p.x, p.y);
  });
  canvas.addEventListener('pointermove', (e) => {
    const st = e.pointerId === sticks.move.id ? sticks.move : e.pointerId === sticks.aim.id ? sticks.aim : null;
    if (!st) return;
    e.preventDefault();
    const p = stagePoint(e);
    const a = stickMove(st, p.x, p.y);
    if (st === sticks.move) {
      joyMoveAxis.x = a.x; joyMoveAxis.y = a.y;
    } else {
      joyAimAxis.x = a.x; joyAimAxis.y = a.y;
      if (Math.hypot(a.x, a.y) > CFG.aim.stickDead) {
        aimMode = 'touch';
        aimAngle = Math.atan2(a.y, a.x);
      }
    }
  });
  function stickEnd(e) {
    if (e.pointerId === sticks.move.id) {
      releaseStick(sticks.move);
      joyMoveAxis.x = 0; joyMoveAxis.y = 0;
    } else if (e.pointerId === sticks.aim.id) {
      releaseStick(sticks.aim);
      joyAimAxis.x = 0; joyAimAxis.y = 0;
      if (aimMode === 'touch') absorbAim(aimAngle);   // keep the tilt, flip with facing
    }
  }
  canvas.addEventListener('pointerup', stickEnd);
  canvas.addEventListener('pointercancel', stickEnd);

  /* FIRE / JUMP: pointer events, so touch, pen and mouse all work. */
  function holdButton(btn, onDown, onUp) {
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      btn.classList.add('held');
      onDown();
    });
    const up = () => { btn.classList.remove('held'); onUp(); };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
  }
  holdButton(btnFire, () => { fireHeld = true; updateAim(0); fire(); }, () => { fireHeld = false; });
  holdButton(btnJump, () => { jumpHeld = true; }, () => { jumpHeld = false; });

  if (IS_TOUCH) mobileCtrls.classList.add('show');

  for (const btn of weaponBtns) {
    btn.addEventListener('click', () => selectWeapon(btn.dataset.w));
  }
  resetBtn.addEventListener('click', () => {
    if (gameState !== 'menu') newGame();
  });
  if (btnPause) btnPause.addEventListener('click', togglePause);
  overlayBtn.addEventListener('click', () => {
    if (gameState === 'menu') startMode('sandbox');
    else primaryAction();
  });
  overlayBtn2.addEventListener('click', () => {
    if (gameState === 'menu') startMode('mission');
    else toMenu();
  });
  /* Buttons never keep focus: Enter / Space must not click them again (RESET!). */
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button');
    if (b) b.blur();
  });
  /* Tap the card (not a button) = start / resume / play again. */
  let cardTap = null;
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button')) return;
    cardTap = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
  });
  overlay.addEventListener('pointerup', (e) => {
    const t = cardTap; cardTap = null;
    if (!t || t.id !== e.pointerId || e.target.closest('button')) return;
    if (performance.now() - t.t <= TOUCH.tapMaxMs && Math.hypot(e.clientX - t.x, e.clientY - t.y) <= TOUCH.tapMaxMovePx) primaryAction();
  });

  /* Re-measure whenever the stage box changes (rotate, hub bar, side toolbar). */
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 60));
  if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(stage);

  /* ============================================================
     HUB BRIDGE
     ============================================================ */
  /*
    Optional; same protocol as Snake / 2048 / hub-gamebar.js (v:1). Only in a frame:
      game → hub  {type:'hub-ready'}                     on load
      hub → game  {type:'hub-hello'}                     → body.in-hub, reply hub-app
      game → hub  {type:'hub-app', app, stats, buttons}  HP / Score / Targets|Enemies;
                                                         New Game / Mode / Weapon
      game → hub  {type:'hub-stat', id, value}           on change
      hub → game  {type:'hub-action', id:'new'|'mode'|'weapon'}
      game → hub  {type:'hub-rumble', ms | pattern}      CFG.rumble events
      hub → game  {type:'hub-stick', x, y}               analog stick → aim
    Accepted only from window.parent with a same-origin / file:// origin.
  */
  const HUB_V = 1;
  const IN_FRAME = (() => { try { return window.parent && window.parent !== window; } catch (_) { return true; } })();
  let hubLinked = false;
  const hubLastSent = {};
  let lastRumbleAt = 0;
  function hubPost(msg) {
    if (!IN_FRAME) return;
    try { window.parent.postMessage(Object.assign({ v: HUB_V }, msg), '*'); } catch (_) { /* ignore */ }
  }
  function hubOriginOk(origin) {
    return origin === location.origin || origin === 'null' || location.origin === 'null' ||
      String(origin).indexOf('file:') === 0;
  }
  function hubStats() {
    const mission = currentMode === 'mission';
    return [
      { id: 'hp', label: TX.statHp, value: player ? Math.max(0, Math.floor(player.hp)) : MAX_HP },
      { id: 'score', label: TX.statScore, value: score },
      { id: 'obj', label: mission ? TX.statTargets : TX.statEnemies, value: mission ? targetsLeft() : enemiesLeft() },
    ];
  }
  function hubSendStats() {
    if (!hubLinked) return;
    hubStats().forEach((st) => {
      if (hubLastSent[st.id] === st.value) return;
      hubLastSent[st.id] = st.value;
      hubPost({ type: 'hub-stat', id: st.id, value: st.value });
    });
  }
  function hubSendApp() {
    if (!hubLinked) return;
    const stats = hubStats();
    stats.forEach((st) => { hubLastSent[st.id] = st.value; });
    hubPost({
      type: 'hub-app',
      app: { name: APP.name, version: APP.version },
      stats: stats,
      buttons: [
        { id: 'new', label: TX.newGame },
        { id: 'mode', label: fmt(TX.modeBtn, { mode: currentMode === 'mission' ? (TX.modeMission || TX.mission) : (TX.modeSandbox || TX.sandbox) }) },
        { id: 'weapon', label: fmt(TX.weaponBtn, { weapon: WEAPONS[currentWeapon].label || currentWeapon }) },
      ],
    });
  }
  /* Phone rumble via the hub: ms or a pattern; 0 / empty = off. Short buzzes are
     throttled (50 ms) so auto-fire kills do not flood the link. */
  function hubRumble(v) {
    if (!hubLinked || !v) return;
    const now = performance.now();
    if (!Array.isArray(v) && now - lastRumbleAt < 50) return;
    lastRumbleAt = now;
    if (Array.isArray(v)) hubPost({ type: 'hub-rumble', pattern: v.slice(0, 20) });
    else if (Number(v) > 0) hubPost({ type: 'hub-rumble', ms: Number(v) });
  }
  function onHubMessage(e) {
    if (e.source !== window.parent || !hubOriginOk(e.origin)) return;
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'hub-stick') {                     // no v field on this one
      const x = Number(d.x), y = Number(d.y);
      if (isFinite(x) && isFinite(y)) { hubStick.x = x; hubStick.y = y; }
      return;
    }
    if (d.v !== HUB_V) return;
    if (d.type === 'hub-hello') {
      if (!hubLinked) {
        hubLinked = true;
        document.body.classList.add('in-hub');        // own top bar + RESET hidden
        requestAnimationFrame(resize);
      }
      hubSendApp();
    } else if (d.type === 'hub-action' && hubLinked) {
      if (d.id === 'new') newGame();
      else if (d.id === 'mode') cycleMode();
      else if (d.id === 'weapon') nextWeapon();
    }
  }
  if (IN_FRAME) window.addEventListener('message', onHubMessage);

  /* ============================================================
     RENDER
     ============================================================ */

  /*
    Sky, stars, and a far ridge. Camera parallax is light.
  */
  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, CH);
    g.addColorStop(0, '#141428');
    g.addColorStop(0.6, '#1a1030');
    g.addColorStop(1, '#0a0814');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, CW, CH);
    ctx.fillStyle = 'rgba(200, 220, 255, 0.35)';
    for (let i = 0; i < 70; i++) {
      const sx = ((i * 173 + 19) - camX * 0.15) % CW;
      const sy = ((i * 71 + 41) - camY * 0.1) % 280;
      ctx.fillRect((sx + CW) % CW, (sy + 280) % 280, 1.5, 1.5);
    }
    ctx.fillStyle = 'rgba(30, 20, 50, 0.7)';
    ctx.beginPath();
    ctx.moveTo(0, CH);
    for (let i = 0; i <= 20; i++) {
      const mx = (i / 20) * CW;
      const my = CH * 0.48 - Math.sin((i + camX * 0.0003) * 0.7) * 50 - 40;
      ctx.lineTo(mx, my);
    }
    ctx.lineTo(CW, CH);
    ctx.closePath();
    ctx.fill();
  }

  /*
    Paint one tile rectangle (inclusive) into the 1px-per-tile image with the
    precomputed shades. Damaged tiles are darker than full-HP tiles.
  */
  function paintTerrain(x0, y0, x1, y1) {
    x0 = Math.max(0, x0); y0 = Math.max(0, y0);
    x1 = Math.min(GRID_W - 1, x1); y1 = Math.min(GRID_H - 1, y1);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w <= 0 || h <= 0) return;
    const img = terrainCtx.createImageData(w, h);
    const data = img.data;
    let idx = 0;
    for (let y = y0; y <= y1; y++) {
      let i = y * GRID_W + x0;
      for (let x = x0; x <= x1; x++, i++, idx += 4) {
        const m = terrain[i];
        if (m === MAT.AIR) continue;              // createImageData is all 0 (transparent)
        const c = tileShade(m, terrainHp[i]);
        data[idx] = c[0];
        data[idx + 1] = c[1];
        data[idx + 2] = c[2];
        data[idx + 3] = m === MAT.WATER ? 170 : 255;
      }
    }
    terrainCtx.putImageData(img, x0, y0);
  }

  /*
    Repaint the whole image for a new world, otherwise only the damaged
    rectangle; then blit the camera window.
  */
  function drawTerrain() {
    if (!terrain) return;
    if (terrainDirty) {
      paintTerrain(0, 0, GRID_W - 1, GRID_H - 1);
      terrainDirty = false;
      dirtyRect = null;
    } else if (dirtyRect) {
      const r = dirtyRect;
      dirtyRect = null;
      paintTerrain(r.x0, r.y0, r.x1, r.y1);
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      terrainCanvas,
      camX / TILE, camY / TILE, VIEW_W / TILE, VIEW_H / TILE,
      0, 0, CW, CH
    );
    ctx.imageSmoothingEnabled = true;
  }

  /*
    Pulsing rings for live mission targets.
  */
  function drawTargets() {
    for (const t of targets) {
      if (t.destroyed) continue;
      const sx = t.x - camX;
      const sy = t.y - camY;
      if (sx < -80 || sx > CW + 80 || sy < -80 || sy > CH + 80) continue;
      const pulse = 1 + Math.sin(performance.now() * 0.005) * 0.08;
      ctx.strokeStyle = 'rgba(255, 60, 60, 0.9)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, t.r * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#FF3B3B';
      ctx.beginPath();
      ctx.arc(sx, sy, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /*
    Blocky enemy sprites and a HP bar when hurt.
  */
  function drawEnemies() {
    for (const e of enemies) {
      if (!e.alive) continue;
      const sx = e.body.position.x - camX;
      const sy = e.body.position.y - camY;
      if (sx < -60 || sx > CW + 60 || sy < -60 || sy > CH + 60) continue;
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(sx - 12, sy - 15, 24, 30);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(sx - 8, sy - 22, 16, 10);
      const eyeX = e.facing > 0 ? sx + 2 : sx - 6;
      ctx.fillStyle = '#fff';
      ctx.fillRect(eyeX, sy - 18, 4, 4);
      if (e.hp < e.maxHp) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(sx - 14, sy - 30, 28, 4);
        ctx.fillStyle = e.hp > e.maxHp / 2 ? '#6BFF6B' : '#FF5B5B';
        ctx.fillRect(sx - 14, sy - 30, 28 * Math.max(0, e.hp / e.maxHp), 4);
      }
    }
  }

  /*
    Player body, arm along aim, short aim tick.
  */
  function drawPlayer() {
    if (!player) return;
    const sx = player.body.position.x - camX;
    const sy = player.body.position.y - camY;
    ctx.fillStyle = '#2a5a9a';
    ctx.fillRect(sx - PLAYER_W / 2, sy - PLAYER_H / 2, PLAYER_W, PLAYER_H);
    ctx.fillStyle = '#d0b090';
    ctx.fillRect(sx - 8, sy - PLAYER_H / 2 - 10, 16, 10);
    const armX = sx + Math.cos(aimAngle) * 16;
    const armY = sy - 4 + Math.sin(aimAngle) * 16;
    ctx.strokeStyle = '#d0b090';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 4);
    ctx.lineTo(armX, armY);
    ctx.stroke();
    ctx.fillStyle = WEAPONS[currentWeapon].color;
    ctx.beginPath();
    ctx.arc(armX, armY, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(armX, armY);
    ctx.lineTo(armX + Math.cos(aimAngle) * 36, armY + Math.sin(aimAngle) * 36);
    ctx.stroke();
  }

  /*
    Player shots, trails, and enemy shots.
  */
  function drawProjectiles() {
    for (const p of projectiles) {
      const sx = p.x - camX;
      const sy = p.y - camY;
      if (p.trail && p.trail.length > 1) {
        ctx.strokeStyle = p.weapon.color;
        ctx.globalAlpha = 0.4;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < p.trail.length; i++) {
          const tp = p.trail[i];
          if (i === 0) ctx.moveTo(tp.x - camX, tp.y - camY);
          else ctx.lineTo(tp.x - camX, tp.y - camY);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = p.weapon.color;
      ctx.beginPath();
      ctx.arc(sx, sy, p.weapon.radius + 1, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of enemyProjectiles) {
      ctx.fillStyle = '#FF5B5B';
      ctx.beginPath();
      ctx.arc(p.x - camX, p.y - camY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /*
    Soft radial blasts.
  */
  function drawExplosions() {
    for (const ex of explosions) {
      const t = 1 - ex.life / ex.maxLife;
      const sx = ex.x - camX;
      const sy = ex.y - camY;
      const r = ex.r * (0.6 + t * 0.6);
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, 'rgba(255,240,200,' + (1 - t) + ')');
      g.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /*
    Sparks and debris.
  */
  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x - camX, p.y - camY, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  /*
    Floating damage and score text.
  */
  function drawFloaters() {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 14px Courier New';
    for (const d of floaters) {
      ctx.globalAlpha = Math.max(0, d.life / d.maxLife);
      ctx.fillStyle = d.color;
      ctx.fillText(d.text, d.x - camX, d.y - camY);
    }
    ctx.globalAlpha = 1;
  }

  /*
    World strip: player, enemies, targets.
  */
  function drawMinimap() {
    /* Top-left: clear of the touch sticks / FIRE (bottom) and pause (top-right). */
    const mw = Math.min(150, Math.max(80, CW * 0.25));
    const mh = Math.round(mw * 0.28);
    const mx = 8;
    const my = 8;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = 'rgba(255,215,0,0.4)';
    ctx.strokeRect(mx, my, mw, mh);
    if (player) {
      ctx.fillStyle = '#6BFF6B';
      ctx.fillRect(mx + (player.body.position.x / WORLD_W) * mw, my + (player.body.position.y / WORLD_H) * mh, 3, 3);
    }
    ctx.fillStyle = '#FF5B5B';
    for (const e of enemies) {
      if (!e.alive) continue;
      ctx.fillRect(mx + (e.body.position.x / WORLD_W) * mw, my + (e.body.position.y / WORLD_H) * mh, 2, 2);
    }
    ctx.fillStyle = '#FFD700';
    for (const t of targets) {
      if (t.destroyed) continue;
      ctx.fillRect(mx + (t.x / WORLD_W) * mw - 1, my + (t.y / WORLD_H) * mh - 1, 3, 3);
    }
  }

  /*
    Gold exit posts at the east edge so the end of the map is visible.
  */
  function drawExit() {
    const x = WORLD_W - 28 - camX;
    if (x < -40 || x > CW + 40) return;
    const locked = gateLocked();
    ctx.fillStyle = locked ? '#FF5B5B' : '#FFD700';
    ctx.fillRect(x, 40, 6, CH - 80);
    ctx.fillRect(x - 18, 40, 42, 6);
    if (locked) {
      for (let yy = 60; yy < CH - 40; yy += 26) ctx.fillRect(x - 18, yy, 42, 3);
    }
    ctx.font = '12px Courier New';
    ctx.textAlign = 'left';
    ctx.fillText(locked ? 'LOCKED' : 'EXIT', x - (locked ? 16 : 8), 32);
  }

  /*
    Full frame. Order is back to front.
  */
  function render() {
    drawBackground();
    drawTerrain();
    drawExit();
    drawTargets();
    drawEnemies();
    drawProjectiles();
    drawPlayer();
    drawExplosions();
    drawParticles();
    drawFloaters();
    drawMinimap();
  }

  /* ============================================================
     CAMERA AND LOOP
     ============================================================ */

  /*
    Ease the camera toward the player and clamp to the world.
  */
  function updateCamera(dt) {
    if (!player) return;
    const targetX = player.body.position.x - VIEW_W / 2;
    const targetY = player.body.position.y - VIEW_H / 2 - 30;
    camX += (targetX - camX) * Math.min(1, dt * 6);
    camY += (targetY - camY) * Math.min(1, dt * 6);
    const maxX = Math.max(0, WORLD_W - VIEW_W);
    const maxY = Math.max(0, WORLD_H - VIEW_H);
    camX = Math.max(0, Math.min(maxX, camX));
    camY = Math.max(0, Math.min(maxY, camY));
  }

  /*
    Age blasts, sparks, and floaters. Used in play and on the end card.
  */
  function updateFx(dt) {
    for (let i = explosions.length - 1; i >= 0; i--) {
      explosions[i].life -= dt;
      if (explosions[i].life <= 0) explosions.splice(i, 1);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.gravity) p.vy += p.gravity * dt;
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const d = floaters[i];
      d.life -= dt;
      d.y -= 28 * dt;
      if (d.life <= 0) floaters.splice(i, 1);
    }
  }

  /* Seconds not yet consumed by fixed steps. */
  let accumulator = 0;
  /* Last frame timestamp. */
  let lastTime = 0;

  /*
    Fixed step: input, Matter, chunks, shots, AI, fluids.
    Ground flag is cleared before contacts and set by the collision listener.
  */
  function simStep() {
    updatePlayerInput();
    if (player) player.onGround = false;
    if (player) player.fireCooldown = Math.max(0, player.fireCooldown - FIXED_DT);
    updateAim(FIXED_DT);
    const w = WEAPONS[currentWeapon];
    if ((mouseDown || fireHeld || fireKeyHeld) && w.auto) fire();
    Engine.update(engine, FIXED_DT * 1000);
    rebuildChunksInView();
    updateProjectiles(FIXED_DT);
    updateEnemies(FIXED_DT);
    updateEnemyProjectiles(FIXED_DT);
    applyFluids(FIXED_DT);
    updateFx(FIXED_DT);
    updateCamera(FIXED_DT);
    checkGameConditions();
  }

  /*
    Render loop. Playing state runs as many 1/60 steps as the frame earned.
  */
  function loop(now) {
    requestAnimationFrame(loop);
    const frameDt = Math.min(0.05, (now - lastTime) / 1000 || 0);
    lastTime = now;
    if (gameState === 'playing') {
      accumulator += frameDt;
      let guard = 0;
      while (accumulator >= FIXED_DT && guard < 4) {
        simStep();
        accumulator -= FIXED_DT;
        guard++;
      }
    } else if (gameState !== 'paused') {
      updateFx(frameDt);
    }
    render();
  }

  /* Boot into the menu. World is built when a mode button is pressed. */
  Events.on(engine, 'collisionActive', onCollisionActive);
  /* Touch sizes from config → CSS variables. */
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--stick', TOUCH.stick + 'px');
  rootStyle.setProperty('--knob', TOUCH.knob + 'px');
  rootStyle.setProperty('--fire', TOUCH.fire + 'px');
  rootStyle.setProperty('--jump', TOUCH.jump + 'px');
  /* Weapon labels from config. */
  for (const btn of weaponBtns) {
    const w = WEAPONS[btn.dataset.w];
    if (w && btn.firstChild && btn.firstChild.nodeType === 3) btn.firstChild.textContent = (w.label || w.name).toUpperCase() + ' ';
  }
  resize();
  updateAmmoUI();
  showOverlay('menu');
  hubPost({ type: 'hub-ready' });
  requestAnimationFrame((t) => {
    lastTime = t;
    requestAnimationFrame(loop);
  });
})();
