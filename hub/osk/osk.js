/*
 * Hub on-screen keyboard (hub/osk/osk.js) — Desktop mode only. Load after hub-controller.js
 * (window.__hubController.key), wm_taskbar.js (tray), hub/controller/kb_common.js,
 * osk_layout.js and osk_board.js.
 * - A fixed panel on the Hub page (NOT a window / iframe), only as wide as the keys (--osk-w,
 *   centred); beside it nothing covers the desktop. z-index 95: over windows (90 = taskbar) and
 *   under the Hub menu, popovers, dialogs and right-click menus.
 * - H23: always floating (docked mode removed — its desk overlay blocked clicks). Every open starts
 *   at bottom centre above the taskbar; drag the grip anywhere (osk_drag.js). It takes no room
 *   from the desk and only its own box catches clicks. ✕ on the top bar closes it.
 * - It never becomes the active window and never takes focus (osk_board.js guard + tabindex -1);
 *   a key press puts focus back into the active window's frame if the Hub page had it, and back
 *   on the app's last text field if a click on the Hub page dropped it.
 * - Keys go to the active window's app through __hubController.key(msg) = hub-controller.js
 *   forwardKey: {t:'key', key, code, s:1|0, shift, ctrl, alt, repeat}, down and up. That path
 *   fires keydown / keypress / keyup on the focused element (games) and types into inputs,
 *   textareas and contenteditable (insertText), plus Backspace / Delete / Enter / ← → / Home / End.
 * - Held keys are released on a window switch, mode switch, page blur / hide and when hidden.
 * - Toggle: ⌨ button in the taskbar tray, ✕ on the top bar, or Ctrl+Alt+K.
 *   Shown / hidden is kept in localStorage 'sites-hub.osk' ('1' = shown).
 */
