/*
 * Ping Pong — Classic Bar: today's plain bar (the default paddle), pixel-identical to the build before paddle models.
 * A model is { id, name, draw(ctx, x, y, w, h, col, st), hit?, emit? } (core/registry.js); (x, y) = top-left corner, court units.
 * The theme supplies col (theme.paddleColors(side)):
 *   fill      body colour
 *   radius    corner radius (0 / missing = plain rectangle)
 *   glow      glow colour (missing = none), glowBlur = its size
 *   edge      outline colour, edgeW = its width
 *   shine     a light stripe on the body (rgba colour)
 * This bar has no animation and no effects of its own (so the theme's hit effect is all there is) and ignores st.
 */
PP.registerPaddle({
  id: "classic",
  name: "Classic Bar",
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
