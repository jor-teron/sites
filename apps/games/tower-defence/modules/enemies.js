/*
  File: modules/enemies.js
  Project: tower-defence
  Purpose: Spawn, damage, kill, slow, and move enemies along the path.
*/

import { ENEMY_TYPES } from './config.js';
import { TILE, pathLengthTiles, posAtTiles, headingAtTiles } from './path.js';
import * as state from './state.js';
import { blast, smallDeath } from './effects.js';

/*
  Spawn one enemy of the given catalog key.
  HP scales with the current wave. dist, speed, and radius are in tiles
  (tiles, tiles/s, tiles) so a resize mid-wave does not move enemies.
*/
export function spawnEnemy(type) {
  const def = ENEMY_TYPES[type];
  const waveScale = 1 + (state.wave - 1) * 0.12;
  const hp = Math.floor(def.hp * waveScale);
  state.enemies.push({
    type, def, hp, maxHp: hp,
    dist: 0,
    heading: headingAtTiles(0),
    baseSpeed: def.speed,
    speedMul: 1,
    slowTimer: 0,
    radius: def.radius,
    color: def.color,
    goldReward: def.gold
  });
}

/*
  Apply a slow. Stronger (lower) multipliers win. Timer refreshes if longer.
*/
export function applySlow(e, mul, duration) {
  e.slowTimer = Math.max(e.slowTimer, duration);
  e.speedMul = Math.min(e.speedMul, mul);
}

/*
  Remove an enemy, pay gold, and spawn a death effect (blast for tanks).
*/
export function killEnemy(e) {
  const idx = state.enemies.indexOf(e);
  if (idx < 0) return;
  state.enemies.splice(idx, 1);
  state.addGold(e.goldReward);
  state.addScore(e.goldReward * 2);
  const pos = posAtTiles(e.dist);
  const x = pos.x / TILE;
  const y = pos.y / TILE;
  state.addFloatingText(x, y, `+$${e.goldReward}`, '#FFD700');
  if (e.type === 'tank') blast(x, y, 0.9);
  else if (e.type === 'boss') blast(x, y, 1.2, true);
  else smallDeath(x, y);
}

/*
  Damage an enemy. Kills it at 0 HP.
*/
export function damageEnemy(e, dmg) {
  e.hp -= dmg;
  if (e.hp <= 0) killEnemy(e);
}

/*
  Move enemies. Leaks cost 1 life, or 5 for a boss.
  Returns true if the run ended this step.
*/
export function updateEnemies(dt) {
  for (let i = state.enemies.length - 1; i >= 0; i--) {
    const e = state.enemies[i];
    if (e.slowTimer > 0) {
      e.slowTimer -= dt;
      if (e.slowTimer <= 0) e.speedMul = 1;
    }
    e.dist += e.baseSpeed * e.speedMul * dt;
    /* Turn smoothly toward the current segment direction. */
    let turn = headingAtTiles(e.dist) - e.heading;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    e.heading += turn * Math.min(1, dt * 10);
    if (e.dist >= pathLengthTiles()) {
      const left = state.loseLives(e.type === 'boss' ? 5 : 1);
      state.enemies.splice(i, 1);
      if (left <= 0) {
        if (state.onGameOver) state.onGameOver();
        return true;
      }
    }
  }
  return false;
}
