/*
  File: modules/towers.js
  Project: tower-defence
  Purpose: Place, upgrade, sell, and fire towers.
*/

import { TOWER_TYPES, MAX_TOWER_LEVEL } from './config.js';
import { TILE, posAtTiles } from './path.js';
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
    recoil: 0, flash: 0, shots: 0,
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
  Spend gold and scale stats. Returns false at max level or if the
  player cannot pay.
*/
export function upgradeTower(t) {
  if (t.level >= MAX_TOWER_LEVEL) return false;
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

/* True once the tower cannot be upgraded further. */
export function isMaxLevel(t) {
  return t.level >= MAX_TOWER_LEVEL;
}

/*
  Each tower aims at the enemy furthest along the path inside range
  every step, and fires when its cooldown is ready.
*/
export function updateTowers(dt) {
  for (const t of state.towers) {
    if (t.cooldown > 0) t.cooldown -= dt;
    /* Visual only: turret kick and muzzle flash decay. */
    if (t.recoil > 0) t.recoil = Math.max(0, t.recoil - dt * 7);
    if (t.flash > 0) t.flash -= dt;
    const tc = towerCenter(t);
    const rangePx = t.range * TILE;
    let best = null;
    let bestPos = null;
    let bestScore = -Infinity;
    for (const e of state.enemies) {
      const ep = posAtTiles(e.dist);
      const d = Math.hypot(ep.x - tc.x, ep.y - tc.y);
      if (d > rangePx) continue;
      if (e.dist > bestScore) { bestScore = e.dist; best = e; bestPos = ep; }
    }
    if (!best) continue;
    t.angle = Math.atan2(bestPos.y - tc.y, bestPos.x - tc.x);
    if (t.cooldown <= 0) {
      fireProjectile(t, best, tc);
      t.cooldown = t.fireRate;
      t.recoil = 1;
      t.flash = t.type === 'cannon' ? 0.09 : 0.06;
      t.shots++;
    }
  }
}
