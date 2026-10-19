/* Pac-Man — input.js
 * Keyboard (arrows / WASD), swipe on the canvas, and the overlay button. Directions go into Pac-Man's
 * buffer (pacman.js decides when they can be taken); a press during READY shortens the countdown.
 */
(function (PAC) {
  'use strict';
  const D = PAC.maze.DIR;
  const KEYS = {
    ArrowUp: D.up, w: D.up, ArrowDown: D.down, s: D.down,
    ArrowLeft: D.left, a: D.left, ArrowRight: D.right, d: D.right,
  };

  /** handlers = { direction(dir), button() } */
  function init(handlers) {
    window.addEventListener('keydown', (e) => {
      const d = KEYS[e.key] || KEYS[e.key.toLowerCase()];
      if (!d) return;
      e.preventDefault();
      handlers.direction(d);
    });

    const canvas = PAC.render.canvas;
    let touchStart = null;
    canvas.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });
    canvas.addEventListener('touchmove', (e) => {
      if (!touchStart) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
      if (Math.hypot(dx, dy) < 20) return;      // 20 px before a swipe counts
      handlers.direction(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? D.right : D.left) : (dy > 0 ? D.down : D.up));
      touchStart = null;
    }, { passive: true });
    canvas.addEventListener('touchend', () => { touchStart = null; }, { passive: true });

    document.getElementById('overlay-btn').addEventListener('click', () => handlers.button());
  }

  PAC.input = { init };
})(window.PAC = window.PAC || {});
