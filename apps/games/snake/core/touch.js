/**
 * Snake — touch / mouse (pointer events, anywhere on screen; one pointer at a time)
 * and the optional on-screen D-pad.
 * Swipe: a direction is queued as soon as the finger moves CFG.touch.swipeMinPx
 * from the anchor; the anchor then moves to that point, so a new swipe can be
 * chained in the same touch. queueDir() ignores reverses / repeats and keeps up
 * to input.queueSize turns. Tap (short, small move) = start / restart after
 * game over / pause-resume. The D-pad and its toggle are excluded (.ui).
 */
window.SN = window.SN || {};
(function () {
  'use strict';
  const G = SN.G, TX = SN.TX, game = SN.game, el = SN.el;
  const TC = Object.assign({ swipeMinPx: 24, tapMaxMs: 300, tapMaxMovePx: 12, showDpad: false, dpadKey: 'snake-dpad' }, SN.CFG.touch || {});

  let ptr = null; // {id, x0, y0, ax, ay, t0, swiped, maxMove}
  function onTap() {
    if (G.state === 'play') game.togglePause();
    else game.clickStart(); // title / over → new game, pause → resume
  }
  window.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('.ui')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (ptr) return;
    ptr = { id: e.pointerId, x0: e.clientX, y0: e.clientY, ax: e.clientX, ay: e.clientY, t0: performance.now(), swiped: false, maxMove: 0 };
  });
  window.addEventListener('pointermove', (e) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    ptr.maxMove = Math.max(ptr.maxMove, Math.hypot(e.clientX - ptr.x0, e.clientY - ptr.y0));
    const dx = e.clientX - ptr.ax, dy = e.clientY - ptr.ay;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < TC.swipeMinPx) return;
    const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
    ptr.ax = e.clientX; ptr.ay = e.clientY; ptr.swiped = true;
    if (G.state === 'play' || G.state === 'pause') game.queueDir(d);
  });
  function endPtr(e, cancelled) {
    if (!ptr || e.pointerId !== ptr.id) return;
    const p = ptr; ptr = null;
    if (cancelled || p.swiped) return;
    if (performance.now() - p.t0 <= TC.tapMaxMs && p.maxMove <= TC.tapMaxMovePx) onTap();
  }
  window.addEventListener('pointerup', (e) => endPtr(e, false));
  window.addEventListener('pointercancel', (e) => endPtr(e, true));
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });

  // Optional on-screen D-pad (off by default; toggle saved in localStorage)
  const dpadEl = el.dpad;
  const dpadToggle = el.dpadToggle;
  G.dpadOn = !!TC.showDpad;
  try { const v = localStorage.getItem(TC.dpadKey); if (v === '1' || v === '0') G.dpadOn = v === '1'; } catch (_) { /* ignore */ }
  function renderDpad() {
    dpadEl.hidden = !G.dpadOn;
    dpadToggle.classList.toggle('on', G.dpadOn);
    dpadToggle.setAttribute('aria-pressed', String(G.dpadOn));
    dpadToggle.title = G.dpadOn ? (TX.dpadHide || 'Hide D-pad') : (TX.dpadShow || 'Show D-pad');
  }
  function setDpad(on) {
    G.dpadOn = !!on;
    try { localStorage.setItem(TC.dpadKey, G.dpadOn ? '1' : '0'); } catch (_) { /* ignore */ }
    renderDpad();
    SN.hub.sendApp();
  }
  dpadToggle.addEventListener('click', () => { setDpad(!G.dpadOn); dpadToggle.blur(); });
  dpadEl.querySelectorAll('[data-dir]').forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (G.state === 'play' || G.state === 'pause') game.queueDir(b.dataset.dir);
    });
  });
  renderDpad();

  SN.touch = { setDpad };
})();
