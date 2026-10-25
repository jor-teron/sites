/*
  File: modules/render.js
  Project: tower-defence
  Purpose: Draw the board. No gameplay mutations. Static board is cached;
           unit art comes from models.js sprites.
*/

import { COLS, ROWS } from './config.js';
import { TILE, pathVersion, pathSegments, totalPathLength, posAtDistance, posAtTiles } from './path.js';
import * as state from './state.js';
import { towerCenter } from './towers.js';
import { drawTower, drawEnemy } from './models.js';
import { themeFor } from './themes.js';
import { drawScorches, drawProjectiles, drawParticles } from './effects.js';

/* Cached grass, grid, road, and IN / OUT markers. Rebuilt on resize. */
let staticLayer = null;
let staticKey = '';

/*
  Grass fill and a faint grid.
*/
function drawBackground(ctx, CW, CH, th) {
  ctx.fillStyle = th.grass;
  ctx.fillRect(0, 0, CW, CH);
  ctx.strokeStyle = th.grid;
  ctx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * TILE, 0);
    ctx.lineTo(c * TILE, CH);
    ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * TILE);
    ctx.lineTo(CW, r * TILE);
    ctx.stroke();
  }
}

/*
  Road, center dashes, and IN / OUT markers.
*/
function drawPath(ctx, th) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  /* Optional edge / glow: a slightly wider stroke under the road. */
  if (th.edge) {
    ctx.save();
    ctx.strokeStyle = th.edge;
    ctx.lineWidth = TILE * 0.95;
    ctx.shadowColor = th.edge;
    ctx.shadowBlur = th.glow;
    ctx.beginPath();
    for (let i = 0; i < pathSegments.length; i++) {
      const s = pathSegments[i];
      if (i === 0) ctx.moveTo(s.ax, s.ay);
      ctx.lineTo(s.bx, s.by);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = th.road;
  ctx.lineWidth = TILE * 0.85;
  ctx.beginPath();
  for (let i = 0; i < pathSegments.length; i++) {
    const s = pathSegments[i];
    if (i === 0) ctx.moveTo(s.ax, s.ay);
    ctx.lineTo(s.bx, s.by);
  }
  ctx.stroke();

  ctx.strokeStyle = th.dash;
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 12]);
  ctx.beginPath();
  for (let i = 0; i < pathSegments.length; i++) {
    const s = pathSegments[i];
    if (i === 0) ctx.moveTo(s.ax, s.ay);
    ctx.lineTo(s.bx, s.by);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  if (pathSegments.length > 0) {
    const sp = posAtDistance(0);
    ctx.fillStyle = 'rgba(255, 80, 80, 0.9)';
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, TILE * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(10, TILE * 0.32)}px Courier New`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('IN', sp.x, sp.y);

    const ep = posAtDistance(totalPathLength);
    ctx.fillStyle = 'rgba(80, 120, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(ep.x, ep.y, TILE * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(10, TILE * 0.28)}px Courier New`;
    ctx.fillText('OUT', ep.x, ep.y);
  }
}

/*
  Static board (grass, grid, road, markers) drawn once per size into an
  offscreen canvas, then copied each frame.
*/
function drawStatic(ctx, CW, CH) {
  const dpr = window.devicePixelRatio || 1;
  const key = `${TILE}|${CW}|${CH}|${dpr}|${pathVersion}|${state.mapId}`;
  if (!staticLayer || key !== staticKey) {
    staticKey = key;
    staticLayer = document.createElement('canvas');
    staticLayer.width = Math.floor(CW * dpr);
    staticLayer.height = Math.floor(CH * dpr);
    const g = staticLayer.getContext('2d');
    g.scale(dpr, dpr);
    /* Colours come from the current map's theme (themes.js). */
    const th = themeFor(state.mapId);
    drawBackground(g, CW, CH, th);
    drawPath(g, th);
  }
  ctx.drawImage(staticLayer, 0, 0, CW, CH);
}

/*
  Towers (models.js) and the selected range ring.
*/
function drawTowers(ctx, now) {
  for (const t of state.towers) {
    const p = towerCenter(t);
    drawTower(ctx, t, p, now);
    if (state.selectedTower === t) {
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, t.range * TILE, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeRect(p.x - TILE * 0.47, p.y - TILE * 0.47, TILE * 0.94, TILE * 0.94);
    }
  }
}

/* Enemies (models.js), with slow tint and HP bars. */
function drawEnemies(ctx, now) {
  for (const e of state.enemies) {
    drawEnemy(ctx, e, posAtTiles(e.dist), now);
  }
}

/* Rising labels. Positions are in tiles. */
function drawFloatingTexts(ctx) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of state.floatingTexts) {
    const t = f.life / f.maxLife;
    ctx.globalAlpha = t;
    ctx.fillStyle = f.color;
    ctx.font = `bold ${Math.max(12, TILE * 0.32)}px Courier New`;
    ctx.fillText(f.text, f.x * TILE, f.y * TILE);
    ctx.globalAlpha = 1;
  }
}

/*
  Full frame. CW/CH are the logical canvas size in CSS pixels.
*/
export function render(ctx, CW, CH) {
  const now = performance.now() / 1000;
  drawStatic(ctx, CW, CH);
  drawScorches(ctx);
  drawTowers(ctx, now);
  drawEnemies(ctx, now);
  drawProjectiles(ctx, state.projectiles);
  drawParticles(ctx);
  drawFloatingTexts(ctx);
}
