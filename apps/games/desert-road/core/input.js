/* Desert Road — input: keyboard, touch / mouse halves, pause button, controller hook. */
(() => {
  const DR = window.DR, CFG = DR.CFG, state = DR.state, el = DR.el, canvas = DR.canvas, isKey = DR.isKey;
  const G = () => DR.game;
  const touches = new Map(); // pointerId -> 'left' | 'right'

  function onKeyDown(e) {
    if (isKey(CFG.keys.left, e))  { state.keys.left  = true; e.preventDefault(); }
    if (isKey(CFG.keys.right, e)) { state.keys.right = true; e.preventDefault(); }
    // Held keys (and the Hub keyboard / controller) auto-repeat: never toggle on a repeat.
    if (e.repeat) {
      if (isKey(CFG.keys.start, e) || isKey(CFG.keys.pause, e) || isKey(CFG.keys.restart, e)) e.preventDefault();
      return;
    }
    if (!state.running) {
      if (isKey(CFG.keys.start, e)) {
        e.preventDefault(); // a focused Start button must not also "click" (double start)
        G().startGame();
      }
    } else if (isKey(CFG.keys.pause, e)) {
      e.preventDefault();
      G().togglePause();
    } else if (isKey(CFG.keys.restart, e)) {
      e.preventDefault();
      G().startGame();
    } else if (isKey(CFG.keys.start, e)) {
      e.preventDefault(); // Space while driving: no page scroll
    }
  }
  function onKeyUp(e) {
    if (isKey(CFG.keys.left, e))  state.keys.left  = false;
    if (isKey(CFG.keys.right, e)) state.keys.right = false;
  }
  function updatePads() {
    let l = false, r = false;
    for (const d of touches.values()) { if (d === 'left') l = true; else r = true; }
    state.touchLeft = l;
    state.touchRight = r;
    if (el.padL) el.padL.classList.toggle('on', l);
    if (el.padR) el.padR.classList.toggle('on', r);
  }
  /** Focus lost: the keyup / pointerup would never arrive, so drop held input. */
  function clear() {
    state.keys.left = false;
    state.keys.right = false;
    touches.clear();
    updatePads();
  }
  function autoPause() {
    clear();
    if (state.running && !state.paused) G().togglePause();
  }
  const sideOf = (e) => (e.clientX < DR.view.W / 2 ? 'left' : 'right');

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', autoPause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (state.running && state.paused) { G().togglePause(); return; } // tap resumes
    if (!state.running) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    touches.set(e.pointerId, sideOf(e));
    updatePads();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!touches.has(e.pointerId)) return;
    touches.set(e.pointerId, sideOf(e));
    updatePads();
  });
  const endTouch = (e) => { if (touches.delete(e.pointerId)) updatePads(); };
  canvas.addEventListener('pointerup', endTouch);
  canvas.addEventListener('pointercancel', endTouch);
  canvas.addEventListener('lostpointercapture', endTouch);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  if (el.pauseBtn) {
    el.pauseBtn.addEventListener('click', (e) => {
      if (e.currentTarget.blur) e.currentTarget.blur();
      G().togglePause();
    });
  }

  // Controller hook (Hub / InputBus)
  window.setDriveInput = (dir, down) => {
    if (dir === 'left')  state.keys.left  = down;
    if (dir === 'right') state.keys.right = down;
  };

  DR.input = { clear };
})();
