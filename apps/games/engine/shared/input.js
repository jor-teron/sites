/** Keyboard / pointer / split-touch — HEX-7a adds Space/touch jump pulse; WASD/arrows unchanged. */
export function createInput(el) {
  const keys = Object.create(null);
  const pointer = { dx: 0, dy: 0, locked: false, down: false };
  const touchMove = { active: false, id: null, x: 0, y: 0, ox: 0, oy: 0 };
  const touchLook = { active: false, id: null, dx: 0, dy: 0, lx: 0, ly: 0 };
  const axes = { x: 0, y: 0 }; // reused
  const lookOut = { dx: 0, dy: 0 };
  let half = window.innerWidth * 0.5;
  let jumpPulse = false; // edge: Space keydown (!repeat) or Jump button press

  function clearStuck() {
    for (const k of Object.keys(keys)) keys[k] = false;
    pointer.dx = pointer.dy = 0; pointer.down = false;
    touchMove.active = false; touchMove.id = null; touchMove.x = touchMove.y = 0;
    touchLook.active = false; touchLook.id = null; touchLook.dx = touchLook.dy = 0;
    jumpPulse = false;
  }

  const onResize = () => { half = (el.clientWidth || window.innerWidth) * 0.5; };
  window.addEventListener('resize', onResize); onResize();
  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!e.repeat) jumpPulse = true; // press only, ignore key-repeat mid-air
    }
  }, { passive: false });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('mousemove', (e) => {
    if (pointer.locked || pointer.down || e.buttons === 1) {
      pointer.dx += e.movementX; pointer.dy += e.movementY;
    }
  });
  window.addEventListener('mousedown', () => { pointer.down = true; });
  window.addEventListener('mouseup', () => { pointer.down = false; });
  document.addEventListener('pointerlockchange', () => {
    pointer.locked = document.pointerLockElement === el;
    if (!pointer.locked) pointer.dx = pointer.dy = 0;
  });
  window.addEventListener('blur', clearStuck);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearStuck(); });
  window.addEventListener('pointercancel', clearStuck);

  el.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (t.clientX < half && !touchMove.active) {
        touchMove.active = true; touchMove.id = t.identifier;
        touchMove.ox = t.clientX; touchMove.oy = t.clientY; touchMove.x = 0; touchMove.y = 0;
      } else if (!touchLook.active) {
        touchLook.active = true; touchLook.id = t.identifier; touchLook.lx = t.clientX; touchLook.ly = t.clientY;
      }
    }
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touchMove.id) {
        touchMove.x = (t.clientX - touchMove.ox) / 70; touchMove.y = (t.clientY - touchMove.oy) / 70;
      } else if (t.identifier === touchLook.id) {
        touchLook.dx += t.clientX - touchLook.lx; touchLook.dy += t.clientY - touchLook.ly;
        touchLook.lx = t.clientX; touchLook.ly = t.clientY;
      }
    }
  }, { passive: true });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === touchMove.id) { touchMove.active = false; touchMove.id = null; touchMove.x = touchMove.y = 0; }
      if (t.identifier === touchLook.id) { touchLook.active = false; touchLook.id = null; touchLook.dx = touchLook.dy = 0; }
    }
  };
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', (e) => { end(e); clearStuck(); });

  return {
    key: (c) => !!keys[c],
    clearStuck,
    /** One-shot jump request (Space edge or Jump button). */
    requestJump() { jumpPulse = true; },
    consumeJump() { const v = jumpPulse; jumpPulse = false; return v; },
    consumeLook() {
      lookOut.dx = pointer.dx + touchLook.dx;
      lookOut.dy = pointer.dy + touchLook.dy;
      pointer.dx = pointer.dy = 0; touchLook.dx = touchLook.dy = 0;
      return lookOut;
    },
    moveAxes() {
      let x = 0, y = 0;
      if (keys.KeyW || keys.ArrowUp) y -= 1;
      if (keys.KeyS || keys.ArrowDown) y += 1;
      if (keys.KeyA || keys.ArrowLeft) x -= 1;
      if (keys.KeyD || keys.ArrowRight) x += 1;
      if (touchMove.active) {
        x += Math.max(-1, Math.min(1, touchMove.x));
        y += Math.max(-1, Math.min(1, touchMove.y));
      }
      const l = Math.hypot(x, y) || 1;
      axes.x = x / l; axes.y = y / l;
      return axes;
    },
    requestLock() { try { el.requestPointerLock && el.requestPointerLock(); } catch (_) {} }
  };
}
