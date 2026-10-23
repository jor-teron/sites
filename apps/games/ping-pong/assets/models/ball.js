/*
 * Ping Pong — assets/models/ball.js: the ball (code-drawn disc, no image).
 * Plain script: drawBall(ctx, x, y, r) is called by draw() in ui/dom.js (x, y = centre,
 * r = radius, court units). Colour: PONG_CONFIG.colors.pieces.
 */
function drawBall(ctx, x, y, r) {
  ctx.fillStyle = CFG.colors.pieces;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
