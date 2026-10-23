/*
  File: core/input.js
  Project: Demolisher
  Purpose: Keyboard, mouse, touch sticks, buttons, resize; registers the DOM listeners.
  Plain script (no modules): top-level const / let / function share one global scope with the
  other core/*.js files, loaded in the order listed in demolisher.html.
  Uses: state.js .. ui.js.
*/

'use strict';

/* ============================================================
   INPUT
   ============================================================ */

/* Touch-capable device: show the touch layer and touch help text. */
const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

/*
  Select a weapon if it still has ammo.
*/
function selectWeapon(name) {
  if (!WEAPONS[name]) return;
  if (ammoRemaining[name] <= 0) {
    showHint(TX.noAmmo, 700);
    hubRumble(RUMBLE.outOfAmmo);
    return;
  }
  const changed = currentWeapon !== name;
  currentWeapon = name;
  for (const btn of weaponBtns) btn.classList.toggle('active', btn.dataset.w === name);
  if (changed) {
    showHint(WEAPONS[name].label || name, 600);
    hubSendApp();
  }
}
/* X / B / hub Weapon button: next weapon that still has ammo. */
function nextWeapon() {
  const n = WEAPON_ORDER.length;
  let i = WEAPON_ORDER.indexOf(currentWeapon);
  for (let k = 1; k <= n; k++) {
    const w = WEAPON_ORDER[(i + k) % n];
    if (ammoRemaining[w] > 0) { selectWeapon(w); return; }
  }
}

/* Drop everything held (focus lost, tab hidden, pause, end card). */
function clearInput() {
  for (const k in keys) keys[k] = false;
  mouseDown = false;
  fireHeld = false;
  jumpHeld = false;
  fireKeyHeld = false;
  hubStick.x = 0; hubStick.y = 0;
  joyMoveAxis.x = 0; joyMoveAxis.y = 0;
  joyAimAxis.x = 0; joyAimAxis.y = 0;
  releaseStick(sticks.move);
  releaseStick(sticks.aim);
  btnFire.classList.remove('held');
  btnJump.classList.remove('held');
}

window.addEventListener('keydown', (e) => {
  if (e.target === levelInput) return;              // typing in the level box is not a game key
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const game = ['left', 'right', 'jump', 'fire', 'aimUp', 'aimDown', 'nextWeapon', 'pause', 'menu', 'weapons'].some(a => matches(a, e));
  if (game || e.key === ' ' || e.key.indexOf('Arrow') === 0) e.preventDefault(); // also stops focused buttons re-firing
  if (e.code) keys[e.code] = true;
  keys[e.key] = true;
  if (e.repeat) return;
  if (matches('fire', e)) {
    fireKeyHeld = true;
    if (gameState === 'playing') { updateAim(0); fire(); }
  } else if (matches('nextWeapon', e)) {
    nextWeapon();
  } else if (matches('pause', e)) {
    primaryAction();
  } else if (matches('menu', e)) {
    toMenu();
  } else {
    const wi = KEYS.weapons.indexOf(e.code);
    const wk = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].indexOf(e.key);
    const idx = wi >= 0 ? wi : wk;
    if (idx >= 0 && WEAPON_ORDER[idx]) selectWeapon(WEAPON_ORDER[idx]);
  }
});
window.addEventListener('keyup', (e) => {
  if (e.target === levelInput) return;
  if (e.code) keys[e.code] = false;
  keys[e.key] = false;
  if (matches('fire', e)) fireKeyHeld = false;
});
window.addEventListener('blur', clearInput);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  clearInput();
  if (gameState === 'playing') togglePause();
});

