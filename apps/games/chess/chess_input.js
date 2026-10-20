/* Pointer, touch, and keyboard input. Calls back into Chess.game; no rules here. */
(function (root) {
  const Chess = root.Chess = root.Chess || {};
  Chess.input = {
    attach: function (h) {
      const canvas = document.getElementById('board');
      const wrap = document.getElementById('board-wrap');
      let down = null;
      wrap.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
      wrap.addEventListener('gesturestart', function (e) { e.preventDefault(); });
      canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      canvas.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        canvas.setPointerCapture(e.pointerId);
        down = { id: e.pointerId, x: e.clientX, y: e.clientY, sq: Chess.render.hit(e.clientX, e.clientY), drag: false };
      });
      canvas.addEventListener('pointermove', function (e) {
        if (!down || e.pointerId !== down.id) return;
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (!down.drag && dx * dx + dy * dy > 64) {
          down.drag = true;
          h.dragStart(down.sq);
        }
        if (down.drag) h.drag(e.clientX, e.clientY);
      });
      function up(e) {
        if (!down || e.pointerId !== down.id) return;
        const sq = Chess.render.hit(e.clientX, e.clientY);
        const dragged = down.drag;
        down = null;
        if (dragged) h.drop(sq);
        else h.tap(sq);
      }
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', function (e) {
        if (!down || e.pointerId !== down.id) return;
        down = null;
        h.drop(-1);
      });
      window.addEventListener('keydown', function (e) {
        const k = e.key;
        if (k === 'ArrowUp' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowRight' || k === ' ' || k === 'Enter')
          e.preventDefault();
        h.key(e);
      });
      document.getElementById('btn-undo').addEventListener('click', h.undo);
      document.getElementById('btn-hint').addEventListener('click', h.hint);
      document.getElementById('btn-new').addEventListener('click', h.menu);
      document.getElementById('btn-start').addEventListener('click', h.start);
      document.getElementById('btn-back').addEventListener('click', h.back);
      document.getElementById('btn-undo-over').addEventListener('click', h.undo);
      document.querySelectorAll('#color-choices button').forEach(function (b) {
        b.addEventListener('click', function () { h.draft({ human: b.dataset.color }); });
      });
      document.querySelectorAll('#level-choices button').forEach(function (b) {
        b.addEventListener('click', function () { h.draft({ level: b.dataset.level }); });
      });
      document.querySelectorAll('#promo button').forEach(function (b) {
        b.addEventListener('click', function () { h.promo(+b.dataset.promo); });
      });
    },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
