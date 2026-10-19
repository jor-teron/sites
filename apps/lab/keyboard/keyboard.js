/*
 * Project: keyboard (Lab)
 * File: keyboard.js
 * Role: Start-up. Draws the rows from keyboard_layout.js with CTRL_KB.kit (hub/controller/
 * kb_common.js, the same board code as the phone Gamepad's keyboard) and connects its kit.api:
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

  if (!KB || !LK || !LK.ROWS) {
    statusEl.textContent = 'Keyboard failed to load (hub/controller/kb_common.js missing)';
    return;
  }
  const kit = KB.kit;

  // ---- settings ----
  let vibrate = true;
  try { vibrate = localStorage.getItem(VIB_KEY) !== '0'; } catch (_) { /* private mode */ }
  function paintVib() {
    vibBtn.setAttribute('aria-pressed', String(vibrate));
    vibBtn.textContent = vibrate ? 'Vibrate: on' : 'Vibrate: off';
  }

  // ---- draw the keys ----
  const root = kit.el('div', 'kb');
  for (const row of LK.ROWS) {
    const r = kit.el('div', 'kb-row');
    for (const def of row) {
      const label = def[0];
      const key = def[1] == null ? label : def[1];
      const extra = def[4] || {};
      const letter = key.length === 1 && /[a-z]/.test(key);
      const k = kit.el('button', 'kk' + (letter ? ' letter' : '') + (label.length > 1 ? ' fn' : ''), {
        key: key || null, shift: def[2] || null, mod: extra.mod || null, action: extra.action || null, label: label,
      }, label);
      k.tabIndex = -1;
      if (extra.mod || extra.action) k.setAttribute('aria-pressed', 'false');
      if (extra.say) k.setAttribute('aria-label', extra.say);
      if (key === ' ') k.classList.add('space');
      if (def[3]) k.style.flexGrow = def[3];
      r.appendChild(k);
    }
    root.appendChild(r);
  }
  boardEl.appendChild(root);

  // ---- board state (caps here; shift / ctrl / alt live in kb_common) ----
  let caps = false;
  let ctl = null;
  const modOn = (n) => !!(ctl && ctl.mods[n]);

  const board = {
    resolve(k) {
      const key = k.dataset.key;
      const sh = modOn('shift');
      if (k.classList.contains('letter')) {
        // Ctrl / Alt + letter with Caps only: send the plain letter (Ctrl+C, not Ctrl+Shift+C)
        if ((modOn('ctrl') || modOn('alt')) && !sh) return key;
        return sh !== caps ? key.toUpperCase() : key;
      }
      if (sh && k.dataset.shift) return k.dataset.shift;
      return key;
    },
    action(name, k) {
      if (name !== 'caps') return;
      caps = !caps;
      k.classList.toggle('on', caps);
      board.repaint();
      setStatus('Caps ' + (caps ? 'on' : 'off'));
    },
    repaint() {
      const sh = modOn('shift');
      root.querySelectorAll('.kk').forEach((k) => {
        if (k.classList.contains('letter')) {
          k.textContent = sh !== caps ? k.dataset.key.toUpperCase() : k.dataset.key;
        } else if (k.dataset.shift) {
          const lab = sh ? k.dataset.shift : k.dataset.label;
          k.textContent = lab;
          k.setAttribute('aria-label', LK.SAY[lab] || lab);
        }
        if (k.hasAttribute('aria-pressed')) k.setAttribute('aria-pressed', String(k.classList.contains('on')));
      });
    },
  };

  // ---- output ----
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
    if (modOn('ctrl')) bits.push('Ctrl');
    if (modOn('alt')) bits.push('Alt');
    if (modOn('shift')) bits.push('Shift');
    if (caps) bits.push('Caps');
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

  Object.assign(kit.api, {
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
  });

  ctl = kit.bind(root, board);
  board.repaint();

  // ---- never take focus / no long-press menu / no gestures on the keys ----
  const stop = (e) => e.preventDefault();
  [boardEl, document.getElementById('bar')].forEach((el) => {
    el.addEventListener('mousedown', stop);
    el.addEventListener('touchstart', stop, { passive: false });
    el.addEventListener('contextmenu', stop);
  });
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
    for (const id of Array.from(held.keys())) kit.api.keyUp(id);
    ctl.release();
  }
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });

  paintVib();
  setStatus(inFrame ? 'ready (sending keys to the parent page too)' : 'ready');
})();
