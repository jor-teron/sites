/*
  File: assets/models.js
  Project: tower-defence
  Purpose: Detailed top-down unit art. Every unit part (tower base and
           turret per type x level, enemy body frames, shadows, glows) is
           drawn once into a small offscreen canvas and cached. The cache
           is dropped when the tile size or pixel ratio changes. Per frame
           the renderer only blits and rotates these sprites, which keeps
           it cheap on slow PCs. All sprites face +x (angle 0 = right).
*/

import { TILE } from '../core/path.js';

/* Sprite cache keyed by part name. */
const cache = new Map();

/* Tile size and pixel ratio the cache was built for. */
let cacheTile = 0;
let cacheDpr = 0;

/* Pixel ratio for sprites. Capped at 2 to keep memory low. */
function spriteDpr() {
  return Math.min(2, window.devicePixelRatio || 1);
}

/* Drop the cache when the board was resized or moved to another screen. */
function checkCache() {
  const dpr = spriteDpr();
  if (TILE !== cacheTile || dpr !== cacheDpr) {
    cache.clear();
    cacheTile = TILE;
    cacheDpr = dpr;
  }
  return dpr;
}

/*
  Get or build a square sprite. sizeTiles is the side in tiles. draw(g, T)
  paints with the origin at the sprite center; T is the tile size in px.
*/
export function sprite(key, sizeTiles, draw) {
  const dpr = checkCache();
  let s = cache.get(key);
  if (s) return s;
  const size = Math.max(4, Math.ceil(sizeTiles * TILE));
  const c = document.createElement('canvas');
  c.width = Math.ceil(size * dpr);
  c.height = Math.ceil(size * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr);
  g.translate(size / 2, size / 2);
  draw(g, TILE);
  s = { c, size, half: size / 2 };
  cache.set(key, s);
  return s;
}

/* Draw a sprite centered at x, y, rotated by angle, scaled by scale. */
export function blit(ctx, s, x, y, angle = 0, scale = 1) {
  const h = s.half * scale;
  const w = s.size * scale;
  if (angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(s.c, -h, -h, w, w);
    ctx.restore();
  } else {
    ctx.drawImage(s.c, x - h, y - h, w, w);
  }
}

/* ---------- small paint helpers (only used while building sprites) ---------- */

/* Lighten (amt > 0) or darken (amt < 0) a #rrggbb color. */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let gr = (n >> 8) & 255;
  let b = n & 255;
  const f = (v) => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt));
  r = f(r); gr = f(gr); b = f(b);
  return `rgb(${r},${gr},${b})`;
}

/* Rounded rectangle path. */
function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* Regular polygon path. */
function poly(g, n, radius, rot = 0) {
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * Math.PI * 2;
    const px = Math.cos(a) * radius;
    const py = Math.sin(a) * radius;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
}

/* Radial gradient lit from the top-left. */
function ballGrad(g, radius, light, dark) {
  const gr = g.createRadialGradient(-radius * 0.35, -radius * 0.35, radius * 0.1, 0, 0, radius);
  gr.addColorStop(0, light);
  gr.addColorStop(1, dark);
  return gr;
}

/* Barrel along +x from x0 with length len and width w, shaded as a cylinder. */
function barrel(g, x0, y, len, w, base) {
  const gr = g.createLinearGradient(0, y - w / 2, 0, y + w / 2);
  gr.addColorStop(0, '#111');
  gr.addColorStop(0.45, base);
  gr.addColorStop(1, '#0a0a0a');
  g.fillStyle = gr;
  rrect(g, x0, y - w / 2, len, w, w * 0.3);
  g.fill();
}

