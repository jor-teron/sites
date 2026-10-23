/* Turbo Lap — floating analog steering stick (TLQ1e). Touch the left half of the screen during a race: a round semi-transparent base
   appears under the thumb, the knob follows it (clamped to the base radius) and the horizontal offset becomes steer -1..1 (small dead
   zone, then scaled so full deflection = ±1). It adds to the 'touch' input source through TL.touch.stickX, so physics, AI, gas, brake,
   nitro, Auto Gas, keyboard and gamepad are untouched. The pad buttons sit above the zone, so touching a button still hits the button;
   one thumb on the stick plus another on GAS / BRAKE / NITRO works (the stick follows its own pointer id). Releasing, pausing, opening
   a panel, blur, rotating to portrait: core/touch.js calls T.releaseAll(), which calls release() below. */
window.TL = window.TL || {};
(() => {
  const T = TL.touch, pad = document.getElementById('touch'), DEAD = TL.CFG.touch.stickDeadzone;
  if (!T || !pad) return;
  const el = (cls, parent) => { const e = document.createElement('div'); e.className = cls; parent.appendChild(e); return e; };
  const zone = el('stickzone', pad), base = el('stickbase', zone), knob = el('stickknob', base);
  pad.insertBefore(zone, pad.firstChild);                                // below the buttons in stacking order
  let id = null, ox = 0, oy = 0, R = 48;                                 // active pointer, thumb start, base radius
  const S = TL.stick = { get active() { return id !== null; }, get x() { return T.stickX; } };

  const axis = v => { const a = Math.abs(v); return a < DEAD ? 0 : Math.sign(v) * Math.min(1, (a - DEAD) / (1 - DEAD)); };
  function release() {
    if (id === null && !T.stickX) return;
    id = null; T.stickX = 0;
    base.classList.remove('on', 'hot'); knob.style.transform = '';
    T.sync();
  }
  T.onRelease = release;

  function drag(e) {
    const dx = e.clientX - ox, dy = e.clientY - oy, len = Math.hypot(dx, dy), k = len > R ? R / len : 1;
    knob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
    T.stickX = axis(Math.max(-1, Math.min(1, dx / R)));
    base.classList.toggle('hot', T.stickX !== 0);
    T.sync();
  }
  zone.addEventListener('pointerdown', e => {
    if (id !== null || e.target !== zone) return;                         // one stick thumb at a time
    e.preventDefault();
    id = e.pointerId; ox = e.clientX; oy = e.clientY;
    try { zone.setPointerCapture(id); } catch (_) {}
    R = base.offsetWidth / 2;
    const cx = Math.max(R + 6, Math.min(innerWidth - R - 6, ox)), cy = Math.max(R + 6, Math.min(innerHeight - R - 6, oy));   // keep the base on screen
    base.style.transform = `translate(${cx - R}px, ${cy - R}px)`;
    ox = cx; oy = cy;                                                     // the stick's centre (the thumb sits on it unless it was near an edge)
    base.classList.add('on'); drag(e);
  });
  zone.addEventListener('pointermove', e => { if (e.pointerId === id) { e.preventDefault(); drag(e); } }, { passive: false });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => zone.addEventListener(ev, e => { if (e.pointerId === id) release(); }));
})();
