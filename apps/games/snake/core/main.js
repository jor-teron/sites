/**
 * Snake — boot and the frame-rate independent loop (fixed seconds-per-cell steps
 * from an accumulator; frame delta clamped to timing.maxDt).
 */
window.SN = window.SN || {};
(function () {
  'use strict';
  const CFG = SN.CFG, G = SN.G, TX = SN.TX, game = SN.game, render = SN.render;

  function loop(ts) {
    if (!G.last) G.last = ts;
    const dt = Math.min(CFG.timing.maxDt, (ts - G.last) / 1000);
    G.last = ts;
    if (G.state === 'play') {
      G.acc += dt;
      const stepTime = G.boost ? SN.BOOST_STEP : SN.BASE_STEP;
      while (G.acc >= stepTime) {
        G.acc -= stepTime;
        game.step();
        if (G.state !== 'play') break;
      }
    }
    render.draw();
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', SN.resize);
  SN.resize();
  game.resetGame();
  game.showOverlay(TX.title, TX.pressStart, TX.titleSub);
  requestAnimationFrame(loop);
  SN.hub.post({ type: 'hub-ready' });

  // Read-only peek for debugging / tests
  window.__snake = {
    get state() { return G.state; }, get dir() { return G.dir; }, get head() { return G.snake[0].slice(); },
    get score() { return G.score; }, get best() { return G.best; }, get wrap() { return G.wrap; },
    get length() { return G.snake.length; }, get inHub() { return SN.hub.linked; }, get food() { return G.food.slice(); },
    get queue() { return G.dirQueue.slice(); }, get dpad() { return G.dpadOn; },
  };
})();
