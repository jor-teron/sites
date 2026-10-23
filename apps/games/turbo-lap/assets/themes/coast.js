/* Turbo Lap — theme 1: Coastline. Today's look, unchanged and the default: blue sky and sun, snowy far mountains, green
   hills and trees. Its background is the original renderer code moved here and its objects are the original sprites, so it
   stays pixel-identical to the build before themes. */
(() => {
  const CFG = TL.CFG, U = TL.util, SP = TL.sprites, C = CFG.colors;

  function layer(ctx, W, H, baseY, amp, offset, seed, rough, color, snow) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(0, H);
    const step = Math.max(4, W / 160), pts = [];
    for (let px = 0; px <= W + step; px += step) {
      const y = baseY - amp * TL.art.ridge(px / W / 2 + offset, seed, rough);
      pts.push([px, y]); ctx.lineTo(px, y);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    if (snow) {
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      let inside = false;
      for (const [px, y] of pts) {
        const peak = baseY - amp * 0.78;
        if (y < peak) { if (!inside) { ctx.moveTo(px, peak); inside = true; } ctx.lineTo(px, y); }
        else if (inside) { ctx.lineTo(px, peak); ctx.closePath(); inside = false; }
      }
      ctx.fill();
    }
  }

  TL.themes.register(TL.makeTheme({
    id: 'coast', name: 'Coastline', blurb: 'Blue sky, green hills',
    colors: { light: C.light, dark: C.dark, start: C.start },
    fog: C.fog,
    sky: { top: C.skyTop, bottom: C.skyBottom },
    drawBackground(ctx, W, H, playerY, R) {
      const g = ctx.createLinearGradient(0, 0, 0, H * 0.6);
      g.addColorStop(0, C.skyTop); g.addColorStop(1, C.skyBottom);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(255,250,220,0.9)';
      const sx = U.mod(0.75 - R.skyOffset * 2, 2) / 2 * W * 2 - W * 0.25;
      ctx.beginPath(); ctx.arc(sx, H * 0.14, Math.min(W, H) * 0.05, 0, Math.PI * 2); ctx.fill();
      const lift = U.clamp(playerY / 8000, -1, 1.5) * H * 0.06;
      const horizon = H * 0.5 + lift;
      layer(ctx, W, H, horizon + 2, H * 0.22, R.skyOffset, 0.1, 1, C.mountainsFar, true);
      layer(ctx, W, H, horizon + 2, H * 0.12, R.hillOffset, 0.37, 0.5, C.mountainsNear, false);
      layer(ctx, W, H, horizon + 2, H * 0.05, R.treeOffset, 0.71, 2, C.hills, false);
    },
    tree: (c, x, y, w) => SP.tree(c, x, y, w),
    bush: (c, x, y, w) => SP.bush(c, x, y, w),
    lamp: (c, x, y, w, v, dir) => SP.lamp(c, x, y, w, dir),
    sign: (c, x, y, w, v, dir) => SP.sign(c, x, y, w, dir)
  }));
})();
