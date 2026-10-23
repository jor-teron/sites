/*
 * Ping Pong — assets/models/net.js: the centre line / net helper (code-drawn, no image).
 * Plain script: themes call drawNet(ctx, e, style) from their drawCourt (e = { W, H }).
 * style: { color, width, dash [on, off], cap ("butt" | "round"), glow (colour), glowBlur }.
 */
function drawNet(ctx, e, style) {
  ctx.save();
  if (style.glow) PP.glow(ctx, style.glow, style.glowBlur || 10);
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  if (style.cap) ctx.lineCap = style.cap;
  ctx.setLineDash(style.dash || []);
  ctx.beginPath();
  ctx.moveTo(e.W / 2, 0);
  ctx.lineTo(e.W / 2, e.H);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}
