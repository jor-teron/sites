/*
  File: core/physics.js
  Project: Demolisher
  Purpose: Chunk collision bodies (one compound static body per 32-tile chunk) and the player (input state, movement, contacts, damage).
  Plain script (no modules): top-level const / let / function share one global scope with the
  other core/*.js files, loaded in the order listed in demolisher.html.
  Uses: state.js, terrain.js.
*/

'use strict';

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
