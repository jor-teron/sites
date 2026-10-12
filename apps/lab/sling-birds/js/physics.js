// Physics engine, collision handling (pig hits) and turn resolution.
import { Engine, Composite, Events, Vector, WORLD_WIDTH, WORLD_HEIGHT, GRAVITY, SETTLE_SPEED, SETTLE_MAX_TIME } from './config.js';
import { S } from './entities.js';
import { updateHud, endGame, showHint } from './ui.js';
import { loadNextBird } from './entities.js';

export const engine = Engine.create();
engine.gravity.y = GRAVITY;

// ---------- COLLISION HANDLING ----------
Events.on(engine, 'collisionStart', (event) => {
  for (const pair of event.pairs) {
    checkPigHit(pair.bodyA, pair.bodyB);
    checkPigHit(pair.bodyB, pair.bodyA);
  }
});

function checkPigHit(bodyA, bodyB) {
  const pigEntry = S.pigs.find(p => p.body === bodyA && !p.dead);
  if (!pigEntry) return;

  const relV = Vector.magnitude(Vector.sub(bodyA.velocity, bodyB.velocity));
  // Kill pig if impact is strong enough
  if (relV > 2.5) {
    killPig(pigEntry);
  }
}

function killPig(pigEntry) {
  if (pigEntry.dead) return;
  pigEntry.dead = true;
  S.score += 500;
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
