// Shared game state plus world/level building and bird loading.
import { Engine, Bodies, Body, Composite, SLING_X, SLING_Y, MAT, GRAVITY, BIRD_FRICTION_AIR, PIG_HP } from './config.js?v=sb1a';
import { getLevel } from './levels.js?v=sb1a';
import { makeGround, makeLeftWall, makeBlockBody, makePigBody, makePlatformBody } from './bodies.js?v=sb1a';
import { engine } from './physics.js?v=sb1a';
import { updateHud, endGame, hideOverlay } from './ui.js?v=sb1a';

export const S = {
  levelNo: 0,            // level number 0-50 (00 = demo)
  birdQueue: [],         // array of bird types remaining
  currentBird: null,     // { body, type, launched }
  activeBirds: [],       // birds in flight
  platforms: [],         // static rock { kind:'platform', body, w, h, shape }
  pigs: [],              // { kind:'pig', body, r, hp, maxHp, flash, dead }
  blocks: [],            // { kind:'block', body, material, w, h, r?, hp, maxHp, flash, dead }
  spawnTime: 0,          // engine timestamp when the level was built (damage grace)
  ground: null,

  score: 0,
  isDragging: false,
  dragPos: { x: 0, y: 0 },
  gameState: 'idle',     // 'idle' | 'aiming' | 'flying' | 'waiting' | 'levelclear' | 'gameover'
  turnResolveTimer: 0,   // countdown to next turn after birds settle
  levelEnding: false,
  winTimer: 0,           // pending level-clear timeout
  flightTime: 0,         // seconds since last launch
  pops: []               // pig pop effects { x, y, r, t }
};

export function clearWorld() {
  Composite.clear(engine.world, false, true);
  Engine.clear(engine);
  engine.gravity.y = GRAVITY;
  clearTimeout(S.winTimer);
  S.winTimer = 0;
  S.flightTime = 0;
  S.pops = [];
  S.activeBirds = [];
  S.pigs = [];
  S.blocks = [];
  S.platforms = [];
  S.currentBird = null;
  S.birdQueue = [];
  S.turnResolveTimer = 0;
  S.levelEnding = false;
  S.isDragging = false;
}

export function buildLevel(n) {
  clearWorld();
  S.levelNo = n;
  const level = getLevel(n);
  S.score = 0;
  S.gameState = 'idle';

  S.ground = makeGround();
  Composite.add(engine.world, S.ground);
  Composite.add(engine.world, makeLeftWall());

  // Platforms (static hills and ledges)
  for (const pl of level.platforms) {
    const body = makePlatformBody(pl);
    Composite.add(engine.world, body);
    S.platforms.push({ kind: 'platform', body, w: pl.w, h: pl.h, shape: pl.kind });
  }

  // Blocks
  for (const b of level.blocks) {
    const mat = MAT[b.material];
    const body = makeBlockBody(b);
    Composite.add(engine.world, body);
    const entry = { kind: 'block', body, material: b.material, w: b.w, h: b.h, r: b.r, hp: mat.hp, maxHp: mat.hp, flash: 0, dead: false };
    body.plugin.entity = entry;
    S.blocks.push(entry);
  }

  // Pigs
  for (const p of level.pigs) {
    const body = makePigBody(p);
    Composite.add(engine.world, body);
    const entry = { kind: 'pig', body, r: p.r, hp: PIG_HP, maxHp: PIG_HP, flash: 0, dead: false };
    body.plugin.entity = entry;
    S.pigs.push(entry);
  }

  S.spawnTime = engine.timing.timestamp;

  // Bird queue
  S.birdQueue = Array(level.birds).fill('red');

  updateHud();
  loadNextBird();
  hideOverlay();
}

export function loadNextBird() {
  if (S.levelEnding) return;

  if (S.birdQueue.length === 0) {
    S.currentBird = null;
    updateHud();
    // If pigs still alive, game over
    if (S.pigs.some(p => !p.dead)) {
      endGame(false);
    }
    return;
  }

  const type = S.birdQueue.shift();
  const body = Bodies.circle(SLING_X, SLING_Y, 18, {
    friction: 0.6,
    restitution: 0.4,
    density: 0.004,
    frictionAir: BIRD_FRICTION_AIR
  });
  Body.setStatic(body, true);
  Composite.add(engine.world, body);

  S.currentBird = { body, type, launched: false };
  S.gameState = 'idle';
  updateHud();
}
