/*
 * Ping Pong — Classic: today's look (default). The colours come from PONG_CONFIG.colors / net, so it is
 * pixel-identical to the build before themes: flat court, dashed centre line, plain paddles and disc ball,
 * no trail, no hit effect, and no CSS overrides (the stylesheet defaults are the Classic page).
 */
PP.registerTheme(PP.makeTheme({
  id: "classic",
  name: "Classic",
  paddle: { L: { fill: CFG.colors.pieces }, R: { fill: CFG.colors.pieces } },
  ball: { fill: CFG.colors.pieces },
  drawCourt(ctx, e) {
    ctx.fillStyle = CFG.colors.court;
    ctx.fillRect(0, 0, e.W, e.H);
    drawNet(ctx, e, { color: CFG.colors.net, width: CFG.net.lineWidth, dash: CFG.net.dash });
  },
}));
