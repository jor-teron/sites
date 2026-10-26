/*
 * File: modules/input.js
 * Project: tennis-throw
 * Purpose: Keyboard (held keys applied per second in the loop) and
 *          pointer drag-to-aim for touch and mouse.
 */
(function (TT) {
  const CFG = TT.CFG, game = TT.game, canvas = TT.canvas;
  const keys = {};

  const held = list => list.some(k => keys[k]);
  const clearKeys = () => { for (const k in keys) keys[k] = false; };

  /** TB2: apply held aim/power keys for dt seconds (replaces the 30ms setInterval). */
  TT.applyHeldKeys = function (dt) {
    const A = CFG.aim, K = CFG.keys;
    if (!game.isRunning || game.drag) return;
    // TB1: angle 0 = right, 180 = left, so Left raises the angle
    if (held(K.aimLeft)) game.aimAngle = Math.min(A.angleMax, game.aimAngle + A.angleSpeed * dt);
    if (held(K.aimRight)) game.aimAngle = Math.max(A.angleMin, game.aimAngle - A.angleSpeed * dt);
    if (held(K.powerUp)) game.aimPower = Math.min(A.powerMax, game.aimPower + A.powerSpeed * dt);
    if (held(K.powerDown)) game.aimPower = Math.max(A.powerMin, game.aimPower - A.powerSpeed * dt);
  };

  window.addEventListener('keydown', e => {
    const K = CFG.keys;
    if (e.code) keys[e.code] = true;
    if (e.key) keys[e.key] = true;
    if (TT.isKey(K.throw, e)) {
      e.preventDefault();
      if (e.repeat) return;               // TB1: held Space does not auto-fire
      if (game.isFinished) TT.init(); else TT.tryThrow();
    } else if (TT.isKey(K.start, e)) {
      e.preventDefault();
      if (e.repeat) return;
      if (game.isFinished) TT.init(); else TT.togglePause();
    } else if (TT.isKey(K.restart, e)) {
      e.preventDefault();
      if (!e.repeat) TT.init();
    }
    if (TT.isKey(K.resetAim, e) && !game.isPaused) {
      game.aimAngle = CFG.start.aimAngle;
      game.aimPower = CFG.start.aimPower;
    }
    if ([K.aimLeft, K.aimRight, K.powerUp, K.powerDown].some(l => TT.isKey(l, e))) e.preventDefault();
  });
  window.addEventListener('keyup', e => {
    if (e.code) keys[e.code] = false;
    if (e.key) keys[e.key] = false;
  });
  // Focus lost: the keyup would never arrive, so drop held keys
  window.addEventListener('blur', clearKeys);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearKeys(); });

  // ---- TB2: pointer drag-to-aim (touch + mouse) ----

  /** Pointer position in canvas pixels (canvas may be CSS-scaled on phones). */
  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
  }

  /** Drag direction sets the angle, drag length sets the power. */
  function aimFromDrag(d) {
    const dx = d.x1 - d.x0, dy = d.y0 - d.y1; // screen y is down; flip so up is positive
    const len = Math.hypot(dx, dy);
    if (len < CFG.drag.minPx) return false;
    const A = CFG.aim;
    let ang = Math.atan2(dy, dx) * 180 / Math.PI;      // -180..180
    if (ang < 0) ang = dx >= 0 ? A.angleMin : A.angleMax; // dragging downward: clamp to the horizon
    game.aimAngle = Math.max(A.angleMin, Math.min(A.angleMax, ang));
    game.aimPower = Math.max(A.powerMin, Math.min(A.powerMax, len / CFG.drag.fullPowerPx));
    return true;
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (game.isFinished) { TT.init(); return; }        // tap to play again
    if (game.isPaused) { TT.togglePause(); return; }   // tap to resume
    if (!game.isRunning) return;
    const p = toCanvas(e);
    game.drag = { x0: p.x, y0: p.y, x1: p.x, y1: p.y, id: e.pointerId };
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events */ }
  });
  canvas.addEventListener('pointermove', e => {
    const d = game.drag;
    if (!d || d.id !== e.pointerId) return;
    const p = toCanvas(e);
    d.x1 = p.x; d.y1 = p.y;
    aimFromDrag(d);
  });
  function endDrag(e, fire) {
    const d = game.drag;
    if (!d || d.id !== e.pointerId) return;
    game.drag = null;
    if (fire && aimFromDrag(d)) TT.tryThrow(); // cooldown + 2-ball limit apply
  }
  canvas.addEventListener('pointerup', e => endDrag(e, true));
  canvas.addEventListener('pointercancel', e => endDrag(e, false));
})(window.TT);
