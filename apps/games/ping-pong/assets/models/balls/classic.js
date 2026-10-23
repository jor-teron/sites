/*
 * Ping Pong — Classic ball (default): today's plain disc, coloured by the theme (fill, optional glow / rim).
 * It defines no trail / hit / shadow of its own, so the THEME's effects apply (core/registry.js, PP.ballFx).
 * col (theme.ballColors()): fill; glow + glowBlur (optional); rim + rimW (optional outline).
 */
PP.registerBall({
  id: "classic",
  name: "Classic",
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
