/*
  File: modules/projectiles.js
  Project: tower-defence
  Purpose: Shots that track a target and apply damage, splash, or slow on hit.
*/

import { TILE, posAtTiles } from './path.js';
import * as state from './state.js';
import { damageEnemy, applySlow } from './enemies.js';
import { blast, hitSparks, frostBurst, shellSmoke } from './effects.js';

/*
  Launch a shot from a tower toward an enemy.
  from is the tower center in canvas pixels. Shots are stored in tile
  units (x, y in tiles, speed in tiles/s) so a resize does not move them.
*/
export function fireProjectile(tower, target, from) {
  const x = from.x / TILE;
  const y = from.y / TILE;
  state.projectiles.push({
    x, y, target,
    speed: tower.projectileSpeed,
    damage: tower.damage,
    splash: tower.splash,
    slow: tower.slow,
    slowDuration: tower.slowDuration,
    color: tower.bulletColor,
    kind: tower.type,
    ang: tower.angle,
    trail: 0,
    lastX: x, lastY: y
  });
}

/*
  Resolve a hit at x, y (tiles). Splash damages every enemy in radius
  and leaves a blast. Direct shots only hurt the original target if it
  is still alive; they always show sparks or a frost burst.
*/
export function handleProjectileHit(p, x, y) {
  const px = x * TILE;
  const py = y * TILE;
  if (p.splash > 0) {
    const radius = p.splash * TILE;
    /* Copy: kills splice state.enemies and would skip the next enemy. */
    for (const e of state.enemies.slice()) {
      const ep = posAtTiles(e.dist);
      const d = Math.hypot(ep.x - px, ep.y - py);
      if (d <= radius) {
        damageEnemy(e, p.damage);
        if (p.slow > 0) applySlow(e, p.slow, p.slowDuration);
      }
    }
    blast(x, y, p.splash);
  } else {
    if (state.enemies.includes(p.target)) {
      damageEnemy(p.target, p.damage);
      if (p.slow > 0) applySlow(p.target, p.slow, p.slowDuration);
    }
    if (p.kind === 'frost') frostBurst(x, y);
    else hitSparks(x, y, p.ang);
  }
}

/*
  Step shots toward their target. Dead targets keep the last known point.
*/
export function updateProjectiles(dt) {
  for (let i = state.projectiles.length - 1; i >= 0; i--) {
    const p = state.projectiles[i];
    let tx;
    let ty;
    if (state.enemies.includes(p.target)) {
      const tp = posAtTiles(p.target.dist);
      tx = tp.x / TILE;
      ty = tp.y / TILE;
      p.lastX = tx;
      p.lastY = ty;
    } else {
      tx = p.lastX;
      ty = p.lastY;
    }
    const dx = tx - p.x;
    const dy = ty - p.y;
    const d = Math.hypot(dx, dy);
    const move = p.speed * dt;
    if (d <= move + 4 / TILE) {
      handleProjectileHit(p, tx, ty);
      state.projectiles.splice(i, 1);
    } else {
      p.x += (dx / d) * move;
      p.y += (dy / d) * move;
      p.ang = Math.atan2(dy, dx);
      if (p.kind === 'cannon') {
        p.trail -= dt;
        if (p.trail <= 0) {
          shellSmoke(p.x, p.y);
          p.trail = 0.05;
        }
      }
    }
  }
}
