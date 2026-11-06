/** Keyboard / pointer / split-touch (left move, right look). */
export function createInput(el) {
  const keys = Object.create(null);
  const pointer = { dx: 0, dy: 0, locked: false };
  const touchMove = { active: false, id: null, x: 0, y: 0, ox: 0, oy: 0 };
  const touchLook = { active: false, id: null, dx: 0, dy: 0, lx: 0, ly: 0 };
  let half = window.innerWidth * 0.5;
  const onResize = () => { half = (el.clientWidth || window.innerWidth) * 0.5; };
  window.addEventListener('resize', onResize); onResize();
  window.addEventListener('keydown', (e) => { keys[e.code] = true; });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('mousemove', (e) => {
    if (pointer.locked || e.buttons === 1) { pointer.dx += e.movementX; pointer.dy += e.movementY; }
  });
  document.addEventListener('pointerlockchange', () => {
    pointer.locked = document.pointerLockElement === el;
  });
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
      if (t.identifier === touchLook.id) { touchLook.active = false; touchLook.id = null; }
    }
  };
  el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
  return {
    key: (c) => !!keys[c],
    consumeLook() {
      const dx = pointer.dx + touchLook.dx, dy = pointer.dy + touchLook.dy;
      pointer.dx = pointer.dy = 0; touchLook.dx = touchLook.dy = 0; return { dx, dy };
    },
    moveAxes() {
      let x = 0, y = 0;
      if (keys.KeyW || keys.ArrowUp) y -= 1;
      if (keys.KeyS || keys.ArrowDown) y += 1;
      if (keys.KeyA || keys.ArrowLeft) x -= 1;
      if (keys.KeyD || keys.ArrowRight) x += 1;
      if (touchMove.active) { x += Math.max(-1, Math.min(1, touchMove.x)); y += Math.max(-1, Math.min(1, touchMove.y)); }
      const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l };
    },
    requestLock() { try { el.requestPointerLock && el.requestPointerLock(); } catch (_) {} }
  };
}