(function () {
  'use strict';

  const KEY = 'sites-hub.osk';
  if (!window.CTRL_KB || !window.OSK_BOARD || !window.OSK_LAYOUT || !window.OSK_DRAG) return;
  const tray = document.querySelector('#wm-taskbar .wm-tray');

  // ---- panel ----
  const panel = document.createElement('div');
  panel.id = 'hub-osk';
  panel.setAttribute('role', 'region');
  panel.setAttribute('aria-label', 'On-screen keyboard');
  panel.hidden = true;
  // grip bar on top: drag = move; ✕ close button on the right
  const grip = document.createElement('div');
  grip.className = 'osk-grip';
  grip.title = 'Drag to move the keyboard';
  const pill = document.createElement('span');
  pill.className = 'osk-pill';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'osk-close';
  closeBtn.tabIndex = -1;
  closeBtn.textContent = '✕';
  closeBtn.title = 'Close keyboard (Ctrl+Alt+K)';
  closeBtn.setAttribute('aria-label', 'Close keyboard');
  grip.append(pill, closeBtn);
  const boardHost = document.createElement('div');
  boardHost.className = 'osk-body';
  panel.append(grip, boardHost);
  document.body.appendChild(panel);
  window.OSK_BOARD.guard(panel);

  // Layout (H23: no hide key at the bottom-right; the other keys take its room — ✕ on the top bar)
  const rows = window.OSK_LAYOUT.ROWS.map((r) => r.slice());
  // H23: docked mode is gone; drop its old body class / any old saved dock state
  document.body.classList.remove('hub-osk-docked');
  try { localStorage.removeItem('sites-hub.osk.docked'); } catch (_) { /* ignore */ }

  // ---- output: the Hub controller key path ----
  const held = new Map();   // kb_common id → message (keyup on release)
  function send(m) {
    const c = window.__hubController;
    if (c && typeof c.key === 'function') c.key(m);
  }
  function appFrame() { return window.__hubAppFrame ? window.__hubAppFrame() : null; }
  const isField = (el) => !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');

  /** The focused text field inside the active window's app (same origin, nested frames too). */
  function activeField() {
    try {
      const f = appFrame();
      let el = f && f.contentDocument && f.contentDocument.activeElement;
      for (let i = 0; i < 4 && el && el.tagName === 'IFRAME'; i++) el = el.contentDocument && el.contentDocument.activeElement;
      return isField(el) ? el : null;
    } catch (_) { return null; }   // cross-origin app
  }
  /** Is el inside frame f (directly or in a nested frame)? */
  function inFrame(el, f) {
    try {
      let w = el.ownerDocument.defaultView;
      for (let i = 0; i < 5 && w; i++) { if (w.frameElement === f) return true; w = w.parent === w ? null : w.parent; }
    } catch (_) { /* ignore */ }
    return false;
  }

  // A click on the Hub page (clock, desktop, …) moves focus out of the app and Chrome drops the
  // app's focused field; remember it just before, so the next OSK key can put the caret back.
  let lastField = null;
  document.addEventListener('pointerdown', (e) => {
    if (panel.hidden || panel.contains(e.target)) return;
    const el = activeField();
    if (el) lastField = el;
  }, true);

  /** Keep the caret in the app: if the Hub page took focus, give it back to the active window. */
  function refocus() {
    const f = appFrame();
    if (!f) return;
    if (document.activeElement !== f && typeof window.__hubFocusFrame === 'function') window.__hubFocusFrame();
    const cur = activeField();
    if (cur) { lastField = cur; return; }
    if (lastField && lastField.isConnected && inFrame(lastField, f)) {
      try { lastField.focus({ preventScroll: true }); } catch (_) { /* ignore */ }
    }
  }

  const api = {
    keyDown(id, key, code, flags, repeat) {
      const m = { t: 'key', key: key, code: code, s: 1, shift: flags.shift ? 1 : 0, ctrl: flags.ctrl ? 1 : 0, alt: flags.alt ? 1 : 0, repeat: repeat ? 1 : 0 };
      held.set(id, m);
      send(m);
    },
    keyUp(id) {
      const m = held.get(id);
      if (!m) return;
      held.delete(id);
      send(Object.assign({}, m, { s: 0, repeat: 0 }));
    },
    vibrate() {},
    firstTouch: refocus,
  };

  const kb = window.OSK_BOARD.create(boardHost, {
    rows: rows,
    api: api,
    onAction(name) { if (name === 'hide') setShown(false); },
  });

  // ---- floating, moved by the grip (osk_drag.js); takes no room from the desk ----
  const drag = window.OSK_DRAG.attach({ panel: panel, grip: grip });

  // ✕ close (pointerup: touchstart is cancelled on the panel, so no click)
  let closeDown = false;
  closeBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); closeDown = true; });
  closeBtn.addEventListener('pointerup', (e) => {
    if (!closeDown) return;
    closeDown = false;
    e.stopPropagation();
    setShown(false);
  });
  closeBtn.addEventListener('pointerleave', () => { closeDown = false; });

  function releaseAll() {
    for (const id of Array.from(held.keys())) api.keyUp(id);
    kb.release();
  }

  // ---- tray button ----
  let btn = null;
  if (tray) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'wm-osk-btn';
    btn.tabIndex = -1;
    btn.textContent = '⌨';
    btn.title = 'On-screen keyboard (Ctrl+Alt+K)';
    btn.setAttribute('aria-label', 'On-screen keyboard');
    btn.setAttribute('aria-pressed', 'false');
    btn.addEventListener('mousedown', (e) => e.preventDefault());   // keep focus in the app
    btn.addEventListener('click', () => setShown(panel.hidden));
    // R43: stub's spot, else just before the tray (right side, after the workspace switcher)
    const stub = document.querySelector('#wm-taskbar .wm-osk-btn[data-stub]');
    if (stub) stub.after(btn); else tray.before(btn);
  }

  // ---- show / hide ----
  function setShown(on, noSave) {
    on = !!on;
    if (!on) releaseAll();
    panel.hidden = !on;
    if (on) drag.reset();   // every open: floating at bottom centre (position is not kept)
    document.body.classList.toggle('hub-osk-on', on);
    if (btn) { btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', String(on)); }
    if (!noSave) { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) { /* private mode */ } }
    refocus();
  }

  // ---- Ctrl+Alt+K (Hub page and same-origin apps via __hubWmKey) ----
  function key(e) {
    if (!(window.HubMode && HubMode.isDesktop())) return false;
    if (!(e.ctrlKey && e.altKey && !e.shiftKey && !e.metaKey) || e.repeat) return false;
    if (e.key !== 'k' && e.key !== 'K' && e.code !== 'KeyK') return false;
    e.preventDefault();
    e.stopPropagation();
    setShown(panel.hidden);
    return true;
  }
  const prev = window.__hubWmKey;
  window.__hubWmKey = (e) => { if (!key(e) && prev) prev(e); };
  document.addEventListener('keydown', key, true);

  // ---- no stuck keys ----
  window.addEventListener('hub-wm-focus', releaseAll);
  window.addEventListener('hub-wm-mode', releaseAll);
  window.addEventListener('blur', () => setTimeout(() => { if (!document.hasFocus()) releaseAll(); }, 0));
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  window.addEventListener('pagehide', releaseAll);

  let saved = false;
  try { saved = localStorage.getItem(KEY) === '1'; } catch (_) { /* ignore */ }
  setShown(saved, true);

  window.HubOSK = {
    show() { setShown(true); },
    hide() { setShown(false); },
    toggle() { setShown(panel.hidden); },
    get shown() { return !panel.hidden; },
  };
})();
