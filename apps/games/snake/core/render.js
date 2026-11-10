/** Snake — canvas drawing: board, grid, food, snake and the boost tint (SNK-T1 themes). */
window.SN = window.SN || {};
(function () {
  'use strict';
  const G = SN.G, V = SN.view;

  function draw() {
    const t = window.SnakeAppearance ? SnakeAppearance.current() : null;
    if (!t || !window.SnakeThemes) return;
    SnakeThemes.frame(SN.ctx, t, V, {
      cols: SN.COLS, rows: SN.ROWS, snake: G.snake, food: G.food, dir: G.dir,
      boost: !!(G.boost && G.state === 'play'), wrap: G.wrap, time: performance.now()
    });
  }

  SN.render = { draw };
})();
