/*
  File: core/entities.js
  Project: Demolisher
  Purpose: Enemies (AI, shots) and Mission targets.
  Plain script (no modules): top-level const / let / function share one global scope with the
  other core/*.js files, loaded in the order listed in demolisher.html.
  Uses: state.js .. effects.js.
*/

'use strict';

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
      e.shots = (e.shots || 0) + 1;   // animation only: counts real shots
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
