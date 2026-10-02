/*
  File: modules/enemies.js
  Project: tower-defence
  Purpose: Spawn, damage, kill, slow, and move enemies along the path.
*/

import { ENEMY_TYPES } from './config.js';
import { TILE, totalPathLength, posAtDistance } from './path.js';
import * as state from './state.js';

/*
  Spawn one enemy of the given catalog key.
  HP scales with the current wave. Speed and radius use the live tile size.
*/
export function spawnEnemy(type) {
  const def = ENEMY_TYPES[type];
  const waveScale = 1 + (state.wave - 1) * 0.12;
  const hp = Math.floor(def.hp * waveScale);
  state.enemies.push({
    type, def, hp, maxHp: hp,
    dist: 0,
    baseSpeed: def.speed * TILE,
    speedMul: 1,
    slowTimer: 0,
    radius: def.radius * TILE,
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
  Remove an enemy, pay gold, and spawn a death burst.
*/
export function killEnemy(e) {
  const idx = state.enemies.indexOf(e);
  if (idx < 0) return;
  state.enemies.splice(idx, 1);
  state.addGold(e.goldReward);
  state.addScore(e.goldReward * 2);
  const pos = posAtDistance(e.dist);
  state.addFloatingText(pos.x, pos.y, `+$${e.goldReward}`, '#FFD700');
  state.burst(pos.x, pos.y, e.color, 8, 50, 130, 0.5, 3);
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
    if (e.dist >= totalPathLength) {
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
