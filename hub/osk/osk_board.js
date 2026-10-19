/*
 * On-screen keyboard — board (hub/osk/osk_board.js). Load after hub/controller/kb_common.js
 * (CTRL_KB) and osk_layout.js (OSK_LAYOUT).
 * Shared by the Hub OSK panel (osk.js) and the Lab keyboard page (apps/lab/keyboard/).
 * Draws the key rows with CTRL_KB.kit and adds what kb_common leaves to the board:
 *   - Caps (action 'caps'), letter + symbol labels that follow Shift / Caps, aria-pressed / aria-label
 *   - Ctrl / Alt + letter with Caps only sends the plain letter (Ctrl+C, not Ctrl+Shift+C)
 *   - other actions (e.g. 'hide') go to opts.onAction(name, keyEl)
 *   - the keys never take focus: type=button, tabindex -1, mousedown / touchstart / contextmenu cancelled
 * kb_common does the rest: pointer capture, press = keydown, release / slide-off / cancel = keyup,
 * hold = repeat, Shift / Ctrl / Alt hold = held, tap = one-shot.
 * API: OSK_BOARD.create(host, { rows, say, api, onAction, onCaps }) →
 *        { root, release(), modOn(name), get caps }
 *   api: { keyDown(id, key, code, flags, repeat), keyUp(id), vibrate(ms), firstTouch() } (CTRL_KB.kit.api)
 */
(function () {
  'use strict';

  /** Cancel the default action: no focus change, no long-press menu, no scrolling. */
  function guard(el) {
    const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
    el.addEventListener('mousedown', (e) => e.preventDefault());
    el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    el.addEventListener('contextmenu', stop);
  }

  function create(host, opts) {
    const kit = window.CTRL_KB.kit;
    const rows = opts.rows || window.OSK_LAYOUT.ROWS;
    const say = opts.say || window.OSK_LAYOUT.SAY || {};
    const root = kit.el('div', 'kb osk-kb');

    for (const row of rows) {
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
        if (extra.mod || extra.action === 'caps') k.setAttribute('aria-pressed', 'false');
        if (extra.say) k.setAttribute('aria-label', extra.say);
        if (key === ' ') k.classList.add('space');
        if (def[3]) k.style.flexGrow = def[3];
        r.appendChild(k);
      }
      root.appendChild(r);
    }
    host.appendChild(root);
    guard(root);

    let caps = false;
    let ctl = null;
    const modOn = (n) => !!(ctl && ctl.mods[n]);

    const board = {
      resolve(k) {
        const key = k.dataset.key;
        const sh = modOn('shift');
        if (k.classList.contains('letter')) {
          if ((modOn('ctrl') || modOn('alt')) && !sh) return key;
          return sh !== caps ? key.toUpperCase() : key;
        }
        if (sh && k.dataset.shift) return k.dataset.shift;
        return key;
      },
      action(name, k) {
        if (name === 'caps') {
          caps = !caps;
          k.classList.toggle('on', caps);
          board.repaint();
          if (opts.onCaps) opts.onCaps(caps);
        } else if (opts.onAction) {
          opts.onAction(name, k);
        }
      },
      repaint() {
        const sh = modOn('shift');
        root.querySelectorAll('.kk').forEach((k) => {
          if (k.classList.contains('letter')) {
            k.textContent = sh !== caps ? k.dataset.key.toUpperCase() : k.dataset.key;
          } else if (k.dataset.shift) {
            const lab = sh ? k.dataset.shift : k.dataset.label;
            k.textContent = lab;
            k.setAttribute('aria-label', say[lab] || lab);
          }
          if (k.hasAttribute('aria-pressed')) k.setAttribute('aria-pressed', String(k.classList.contains('on')));
        });
      },
    };

    Object.assign(kit.api, opts.api || {});
    ctl = kit.bind(root, board);
    board.repaint();

    return {
      root: root,
      modOn: modOn,
      get caps() { return caps; },
      release() { ctl.release(); },
    };
  }

  window.OSK_BOARD = { create: create, guard: guard };
})();