/* Small bolt or rivet. */
function bolt(g, x, y, r, gold) {
  g.fillStyle = ballGrad(g, r, gold ? '#FFF2A8' : '#C9CED8', gold ? '#9A7A00' : '#3a3f48');
  g.save();
  g.translate(x, y);
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/* ---------- towers ---------- */

/* Turret scale grows with level. */
function turretScale(level) {
  return 1 + (level - 1) * 0.07;
}

/* Gun barrel count per level: 2, 2, 3, 3, 4. */
function gunBarrels(level) {
  return level >= 5 ? 4 : level >= 3 ? 3 : 2;
}

/* Lateral offsets (tiles) of each gun barrel. */
function gunBarrelOffsets(level) {
  const n = gunBarrels(level);
  const k = turretScale(level);
  const gap = 0.095 * k;
  const out = [];
  for (let i = 0; i < n; i++) out.push((i - (n - 1) / 2) * gap);
  return out;
}

/* Barrel tip distance (tiles) from the tower center. */
function muzzleDist(type, level) {
  const k = turretScale(level);
  if (type === 'cannon') return 0.56 * k;
  if (type === 'gun') return 0.5 * k;
  return 0.34 * k;
}

/* Bolted square base plate. Trim shows level: 2 silver, 3+ gold, 4+ gold bolts, 5 gold ring. */
function towerBase(type, level, color) {
  return sprite(`tb-${type}-${level}`, 1.1, (g, T) => {
    const s = T * 0.84;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.55)';
    g.shadowBlur = T * 0.12;
    g.shadowOffsetX = T * 0.04;
    g.shadowOffsetY = T * 0.07;
    const pg = g.createLinearGradient(-s / 2, -s / 2, s / 2, s / 2);
    pg.addColorStop(0, '#7a8190');
    pg.addColorStop(1, '#262a33');
    g.fillStyle = pg;
    rrect(g, -s / 2, -s / 2, s, s, T * 0.1);
    g.fill();
    g.restore();

    /* Bevel. */
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    g.lineWidth = Math.max(1, T * 0.02);
    rrect(g, -s / 2 + T * 0.04, -s / 2 + T * 0.04, s - T * 0.08, s - T * 0.08, T * 0.07);
    g.stroke();

    /* Level trim. */
    if (level >= 2) {
      g.strokeStyle = level >= 3 ? '#FFD700' : '#C8CCD6';
      g.lineWidth = Math.max(1.5, T * 0.035);
      rrect(g, -s / 2 + T * 0.015, -s / 2 + T * 0.015, s - T * 0.03, s - T * 0.03, T * 0.09);
      g.stroke();
    }

    /* Accent ring around the turret ring. */
    g.strokeStyle = color;
    g.globalAlpha = 0.8;
    g.lineWidth = Math.max(1.5, T * 0.04);
    g.beginPath();
    g.arc(0, 0, T * 0.3, 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
    if (level >= 5) {
      g.strokeStyle = '#FFD700';
      g.lineWidth = Math.max(1, T * 0.02);
      g.beginPath();
      g.arc(0, 0, T * 0.35, 0, Math.PI * 2);
      g.stroke();
    }

    /* Corner bolts. */
    const b = s / 2 - T * 0.1;
    for (const [bx, by] of [[-b, -b], [b, -b], [-b, b], [b, b]]) {
      bolt(g, bx, by, T * 0.045, level >= 4);
    }
  });
}

/* Rotating turret per type and level, pointing +x. */
function towerTurret(type, level, color) {
  return sprite(`tt-${type}-${level}`, 1.4, (g, T) => {
    const k = turretScale(level);
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowBlur = T * 0.08;
    g.shadowOffsetX = T * 0.03;
    g.shadowOffsetY = T * 0.05;

    if (type === 'gun') {
      const len = 0.5 * T * k;
      for (const off of gunBarrelOffsets(level)) {
        barrel(g, 0, off * T, len, T * 0.065, '#5a5f6a');
        g.fillStyle = '#222';
        g.fillRect(len - T * 0.06, off * T - T * 0.042, T * 0.06, T * 0.084);
      }
      const r = T * 0.2 * k;
      g.fillStyle = ballGrad(g, r, shade(color, 0.45), shade(color, -0.45));
      rrect(g, -r * 1.05, -r, r * 2, r * 2, r * 0.45);
      g.fill();
      g.shadowColor = 'transparent';
      g.fillStyle = shade(color, -0.55);
      g.beginPath();
      g.arc(-r * 0.15, 0, r * 0.38, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.beginPath();
      g.arc(-r * 0.3, -r * 0.15, r * 0.14, 0, Math.PI * 2);
      g.fill();
    } else if (type === 'cannon') {
      const len = 0.56 * T * k;
      const w = T * 0.16 * k;
      const offs = level >= 5 ? [-w * 0.62, w * 0.62] : [0];
      const bw = level >= 5 ? w * 0.85 : w;
      for (const off of offs) {
        barrel(g, 0, off, len, bw, '#6b5a50');
        if (level >= 3) {
          g.fillStyle = '#2a2420';
          g.fillRect(len - T * 0.09, off - bw * 0.68, T * 0.09, bw * 1.36);
        }
        for (let i = 0; i < 3; i++) bolt(g, T * (0.2 + i * 0.1) * k, off, bw * 0.13, level >= 4);
      }
      const r = T * 0.24 * k;
      g.fillStyle = ballGrad(g, r, shade(color, 0.4), shade(color, -0.5));
      poly(g, 8, r, Math.PI / 8);
      g.fill();
      g.shadowColor = 'transparent';
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        bolt(g, Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75, r * 0.08, level >= 4);
      }
      g.fillStyle = shade(color, -0.6);
      g.beginPath();
      g.arc(-r * 0.1, 0, r * 0.32, 0, Math.PI * 2);
      g.fill();
    } else {
      /* Frost: hex dish with crystal spikes and a short emitter. */
      const r = T * 0.22 * k;
      barrel(g, 0, 0, T * 0.34 * k, T * 0.08, '#6ab0c8');
      g.fillStyle = ballGrad(g, r, '#E8FBFF', '#2a7f9a');
      poly(g, 6, r, Math.PI / 6);
      g.fill();
      g.shadowColor = 'transparent';
      g.strokeStyle = 'rgba(255,255,255,0.6)';
      g.lineWidth = Math.max(1, T * 0.015);
      g.stroke();
      const spikes = 3 + level;
      for (let i = 0; i < spikes; i++) {
        const a = (i / spikes) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const L = r * (0.85 + (i % 2) * 0.2);
        const W = r * 0.16;
        g.fillStyle = i % 2 ? '#B8FFFF' : '#7FE6FF';
        g.beginPath();
        g.moveTo(-sa * W, ca * W);
        g.lineTo(ca * L, sa * L);
        g.lineTo(sa * W, -ca * W);
        g.closePath();
        g.fill();
      }
      g.fillStyle = ballGrad(g, r * 0.35, '#FFFFFF', '#6BE8FF');
      g.beginPath();
      g.arc(0, 0, r * 0.32, 0, Math.PI * 2);
      g.fill();
      if (level >= 5) {
        g.strokeStyle = '#FFD700';
        g.lineWidth = Math.max(1, T * 0.02);
        poly(g, 6, r * 1.02, Math.PI / 6);
        g.stroke();
      }
    }
    g.restore();
  });
}

/* Soft colored glow, drawn with a pulsing alpha (frost). */
function glow(color) {
  return sprite(`glow-${color}`, 1.3, (g, T) => {
    const R = T * 0.62;
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
    gr.addColorStop(0, color + 'cc');
    gr.addColorStop(0.45, color + '55');
    gr.addColorStop(1, color + '00');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fill();
  });
}

/* Muzzle flash star, pointing +x. */
function muzzleFlash() {
  return sprite('flash', 0.5, (g, T) => {
    const R = T * 0.22;
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, R);
    gr.addColorStop(0, 'rgba(255,255,230,1)');
    gr.addColorStop(0.4, 'rgba(255,200,60,0.9)');
    gr.addColorStop(1, 'rgba(255,120,0,0)');
    g.fillStyle = gr;
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const rr = i % 2 ? R * 0.45 : R;
      const px = Math.cos(a) * rr * (Math.cos(a) > 0 ? 1.4 : 0.7);
      const py = Math.sin(a) * rr * 0.8;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    g.fill();
  });
}

