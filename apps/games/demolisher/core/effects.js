/*
  File: core/effects.js
  Project: Demolisher
  Purpose: Explosions, tile damage, debris and fluids (water / lava).
  Plain script (no modules): top-level const / let / function share one global scope with the
  other core/*.js files, loaded in the order listed in demolisher.html.
  Uses: state.js, terrain.js, weapons.js.
*/

'use strict';

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
