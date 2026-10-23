/*
 * Ping Pong — assets/models/paddle.js: one paddle (code-drawn rectangle, no image).
 * Plain script: drawPaddle(ctx, x, y, w, h) is called twice per frame by draw() in ui/dom.js
 * (x, y = top-left corner in court units). Colour: PONG_CONFIG.colors.pieces.
 */
function drawPaddle(ctx, x, y, w, h) {
  ctx.fillStyle = CFG.colors.pieces;
  ctx.fillRect(x, y, w, h);
}
