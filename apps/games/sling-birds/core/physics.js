// Physics engine, collision handling (pig hits) and turn resolution.
import { Engine, Composite, Events, Vector, WORLD_WIDTH, WORLD_HEIGHT, GRAVITY, SETTLE_SPEED, SETTLE_MAX_TIME, MAT, PIG_SCORE, DMG_MIN, DMG_K, DMG_MASS_MIN, DMG_MASS_MAX, SPAWN_GRACE_MS, HIT_FLASH } from './config.js?v=sb1a';
import { S } from './entities.js?v=sb1a';
import { updateHud, endGame, showHint } from './ui.js?v=sb1a';
import { loadNextBird } from './entities.js?v=sb1a';

export const engine = Engine.create();
engine.gravity.y = GRAVITY;

// ---------- COLLISION DAMAGE (HP) ----------
// Damage = (normal relative speed - DMG_MIN) * DMG_K * clamp(otherMass / ownMass)
Events.on(engine, 'collisionStart', (event) => {
  if (engine.timing.timestamp - S.spawnTime < SPAWN_GRACE_MS) return;
  for (const pair of event.pairs) {
    applyHit(pair.bodyA, pair.bodyB, pair);
    applyHit(pair.bodyB, pair.bodyA, pair);
  }
});

function applyHit(self, other, pair) {
  const e = self.plugin.entity;
  if (!e || e.dead) return;
  const n = pair.collision.normal;
  const relN = Math.abs(Vector.dot(Vector.sub(self.velocity, other.velocity), n));
  if (relN < DMG_MIN) return;
  const ratio = other.isStatic ? 1 : Math.min(DMG_MASS_MAX, Math.max(DMG_MASS_MIN, other.mass / self.mass));
  const dmg = (relN - DMG_MIN) * DMG_K * ratio;
  e.hp -= dmg;
  e.flash = HIT_FLASH;
  if (e.hp <= 0) {
    if (e.kind === 'pig') killPig(e); else breakBlock(e);
  }
}

function breakBlock(entry) {
  if (entry.dead) return;
  entry.dead = true;
  Composite.remove(engine.world, entry.body);
  S.blocks = S.blocks.filter(b => b !== entry);
  S.score += MAT[entry.material].score;
  S.pops.push({ x: entry.body.position.x, y: entry.body.position.y, r: entry.r || Math.max(entry.w, entry.h) / 2, t: 0, material: entry.material });
  updateHud();
}

function killPig(pigEntry) {
  if (pigEntry.dead) return;
  pigEntry.dead = true;
  pigEntry.hp = 0;
  S.score += PIG_SCORE;
  updateHud();
  // Remove the body immediately (no invisible collider); draw a separate pop effect
  Composite.remove(engine.world, pigEntry.body);
  S.pops.push({ x: pigEntry.body.position.x, y: pigEntry.body.position.y, r: pigEntry.r, t: 0 });

  // Win condition
  if (S.pigs.every(p => p.dead) && !S.levelEnding) {
    S.levelEnding = true;
    // Small delay so the player sees the last pig die
    // Cancelled by clearWorld() on reset / level change
    S.winTimer = setTimeout(() => { S.winTimer = 0; endGame(true); }, 900);
  }
}

// ---------- TURN RESOLUTION (called each frame) ----------
export function updateTurnResolution(dt) {
  // Remove birds that flew off screen
  for (let i = S.activeBirds.length - 1; i >= 0; i--) {
    const b = S.activeBirds[i];
    if (b.body.position.x < -100 ||
        b.body.position.x > WORLD_WIDTH + 200 ||
        b.body.position.y > WORLD_HEIGHT + 200) {
      Composite.remove(engine.world, b.body);
      S.activeBirds.splice(i, 1);
    }
  }

  // Hit flashes
  for (const e of S.pigs) if (e.flash > 0) e.flash -= dt;
  for (const e of S.blocks) if (e.flash > 0) e.flash -= dt;

  // Pop effects
  for (const p of S.pops) p.t += dt;
  S.pops = S.pops.filter(p => p.t < 0.35);

  if (S.gameState !== 'flying') return;
  S.flightTime += dt;

  // Has the whole world settled? (birds + blocks + live pigs). Works with 0 birds left (off-screen shot).
  const slow = body => body.speed < SETTLE_SPEED && Math.abs(body.angularVelocity) < 0.05;
  const settled =
    S.activeBirds.every(b => slow(b.body)) &&
    S.blocks.every(b => slow(b.body)) &&
    S.pigs.every(p => p.dead || slow(p.body));

  if (settled || S.flightTime > SETTLE_MAX_TIME) {
    // Start resolve countdown once
    if (S.turnResolveTimer <= 0) S.turnResolveTimer = 0.6;
  }

  if (S.turnResolveTimer > 0) {
    S.turnResolveTimer -= dt;
    if (S.turnResolveTimer <= 0) {
      // Clean up the birds that landed
      for (const b of S.activeBirds) {
        Composite.remove(engine.world, b.body);
      }
      S.activeBirds = [];
      S.turnResolveTimer = 0;

      // Did we lose?
      if (S.levelEnding) return;
      if (S.pigs.every(p => p.dead)) {
        S.levelEnding = true;
        endGame(true);
        return;
      }
      // Next bird?
      if (S.birdQueue.length === 0) {
        endGame(false);
        return;
      }
      // Load the next bird
      loadNextBird();
      showHint('DRAG FROM THE SLINGSHOT', 2000);
    }
  }
}
