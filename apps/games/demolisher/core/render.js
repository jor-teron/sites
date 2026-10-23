/*
  File: core/render.js
  Project: Demolisher
  Purpose: Canvas drawing: sky, terrain blit, actors, effects, HUD overlays on the canvas.
  Plain script (no modules): top-level const / let / function share one global scope with the
  other core/*.js files, loaded in the order listed in demolisher.html.
  Uses: state.js .. hub.js, assets.js (Art), sprites.js (art drawing; each falls back to the shapes below).
*/

'use strict';

/* ============================================================
   RENDER
   ============================================================ */

/*
  Sky, stars, and a far ridge. Camera parallax is light.
*/
function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, CH);
  g.addColorStop(0, '#141428');
  g.addColorStop(0.6, '#1a1030');
  g.addColorStop(1, '#0a0814');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, CW, CH);
  ctx.fillStyle = 'rgba(200, 220, 255, 0.35)';
  for (let i = 0; i < 70; i++) {
    const sx = ((i * 173 + 19) - camX * 0.15) % CW;
    const sy = ((i * 71 + 41) - camY * 0.1) % 280;
    ctx.fillRect((sx + CW) % CW, (sy + 280) % 280, 1.5, 1.5);
  }
  ctx.fillStyle = 'rgba(30, 20, 50, 0.7)';
  ctx.beginPath();
  ctx.moveTo(0, CH);
  for (let i = 0; i <= 20; i++) {
    const mx = (i / 20) * CW;
    const my = CH * 0.48 - Math.sin((i + camX * 0.0003) * 0.7) * 50 - 40;
    ctx.lineTo(mx, my);
  }
  ctx.lineTo(CW, CH);
  ctx.closePath();
  ctx.fill();
}

/*
  Paint one tile rectangle (inclusive) into the 1px-per-tile image with the
  precomputed shades. Damaged tiles are darker than full-HP tiles.
*/
function paintTerrain(x0, y0, x1, y1) {
  x0 = Math.max(0, x0); y0 = Math.max(0, y0);
  x1 = Math.min(GRID_W - 1, x1); y1 = Math.min(GRID_H - 1, y1);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  if (w <= 0 || h <= 0) return;
  const img = terrainCtx.createImageData(w, h);
  const data = img.data;
  let idx = 0;
  for (let y = y0; y <= y1; y++) {
    let i = y * GRID_W + x0;
    for (let x = x0; x <= x1; x++, i++, idx += 4) {
      const m = terrain[i];
      if (m === MAT.AIR) continue;              // createImageData is all 0 (transparent)
      const c = tileShade(m, terrainHp[i]);
      data[idx] = c[0];
      data[idx + 1] = c[1];
      data[idx + 2] = c[2];
      data[idx + 3] = m === MAT.WATER ? 170 : 255;
    }
  }
  terrainCtx.putImageData(img, x0, y0);
}

/*
  Repaint the whole image for a new world, otherwise only the damaged
  rectangle; then blit the camera window.
*/
function drawTerrain() {
  if (!terrain) return;
  let rect = null;
  if (terrainDirty) {
    paintTerrain(0, 0, GRID_W - 1, GRID_H - 1);
    terrainDirty = false;
    dirtyRect = null;
    artPainted = false;            // textured world is rebuilt for the new world
  } else if (dirtyRect) {
    rect = dirtyRect;
    dirtyRect = null;
    paintTerrain(rect.x0, rect.y0, rect.x1, rect.y1);
  }
  if (drawTerrainArt(rect)) return;  // sprites ready: textured world, else the 1 px image below
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    terrainCanvas,
    camX / TILE, camY / TILE, VIEW_W / TILE, VIEW_H / TILE,
    0, 0, CW, CH
  );
  ctx.imageSmoothingEnabled = true;
}

