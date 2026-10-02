/*
  File: demolisher.js
  Project: Demolisher
  Purpose: Destructible-terrain sandbox. Matter.js moves the player and enemies.
           Terrain is a tile grid. Only nearby solid runs become static bodies.
  Depends: Matter 0.19 global, demolisher.html element ids, demolisher.css.
*/

(() => {
  'use strict';

  /* Matter pieces used by the sim. Engine drives contacts. Bodies are player and enemies. */
  const { Engine, Composite, Bodies, Body, Events } = Matter;

  /* ============================================================
     CONFIG
     ============================================================ */

  /* World width in pixels. Wider than the view so the camera can scroll. */
  const WORLD_W = 5000;
  /* World height in pixels. Ground sits near 45 percent of this. */
  const WORLD_H = 1400;
  /* Tile edge in pixels. Render and collision share this size. */
  const TILE = 14;
  /* Tile columns. */
  const GRID_W = Math.ceil(WORLD_W / TILE);
  /* Tile rows. */
  const GRID_H = Math.ceil(WORLD_H / TILE);
  /* Matter gravity. Positive Y is down. */
  const GRAVITY = 1.0;
  /* Player body width. */
  const PLAYER_W = 22;
  /* Player body height. */
  const PLAYER_H = 34;
  /* Target horizontal speed in Matter pixels per tick (Engine.update). */
  const PLAYER_SPEED = 4.6;
  /* Jump velocity in Matter pixels per tick. Negative is up. */
  const PLAYER_JUMP = 10.5;
  /* Starting and maximum hit points. */
  const MAX_HP = 100;
  /* Fixed sim step in seconds. Render stays on requestAnimationFrame. */
  const FIXED_DT = 1 / 60;
  /* Chunk edge in tiles. One static compound per chunk. */
  const CHUNK = 32;
  /* Max chunk body rebuilds per step so a blast does not hitch the frame. */
  const MAX_CHUNK_REBUILDS = 2;
  /* Material ids. Zero is empty. */
  const MAT = {
    AIR: 0,
    DIRT: 1,
    GRASS: 2,
    STONE: 3,
    WATER: 4,
    CRATE: 5,
    METAL: 6,
    LAVA: 7,
    TARGET: 8
  };
  /* Per-material paint and durability. solid false means no chunk body. */
  const MAT_INFO = {
    [MAT.DIRT]:   { color: '#7a4a2a', dark: '#2a140c', hp: 30,  solid: true },
    [MAT.GRASS]:  { color: '#3a7a3a', dark: '#102010', hp: 30,  solid: true },
    [MAT.STONE]:  { color: '#6a6a6a', dark: '#222222', hp: 80,  solid: true },
    [MAT.WATER]:  { color: '#2a5a9a', dark: '#1a3a6a', hp: 9999, solid: false },
    [MAT.CRATE]:  { color: '#c68a4a', dark: '#5a3010', hp: 20,  solid: true },
    [MAT.METAL]:  { color: '#9a9a9a', dark: '#3a3a3a', hp: 250, solid: true },
    [MAT.LAVA]:   { color: '#d05020', dark: '#8a2010', hp: 9999, solid: false },
    [MAT.TARGET]: { color: '#e03030', dark: '#5a0808', hp: 40,  solid: true }
  };
  /* Weapon table. Speeds are pixels per second. explosion 0 is a direct hit. */
  const WEAPONS = {
    pistol:  { name: 'pistol',  ammo: Infinity, cooldown: 0.16, speed: 980,  damage: 8,  radius: 3, color: '#FFE66D', explosion: 0,  gravity: 0,    fuse: 1.6, auto: true },
    rocket:  { name: 'rocket',  ammo: 10,       cooldown: 0.85, speed: 460,  damage: 60, radius: 4, color: '#FF8C42', explosion: 62, gravity: 40,   fuse: 3.2, auto: false },
    grenade: { name: 'grenade', ammo: 5,        cooldown: 1.0,  speed: 380,  damage: 50, radius: 4, color: '#A050FF', explosion: 70, gravity: 520,  fuse: 1.35, auto: false },
    laser:   { name: 'laser',   ammo: 50,       cooldown: 0.07, speed: 1500, damage: 4,  radius: 2, color: '#6BE8FF', explosion: 0,  gravity: 0,    fuse: 1.1, auto: true }
  };

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
  const ammoEls = {
    pistol: document.getElementById('ammo-pistol'),
    rocket: document.getElementById('ammo-rocket'),
    grenade: document.getElementById('ammo-grenade'),
    laser: document.getElementById('ammo-laser')
  };
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
    CW = Math.max(200, Math.floor(rect.width));
    CH = Math.max(200, Math.floor(rect.height));
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
  /* True when the offscreen image must be rebuilt. */
  let terrainDirty = true;

  /*
    Allocate grids and the offscreen canvas.
    Called at the start of every world generate.
  */
  function initTerrain() {
    terrain = new Uint8Array(GRID_W * GRID_H);
    terrainHp = new Uint16Array(GRID_W * GRID_H);
    terrainCanvas = document.createElement('canvas');
    terrainCanvas.width = GRID_W;
    terrainCanvas.height = GRID_H;
    terrainCtx = terrainCanvas.getContext('2d', { willReadFrequently: true });
    terrainCtx.imageSmoothingEnabled = false;
    terrainDirty = true;
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
    terrainDirty = true;
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

  /*
    Blend intact color toward the dark color as HP falls.
  */
  function tileColor(m, hp) {
    const info = MAT_INFO[m];
    const c = hexToRgb(info.color);
    const d = hexToRgb(info.dark);
    const k = Math.max(0, Math.min(1, hp / info.hp));
    return {
      r: Math.round(d.r + (c.r - d.r) * k),
      g: Math.round(d.g + (c.g - d.g) * k),
      b: Math.round(d.b + (c.b - d.b) * k)
    };
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
      for (let i = 0; i < 40; i++) {
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
  /* Keyboard state. Lowercase and raw key both stored. */
  const keys = {};
  /* Left stick axes, -1 to 1. */
  let joyMoveAxis = { x: 0, y: 0 };
  /* Right stick axes. */
  let joyAimAxis = { x: 0, y: 0 };
  /* Edge detect is unused. Hold-jump uses jumpLock on the player instead. */
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
    if (keys['a'] || keys['arrowleft'] || joyMoveAxis.x < -0.3) input -= 1;
    if (keys['d'] || keys['arrowright'] || joyMoveAxis.x > 0.3) input += 1;
    if (input !== 0) player.facing = input;
    const want = input * PLAYER_SPEED;
    const vx = b.velocity.x + (want - b.velocity.x) * (player.onGround ? 0.35 : 0.12);
    Body.setVelocity(b, { x: vx, y: b.velocity.y });
    if (player.jumpLock > 0) player.jumpLock -= FIXED_DT;
    const jumpPressed = keys['w'] || keys['arrowup'] || keys[' '] || joyMoveAxis.y < -0.55 || jumpHeld;
    if (jumpPressed && player.onGround && player.jumpLock <= 0) {
      Body.setVelocity(b, { x: b.velocity.x, y: -PLAYER_JUMP });
      player.onGround = false;
      player.jumpLock = 0.32;
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
        player.lavaTick = 0.35;
        hurtPlayer(8, b.position.x, b.position.y - 24);
      }
    }
  }

  /*
    Apply damage, float a red number, refresh HUD.
  */
  function hurtPlayer(amount, x, y) {
    if (!player || gameState !== 'playing') return;
    player.hp = Math.max(0, player.hp - amount);
    addFloater(x, y, '-' + Math.ceil(amount), '#FF5B5B');
    updateHud();
  }

  /* ============================================================
     WEAPONS
     ============================================================ */

  /* Active weapon id. */
  let currentWeapon = 'pistol';
  /* Remaining shots. Pistol stays Infinity. */
  let ammoRemaining = { pistol: Infinity, rocket: 10, grenade: 5, laser: 50 };
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
  /* Touch fire held. */
  let fireHeld = false;

  /*
    Convert a canvas CSS point to world pixels.
  */
  function screenToWorld(sx, sy) {
    return { x: sx + camX, y: sy + camY };
  }

  /*
    Point aim at the mouse when it has moved.
  */
  function updateAimFromMouse() {
    if (!player || !mouseAimReady) return;
    const w = screenToWorld(mouseScreenPos.x, mouseScreenPos.y);
    aimAngle = Math.atan2(w.y - (player.body.position.y - 4), w.x - player.body.position.x);
  }

  /*
    Spawn a projectile if cooldown and ammo allow.
  */
  function fire() {
    if (!player || gameState !== 'playing') return;
    if (player.fireCooldown > 0) return;
    const w = WEAPONS[currentWeapon];
    if (ammoRemaining[currentWeapon] <= 0) {
      showHint('No ammo', 700);
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
        hurtPlayer(damage * 0.35 * falloff, player.body.position.x, player.body.position.y - 30);
        const ang = Math.atan2(player.body.position.y - y, player.body.position.x - x);
        Body.setVelocity(player.body, {
          x: player.body.velocity.x + Math.cos(ang) * 8,
          y: player.body.velocity.y + Math.sin(ang) * 8 - 2
        });
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
    terrainHp[i] -= dmg;
    terrainDirty = true;
    if (terrainHp[i] > 0) return false;
    const wx = gx * TILE + TILE / 2;
    const wy = gy * TILE + TILE / 2;
    terrain[i] = MAT.AIR;
    terrainHp[i] = 0;
    if (m === MAT.TARGET) {
      for (const t of targets) {
        if (!t.destroyed && Math.hypot(t.x - wx, t.y - wy) < TILE * 2) {
          t.destroyed = true;
          score += 500;
          addFloater(t.x, t.y - 20, '+500', '#FFD700');
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
      score += 500;
      addFloater(t.x, t.y - 28, '+500', '#FFD700');
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
      hp: 40,
      maxHp: 40,
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
      e.alerted = dist < 360;
      e.facing = e.alerted ? (dx > 0 ? 1 : -1) : e.walkDir;
      const speed = e.alerted ? 2.1 : 1.3;
      const dir = e.alerted ? e.facing : e.walkDir;
      Body.setVelocity(b, { x: dir * speed, y: b.velocity.y });
      const lookX = b.position.x + dir * 16;
      const gxA = Math.floor(lookX / TILE);
      const gyFoot = Math.floor((b.position.y + 20) / TILE);
      const gyBody = Math.floor(b.position.y / TILE);
      if (isSolid(gxA, gyBody) || !isSolid(gxA, gyFoot)) e.walkDir *= -1;
      e.lastShot -= dt;
      if (e.alerted && e.lastShot <= 0 && dist < 420 && dist > 24) {
        e.lastShot = 1.4 + Math.random();
        const angle = Math.atan2(dy, dx);
        enemyProjectiles.push({
          x: b.position.x + Math.cos(angle) * 18,
          y: b.position.y + Math.sin(angle) * 18,
          vx: Math.cos(angle) * 420,
          vy: Math.sin(angle) * 420,
          life: 2.2,
          damage: 8
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
          hurtPlayer(p.damage, player.body.position.x, player.body.position.y - 28);
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
    score += 100;
    addFloater(e.body.position.x, e.body.position.y - 26, '+100', '#FFD700');
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
    targets.push({ x, y, r: 22, hp: 46, maxHp: 46, destroyed: false });
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
  /* menu, playing, dead, won. Overlay is derived from this. */
  let gameState = 'menu';

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
    Left wall, floor, and a soft right stop so the body cannot leave the map.
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
    currentWeapon = 'pistol';
    ammoRemaining = { pistol: Infinity, rocket: 10, grenade: 5, laser: 50 };
    updateAmmoUI();
    for (const btn of weaponBtns) btn.classList.toggle('active', btn.dataset.w === 'pistol');
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
    gameState = 'playing';
    updateHud();
    hideOverlay();
    showHint('SANDBOX — walk east to the gold gate', 2600);
  }

  /*
    Open mission: three targets and a line of walkers.
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
    const spots = [0.42, 0.62, 0.84];
    for (const f of spots) {
      const tx = Math.floor(GRID_W * f);
      spawnTarget(tx * TILE, (sy - 3) * TILE);
    }
    for (let i = 0; i < 7; i++) {
      spawnEnemy((0.32 + i * 0.08) * WORLD_W, (sy - 3) * TILE);
    }
    gameState = 'playing';
    updateHud();
    hideOverlay();
    showHint('MISSION — targets, then the east gate', 2600);
  }

  /* ============================================================
     HUD AND OVERLAY
     ============================================================ */

  /*
    Push HP, score, and counts into the chips.
  */
  function updateHud() {
    if (player) {
      hudHp.textContent = Math.max(0, Math.floor(player.hp));
      statHealth.classList.toggle('low', player.hp < 30);
    }
    hudScore.textContent = score;
    hudTargets.textContent = targets.filter(t => !t.destroyed).length;
    hudEnemies.textContent = enemies.filter(e => e.alive).length;
  }

  /*
    Write ammo counts and grey empty weapons.
  */
  function updateAmmoUI() {
    ammoEls.pistol.textContent = ammoRemaining.pistol === Infinity ? '∞' : ammoRemaining.pistol;
    ammoEls.rocket.textContent = ammoRemaining.rocket;
    ammoEls.grenade.textContent = ammoRemaining.grenade;
    ammoEls.laser.textContent = ammoRemaining.laser;
    for (const btn of weaponBtns) {
      const w = btn.dataset.w;
      const ammo = ammoRemaining[w];
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
  }

  /*
    Fill the card from state. Buttons are never removed, only relabeled.
  */
  function showOverlay(state) {
    const keysText = 'MOVE A/D or arrows  •  JUMP W / SPACE\nAIM mouse  •  FIRE click  •  WEAPONS 1-4';
    if (state === 'menu') {
      overlayTitle.textContent = 'DEMOLISHER';
      overlayLine.innerHTML = 'Destroy the world. Blow up <span class="accent">red targets</span>. Kill <span class="accent">enemies</span>.';
      overlayKeys.textContent = keysText;
      overlayBtn.textContent = 'SANDBOX';
      overlayBtn2.textContent = 'MISSION';
      overlayBtn2.style.display = '';
    } else if (state === 'dead') {
      overlayTitle.textContent = 'YOU DIED';
      overlayLine.textContent = 'Score: ' + score;
      overlayKeys.textContent = '';
      overlayBtn.textContent = 'RETRY';
      overlayBtn2.textContent = 'MENU';
      overlayBtn2.style.display = '';
    } else if (state === 'won' || state === 'exit') {
      overlayTitle.textContent = state === 'exit' ? 'EDGE OF THE MAP' : 'MISSION COMPLETE';
      overlayLine.textContent = state === 'exit'
        ? 'The ridge stops here. Past the gold gate there is nothing. Score: ' + score
        : 'The targets are down. The ridge is quiet. Score: ' + score;
      overlayKeys.textContent = 'Nothing past this line. Turn back, or leave.';
      overlayBtn.textContent = 'PLAY AGAIN';
      overlayBtn2.textContent = 'MENU';
      overlayBtn2.style.display = '';
    }
    overlay.classList.remove('hidden');
  }

  /*
    Rising combat text.
  */
  function addFloater(x, y, text, color) {
    floaters.push({ x, y, text, color: color || '#FFD700', life: 0.8, maxLife: 0.8 });
  }

  /*
    Death and mission-clear checks. Overlay text comes from state, not DOM edits.
  */
  function checkGameConditions() {
    if (!player || gameState !== 'playing') return;
    if (player.hp <= 0) {
      gameState = 'dead';
      showOverlay('dead');
      return;
    }
    if (currentMode === 'mission' && targets.length > 0 && targets.every(t => t.destroyed)) {
      gameState = 'won';
      showOverlay('won');
      return;
    }
    if (player.body.position.y > WORLD_H - 30) {
      Body.setPosition(player.body, { x: player.body.position.x, y: WORLD_H - 80 });
      Body.setVelocity(player.body, { x: player.body.velocity.x, y: 0 });
    }
    if (player.body.position.x > WORLD_W - 40) {
      Body.setPosition(player.body, { x: WORLD_W - 40, y: player.body.position.y });
      Body.setVelocity(player.body, { x: 0, y: player.body.velocity.y });
      gameState = 'exit';
      showOverlay('exit');
    }
  }

  /* ============================================================
     INPUT
     ============================================================ */

  /*
    Select a weapon if it still has ammo.
  */
  function selectWeapon(name) {
    if (!WEAPONS[name]) return;
    if (ammoRemaining[name] <= 0) {
      showHint('No ammo', 700);
      return;
    }
    currentWeapon = name;
    for (const btn of weaponBtns) btn.classList.toggle('active', btn.dataset.w === name);
  }

  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
    keys[k.toLowerCase()] = true;
    if (k === '1') selectWeapon('pistol');
    if (k === '2') selectWeapon('rocket');
    if (k === '3') selectWeapon('grenade');
    if (k === '4') selectWeapon('laser');
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
  });
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseScreenPos.x = e.clientX - rect.left;
    mouseScreenPos.y = e.clientY - rect.top;
    mouseAimReady = true;
  });
  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    mouseDown = true;
    updateAimFromMouse();
    fire();
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseDown = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  /*
    Bind a joystick element. onUpdate receives axes in -1..1.
  */
  function setupJoystick(el, knobEl, onUpdate) {
    let active = false;
    let id = null;
    let startX = 0;
    let startY = 0;
    const R = 40;
    function move(cx, cy) {
      let dx = cx - startX;
      let dy = cy - startY;
      const len = Math.hypot(dx, dy);
      if (len > R) {
        dx = dx / len * R;
        dy = dy / len * R;
      }
      knobEl.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      onUpdate(dx / R, dy / R);
    }
    function end(e) {
      for (const t of e.changedTouches) {
        if (t.identifier === id) {
          active = false;
          id = null;
          knobEl.style.transform = '';
          onUpdate(0, 0);
        }
      }
    }
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      id = t.identifier;
      const rect = el.getBoundingClientRect();
      startX = rect.left + rect.width / 2;
      startY = rect.top + rect.height / 2;
      active = true;
      move(t.clientX, t.clientY);
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      if (!active) return;
      for (const t of e.changedTouches) {
        if (t.identifier === id) {
          e.preventDefault();
          move(t.clientX, t.clientY);
        }
      }
    }, { passive: false });
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('touchcancel', end, { passive: false });
  }

  setupJoystick(joyMove, joyMoveKnob, (x, y) => {
    joyMoveAxis.x = x;
    joyMoveAxis.y = y;
  });
  setupJoystick(joyAim, joyAimKnob, (x, y) => {
    joyAimAxis.x = x;
    joyAimAxis.y = y;
    if (Math.hypot(x, y) > 0.35) aimAngle = Math.atan2(y, x);
  });
  btnFire.addEventListener('touchstart', (e) => {
    e.preventDefault();
    fireHeld = true;
    if (Math.hypot(joyAimAxis.x, joyAimAxis.y) < 0.35 && player) {
      aimAngle = player.facing > 0 ? 0 : Math.PI;
    }
    fire();
  }, { passive: false });
  btnFire.addEventListener('touchend', () => { fireHeld = false; });
  btnFire.addEventListener('touchcancel', () => { fireHeld = false; });
  btnJump.addEventListener('touchstart', (e) => {
    e.preventDefault();
    jumpHeld = true;
  }, { passive: false });
  btnJump.addEventListener('touchend', () => { jumpHeld = false; });
  btnJump.addEventListener('touchcancel', () => { jumpHeld = false; });

  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    mobileCtrls.classList.add('show');
  }

  for (const btn of weaponBtns) {
    btn.addEventListener('click', () => selectWeapon(btn.dataset.w));
  }
  resetBtn.addEventListener('click', () => {
    if (currentMode === 'mission' && gameState !== 'menu') setupMission();
    else if (gameState !== 'menu') setupSandbox();
  });
  overlayBtn.addEventListener('click', () => {
    if (gameState === 'menu') setupSandbox();
    else if (currentMode === 'mission') setupMission();
    else setupSandbox();
  });
  overlayBtn2.addEventListener('click', () => {
    if (gameState === 'menu') setupMission();
    else {
      gameState = 'menu';
      showOverlay('menu');
    }
  });
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 60));

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
    Rebuild the 1px-per-tile image if dirty, then blit the camera window.
    Damaged tiles are darker than full-HP tiles.
  */
  function drawTerrain() {
    if (terrainDirty && terrain) {
      const img = terrainCtx.createImageData(GRID_W, GRID_H);
      const data = img.data;
      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          const i = ti(x, y);
          const m = terrain[i];
          const idx = i * 4;
          if (m === MAT.AIR) {
            data[idx + 3] = 0;
          } else {
            const c = tileColor(m, terrainHp[i]);
            data[idx] = c.r;
            data[idx + 1] = c.g;
            data[idx + 2] = c.b;
            data[idx + 3] = m === MAT.WATER ? 170 : 255;
          }
        }
      }
      terrainCtx.putImageData(img, 0, 0);
      terrainDirty = false;
    }
    if (!terrainCanvas) return;
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
    const mw = 150;
    const mh = 42;
    const mx = CW - mw - 8;
    const my = CH - mh - 8;
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
    ctx.fillStyle = '#FFD700';
    ctx.fillRect(x, 40, 6, CH - 80);
    ctx.fillRect(x - 18, 40, 42, 6);
    ctx.font = '12px Courier New';
    ctx.fillText('EXIT', x - 8, 32);
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
    updateAimFromMouse();
    const w = WEAPONS[currentWeapon];
    if ((mouseDown || fireHeld) && w.auto) fire();
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
    } else {
      updateFx(frameDt);
    }
    render();
  }

  /* Boot into the menu. World is built when a mode button is pressed. */
  Events.on(engine, 'collisionActive', onCollisionActive);
  resize();
  showOverlay('menu');
  requestAnimationFrame((t) => {
    lastTime = t;
    requestAnimationFrame(loop);
  });
})();
