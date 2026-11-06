/* ============================================================
 * File:        ui/render.js
 * Project:     Osmos OSM1b
 * Purpose:     Glow cells + wells / currents / membranes (code-drawn).
 * Depends on:  OSMOS_PHYSICS, OSMOS_FX
 * ============================================================ */
var OSMOS_RENDER = (function () {
  function draw(ctx, state, view) {
    if (!state) return;
    var theme = state.level.theme;
    var W = view.w, H = view.h;
    var scale = Math.min(W / OSMOS_CONFIG.world.w, H / OSMOS_CONFIG.world.h);
    var ox = (W - OSMOS_CONFIG.world.w * scale) * 0.5;
    var oy = (H - OSMOS_CONFIG.world.h * scale) * 0.5;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);

    var vg = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.15, W * 0.5, H * 0.5, H * 0.75);
    vg.addColorStop(0, 'rgba(255,255,255,0.03)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    drawFields(ctx, state.level, state.time || 0, theme);
    OSMOS_FX.draw(ctx);

    var cells = state.cells, i, c, r, col;
    for (i = 0; i < cells.length; i++) {
      c = cells[i];
      if (!c.alive) continue;
      r = OSMOS_PHYSICS.radius(c.mass);
      if (c.kind === 'player') col = theme.accent;
      else if (c.kind === 'big') col = theme.big;
      else if (c.kind === 'hazard') col = '#ff6b6b';
      else if (c.kind === 'eject') col = theme.soft;
      else col = theme.food;
      drawCell(ctx, c.x, c.y, r, col, c.kind === 'big' || c.kind === 'hazard', c.kind === 'player');
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawFields(ctx, level, time, theme) {
    var i, w, c, m, t, g, ang, len, j;
    var wells = level.wells || [];
    for (i = 0; i < wells.length; i++) {
      w = wells[i];
      for (j = 3; j >= 1; j--) {
        ctx.beginPath();
        ctx.strokeStyle = hexAlpha(theme.accent, 0.08 + j * 0.06);
        ctx.lineWidth = 1.5;
        ctx.arc(w.x, w.y, w.r * (j / 3), 0, Math.PI * 2);
        ctx.stroke();
      }
      g = ctx.createRadialGradient(w.x, w.y, 0, w.x, w.y, w.core);
      g.addColorStop(0, hexAlpha(theme.accent, 0.28));
      g.addColorStop(1, hexAlpha(theme.accent, 0));
      ctx.beginPath();
      ctx.fillStyle = g;
      ctx.arc(w.x, w.y, w.core * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    var currents = level.currents || [];
    for (i = 0; i < currents.length; i++) {
      c = currents[i];
      ang = Math.atan2(c.vy, c.vx);
      len = Math.sqrt(c.vx * c.vx + c.vy * c.vy) || 1;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(ang);
      ctx.strokeStyle = hexAlpha(theme.soft, 0.35);
      ctx.fillStyle = hexAlpha(theme.food, 0.12);
      ctx.beginPath();
      ctx.rect(-c.hw, -c.hh, c.hw * 2, c.hh * 2);
      ctx.fill();
      for (j = -2; j <= 2; j++) {
        var oy = j * (c.hh * 0.35);
        var ox = ((time * len * 0.35) % 40) - 20;
        ctx.beginPath();
        ctx.moveTo(-c.hw * 0.7 + ox, oy);
        ctx.lineTo(-c.hw * 0.7 + ox + 22, oy);
        ctx.lineTo(-c.hw * 0.7 + ox + 16, oy - 4);
        ctx.moveTo(-c.hw * 0.7 + ox + 22, oy);
        ctx.lineTo(-c.hw * 0.7 + ox + 16, oy + 4);
        ctx.stroke();
      }
      ctx.restore();
    }

    var membranes = level.membranes || [];
    for (i = 0; i < membranes.length; i++) {
      m = membranes[i];
      ctx.beginPath();
      ctx.strokeStyle = hexAlpha('#9ad7ff', 0.55);
      ctx.lineWidth = OSMOS_CONFIG.membranes.thickness;
      ctx.lineCap = 'round';
      ctx.moveTo(m.x1, m.y1);
      ctx.lineTo(m.x2, m.y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.strokeStyle = hexAlpha('#ffffff', 0.2);
      ctx.lineWidth = 2;
      ctx.moveTo(m.x1, m.y1);
      ctx.lineTo(m.x2, m.y2);
      ctx.stroke();
    }
  }

  function drawCell(ctx, x, y, r, color, isBig, isPlayer) {
    var glow = ctx.createRadialGradient(x, y, r * 0.15, x, y, r * (isBig ? 1.55 : 1.35));
    glow.addColorStop(0, hexAlpha(color, isPlayer ? 0.95 : 0.8));
    glow.addColorStop(0.55, hexAlpha(color, 0.35));
    glow.addColorStop(1, hexAlpha(color, 0));
    ctx.beginPath();
    ctx.fillStyle = glow;
    ctx.arc(x, y, r * (isBig ? 1.55 : 1.35), 0, Math.PI * 2);
    ctx.fill();

    var body = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.1, x, y, r);
    body.addColorStop(0, hexAlpha('#ffffff', isBig ? 0.25 : 0.45));
    body.addColorStop(0.45, hexAlpha(color, 0.85));
    body.addColorStop(1, hexAlpha(color, 0.55));
    ctx.beginPath();
    ctx.fillStyle = body;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    if (isBig) {
      ctx.beginPath();
      ctx.strokeStyle = hexAlpha('#ffffff', 0.18);
      ctx.lineWidth = Math.max(1.2, r * 0.06);
      ctx.arc(x, y, r * 0.92, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function hexAlpha(hex, a) {
    if (hex.charAt(0) !== '#') return hex;
    var h = hex.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var r = parseInt(h.slice(0, 2), 16);
    var g = parseInt(h.slice(2, 4), 16);
    var b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
  }

  function worldFromScreen(view, sx, sy) {
    var W = view.w, H = view.h;
    var scale = Math.min(W / OSMOS_CONFIG.world.w, H / OSMOS_CONFIG.world.h);
    var ox = (W - OSMOS_CONFIG.world.w * scale) * 0.5;
    var oy = (H - OSMOS_CONFIG.world.h * scale) * 0.5;
    return { x: (sx - ox) / scale, y: (sy - oy) / scale };
  }

  return { draw: draw, worldFromScreen: worldFromScreen };
})();
