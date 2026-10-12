// Shared game state plus world/level building and bird loading.
import { Engine, Bodies, Body, Composite, WORLD_WIDTH, WORLD_HEIGHT, GROUND_Y, SLING_X, SLING_Y, MAT, GRAVITY, BIRD_FRICTION_AIR, PIG_HP } from './config.js';
import { LEVELS } from './levels.js';
import { engine } from './physics.js';
import { updateHud, endGame, hideOverlay } from './ui.js';

export const S = {
  currentLevelIndex: 0,
  birdQueue: [],         // array of bird types remaining
  currentBird: null,     // { body, type, launched }
  activeBirds: [],       // birds in flight
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
  S.currentBird = null;
  S.birdQueue = [];
  S.turnResolveTimer = 0;
  S.levelEnding = false;
  S.isDragging = false;
}

export function buildLevel(index) {
  clearWorld();
  S.currentLevelIndex = index;
  const level = LEVELS[index];
  S.score = 0;
  S.gameState = 'idle';

  // Ground
  S.ground = Bodies.rectangle(
    WORLD_WIDTH / 2, GROUND_Y + 60,
    WORLD_WIDTH * 2, 120,
    { isStatic: true, friction: 0.9, restitution: 0.05 }
  );
  Composite.add(engine.world, S.ground);

  // Invisible wall on the left so nothing flies out weirdly
  Composite.add(engine.world, Bodies.rectangle(-30, WORLD_HEIGHT / 2, 60, WORLD_HEIGHT * 2, { isStatic: true }));

  // Blocks
  for (const b of level.blocks) {
    const mat = MAT[b.material];
    const opts = { friction: mat.friction, restitution: mat.restitution, density: mat.density };
    const body = b.r
      ? Bodies.circle(b.x, b.y, b.r, opts)
      : Bodies.rectangle(b.x, b.y, b.w, b.h, opts);
    if (b.angle) Body.setAngle(body, b.angle);
    Composite.add(engine.world, body);
    const entry = { kind: 'block', body, material: b.material, w: b.w, h: b.h, r: b.r, hp: mat.hp, maxHp: mat.hp, flash: 0, dead: false };
    body.plugin.entity = entry;
    S.blocks.push(entry);
  }

  // Pigs
  for (const p of level.pigs) {
    const body = Bodies.circle(p.x, p.y, p.r, {
      friction: 0.5,
      restitution: 0.3,
      density: 0.0008
    });
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
