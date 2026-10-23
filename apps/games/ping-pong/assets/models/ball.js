/*
 * Ping Pong — assets/models/ball.js: ball models (code-drawn disc, no image).
 * A model is { id, name, draw(ctx, x, y, r, col) }; (x, y) = centre, r = radius, court units.
 * The theme supplies col (theme.ballColors()):
 *   fill      disc colour
 *   glow      glow colour (missing = none), glowBlur = its size
 *   rim       outline colour, rimW = its width
 * The trail / bounce shadow are effects, drawn by the theme under the ball (theme.drawUnder).
 * Draw through PP.drawBall(ctx, x, y, r) (core/registry.js). Later releases add models with
 * PP.registerBall({...}); this "standard" one is the default.
 */
PP.registerBall({
  id: "standard",
  name: "Standard",
  draw(ctx, x, y, r, col) {
    ctx.save();
    if (col.glow) PP.glow(ctx, col.glow, col.glowBlur || 12);
    ctx.fillStyle = col.fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (col.rim) {
      ctx.strokeStyle = col.rim;
      ctx.lineWidth = col.rimW || 1;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
});
