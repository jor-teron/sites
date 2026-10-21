/* Turbo Lap — input. Several sources (keyboard, gamepad, later touch) each publish a control state;
   the game reads the merged result through TL.input.read(). One-shot actions go through TL.input.on().
   To add touch later: TL.input.setSource('touch', {steer, gas, brake, nitro}) and TL.input.fire('start'). */
window.TL = window.TL || {};
(() => {
  const sources = {}, handlers = {};
  const I = TL.input = {
    autopilot: null,                       // test hook: function() -> control state
    setSource(name, s) { sources[name] = s; },
    on(action, fn) { (handlers[action] = handlers[action] || []).push(fn); },
    fire(action) { (handlers[action] || []).forEach(fn => fn()); },
    read() {
      if (I.autopilot) return I.autopilot();
      const out = { steer: 0, gas: false, brake: false, nitro: false };
      for (const k in sources) {
        const s = sources[k];
        out.steer += s.steer || 0; out.gas = out.gas || !!s.gas; out.brake = out.brake || !!s.brake; out.nitro = out.nitro || !!s.nitro;
      }
      out.steer = Math.max(-1, Math.min(1, out.steer));
      return out;
    }
  };

  // ---- keyboard ----
  const down = new Set();
  const kb = { steer: 0, gas: false, brake: false, nitro: false };
  I.setSource('keyboard', kb);
  const GAME_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];
  function syncKb() {
    kb.steer = (down.has('ArrowRight') || down.has('KeyD') ? 1 : 0) - (down.has('ArrowLeft') || down.has('KeyA') ? 1 : 0);
    kb.gas = down.has('ArrowUp') || down.has('KeyW');
    kb.brake = down.has('ArrowDown') || down.has('KeyS');
    kb.nitro = down.has('Space') || down.has('ShiftLeft') || down.has('ShiftRight');
  }
  window.addEventListener('keydown', e => {
    if (GAME_KEYS.includes(e.code)) e.preventDefault();
    if (!e.repeat) {
      if (e.code === 'Enter' || e.code === 'NumpadEnter') I.fire('start');
      else if (e.code === 'KeyP' || e.code === 'Escape') I.fire('pause');
      else if (e.code === 'KeyF') I.fire('fps');
      else if (e.code === 'KeyT') I.fire('title');
    }
    down.add(e.code); syncKb();
  });
  window.addEventListener('keyup', e => { down.delete(e.code); syncKb(); });
  window.addEventListener('blur', () => { down.clear(); syncKb(); I.fire('blur'); });

  // ---- gamepad (standard mapping) ----
  const gp = { steer: 0, gas: false, brake: false, nitro: false };
  I.setSource('gamepad', gp);
  let prevStart = false, prevA = false, prevB = false;
  I.pollGamepad = function () {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) if (p && p.connected) { pad = p; break; }
    if (!pad) { gp.steer = 0; gp.gas = gp.brake = gp.nitro = false; return; }
    const b = i => !!(pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.3));
    let ax = pad.axes[0] || 0;
    if (Math.abs(ax) < 0.15) ax = 0;
    gp.steer = Math.max(-1, Math.min(1, ax + (b(15) ? 1 : 0) - (b(14) ? 1 : 0)));
    gp.gas = b(0) || b(7) || b(12);
    gp.brake = b(1) || b(6) || b(13);
    gp.nitro = b(2) || b(5);
    const start = b(9), a = b(0), back = b(1);
    if (start && !prevStart) I.fire('pause');
    if (a && !prevA) I.fire('padA');
    if (back && !prevB) I.fire('padB');
    prevStart = start; prevA = a; prevB = back;
  };
})();
