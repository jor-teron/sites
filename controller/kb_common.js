/*
 * Gamepad Controller — keyboard modes, shared part (load before kb_*.js).
 *
 * A keyboard mode = one entry in CONTROLLER_CONFIG.modes with board:'<id>' + one script
 * that calls CTRL_KB.register('<id>', build). build(host, kit) draws the keys into host
 * and returns { el, release() }. Keys are plain elements with data attributes:
 *   data-key="a"  data-shift="A"   a key (shift label / value optional)
 *   data-mod="shift|ctrl|alt"      modifier: hold = held, tap = one-shot for the next key
 *   data-action="..."              board-only action (layer switch, caps, ...)
 * kit.bind(el, board) wires pointer handling: press → keydown, release → keyup, hold →
 * auto-repeat keydown (repeat:1). Sending goes through kit.api (set by controller_logic.js),
 * which uses the same hub connection as the gamepad.
 */
(function () {
  'use strict';

  const boards = Object.create(null);

  // US layout: shifted symbol -> base key (for the physical "code")
  const SHIFTED = {
    '!': '1', '@': '2', '#': '3', '$': '4', '%': '5', '^': '6', '&': '7', '*': '8', '(': '9', ')': '0',
    '_': '-', '+': '=', '{': '[', '}': ']', '|': '\\', ':': ';', '"': "'", '<': ',', '>': '.', '?': '/', '~': '`',
  };
  const PUNCT = {
    '-': 'Minus', '=': 'Equal', '[': 'BracketLeft', ']': 'BracketRight', '\\': 'Backslash', ';': 'Semicolon',
    "'": 'Quote', ',': 'Comma', '.': 'Period', '/': 'Slash', '`': 'Backquote', ' ': 'Space',
  };
  const NAMED = { Shift: 'ShiftLeft', Control: 'ControlLeft', Alt: 'AltLeft', Meta: 'MetaLeft' };
  const MOD_KEYS = { shift: 'Shift', ctrl: 'Control', alt: 'Alt' };

  /** KeyboardEvent.code for a key value ('a' → 'KeyA', '!' → 'Digit1', 'Enter' → 'Enter'). */
  function codeFor(key) {
    if (!key) return '';
    if (key.length === 1) {
      const low = key.toLowerCase();
      if (low >= 'a' && low <= 'z') return 'Key' + low.toUpperCase();
      if (key >= '0' && key <= '9') return 'Digit' + key;
      if (PUNCT[key]) return PUNCT[key];
      if (SHIFTED[key]) return codeFor(SHIFTED[key]);
      return '';
    }
    return NAMED[key] || key;
  }

  /** True when a typed character needs Shift on a US keyboard ('A', '!'). */
  function isShifted(key) {
    return !!key && key.length === 1 && (!!SHIFTED[key] || key !== key.toLowerCase());
  }

  /** Small DOM helper: el('button', 'kk wide', {key:'a'}, 'a'). */
  function el(tag, cls, data, text) {
    const n = document.createElement(tag);
    if (tag === 'button') n.type = 'button';
    if (cls) n.className = cls;
    if (data) for (const k of Object.keys(data)) if (data[k] != null) n.dataset[k] = data[k];
    if (text != null) n.textContent = text;
    return n;
  }

  /**
   * Pointer handling for one board element.
   * board hooks (all optional):
   *   resolve(keyEl) → key value to send (default: data-key)
   *   action(name, keyEl)          data-action pressed
   *   afterKey()                   a normal key was pressed (consume one-shot state)
   *   repaint()                    labels changed (shift / caps / modifiers)
   * Returns { mods, release } — mods: { shift, ctrl, alt } current state for messages.
   */
  function bind(root, board) {
    const api = kit.api;
    const cfg = (typeof CONTROLLER_CONFIG !== 'undefined' && CONTROLLER_CONFIG.keyboard) || {};
    const ptr = new Map();       // pointerId -> { kind, el, id, timer }
    // modifier state: latched = one-shot (sent down, released after the next key);
    // holder = pointerId holding it; used = another key was pressed while held
    const mods = { shift: null, ctrl: null, alt: null };

    function modFlags() {
      return { shift: !!mods.shift, ctrl: !!mods.ctrl, alt: !!mods.alt };
    }
    function paintMods() {
      root.querySelectorAll('[data-mod]').forEach((k) => {
        const m = mods[k.dataset.mod];
        k.classList.toggle('on', !!m);
        k.classList.toggle('held', !!(m && m.holder != null));
      });
      if (board.repaint) board.repaint();
    }
    function modDown(name, pid) {
      const key = MOD_KEYS[name];
      mods[name] = { holder: pid, used: false };
      api.keyDown('mod-' + name, key, codeFor(key), modFlags(), false);
    }
    function modUp(name) {
      if (!mods[name]) return;
      mods[name] = null;
      api.keyUp('mod-' + name);
    }

    function down(e) {
      const k = e.target.closest('[data-key],[data-mod],[data-action]');
      if (!k || !root.contains(k)) return;
      e.preventDefault();
      e.stopPropagation();
      try { k.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      api.firstTouch();
      api.vibrate(cfg.hapticMs || 0);
      const pid = e.pointerId;
      if (k.dataset.mod) {
        const name = k.dataset.mod;
        if (mods[name] && mods[name].holder == null) modUp(name); // tap a latched mod: off
        else if (!mods[name]) modDown(name, pid);
        ptr.set(pid, { kind: 'mod', el: k, name: name });
        paintMods();
        return;
      }
      if (k.dataset.action) {
        k.classList.add('active');
        ptr.set(pid, { kind: 'action', el: k });
        if (board.action) board.action(k.dataset.action, k);
        return;
      }
      const key = board.resolve ? board.resolve(k) : k.dataset.key;
      if (!key) return;
      const id = 'k' + pid;
      const flags = modFlags();
      if (isShifted(key)) flags.shift = true;
      api.keyDown(id, key, codeFor(key), flags, false);
      k.classList.add('active');
      const rec = { kind: 'key', el: k, id: id, timer: 0 };
      if (cfg.repeatKeys !== false) {
        rec.timer = setTimeout(function rep() {
          api.keyDown(id, key, codeFor(key), flags, true);
          rec.timer = setTimeout(rep, cfg.repeatMs || 60);
        }, cfg.repeatDelayMs || 450);
      }
      ptr.set(pid, rec);
      // one-shot modifiers end after this key; held ones are marked "used"
      for (const name of Object.keys(mods)) {
        const m = mods[name];
        if (!m) continue;
        if (m.holder == null) modUp(name);
        else m.used = true;
      }
      if (board.afterKey) board.afterKey();
      paintMods();
    }

    function up(e) {
      const p = ptr.get(e.pointerId);
      if (!p) return;
      ptr.delete(e.pointerId);
      p.el.classList.remove('active');
      if (p.kind === 'key') {
        clearTimeout(p.timer);
        api.keyUp(p.id);
      } else if (p.kind === 'mod') {
        const m = mods[p.name];
        if (m && m.holder === e.pointerId) {
          if (m.used) modUp(p.name);  // held together with keys: release now
          else m.holder = null;       // plain tap: one-shot for the next key
        }
        paintMods();
      }
    }

    root.addEventListener('pointerdown', down);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('lostpointercapture', up);

    /** Drop every pressed key / modifier (keyups are sent by api.releaseKeys). */
    function release() {
      for (const p of ptr.values()) { clearTimeout(p.timer); p.el.classList.remove('active'); }
      ptr.clear();
      mods.shift = mods.ctrl = mods.alt = null;
      paintMods();
    }
    return { mods: mods, release: release };
  }

  const kit = {
    // set by controller_logic.js:
    //   keyDown(id, key, code, {shift,ctrl,alt}, repeat)  keyUp(id)  vibrate(ms)  firstTouch()
    api: {
      keyDown() {}, keyUp() {}, vibrate() {}, firstTouch() {},
    },
    codeFor: codeFor,
    isShifted: isShifted,
    el: el,
    bind: bind,
  };

  window.CTRL_KB = {
    kit: kit,
    boards: boards,
    /** Register a board: build(host, kit) → { el, release() }. */
    register(id, build) { boards[id] = build; },
  };
})();