/*
  Pulsing rings for live mission targets.
*/
function drawTargets() {
  for (const t of targets) {
    if (t.destroyed) continue;
    const sx = t.x - camX;
    const sy = t.y - camY;
    if (sx < -80 || sx > CW + 80 || sy < -80 || sy > CH + 80) continue;
    const pulse = 1 + Math.sin(performance.now() * 0.005) * 0.08;
    if (drawTargetArt(t, sx, sy, pulse)) continue;
    ctx.strokeStyle = 'rgba(255, 60, 60, 0.9)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sx, sy, t.r * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#FF3B3B';
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

/*
  Blocky enemy sprites and a HP bar when hurt.
*/
function drawEnemies() {
  for (const e of enemies) {
    if (!e.alive) continue;
    const sx = e.body.position.x - camX;
    const sy = e.body.position.y - camY;
    if (sx < -60 || sx > CW + 60 || sy < -60 || sy > CH + 60) continue;
    const art = drawEnemyArt(e, sx, sy);
    if (!art) {
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(sx - 12, sy - 15, 24, 30);
      ctx.fillStyle = '#e74c3c';
      ctx.fillRect(sx - 8, sy - 22, 16, 10);
      const eyeX = e.facing > 0 ? sx + 2 : sx - 6;
      ctx.fillStyle = '#fff';
      ctx.fillRect(eyeX, sy - 18, 4, 4);
    }
    if (e.hp < e.maxHp) {
      const by = art ? sy - 36 : sy - 30;   // sprite head is taller than the old block
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(sx - 14, by, 28, 4);
      ctx.fillStyle = e.hp > e.maxHp / 2 ? '#6BFF6B' : '#FF5B5B';
      ctx.fillRect(sx - 14, by, 28 * Math.max(0, e.hp / e.maxHp), 4);
    }
  }
}

/*
  Player body, arm along aim, short aim tick.
*/
function drawPlayer() {
  if (!player) return;
  const sx = player.body.position.x - camX;
  const sy = player.body.position.y - camY;
  const armX = sx + Math.cos(aimAngle) * 16;
  const armY = sy - 4 + Math.sin(aimAngle) * 16;
  if (drawPlayerArt(sx, sy)) {
    drawAimTick(armX + Math.cos(aimAngle) * 12, armY + Math.sin(aimAngle) * 12);   // from the muzzle
    return;
  }
  ctx.fillStyle = '#2a5a9a';
  ctx.fillRect(sx - PLAYER_W / 2, sy - PLAYER_H / 2, PLAYER_W, PLAYER_H);
  ctx.fillStyle = '#d0b090';
  ctx.fillRect(sx - 8, sy - PLAYER_H / 2 - 10, 16, 10);
  ctx.strokeStyle = '#d0b090';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(sx, sy - 4);
  ctx.lineTo(armX, armY);
  ctx.stroke();
  ctx.fillStyle = WEAPONS[currentWeapon].color;
  ctx.beginPath();
  ctx.arc(armX, armY, 3, 0, Math.PI * 2);
  ctx.fill();
  drawAimTick(armX, armY);
}

/*
  Short aim guide from the hand along the aim.
*/
function drawAimTick(armX, armY) {
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(armX, armY);
  ctx.lineTo(armX + Math.cos(aimAngle) * 36, armY + Math.sin(aimAngle) * 36);
  ctx.stroke();
}

/*
  Player shots, trails, and enemy shots.
*/
function drawProjectiles() {
  for (const p of projectiles) {
    const sx = p.x - camX;
    const sy = p.y - camY;
    if (drawProjectileArt(p, sx, sy)) continue;
    if (p.trail && p.trail.length > 1) {
      ctx.strokeStyle = p.weapon.color;
      ctx.globalAlpha = 0.4;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < p.trail.length; i++) {
        const tp = p.trail[i];
        if (i === 0) ctx.moveTo(tp.x - camX, tp.y - camY);
        else ctx.lineTo(tp.x - camX, tp.y - camY);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = p.weapon.color;
    ctx.beginPath();
    ctx.arc(sx, sy, p.weapon.radius + 1, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const p of enemyProjectiles) {
    if (drawEnemyShotArt(p)) continue;
    ctx.fillStyle = '#FF5B5B';
    ctx.beginPath();
    ctx.arc(p.x - camX, p.y - camY, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

/*
  Soft radial blasts.
*/
function drawExplosions() {
  const art = Art.ready && Art.has('fx/smoke_puff');
  if (art) {
    for (const ex of explosions) {
      if (!ex.smoked) { ex.smoked = true; if (!ex.flash) addExplosionSmoke(ex); }
    }
    drawSmokeArt();
  }
  for (const ex of explosions) {
    if (drawExplosionArt(ex)) continue;
    const t = 1 - ex.life / ex.maxLife;
    const sx = ex.x - camX;
    const sy = ex.y - camY;
    const r = ex.r * (0.6 + t * 0.6);
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, 'rgba(255,240,200,' + (1 - t) + ')');
    g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/*
  Sparks and debris.
*/
function drawParticles() {
  for (const p of particles) {
    if (drawParticleArt(p)) continue;
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x - camX, p.y - camY, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/*
  Floating damage and score text.
*/
function drawFloaters() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 14px Courier New';
  for (const d of floaters) {
    ctx.globalAlpha = Math.max(0, d.life / d.maxLife);
    ctx.fillStyle = d.color;
    ctx.fillText(d.text, d.x - camX, d.y - camY);
  }
  ctx.globalAlpha = 1;
}

/*
  World strip: player, enemies, targets.
*/
function drawMinimap() {
  /* Top-left: clear of the touch sticks / FIRE (bottom) and pause (top-right). */
  const mw = Math.min(150, Math.max(80, CW * 0.25));
  const mh = Math.round(mw * 0.28);
  const mx = 8;
  const my = 8;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = 'rgba(255,215,0,0.4)';
  ctx.strokeRect(mx, my, mw, mh);
  if (player) {
    ctx.fillStyle = '#6BFF6B';
    ctx.fillRect(mx + (player.body.position.x / WORLD_W) * mw, my + (player.body.position.y / WORLD_H) * mh, 3, 3);
  }
  ctx.fillStyle = '#FF5B5B';
  for (const e of enemies) {
    if (!e.alive) continue;
    ctx.fillRect(mx + (e.body.position.x / WORLD_W) * mw, my + (e.body.position.y / WORLD_H) * mh, 2, 2);
  }
  ctx.fillStyle = '#FFD700';
  for (const t of targets) {
    if (t.destroyed) continue;
    ctx.fillRect(mx + (t.x / WORLD_W) * mw - 1, my + (t.y / WORLD_H) * mh - 1, 3, 3);
  }
}

/*
  Gold exit posts at the east edge so the end of the map is visible.
*/
function drawExit() {
  const x = WORLD_W - 28 - camX;
  if (x < -40 || x > CW + 40) return;
  const locked = gateLocked();
  ctx.fillStyle = locked ? '#FF5B5B' : '#FFD700';
  if (!drawExitArt(x, locked)) {
    ctx.fillRect(x, 40, 6, CH - 80);
    ctx.fillRect(x - 18, 40, 42, 6);
    if (locked) {
      for (let yy = 60; yy < CH - 40; yy += 26) ctx.fillRect(x - 18, yy, 42, 3);
    }
  }
  ctx.font = '12px Courier New';
  ctx.textAlign = 'left';
  ctx.fillText(locked ? 'LOCKED' : 'EXIT', x - (locked ? 16 : 8), 32);
}

/*
  Full frame. Order is back to front.
*/
function render() {
  drawBackground();
  drawTerrain();
  drawExit();
  drawTargets();
  drawEnemies();
  drawProjectiles();
  drawPlayer();
  drawExplosions();
  drawParticles();
  drawFloaters();
  drawMinimap();
}
