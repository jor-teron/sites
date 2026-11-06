/* ============================================================
 * File:        ui/render.js
 * Project:     Osmos OSM1a
 * Purpose:     Layered glow cells on 2D canvas.
 * Depends on:  OSMOS_PHYSICS, OSMOS_FX
 * ============================================================ */
var OSMOS_RENDER = (function () {
  function draw(ctx, state, view) {
    if (!state) return;
    var theme = state.level.theme;
    var W = view.w, H = view.h;
    var sx = W / OSMOS_CONFIG.world.w, sy = H / OSMOS_CONFIG.world.h;
    var scale = Math.min(sx, sy);
    var ox = (W - OSMOS_CONFIG.world.w * scale) * 0.5;
    var oy = (H - OSMOS_CONFIG.world.h * scale) * 0.5;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);

    /* soft vignette */
    var vg = ctx.createRadialGradient(W * 0.5, H * 0.5, H * 0.15, W * 0.5, H * 0.5, H * 0.75);
    vg.addColorStop(0, 'rgba(255,255,255,0.03)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    OSMOS_FX.draw(ctx);

    var cells = state.cells, i, c, r, g, col;
    for (i = 0; i < cells.length; i++) {
      c = cells[i];
      if (!c.alive) continue;
      r = OSMOS_PHYSICS.radius(c.mass);
      if (c.kind === 'player') col = theme.accent;
      else if (c.kind === 'big') col = theme.big;
      else if (c.kind === 'eject') col = theme.soft;
      else col = theme.food;
      drawCell(ctx, c.x, c.y, r, col, c.kind === 'big', c.kind === 'player');
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
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
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
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
