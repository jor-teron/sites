/*
  File: modules/render.js
  Project: tower-defence
  Purpose: Draw the board. No gameplay mutations.
*/

import { COLS, ROWS } from './config.js';
import { TILE, pathSegments, totalPathLength, posAtDistance } from './path.js';
import * as state from './state.js';
import { towerCenter } from './towers.js';

/*
  Grass fill and a faint grid.
*/
export function drawBackground(ctx, CW, CH) {
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
export function drawPath(ctx) {
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
  Towers, level pips, barrels, and the selected range ring.
*/
export function drawTowers(ctx) {
  for (const t of state.towers) {
    const p = towerCenter(t);
    const r = TILE * 0.4;

    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 2, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < t.level; i++) {
      const a = -Math.PI / 2 + (i - (t.level - 1) / 2) * 0.4;
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(p.x + Math.cos(a) * (r + 6), p.y + Math.sin(a) * (r + 6), 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(t.angle);
    ctx.fillStyle = '#111';
    const barrelLen = r * 1.6;
    ctx.fillRect(0, -3, barrelLen, 6);
    ctx.fillStyle = t.color;
    ctx.fillRect(barrelLen - 4, -3, 4, 6);
    ctx.restore();

    if (state.selectedTower === t) {
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, t.range * TILE, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

/*
  Enemies, slow tint, eyes, and HP bars when damaged.
*/
export function drawEnemies(ctx) {
  for (const e of state.enemies) {
    const p = posAtDistance(e.dist);
    const r = e.radius;

    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + r * 0.5, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    if (e.slowTimer > 0) {
      ctx.fillStyle = 'rgba(100, 220, 255, 0.35)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();

    const exOff = r * 0.3;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(p.x - exOff, p.y - r * 0.15, r * 0.22, 0, Math.PI * 2);
    ctx.arc(p.x + exOff, p.y - r * 0.15, r * 0.22, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(p.x - exOff, p.y - r * 0.15, r * 0.1, 0, Math.PI * 2);
    ctx.arc(p.x + exOff, p.y - r * 0.15, r * 0.1, 0, Math.PI * 2);
    ctx.fill();

    if (e.hp < e.maxHp) {
      const barW = r * 2.2;
      const barH = 4;
      const bx = p.x - barW / 2;
      const by = p.y - r - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(bx, by, barW, barH);
      const frac = Math.max(0, e.hp / e.maxHp);
      ctx.fillStyle = frac > 0.5 ? '#6BFF6B' : frac > 0.25 ? '#FFD700' : '#FF5B5B';
      ctx.fillRect(bx, by, barW * frac, barH);
    }
  }
}

/* Shot glows. */
export function drawProjectiles(ctx) {
  for (const p of state.projectiles) {
    ctx.fillStyle = p.color + '55';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* Sparks and splash rings. */
export function drawParticles(ctx) {
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
export function drawFloatingTexts(ctx) {
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
  Next-wave countdown, or live wave counts while a wave is active.
*/
export function drawWaveInfo(ctx) {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  if (!state.waveActive && state.wave >= 0 && state.nextWaveIn > 0 && state.gameState === 'playing') {
    ctx.fillStyle = 'rgba(255, 215, 0, 0.9)';
    ctx.font = `bold ${Math.max(11, TILE * 0.3)}px Courier New`;
    ctx.fillText(`NEXT WAVE IN ${state.nextWaveIn.toFixed(1)}s`, 10, 10);
  }

  if (state.waveActive) {
    ctx.fillStyle = 'rgba(255, 100, 100, 0.9)';
    ctx.font = `bold ${Math.max(11, TILE * 0.3)}px Courier New`;
    const remaining = state.spawnQueue.length + state.enemies.length;
    ctx.fillText(`WAVE ${state.wave} — ${remaining} LEFT`, 10, 10);
    ctx.fillStyle = 'rgba(120, 255, 120, 0.8)';
    ctx.font = `${Math.max(10, TILE * 0.22)}px Courier New`;
    ctx.fillText(`queue:${state.spawnQueue.length}  alive:${state.enemies.length}  t:${state.waveTimer.toFixed(1)}s`, 10, 12 + TILE * 0.38);
  }
}

/*
  Full frame. CW/CH are the logical canvas size in CSS pixels.
*/
export function render(ctx, CW, CH) {
  ctx.fillStyle = '#0a0a12';
  ctx.fillRect(0, 0, CW, CH);
  drawBackground(ctx, CW, CH);
  drawPath(ctx);
  drawTowers(ctx);
  drawEnemies(ctx);
  drawProjectiles(ctx);
  drawParticles(ctx);
  drawFloatingTexts(ctx);
  drawWaveInfo(ctx);
}
