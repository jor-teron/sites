/**
 * Snake — keyboard input (bindings in SNAKE_CONFIG.keys).
 * Arrows/WASD move, Space (A) pause/resume, Enter/P (Start) new game or
 * pause/resume, Esc/R (Select) title, X (B) wrap toggle, Shift boost.
 */
window.SN = window.SN || {};
(function () {
  'use strict';
  const K = SN.K, G = SN.G, isKey = SN.isKey, game = SN.game;

  function onKey(e, down) {
    if (down) {
      if (isKey(K.up, e)) { game.queueDir('up'); e.preventDefault(); }
      else if (isKey(K.down, e)) { game.queueDir('down'); e.preventDefault(); }
      else if (isKey(K.left, e)) { game.queueDir('left'); e.preventDefault(); }
      else if (isKey(K.right, e)) { game.queueDir('right'); e.preventDefault(); }
      else if (K.pause && isKey(K.pause, e)) { if (!e.repeat) game.togglePause(); e.preventDefault(); }
      else if (isKey(K.boost, e)) { G.boost = true; e.preventDefault(); }
      else if (isKey(K.wrap, e)) {
        if (!e.repeat) game.toggleWrap();
      } else if (isKey(K.start, e)) { if (!e.repeat) game.onStartKey(); e.preventDefault(); }
      else if (isKey(K.restart, e)) { if (!e.repeat) game.toTitle(); e.preventDefault(); }
    } else {
      if (isKey(K.boost, e)) G.boost = false;
    }
  }

  /** Focus lost: the keyup would never arrive, so drop held keys. */
  function clearKeys() {
    G.boost = false;
  }

  window.addEventListener('keydown', (e) => onKey(e, true));
  window.addEventListener('keyup', (e) => onKey(e, false));
  window.addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearKeys(); });
})();
