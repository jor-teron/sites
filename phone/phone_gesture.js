/*
 * Phone launcher PH1 — one tiny pointer-gesture helper (mouse, pen and touch alike).
 * PhoneGesture.attach(el, h): h.start(e) → false = ignore this pointer;
 *   h.move(dx, dy, axis, e) after the axis locks ('x' | 'y', 10 px);
 *   h.end(dx, dy, axis, vx, vy, e) (px/ms, last ~100 ms); h.cancel();
 *   h.captureOnDown = true: capture the pointer at once (the thin left-edge strip over an app iframe);
 *   h.tap(e) (no move, before the long-press time); h.long(e) (480 ms still = long-press, no tap after).
 * Elements using it have touch-action:none in phone.css, so the page never pans by itself.
 * PhoneGesture.SWIPE = 75 px (house rule), FLICK = 0.45 px/ms (a quick short flick also counts).
 */
(function () {
  'use strict';
  var LOCK = 10, LONG_MS = 480;
  // After a long-press the finger lifts over the menu that just opened: swallow that one click.
  var longUpAt = 0;
  document.addEventListener('click', function (e) { if (Date.now() - longUpAt < 450 && e.detail !== 0) { e.stopPropagation(); e.preventDefault(); } }, true);
  function attach(el, h) {
    var p = null;
    function down(e) {
      if (p || (e.pointerType === 'mouse' && e.button !== 0)) return;
      if (h.start && h.start(e) === false) return;
      if (h.captureOnDown) { try { el.setPointerCapture(e.pointerId); } catch (_) { /* gone */ } }   // thin strips (mouse leaves them at once)
      p = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: '', t: e.timeStamp, pts: [[e.timeStamp, e.clientX, e.clientY]], longT: 0, done: false, target: e.target };
      if (h.long) {
        p.longT = setTimeout(function () {
          if (!p || p.axis) return;
          p.done = true;
          h.long({ target: p.target, clientX: p.x, clientY: p.y });
        }, LONG_MS);
      }
    }
    function move(e) {
      if (!p || e.pointerId !== p.id || p.done) return;
      var dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.pts.push([e.timeStamp, e.clientX, e.clientY]);
      if (p.pts.length > 8) p.pts.shift();
      if (!p.axis) {
        if (Math.abs(dx) < LOCK && Math.abs(dy) < LOCK) return;
        p.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        clearTimeout(p.longT);
        try { el.setPointerCapture(p.id); } catch (_) { /* gone */ }
      }
      if (h.move) h.move(dx, dy, p.axis, e);
    }
    function up(e) {
      if (!p || e.pointerId !== p.id) return;
      var q = p; p = null;
      clearTimeout(q.longT);
      if (q.done) { longUpAt = Date.now(); return; }
      var dx = e.clientX - q.x, dy = e.clientY - q.y;
      if (!q.axis) { if (h.tap && e.type === 'pointerup') h.tap({ target: q.target, clientX: e.clientX, clientY: e.clientY }); else if (h.cancel) h.cancel(); return; }
      if (e.type !== 'pointerup') { if (h.cancel) h.cancel(); return; }
      var now = e.timeStamp, a = q.pts[0];
      for (var i = q.pts.length - 1; i >= 0; i--) { if (now - q.pts[i][0] > 100) break; a = q.pts[i]; }
      var dt = Math.max(1, now - a[0]);
      if (h.end) h.end(dx, dy, q.axis, (e.clientX - a[1]) / dt, (e.clientY - a[2]) / dt, e);
    }
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    // (touch pointers start implicitly captured by the touched child; that capture moving to el is not a loss)
    el.addEventListener('lostpointercapture', function (e) { if (p && e.target === el && e.pointerId === p.id && p.axis) up({ pointerId: e.pointerId, type: 'pointercancel', clientX: p.x, clientY: p.y, timeStamp: e.timeStamp }); });
    // no native long-press menu / image drag inside the launcher
    el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.addEventListener('dragstart', function (e) { e.preventDefault(); });
  }
  /** True when a swipe of d px with speed v (px/ms) should count (sign = direction). */
  function passed(d, v, sign) { return sign * d >= 75 || (sign * d >= 24 && sign * v >= 0.45); }
  window.PhoneGesture = { attach: attach, passed: passed, SWIPE: 75, FLICK: 0.45 };
})();
