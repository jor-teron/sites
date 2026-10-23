/* Turbo Lap — touch controls. Publishes the 'touch' input source (same shape as keyboard/gamepad) and fires the
   same one-shot actions, so the game logic is untouched. Also owns AUTO GAS, the portrait "rotate" overlay and the
   safe-area insets the HUD uses. Controls only appear on touch devices (pointer:coarse or after a first touch). */
window.TL = window.TL || {};
(() => {
  const CFG = TL.CFG.touch, input = TL.input, $ = id => document.getElementById(id);
  const src = { steer: 0, gas: false, brake: false, nitro: false };
  input.setSource('touch', src);
  const T = TL.touch = { active: false, insets: { t: 0, r: 0, b: 0, l: 0 }, pointers: new Map(), portrait: false, stickX: 0, onRelease: null };   // stickX: analog steer from ui/joystick.js
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
  let autoGas = TL.storage.autoGas(coarse ? CFG.autoGasDefaultTouch : CFG.autoGasDefaultDesktop);

  function setAutoGas(v, save) {
    autoGas = v; input.autoGas = v;
    document.body.classList.toggle('autogas', v);
    const b = $('autoGasBtn'); if (b) b.textContent = 'AUTO GAS: ' + (v ? 'ON' : 'OFF');
    if (save) TL.storage.setAutoGas(v);
  }
  T.setAutoGas = v => setAutoGas(!!v, true);
  T.autoGas = () => autoGas;

  function readInsets() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;visibility:hidden;padding:env(safe-area-inset-top,0) env(safe-area-inset-right,0) env(safe-area-inset-bottom,0) env(safe-area-inset-left,0)';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    T.insets = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    probe.remove();
  }

  function activate() {
    if (T.active) return;
    T.active = true;
    document.body.classList.add('touch');
    if (TL.storage.get('autogas', null) === null) setAutoGas(CFG.autoGasDefaultTouch, false);   // first touch on an unset device
    readInsets(); updateVisibility(); checkOrientation();
  }

  // ---- pad state from active pointers ----
  function sync() {
    const held = new Set(T.pointers.values());
    src.steer = Math.max(-1, Math.min(1, (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0) + T.stickX));
    src.gas = held.has('gas'); src.brake = held.has('brake'); src.nitro = held.has('nitro');
    document.querySelectorAll('#touch .tbtn').forEach(el => el.classList.toggle('on', held.has(el.dataset.k)));
  }
  T.sync = sync;
  T.releaseAll = function () { T.pointers.clear(); if (T.onRelease) T.onRelease(); sync(); };   // also lets go of the floating stick
  T.hold = function (id, k) { if (k) T.pointers.set(id, k); else T.pointers.delete(id); sync(); };   // test hook / programmatic press
  const keyAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.dataset && el.closest('#touch') ? el.dataset.k : null; };

  function down(e) {
    const k = e.target.dataset && e.target.dataset.k;
    if (!k) return;
    e.preventDefault();
    activate();
    if (k === 'pause') { e.target.classList.add('on'); setTimeout(() => e.target.classList.remove('on'), 150); input.fire('pause'); return; }
    T.pointers.set(e.pointerId, k); sync();
  }
  function move(e) {
    if (!T.pointers.has(e.pointerId)) return;
    e.preventDefault();
    const k = keyAt(e.clientX, e.clientY);            // sliding a thumb from ◀ to ▶ (or off a pad) follows the finger
    if (k && k !== 'pause') T.pointers.set(e.pointerId, k); else if (!k) T.pointers.set(e.pointerId, null);
    sync();
  }
  function up(e) { if (T.pointers.delete(e.pointerId)) sync(); }

  function bind() {
    const pad = $('touch');
    pad.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => window.addEventListener(ev, up));
    // Block scroll / pinch / double-tap zoom on the controls; touchcancel or a touchend with no touches left releases everything.
    pad.addEventListener('touchstart', e => { e.preventDefault(); activate(); }, { passive: false });
    pad.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
    window.addEventListener('touchcancel', T.releaseAll);
    window.addEventListener('touchend', e => { if (e.touches.length === 0 && T.pointers.size) T.releaseAll(); });
    window.addEventListener('touchstart', activate, { passive: true });
    document.addEventListener('gesturestart', e => e.preventDefault());
    window.addEventListener('blur', T.releaseAll);
    document.addEventListener('visibilitychange', () => { if (document.hidden) T.releaseAll(); });
    const ag = $('autoGasBtn');
    if (ag) ag.addEventListener('click', e => { e.currentTarget.blur(); setAutoGas(!autoGas, true); });
    window.addEventListener('resize', () => { readInsets(); checkOrientation(); });
    window.addEventListener('orientationchange', () => setTimeout(() => { readInsets(); checkOrientation(); }, 120));
  }

  // ---- visibility: controls only during a race on touch devices ----
  let lastKey = '';
  function updateVisibility() {
    const G = TL.game, racing = G && (G.state === 'countdown' || G.state === 'race' || G.state === 'finished') && !G.paused && G.panel == null;
    const show = T.active && racing && !T.portrait;
    const key = show + '|' + T.portrait;
    if (key !== lastKey) { lastKey = key; $('touch').classList.toggle('hidden', !show); if (!show) T.releaseAll(); }
  }

  // ---- portrait: overlay + pause, resume when back in landscape ----
  let pausedByRotate = false;
  function checkOrientation() {
    const portrait = T.active && innerHeight > innerWidth;
    if (portrait === T.portrait) return;
    T.portrait = portrait;
    $('rotate').classList.toggle('hidden', !portrait);
    const G = TL.game; if (!G || !CFG.pauseOnPortrait) return;
    if (portrait) {
      if ((G.state === 'race' || G.state === 'countdown') && !G.paused) { input.fire('blur'); pausedByRotate = true; }
    } else if (pausedByRotate) { pausedByRotate = false; if (G.paused) input.fire('start'); }
  }
  T.checkOrientation = checkOrientation;

  // poll cheaply each frame for game-state changes (title/pause/finish panels)
  function tick() { updateVisibility(); requestAnimationFrame(tick); }

  bind();
  setAutoGas(autoGas, false);
  if (coarse) activate();
  requestAnimationFrame(tick);
})();
