/*
 * Ping Pong — assets/models/net.js: the dashed centre net (code-drawn, no image).
 * Plain script: drawNet(ctx) is called by draw() in ui/dom.js. Uses PONG_CONFIG colours / net.
 */
function drawNet(ctx) {
  ctx.strokeStyle = CFG.colors.net;
  ctx.lineWidth = CFG.net.lineWidth;
  ctx.setLineDash(CFG.net.dash);
  ctx.beginPath();
  ctx.moveTo(COURT_W / 2, 0);
  ctx.lineTo(COURT_W / 2, COURT_H);
  ctx.stroke();
  ctx.setLineDash([]);
}
