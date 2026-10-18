/*
  File: modules/render.js
  Project: tower-defence
  Purpose: Draw the board. No gameplay mutations. Static board is cached;
           unit art comes from models.js sprites.
*/

import { COLS, ROWS } from './config.js';
import { TILE, pathSegments, totalPathLength, posAtDistance, posAtTiles } from './path.js';
import * as state from './state.js';
import { towerCenter } from './towers.js';
import { drawTower, drawEnemy } from './models.js';

/* Cached grass, grid, road, and IN / OUT markers. Rebuilt on resize. */
let staticLayer = null;
let staticKey = '';

/*
  Grass fill and a faint grid.
*/
function drawBackground(ctx, CW, CH) {
  ctx.fillStyle = '#0f1a12';
  ctx.fillRect(0, 0, CW, CH);
  ctx.strokeStyle = 'rgba(60, 100, 70, 0.25)';
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
function drawPath(ctx) {
  ctx.strokeStyle = '#3a2a1a';
  ctx.lineWidth = TILE * 0.85;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  for (let i = 0; i < pathSegments.length; i++) {
    const s = pathSegments[i];
    if (i === 0) ctx.moveTo(s.ax, s.ay);
    ctx.lineTo(s.bx, s.by);
  }
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 220, 150, 0.35)';
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
  const key = `${TILE}|${CW}|${CH}|${dpr}|${pathSegments.length}`;
  if (!staticLayer || key !== staticKey) {
    staticKey = key;
    staticLayer = document.createElement('canvas');
    staticLayer.width = Math.floor(CW * dpr);
    staticLayer.height = Math.floor(CH * dpr);
    const g = staticLayer.getContext('2d');
    g.scale(dpr, dpr);
    drawBackground(g, CW, CH);
    drawPath(g);
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

/* Shot glows. Shot positions are stored in tiles. */
function drawProjectiles(ctx) {
  for (const p of state.projectiles) {
    const x = p.x * TILE;
    const y = p.y * TILE;
    ctx.fillStyle = p.color + '55';
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* Sparks and splash rings. */
function drawParticles(ctx) {
  for (const p of state.particles) {
    const t = p.life / p.maxLife;
    if (p.splash) {
      ctx.fillStyle = `rgba(255, 150, 80, ${t * 0.5})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1.2 - t * 0.6), 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

/* Rising labels. */
function drawFloatingTexts(ctx) {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of state.floatingTexts) {
    const t = f.life / f.maxLife;
    ctx.globalAlpha = t;
    ctx.fillStyle = f.color;
    ctx.font = `bold ${Math.max(12, TILE * 0.32)}px Courier New`;
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }
}

/*
  Full frame. CW/CH are the logical canvas size in CSS pixels.
*/
export function render(ctx, CW, CH) {
  const now = performance.now() / 1000;
  drawStatic(ctx, CW, CH);
  drawTowers(ctx, now);
  drawEnemies(ctx, now);
  drawProjectiles(ctx);
  drawParticles(ctx);
  drawFloatingTexts(ctx);
}