/*
  Draw one tower at canvas center p. Uses t.angle for aim, t.recoil
  (1 -> 0) to kick the turret back, and t.flash (> 0) for the muzzle flash.
  now is seconds, used for the frost pulse.
*/
export function drawTower(ctx, t, p, now) {
  const T = TILE;
  blit(ctx, towerBase(t.type, t.level, t.color), p.x, p.y);

  if (t.type === 'frost') {
    const pulse = 0.5 + 0.5 * Math.sin(now * 3.2 + t.c * 1.7 + t.r);
    ctx.globalAlpha = 0.35 + 0.35 * pulse;
    blit(ctx, glow('#6BE8FF'), p.x, p.y, 0, 0.85 + 0.25 * pulse + (t.flash > 0 ? 0.2 : 0));
    ctx.globalAlpha = 1;
  }

  const kick = (t.recoil || 0) * T * (t.type === 'cannon' ? 0.1 : 0.06);
  const ca = Math.cos(t.angle);
  const sa = Math.sin(t.angle);
  const tx = p.x - ca * kick;
  const ty = p.y - sa * kick;
  blit(ctx, towerTurret(t.type, t.level, t.color), tx, ty, t.angle);

  if (t.flash > 0 && t.type !== 'frost') {
    let lat = 0;
    if (t.type === 'gun') {
      const offs = gunBarrelOffsets(t.level);
      lat = offs[(t.shots || 0) % offs.length] * T;
    } else if (t.level >= 5) {
      lat = ((t.shots || 0) % 2 ? 1 : -1) * T * 0.16 * turretScale(t.level) * 0.62;
    }
    const d = muzzleDist(t.type, t.level) * T + T * 0.08;
    const fx = tx + ca * d - sa * lat;
    const fy = ty + sa * d + ca * lat;
    blit(ctx, muzzleFlash(), fx, fy, t.angle, t.type === 'cannon' ? 1.5 : 1);
  }
}

