/*
 * Project: notebook
 * File: nb_cover.js
 * Role: Printed parts of special pages, drawn on the canvas (so PNG/PDF export and wrinkles work):
 *   - drawCover(front): soft woven CLOTH (no leather) with rounded corners, a stitched spine on
 *     the left; front = elastic band strap + an empty name label (write on it with the pen) +
 *     a little stitched star; back = embossed logo (the settings card sits on it, nb_settings).
 *   - drawIndexTable(): pages 2–3, a real ruled index with columns "Topic" and "Page No.".
 */
const CLOTH = { base: '#3e8a9a', dark: '#2f6f7d', light: '#5aa6b5', spine: '#2a5f6b' };
let clothPattern = null;

// Small woven tile → repeating pattern (built once).
function clothFill() {
  if (clothPattern) return clothPattern;
  const t = document.createElement('canvas');
  t.width = t.height = 8;
  const c = t.getContext('2d');
  c.fillStyle = CLOTH.base; c.fillRect(0, 0, 8, 8);
  // over-under threads: horizontal in two quarters, vertical in the other two
  c.fillStyle = CLOTH.light; c.fillRect(0, 1, 4, 2); c.fillRect(4, 5, 4, 2);
  c.fillStyle = CLOTH.dark; c.fillRect(5, 0, 2, 4); c.fillRect(1, 4, 2, 4);
  c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(0, 1, 4, 1); c.fillRect(4, 5, 4, 1);
  clothPattern = ctx.createPattern(t, 'repeat');
  return clothPattern;
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function drawCover(front) {
  const w = canvas.width, h = canvas.height;
  ctx.save();
  ctx.fillStyle = '#f5f0e8';
  ctx.fillRect(0, 0, w, h);
  roundRect(ctx, 6, 6, w - 12, h - 12, 22);
  ctx.fillStyle = clothFill();
  ctx.fill();
  ctx.clip();
  // soft light from top-left, like fabric over board
  const g = ctx.createRadialGradient(w * 0.3, h * 0.2, 10, w * 0.5, h * 0.5, Math.max(w, h));
  g.addColorStop(0, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // spine strip + stitches
  ctx.fillStyle = 'rgba(20,50,60,0.35)'; ctx.fillRect(0, 0, 34, h);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(34, 0, 2, h);
  ctx.setLineDash([9, 7]); ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(45, 14); ctx.lineTo(45, h - 14); ctx.stroke();
  ctx.strokeStyle = '#ffe9b0'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(44, 13); ctx.lineTo(44, h - 13); ctx.stroke();
  ctx.setLineDash([]);
  if (front) drawFrontExtras(w, h); else drawBackExtras(w, h);
  ctx.restore();
}

function drawFrontExtras(w, h) {
  // name label (cream card with ruled lines; the user writes on it)
  const lw = Math.min(w * 0.58, 320), lh = 112, lx = (w - lw) / 2 + 10, ly = h * 0.22;
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; roundRect(ctx, lx + 3, ly + 4, lw, lh, 12); ctx.fill();
  ctx.fillStyle = '#fbf5e6'; roundRect(ctx, lx, ly, lw, lh, 12); ctx.fill();
  ctx.strokeStyle = '#d9b77a'; ctx.lineWidth = 2; roundRect(ctx, lx + 6, ly + 6, lw - 12, lh - 12, 8); ctx.stroke();
  ctx.strokeStyle = '#c9d9e0'; ctx.lineWidth = 1;
  for (let i = 1; i <= 3; i++) {
    const y = ly + 12 + i * 24;
    ctx.beginPath(); ctx.moveTo(lx + 18, y); ctx.lineTo(lx + lw - 18, y); ctx.stroke();
  }
  // stitched star, bottom-left (just for fun)
  const sx = 82, sy = h - 82, R = 20, r = 9;
  ctx.setLineDash([4, 4]); ctx.strokeStyle = '#ffd36b'; ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R;
    ctx[i ? 'lineTo' : 'moveTo'](sx + Math.cos(a) * rr, sy + Math.sin(a) * rr);
  }
  ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
  // elastic band strap on the right
  const bx = w - 50, bw = 18;
  ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(bx + 3, 0, bw, h);
  ctx.fillStyle = '#2d2b3d'; ctx.fillRect(bx, 0, bw, h);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  for (let y = 0; y < h; y += 6) ctx.fillRect(bx, y, bw, 2);
  ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(bx + 3, 0, 2, h);
}

function drawBackExtras(w, h) {
  // embossed logo: a little notebook + pen in a ring, pressed into the cloth
  const cx = w / 2 + 17, cy = h - 90;
  const draw = (dx, dy, col) => {
    ctx.save(); ctx.translate(dx, dy); ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.stroke();
    roundRect(ctx, cx - 12, cy - 15, 22, 30, 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - 6, cy - 15); ctx.lineTo(cx - 6, cy + 15); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + 15, cy + 12); ctx.lineTo(cx + 21, cy - 12); ctx.stroke();
    ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center';
    ctx.fillText('PAPER NOTEBOOK', cx, cy + 48);
    ctx.restore();
  };
  draw(-1, -1, 'rgba(0,0,0,0.28)');
  draw(1, 1, 'rgba(255,255,255,0.22)');
}

// Ruled index table: header row + rows, columns Topic | Page No.
function drawIndexTable() {
  const w = canvas.width, h = canvas.height;
  const left = w * 0.07, right = w - w * 0.06, top = 70, rowH = 32;
  const colX = left + (right - left) * 0.76;
  const bottom = top + Math.floor((h - 50 - top) / rowH) * rowH;
  ctx.save();
  ctx.fillStyle = '#7b6a55'; ctx.font = '600 15px Georgia, serif'; ctx.textAlign = 'center';
  ctx.fillText('I N D E X', w / 2, 46);
  ctx.fillStyle = 'rgba(120,170,210,0.15)'; ctx.fillRect(left, top, right - left, rowH);
  ctx.strokeStyle = '#a9c4d8'; ctx.lineWidth = 1;
  for (let y = top + rowH; y < bottom; y += rowH) {
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
  }
  ctx.strokeStyle = '#6f9cbf'; ctx.lineWidth = 1.5;
  ctx.strokeRect(left, top, right - left, bottom - top);
  ctx.beginPath(); ctx.moveTo(left, top + rowH); ctx.lineTo(right, top + rowH); ctx.stroke();
  ctx.strokeStyle = '#d4a5a5';
  ctx.beginPath(); ctx.moveTo(colX, top); ctx.lineTo(colX, bottom); ctx.stroke();
  ctx.fillStyle = '#4b6f8c'; ctx.font = '600 14px system-ui';
  ctx.textAlign = 'left'; ctx.fillText('Topic', left + 12, top + 21);
  ctx.textAlign = 'center'; ctx.fillText('Page No.', (colX + right) / 2, top + 21);
  ctx.restore();
}
