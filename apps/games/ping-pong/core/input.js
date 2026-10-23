/*
 * ========================================================================
 * Ping Pong — core/input.js: keyboard and touch / mouse (pointer events) rules.
 * Touch / mouse (PONG_CONFIG.touch): drag on the left half moves the left paddle; a touch
 * on the right half makes it a 2-player match (CPU off until the match restarts); a short
 * tap starts / resumes / plays again. Pause button in the court's corner.
 * Needs the DOM handles from ui/dom.js (canvas, pauseBtn), so it loads after it.
 * ========================================================================
 */

// --- Keyboard -----------------------------------------------------------

/** True if the event's code or key is in the list. */
function keyIn(list, e) {
  return !!list && (list.indexOf(e.code) >= 0 || list.indexOf(e.key) >= 0);
}

/** True if any of the listed keys (code or key names) is held. */
function held(list) {
  return list.some(function (k) { return keys[k]; });
}

/** Forget every held key (focus lost: the keyup would never arrive). */
function clearKeys() {
  for (const k in keys) keys[k] = false;
}

/**
 * Start (Enter / P): new match after a win, else pause / resume.
 * Pause (Space / A): pause / resume. Restart (Esc / R): full match reset.
 */
function onKeyDown(e) {
  if (e.target && e.target.closest && e.target.closest("[data-pp-ui]")) return;   // theme button / panel: not a game key
  if (e.code) keys[e.code] = true;
  if (e.key) keys[e.key] = true;
  if (keyIn(CFG.keys.up, e) || keyIn(CFG.keys.down, e)) {
    e.preventDefault();
    leftTarget = null;                  // keys take over from mouse / touch (last input wins)
  }

  if (keyIn(CFG.keys.start, e)) {
    e.preventDefault();
    if (!e.repeat) { if (winner) resetMatch(); else togglePause(); }
    return;
  }
  if (keyIn(CFG.keys.pause, e)) {
    e.preventDefault();
    if (!e.repeat) togglePause();
    return;
  }
  if (keyIn(CFG.keys.restart, e)) {
    e.preventDefault();
    if (!e.repeat) resetMatch();
  }
}

/** Mark a key as released. */
function onKeyUp(e) {
  if (e.code) keys[e.code] = false;
  if (e.key) keys[e.key] = false;
}

window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("blur", clearKeys);
document.addEventListener("visibilitychange", function () { if (document.hidden) clearKeys(); });

// --- Touch / mouse (pointer events) ------------------------------------

let usedTouch = false;                  // a touch was seen (win text says "Tap")

/** Client coords → court units (canvas CSS size / 2px border / scale). */
function toCourt(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const bl = canvas.clientLeft || 0, bt = canvas.clientTop || 0;
  const w = canvas.clientWidth || (r.width - 2 * bl), h = canvas.clientHeight || (r.height - 2 * bt);
  return {
    x: (clientX - r.left - bl) * COURT_W / w,
    y: (clientY - r.top - bt) * COURT_H / h,
  };
}

/** Paddle top that centres the paddle on court y. */
function paddleTopAt(y) {
  return clamp(y - PADDLE_H / 2, 0, COURT_H - PADDLE_H);
}

/** Steer the paddle of a side to court y (touch / mouse). */
function aim(side, y) {
  if (side === "L") leftTarget = paddleTopAt(y);
  else if (twoP) rightTarget = paddleTopAt(y);
}

canvas.addEventListener("pointerdown", function (e) {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  e.preventDefault();
  if (e.pointerType !== "mouse") usedTouch = true;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  const c = toCourt(e.clientX, e.clientY);
  let side = c.x < COURT_W / 2 ? "L" : "R";
  if (side === "R") {
    if (TOUCH.twoPlayer !== false && e.pointerType !== "mouse") setTwoPlayer(true);
    else side = "";                     // mouse / 2P off: right half only taps
  }
  pointers.set(e.pointerId, { side: side, x: e.clientX, y: e.clientY, t: performance.now(), moved: false });
  if (side) aim(side, c.y);
});

canvas.addEventListener("pointermove", function (e) {
  const p = pointers.get(e.pointerId);
  if (!p) {
    // PC mouse hovering over the left half (no button): left paddle follows it
    if (e.pointerType === "mouse" && TOUCH.mouse !== false && !e.buttons) {
      const c = toCourt(e.clientX, e.clientY);
      if (c.x < COURT_W / 2) leftTarget = paddleTopAt(c.y);
    }
    return;
  }
  e.preventDefault();
  if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > (TOUCH.tapMaxMovePx || 12)) p.moved = true;
  if (p.side) aim(p.side, toCourt(e.clientX, e.clientY).y);
});

function pointerEnd(e, cancelled) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  pointers.delete(e.pointerId);
  if (!cancelled && !p.moved && performance.now() - p.t <= (TOUCH.tapMaxMs || 300)) tapAction();
}
canvas.addEventListener("pointerup", function (e) { pointerEnd(e, false); });
canvas.addEventListener("pointercancel", function (e) { pointerEnd(e, true); });
canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
document.addEventListener("dblclick", function (e) { e.preventDefault(); });
// No page scroll / pinch on the court (iOS ignores touch-action on some gestures)
document.addEventListener("touchmove", function (e) { e.preventDefault(); }, { passive: false });

if (pauseBtn) {
  pauseBtn.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
  pauseBtn.addEventListener("click", function (e) {
    e.preventDefault();
    if (winner) resetMatch(); else togglePause();
    pauseBtn.blur();                    // Space / Enter keep going to the game
  });
}
