/*
 * ========================================================================
 * Ping Pong — core/main.js: boot (last script). Everything it calls is defined by the
 * scripts before it (see the load order in ping-pong.html).
 * ========================================================================
 */

// --- Boot ---------------------------------------------------------------

fitCourt();
serve(CFG.ball.firstServeDir);
updateHud();
requestAnimationFrame(tick);
hubPost({ type: "hub-ready" });

// Read-only peek for debugging / tests
window.__pong = {
  get scoreL() { return scoreL; }, get scoreR() { return scoreR; }, get winner() { return winner; },
  get paused() { return paused; }, get court() { return [COURT_W, COURT_H]; }, get scale() { return scale; },
  get inHub() { return hubLinked; }, get leftY() { return leftY; }, get rightY() { return rightY; },
  get twoP() { return twoP; }, get paddleH() { return PADDLE_H; }, get waitingServe() { return waitingServe; },
  get ballX() { return ballX; },
};
