/*
  File: modules/towers.js
  Project: tower-defence
  Purpose: Place, upgrade, sell, and fire towers.
*/

import { TOWER_TYPES } from './config.js';
import { TILE, posAtDistance } from './path.js';
import * as state from './state.js';
import { fireProjectile } from './projectiles.js';

/*
  Build a level-1 tower record. Stats are copied so upgrades do not
  mutate the catalog.
*/
export function makeTower(c, r, type) {
  const def = TOWER_TYPES[type];
  return {
    c, r, type, level: 1, cooldown: 0, angle: -Math.PI / 2,
    range: def.range, damage: def.damage, fireRate: def.fireRate,
    projectileSpeed: def.projectileSpeed,
    splash: def.splash || 0, slow: def.slow || 0,
    slowDuration: def.slowDuration || 0,
    color: def.color, bulletColor: def.bulletColor,
    totalInvested: def.cost
  };
}

/* Canvas center of a tower's tile. */
export function towerCenter(t) {
  return { x: (t.c + 0.5) * TILE, y: (t.r + 0.5) * TILE };
}

/* Gold cost of the next upgrade for this tower. */
export function getUpgradeCost(t) {
  const def = TOWER_TYPES[t.type];
  return Math.floor(def.upgradeCost * Math.pow(def.upgradeMul, t.level - 1));
}

/* Refund if sold. 60% of gold spent on this tower. */
export function getSellValue(t) {
  return Math.floor(t.totalInvested * 0.6);
}

/*
  Spend gold and scale stats. Returns false if the player cannot pay.
*/
export function upgradeTower(t) {
  const cost = getUpgradeCost(t);
  if (state.gold < cost) return false;
  state.addGold(-cost);
  t.totalInvested += cost;
  t.level++;
  t.range *= 1.12;
  t.damage *= 1.35;
  t.fireRate *= 0.9;
  if (t.splash) t.splash *= 1.12;
  if (t.slow) t.slow = Math.max(0.2, t.slow - 0.08);
  return true;
}

/*
  Remove the tower and refund gold. Clears selection.
*/
export function sellTower(t) {
  const refund = getSellValue(t);
  state.addGold(refund);
  const p = towerCenter(t);
  state.addFloatingText(p.x, p.y, `+$${refund}`, '#FFD700');
  const idx = state.towers.indexOf(t);
  if (idx >= 0) state.towers.splice(idx, 1);
  state.setSelectedTower(null);
}

/*
  Each tower shoots the enemy furthest along the path inside range.
*/
export function updateTowers(dt) {
  for (const t of state.towers) {
    t.cooldown -= dt;
    if (t.cooldown > 0) continue;
    const tc = towerCenter(t);
    const rangePx = t.range * TILE;
    let best = null;
    let bestScore = -Infinity;
    for (const e of state.enemies) {
      const ep = posAtDistance(e.dist);
      const d = Math.hypot(ep.x - tc.x, ep.y - tc.y);
      if (d > rangePx) continue;
      if (e.dist > bestScore) { bestScore = e.dist; best = e; }
    }
    if (best) {
      const bp = posAtDistance(best.dist);
      t.angle = Math.atan2(bp.y - tc.y, bp.x - tc.x);
      fireProjectile(t, best, tc);
      t.cooldown = t.fireRate;
    }
  }
}
