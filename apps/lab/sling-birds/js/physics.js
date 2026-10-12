// Physics engine, collision handling (pig hits) and turn resolution.
import { Engine, Composite, Events, Vector, WORLD_WIDTH, WORLD_HEIGHT } from './config.js';
import { S } from './entities.js';
import { updateHud, endGame, showHint } from './ui.js';
import { loadNextBird } from './entities.js';

export const engine = Engine.create();
engine.gravity.y = 0.4;

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

  // Remove body after a brief delay so it visually "pops"
  setTimeout(() => {
    Composite.remove(engine.world, pigEntry.body);
  }, 250);

  // Win condition
  if (S.pigs.every(p => p.dead) && !S.levelEnding) {
    S.levelEnding = true;
    // Small delay so the player sees the last pig die
    setTimeout(() => endGame(true), 900);
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

  if (S.gameState !== 'flying') return;
  if (S.activeBirds.length === 0) return;

  // Are all active birds essentially stopped?
  const allStopped = S.activeBirds.every(b => {
    const v = Vector.magnitude(b.body.velocity);
    const w = Math.abs(b.body.angularVelocity);
    return v < 0.8 && w < 0.05;
  });

  if (allStopped) {
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
