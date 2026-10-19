/*
 * Project: keyboard (Lab)
 * File: keyboard.js
 * Role: Start-up. Draws the shared board (hub/osk/osk_board.js + osk_layout.js, also used by the
 * Hub OSK panel; built on hub/controller/kb_common.js like the phone Gamepad) and connects its api:
 *   - press → keydown, release / slide-off / cancel → keyup, hold → auto-repeat (kb_common)
 *   - Shift / Ctrl / Alt: hold = held, tap = one-shot for the next key, tap again = off
 *   - Caps toggles; letter and symbol labels follow Shift / Caps live
 *   - every key: typed into the demo text box (keyboard_type.js), shown on the status line,
 *     and, inside a frame, posted to window.parent as the Hub controller message
 *     {t:'key', key, code, s:1|0, shift, ctrl, alt, repeat} (same origin only).
 * The keys never take focus (pointerdown / mousedown / touchstart are cancelled), so the
 * text box keeps its caret. Vibrate on/off is saved in localStorage.
 */
(function () {
  'use strict';

  const LK = window.LabKeyboard;
  const KB = window.CTRL_KB;
  const boardEl = document.getElementById('board');
  const pad = document.getElementById('pad');
  const statusEl = document.getElementById('status');
  const vibBtn = document.getElementById('vibBtn');
  const clearBtn = document.getElementById('clearBtn');
  const VIB_KEY = 'jtsites-lab-keyboard.vibrate';
  const VIB_MS = 15;

  if (!KB || !LK || !window.OSK_BOARD || !window.OSK_LAYOUT) {
    statusEl.textContent = 'Keyboard failed to load (hub/controller/kb_common.js or hub/osk/ missing)';
    return;
  }

  // ---- settings ----
  let vibrate = true;
  try { vibrate = localStorage.getItem(VIB_KEY) !== '0'; } catch (_) { /* private mode */ }
  function paintVib() {
    vibBtn.setAttribute('aria-pressed', String(vibrate));
    vibBtn.textContent = vibrate ? 'Vibrate: on' : 'Vibrate: off';
  }

  // ---- output ----
  let kb = null;             // the board (OSK_BOARD.create below)
  const held = new Map();   // kb_common id → { key, code, flags } (for the keyup)
  const inFrame = window.parent && window.parent !== window;
  const target = location.origin && location.origin !== 'null' ? location.origin : '*';

  function post(key, code, flags, down, repeat) {
    if (!inFrame) return;
    const msg = {
      t: 'key', key: key, code: code, s: down ? 1 : 0,
      shift: flags.shift ? 1 : 0, ctrl: flags.ctrl ? 1 : 0, alt: flags.alt ? 1 : 0, repeat: repeat ? 1 : 0,
    };
    try { window.parent.postMessage(msg, target); } catch (_) { /* parent gone */ }
  }

  function setStatus(text) {
    const bits = [];
    if (kb && kb.modOn('ctrl')) bits.push('Ctrl');
    if (kb && kb.modOn('alt')) bits.push('Alt');
    if (kb && kb.modOn('shift')) bits.push('Shift');
    if (kb && kb.caps) bits.push('Caps');
    statusEl.textContent = (bits.length ? '[' + bits.join('+') + '] ' : '') + text;
  }

  function keyName(key, flags) {
    const name = key === ' ' ? 'Space' : key;
    const m = [];
    if (flags.ctrl) m.push('Ctrl');
    if (flags.alt) m.push('Alt');
    if (flags.shift && key.length > 1) m.push('Shift');
    return m.length ? m.join('+') + '+' + name : name;
  }

  const api = {
    keyDown(id, key, code, flags, repeat) {
      held.set(id, { key: key, code: code, flags: flags });
      post(key, code, flags, true, repeat);
      if (/^mod-/.test(id)) return;   // a modifier alone does not type
      LK.typeKey(pad, key, flags);
      setStatus(keyName(key, flags) + (repeat ? ' (repeat)' : ''));
    },
    keyUp(id) {
      const h = held.get(id);
      if (!h) return;
      held.delete(id);
      post(h.key, h.code, h.flags, false, false);
    },
    vibrate() {
      if (vibrate && navigator.vibrate) { try { navigator.vibrate(VIB_MS); } catch (_) { /* ignore */ } }
    },
    firstTouch() {},
  };

  kb = window.OSK_BOARD.create(boardEl, {
    api: api,
    onCaps: (on) => setStatus('Caps ' + (on ? 'on' : 'off')),
  });

  // ---- never take focus / no long-press menu / no gestures on the keys ----
  window.OSK_BOARD.guard(document.getElementById('bar'));
  boardEl.addEventListener('focusin', () => pad.focus({ preventScroll: true }));

  // ---- top bar buttons (pointerup: touchstart is cancelled, so no click on touch) ----
  function onTap(btn, fn) {
    btn.addEventListener('pointerup', (e) => { if (e.button === 0 || e.pointerType !== 'mouse') fn(); });
    btn.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
  }
  onTap(vibBtn, () => {
    vibrate = !vibrate;
    try { localStorage.setItem(VIB_KEY, vibrate ? '1' : '0'); } catch (_) { /* ignore */ }
    paintVib();
    if (vibrate && navigator.vibrate) navigator.vibrate(VIB_MS);
  });
  onTap(clearBtn, () => {
    pad.focus({ preventScroll: true });
    pad.select();
    LK.typeKey(pad, 'Backspace', {});
    setStatus('cleared');
  });

  // ---- release held keys when the page loses focus or hides (no stuck keys) ----
  function releaseAll() {
    for (const id of Array.from(held.keys())) api.keyUp(id);
    kb.release();
  }
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  paintVib();
  setStatus(inFrame ? 'ready (sending keys to the parent page too)' : 'ready');
})();
