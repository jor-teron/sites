/** Classic Dino — the original blocky grey dino (default). Colours come from the active theme's palette. */
DR.registerDino({
  id: 'classic',
  name: 'Classic Dino',
  rawDead: true, // keeps the hitbox-box position/pose when dead (so the death frame matches the original)
  eye(d) { return d.ducking ? [d.w + 9.5, 5.5] : [36, 7]; },
  draw(ctx, d, th) {
    const P = th.pal, x = d.x, y = d.y, w = d.w, h = d.h, dead = d.pose === 'dead';
    ctx.fillStyle = P.dino;
    if (d.ducking) {
      DRX.rr(ctx, x, y + 4, w + 8, h - 4, 4);
      ctx.fill();
      ctx.fillRect(x + w - 4, y, 18, 16); // head
      if (dead) DRX.deadEye(ctx, x + w + 9.5, y + 5.5, 2, P.eye);
      else { ctx.fillStyle = P.eye; ctx.fillRect(x + w + 8, y + 4, 3, 3); }
    } else {
      ctx.fillRect(x + 8, y + 14, 22, 26); // body
      ctx.fillRect(x + 20, y, 22, 18);     // head
      ctx.fillRect(x, y + 20, 10, 8);      // tail
      if (dead) DRX.deadEye(ctx, x + 36, y + 7, 2.4, P.eye);
      else { ctx.fillStyle = P.eye; ctx.fillRect(x + 34, y + 5, 4, 4); }
      ctx.fillStyle = P.dino;
      const leg = Math.floor(d.frame) % 2;
      if (d.onGround) {
        ctx.fillRect(x + 10, y + h - 2, 6, 10 + (leg ? 0 : -4));
        ctx.fillRect(x + 22, y + h - 2, 6, 10 + (leg ? -4 : 0));
      } else {
        ctx.fillRect(x + 12, y + h - 2, 6, 8);
        ctx.fillRect(x + 22, y + h - 2, 6, 8);
      }
      ctx.fillRect(x + 14, y + 22, 8, 4); // arm
    }
  },
});
