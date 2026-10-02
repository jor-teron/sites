/*
  File: modules/projectiles.js
  Project: tower-defence
  Purpose: Shots that track a target and apply damage, splash, or slow on hit.
*/

import { TILE, posAtDistance } from './path.js';
import * as state from './state.js';
import { damageEnemy, applySlow } from './enemies.js';

/*
  Launch a shot from a tower toward an enemy.
  from is the tower center in canvas pixels.
*/
export function fireProjectile(tower, target, from) {
  state.projectiles.push({
    x: from.x, y: from.y, target,
    speed: tower.projectileSpeed * TILE,
    damage: tower.damage,
    splash: tower.splash,
    slow: tower.slow,
    slowDuration: tower.slowDuration,
    color: tower.bulletColor,
    lastX: from.x, lastY: from.y
  });
}

/*
  Resolve a hit. Splash damages every enemy in radius.
  Direct shots only hurt the original target if it is still alive.
*/
export function handleProjectileHit(p, x, y) {
  if (p.splash > 0) {
    const radius = p.splash * TILE;
    for (const e of state.enemies) {
      const ep = posAtDistance(e.dist);
      const d = Math.hypot(ep.x - x, ep.y - y);
      if (d <= radius) {
        damageEnemy(e, p.damage);
        if (p.slow > 0) applySlow(e, p.slow, p.slowDuration);
      }
    }
    state.particles.push({
      x, y, vx: 0, vy: 0,
      life: 0.25, maxLife: 0.25,
      color: p.color, size: radius, splash: true
    });
  } else if (state.enemies.includes(p.target)) {
    damageEnemy(p.target, p.damage);
    if (p.slow > 0) applySlow(p.target, p.slow, p.slowDuration);
    state.burst(x, y, p.color, 4, 30, 90, 0.3, 2);
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
      const tp = posAtDistance(p.target.dist);
      tx = tp.x;
      ty = tp.y;
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
    if (d <= move + 4) {
      handleProjectileHit(p, tx, ty);
      state.projectiles.splice(i, 1);
    } else {
      p.x += (dx / d) * move;
      p.y += (dy / d) * move;
    }
  }
}
