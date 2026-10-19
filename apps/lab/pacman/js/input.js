/* Pac-Man — input.js
 * Keyboard, touch and buttons, turned into calls on the handlers game.js passes to init():
 *  - arrows / WASD          -> direction(dir)   (into Pac-Man's buffer; pacman.js decides when to take it)
 *  - swipe anywhere on page -> direction(dir)   (touchmove is cancelled so the page never scrolls / bounces)
 *  - Enter / Space          -> confirm()        (start / restart from START and GAME OVER)
 *  - P (no key repeat)      -> togglePause()    ; the on-screen pause button does the same for touch
 *  - window blur / tab hidden -> autoPause()
 *  - overlay button         -> confirm()
 */
(function (PAC) {
  'use strict';
  const D = PAC.maze.DIR;
  const KEYS = {
    ArrowUp: D.up, w: D.up, ArrowDown: D.down, s: D.down,
    ArrowLeft: D.left, a: D.left, ArrowRight: D.right, d: D.right,
  };
  const SWIPE_PX = 20;                 // finger travel before a swipe counts

  /** handlers = { direction(dir), confirm(), togglePause(), autoPause() } */
  function init(handlers) {
    window.addEventListener('keydown', (e) => {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (key === 'p') {
        e.preventDefault();
        if (!e.repeat) handlers.togglePause();           // holding P must not flicker pause on / off
        return;
      }
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();                              // also stops a focused button from "clicking" twice
        if (!e.repeat) handlers.confirm();
        return;
      }
      const d = KEYS[e.key] || KEYS[key];
      if (!d) return;
      e.preventDefault();
      handlers.direction(d);
    });

    // Swipes are read on the whole document, so a thumb below / beside the maze works too.
    let touchStart = null;
    document.addEventListener('touchstart', (e) => {
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });                               // passive: taps on buttons still click
    document.addEventListener('touchmove', (e) => {
      e.preventDefault();                                // no scroll / pull-to-refresh while steering
      if (!touchStart) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
      if (Math.hypot(dx, dy) < SWIPE_PX) return;
      handlers.direction(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? D.right : D.left) : (dy > 0 ? D.down : D.up));
      touchStart = null;
    }, { passive: false });
    const endTouch = () => { touchStart = null; };
    document.addEventListener('touchend', endTouch, { passive: true });
    document.addEventListener('touchcancel', endTouch, { passive: true });

    document.getElementById('overlay-btn').addEventListener('click', () => handlers.confirm());
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) pauseBtn.addEventListener('click', (e) => { e.currentTarget.blur(); handlers.togglePause(); });

    window.addEventListener('blur', () => handlers.autoPause());
    document.addEventListener('visibilitychange', () => { if (document.hidden) handlers.autoPause(); });
  }

  PAC.input = { init };
})(window.PAC = window.PAC || {});