/* ---------- enemies ---------- */

/* Walk/tread frame counts. */
const GRUNT_FRAMES = 6;
const TREAD_FRAMES = 4;
const WHEEL_FRAMES = 3;

/* Soft ground shadow. Rotation-independent, drawn offset down-right. */
function enemyShadow(type, rTiles) {
  return sprite(`es-${type}`, rTiles * 2.8, (g, T) => {
    const R = rTiles * T * 1.15;
    const gr = g.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
    gr.addColorStop(0, 'rgba(0,0,0,0.5)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, R, 0, Math.PI * 2);
    g.fill();
  });
}

/* Track pair for tanks. len/wid/off in px, frame shifts the tread lines. */
function tracks(g, len, wid, off, frame, frames) {
  for (const side of [-1, 1]) {
    const y = side * off - wid / 2;
    g.fillStyle = '#1b1b1f';
    rrect(g, -len / 2, y, len, wid, wid * 0.35);
    g.fill();
    g.save();
    rrect(g, -len / 2, y, len, wid, wid * 0.35);
    g.clip();
    const step = wid * 0.55;
    const shift = (frame / frames) * step;
    g.fillStyle = '#4a4a52';
    for (let x = -len / 2 - step + shift; x < len / 2 + step; x += step) {
      g.fillRect(x, y + wid * 0.12, step * 0.35, wid * 0.76);
    }
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 1;
    rrect(g, -len / 2, y, len, wid, wid * 0.35);
    g.stroke();
  }
}

/* Helmeted soldier, frame = walk phase. */
function gruntBody(color, rT, frame) {
  return sprite(`eg-${frame}`, rT * 2.8, (g, T) => {
    const r = rT * T;
    const s = Math.sin((frame / GRUNT_FRAMES) * Math.PI * 2);
    /* Feet. */
    g.fillStyle = '#2a1e16';
    for (const side of [-1, 1]) {
      g.beginPath();
      g.ellipse(side * s * r * 0.45, side * r * 0.3, r * 0.26, r * 0.17, 0, 0, Math.PI * 2);
      g.fill();
    }
    /* Backpack. */
    g.fillStyle = shade(color, -0.6);
    rrect(g, -r * 0.85, -r * 0.42, r * 0.5, r * 0.84, r * 0.15);
    g.fill();
    /* Shoulders / torso. */
    g.fillStyle = ballGrad(g, r, shade(color, 0.15), shade(color, -0.5));
    g.beginPath();
    g.ellipse(0, 0, r * 0.5, r * 0.85, 0, 0, Math.PI * 2);
    g.fill();
    /* Arms swing opposite to feet. Rifle on the right arm. */
    for (const side of [-1, 1]) {
      const ax = -side * s * r * 0.35;
      g.fillStyle = shade(color, -0.25);
      g.beginPath();
      g.ellipse(ax + r * 0.1, side * r * 0.8, r * 0.3, r * 0.17, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#e0b48a';
      g.beginPath();
      g.arc(ax + r * 0.38, side * r * 0.8, r * 0.11, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#222';
    g.fillRect(-s * r * 0.35 + r * 0.2, r * 0.66, r * 0.85, r * 0.12);
    /* Helmet. */
    g.fillStyle = ballGrad(g, r * 0.55, '#8d9a6a', '#2f3a1e');
    g.beginPath();
    g.arc(r * 0.05, 0, r * 0.52, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = Math.max(1, r * 0.07);
    g.stroke();
    g.fillStyle = color;
    g.fillRect(-r * 0.2, -r * 0.08, r * 0.2, r * 0.16);
  });
}

/* Scout buggy, frame = wheel tread phase. */
function runnerBody(color, rT, frame) {
  return sprite(`er-${frame}`, rT * 3.0, (g, T) => {
    const r = rT * T;
    /* Wheels. */
    for (const wx of [-r * 0.65, r * 0.65]) {
      for (const side of [-1, 1]) {
        const wy = side * r * 0.72;
        g.fillStyle = '#151515';
        rrect(g, wx - r * 0.3, wy - r * 0.17, r * 0.6, r * 0.34, r * 0.1);
        g.fill();
        g.fillStyle = '#444';
        const step = r * 0.2;
        const shift = (frame / WHEEL_FRAMES) * step;
        for (let x = -r * 0.3 + shift; x < r * 0.3; x += step) {
          g.fillRect(wx + x, wy - r * 0.15, r * 0.06, r * 0.3);
        }
      }
    }
    /* Chassis. */
    g.fillStyle = ballGrad(g, r, shade(color, 0.35), shade(color, -0.45));
    rrect(g, -r * 0.95, -r * 0.55, r * 1.9, r * 1.1, r * 0.35);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = Math.max(1, r * 0.06);
    g.stroke();
    /* Roll cage. */
    g.strokeStyle = '#2a2a2a';
    g.lineWidth = Math.max(1, r * 0.09);
    g.strokeRect(-r * 0.45, -r * 0.4, r * 0.7, r * 0.8);
    g.beginPath();
    g.moveTo(-r * 0.45, -r * 0.4); g.lineTo(r * 0.25, r * 0.4);
    g.stroke();
    /* Windscreen and driver. */
    g.fillStyle = 'rgba(150,220,255,0.75)';
    rrect(g, r * 0.3, -r * 0.35, r * 0.18, r * 0.7, r * 0.06);
    g.fill();
    g.fillStyle = ballGrad(g, r * 0.25, '#ffffff', '#555');
    g.beginPath();
    g.arc(-r * 0.1, 0, r * 0.24, 0, Math.PI * 2);
    g.fill();
    /* Headlights. */
    g.fillStyle = '#FFF6B0';
    g.fillRect(r * 0.82, -r * 0.42, r * 0.1, r * 0.18);
    g.fillRect(r * 0.82, r * 0.24, r * 0.1, r * 0.18);
  });
}

/* Tank hull with tracks, frame = tread phase. heavy = boss version. */
function tankHull(type, color, rT, frame, heavy) {
  return sprite(`eh-${type}-${frame}`, rT * 2.8, (g, T) => {
    const r = rT * T;
    const len = r * (heavy ? 2.1 : 2.0);
    const wid = r * (heavy ? 0.5 : 0.46);
    const off = r * (heavy ? 0.74 : 0.66);
    tracks(g, len, wid, off, frame, TREAD_FRAMES);
    const hw = r * (heavy ? 1.1 : 0.9);
    const hl = r * (heavy ? 1.85 : 1.7);
    g.fillStyle = ballGrad(g, r * 1.1, shade(color, 0.3), shade(color, -0.55));
    rrect(g, -hl / 2, -hw / 2, hl, hw, r * 0.15);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = Math.max(1, r * 0.05);
    g.stroke();
    /* Front glacis highlight and rear engine grille. */
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.fillRect(hl / 2 - r * 0.28, -hw / 2 + r * 0.06, r * 0.22, hw - r * 0.12);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    for (let i = 0; i < 4; i++) {
      g.fillRect(-hl / 2 + r * 0.1 + i * r * 0.1, -hw * 0.3, r * 0.05, hw * 0.6);
    }
    if (heavy) {
      /* Red markings: hull stripes and a star on the rear deck. */
      g.fillStyle = '#B3201A';
      g.fillRect(hl * 0.12, -hw / 2 + r * 0.04, r * 0.1, hw - r * 0.08);
      g.fillRect(hl * 0.12 + r * 0.16, -hw / 2 + r * 0.04, r * 0.05, hw - r * 0.08);
      g.save();
      g.translate(-hl * 0.3, 0);
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const rr = i % 2 ? r * 0.07 : r * 0.17;
        if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
      g.restore();
      /* Side armor skirts with rivets. */
      for (const side of [-1, 1]) {
        g.fillStyle = shade(color, -0.35);
        g.fillRect(-hl * 0.42, side * hw / 2 - (side > 0 ? 0 : r * 0.14), hl * 0.84, r * 0.14);
        for (let i = 0; i < 5; i++) {
          bolt(g, -hl * 0.36 + i * hl * 0.18, side * (hw / 2 + (side > 0 ? r * 0.07 : -r * 0.07)), r * 0.04, false);
        }
      }
    }
  });
}

/* Tank / boss turret, pointing +x. */
function tankTurret(type, color, rT, heavy) {
  return sprite(`et-${type}`, rT * 3.0, (g, T) => {
    const r = rT * T;
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowBlur = r * 0.2;
    g.shadowOffsetX = r * 0.06;
    g.shadowOffsetY = r * 0.1;
    if (heavy) {
      barrel(g, 0, -r * 0.18, r * 1.25, r * 0.16, '#555a63');
      barrel(g, 0, r * 0.18, r * 1.25, r * 0.16, '#555a63');
      g.fillStyle = ballGrad(g, r * 0.6, shade(color, 0.35), shade(color, -0.5));
      rrect(g, -r * 0.55, -r * 0.45, r * 1.0, r * 0.9, r * 0.2);
      g.fill();
      g.shadowColor = 'transparent';
      barrel(g, -r * 0.1, -r * 0.55, r * 0.6, r * 0.09, '#444');
      g.fillStyle = shade(color, -0.6);
      g.beginPath();
      g.arc(-r * 0.15, 0, r * 0.2, 0, Math.PI * 2);
      g.fill();
      /* Red turret band and red barrel tips. */
      g.fillStyle = '#B3201A';
      g.fillRect(r * 0.12, -r * 0.45, r * 0.1, r * 0.9);
      g.fillRect(r * 1.08, -r * 0.27, r * 0.17, r * 0.18);
      g.fillRect(r * 1.08, r * 0.09, r * 0.17, r * 0.18);
    } else {
      barrel(g, 0, 0, r * 1.15, r * 0.17, '#555a63');
      g.fillStyle = ballGrad(g, r * 0.45, shade(color, 0.4), shade(color, -0.5));
      g.beginPath();
      g.arc(-r * 0.05, 0, r * 0.45, 0, Math.PI * 2);
      g.fill();
      g.shadowColor = 'transparent';
      g.fillStyle = shade(color, -0.6);
      g.beginPath();
      g.arc(-r * 0.15, -r * 0.12, r * 0.14, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  });
}

/*
  Draw one enemy at canvas point p. Uses e.heading for facing and e.dist
  (tiles walked) to pick walk / tread frames. now is seconds.
*/
export function drawEnemy(ctx, e, p, now) {
  const T = TILE;
  const def = e.def;
  const rT = def.radius;
  const r = rT * T;
  const ang = e.heading || 0;

  blit(ctx, enemyShadow(e.type, rT), p.x + r * 0.15, p.y + r * 0.25);

  if (e.type === 'grunt') {
    const f = Math.floor(e.dist * 3 * GRUNT_FRAMES) % GRUNT_FRAMES;
    blit(ctx, gruntBody(def.color, rT, f), p.x, p.y, ang);
  } else if (e.type === 'runner') {
    const f = Math.floor(e.dist * 12) % WHEEL_FRAMES;
    blit(ctx, runnerBody(def.color, rT, f), p.x, p.y, ang);
  } else {
    const heavy = e.type === 'boss';
    const f = Math.floor(e.dist * (heavy ? 10 : 14)) % TREAD_FRAMES;
    blit(ctx, tankHull(e.type, def.color, rT, f, heavy), p.x, p.y, ang);
    const sway = Math.sin(now * (heavy ? 0.9 : 1.3) + e.maxHp) * (heavy ? 0.35 : 0.5);
    blit(ctx, tankTurret(e.type, def.color, rT, heavy), p.x, p.y, ang + sway);
  }

  if (e.slowTimer > 0) {
    ctx.fillStyle = 'rgba(100, 220, 255, 0.35)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 1.05, 0, Math.PI * 2);
    ctx.fill();
  }

  if (e.hp < e.maxHp || e.type === 'boss') {
    const barW = Math.max(r * 2.2, T * 0.5);
    const barH = e.type === 'boss' ? 5 : 4;
    const bx = p.x - barW / 2;
    const by = p.y - r * 1.15 - 8;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
    const frac = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = frac > 0.5 ? '#6BFF6B' : frac > 0.25 ? '#FFD700' : '#FF5B5B';
    ctx.fillRect(bx, by, barW * frac, barH);
  }
}