/* Mouse: aim with the pointer, click to fire (touch uses the sticks below). */
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouseScreenPos.x = e.clientX - rect.left;
  mouseScreenPos.y = e.clientY - rect.top;
  mouseAimReady = true;
  aimMode = 'mouse';
});
canvas.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  mouseScreenPos.x = e.clientX - rect.left;
  mouseScreenPos.y = e.clientY - rect.top;
  mouseAimReady = true;
  aimMode = 'mouse';
  mouseDown = true;
  updateAim(0);
  fire();
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseDown = false;
});
/* No context menu / selection / double-tap zoom anywhere on the page. */
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('selectstart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

/*
  Floating touch sticks: a thumb on the left half of the stage = MOVE stick, on
  the right half = AIM stick; the stick base jumps to where the thumb lands.
  Released sticks go back to their resting spot (CSS).
*/
const TOUCH = CFG.touch;
const sticks = {
  move: { el: joyMove, knob: joyMoveKnob, id: null, bx: 0, by: 0 },
  aim: { el: joyAim, knob: joyAimKnob, id: null, bx: 0, by: 0 },
};
function stickAt(st, x, y) {
  st.bx = x; st.by = y;
  st.el.style.left = (x - TOUCH.stick / 2) + 'px';
  st.el.style.top = (y - TOUCH.stick / 2) + 'px';
  st.el.style.right = 'auto';
  st.el.style.bottom = 'auto';
  st.el.classList.add('active');
}
function releaseStick(st) {
  if (!st) return;
  st.id = null;
  st.el.style.left = st.el.style.top = st.el.style.right = st.el.style.bottom = '';
  st.el.classList.remove('active');
  st.knob.style.transform = '';
}
function stickMove(st, x, y) {
  let dx = x - st.bx, dy = y - st.by;
  const len = Math.hypot(dx, dy), R = TOUCH.range;
  if (len > R) { dx = dx / len * R; dy = dy / len * R; }
  st.knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
  return { x: dx / R, y: dy / R };
}
function stagePoint(e) {
  const r = stage.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width };
}
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse' || gameState !== 'playing') return;
  e.preventDefault();                               // no emulated mouse events
  const p = stagePoint(e);
  const st = p.x < p.w / 2 ? sticks.move : sticks.aim;
  if (st.id !== null) return;
  st.id = e.pointerId;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  stickAt(st, p.x, p.y);
});
canvas.addEventListener('pointermove', (e) => {
  const st = e.pointerId === sticks.move.id ? sticks.move : e.pointerId === sticks.aim.id ? sticks.aim : null;
  if (!st) return;
  e.preventDefault();
  const p = stagePoint(e);
  const a = stickMove(st, p.x, p.y);
  if (st === sticks.move) {
    joyMoveAxis.x = a.x; joyMoveAxis.y = a.y;
  } else {
    joyAimAxis.x = a.x; joyAimAxis.y = a.y;
    if (Math.hypot(a.x, a.y) > CFG.aim.stickDead) {
      aimMode = 'touch';
      aimAngle = Math.atan2(a.y, a.x);
    }
  }
});
function stickEnd(e) {
  if (e.pointerId === sticks.move.id) {
    releaseStick(sticks.move);
    joyMoveAxis.x = 0; joyMoveAxis.y = 0;
  } else if (e.pointerId === sticks.aim.id) {
    releaseStick(sticks.aim);
    joyAimAxis.x = 0; joyAimAxis.y = 0;
    if (aimMode === 'touch') absorbAim(aimAngle);   // keep the tilt, flip with facing
  }
}
canvas.addEventListener('pointerup', stickEnd);
canvas.addEventListener('pointercancel', stickEnd);

/* FIRE / JUMP: pointer events, so touch, pen and mouse all work. */
function holdButton(btn, onDown, onUp) {
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    btn.classList.add('held');
    onDown();
  });
  const up = () => { btn.classList.remove('held'); onUp(); };
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('lostpointercapture', up);
}
holdButton(btnFire, () => { fireHeld = true; updateAim(0); fire(); }, () => { fireHeld = false; });
holdButton(btnJump, () => { jumpHeld = true; }, () => { jumpHeld = false; });

if (IS_TOUCH) mobileCtrls.classList.add('show');

/* Re-measure whenever the stage box changes (rotate, hub bar, side toolbar). */
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 60));
if (window.ResizeObserver) new ResizeObserver(() => resize()).observe(stage);
