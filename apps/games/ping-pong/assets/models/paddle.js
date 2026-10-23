/*
 * Ping Pong — assets/models/paddle.js: paddle models (code-drawn, no image).
 * A model is { id, name, draw(ctx, x, y, w, h, col) }; (x, y) = top-left corner, court units.
 * The theme supplies col (theme.paddleColors(side)):
 *   fill      body colour
 *   radius    corner radius (0 / missing = plain rectangle)
 *   glow      glow colour (missing = none), glowBlur = its size
 *   edge      outline colour, edgeW = its width
 *   shine     a light stripe on the body (rgba colour)
 * Draw through PP.drawPaddle(ctx, x, y, w, h, side) (core/registry.js). Later releases add models with
 * PP.registerPaddle({...}); this "standard" one is the default.
 */
PP.registerPaddle({
  id: "standard",
  name: "Standard",
  draw(ctx, x, y, w, h, col) {
    ctx.save();
    if (col.glow) PP.glow(ctx, col.glow, col.glowBlur || 12);
    ctx.fillStyle = col.fill;
    if (col.radius) { PP.roundRect(ctx, x, y, w, h, col.radius); ctx.fill(); }
    else ctx.fillRect(x, y, w, h);
    ctx.restore();
    if (col.shine) {
      ctx.fillStyle = col.shine;
      ctx.fillRect(x + w * 0.18, y + (col.radius || 0), w * 0.22, h - 2 * (col.radius || 0));
    }
    if (col.edge) {
      ctx.strokeStyle = col.edge;
      ctx.lineWidth = col.edgeW || 1.5;
      if (col.radius) PP.roundRect(ctx, x, y, w, h, col.radius); else { ctx.beginPath(); ctx.rect(x, y, w, h); }
      ctx.stroke();
    }
  },
});
