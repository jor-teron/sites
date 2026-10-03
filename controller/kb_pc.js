/*
 * Gamepad Controller — PC keyboard mode (landscape, compact).
 * Layout ported from apps/lab/keyboard.html: Esc / digits / ⌫, Tab / qwerty, Caps / Enter,
 * Shift / Del, Ctrl / Alt / Space / arrows. Shift, Ctrl, Alt: hold = held, tap = one-shot.
 * Caps toggles. Registered as board 'pc' (see CONTROLLER_CONFIG.modes).
 */
(function () {
  'use strict';

  // [label, key, shiftKey, flex, extra]  key '' + mod / action for special keys
  const ROWS = [
    [['Esc', 'Escape', null, 1.1], ['1', '1', '!'], ['2', '2', '@'], ['3', '3', '#'], ['4', '4', '$'], ['5', '5', '%'],
      ['6', '6', '^'], ['7', '7', '&'], ['8', '8', '*'], ['9', '9', '('], ['0', '0', ')'], ['-', '-', '_'], ['=', '=', '+'],
      ['⌫', 'Backspace', null, 1.6]],
    [['Tab', 'Tab', null, 1.4], ['q'], ['w'], ['e'], ['r'], ['t'], ['y'], ['u'], ['i'], ['o'], ['p'],
      ['[', '[', '{'], [']', ']', '}'], ['\\', '\\', '|', 1.2]],
    [['Caps', '', null, 1.7, { action: 'caps' }], ['a'], ['s'], ['d'], ['f'], ['g'], ['h'], ['j'], ['k'], ['l'],
      [';', ';', ':'], ["'", "'", '"'], ['Enter', 'Enter', null, 2.1]],
    [['Shift', '', null, 2.2, { mod: 'shift' }], ['z'], ['x'], ['c'], ['v'], ['b'], ['n'], ['m'],
      [',', ',', '<'], ['.', '.', '>'], ['/', '/', '?'], ['Del', 'Delete', null, 1.6]],
    [['Ctrl', '', null, 1.4, { mod: 'ctrl' }], ['Alt', '', null, 1.4, { mod: 'alt' }], ['Space', ' ', null, 6],
      ['←', 'ArrowLeft'], ['↑', 'ArrowUp'], ['↓', 'ArrowDown'], ['→', 'ArrowRight']],
  ];

  CTRL_KB.register('pc', function build(host, kit) {
    const root = kit.el('div', 'kb kb-pc');
    let caps = false;
    let ctl = null;

    for (const row of ROWS) {
      const r = kit.el('div', 'kb-row');
      for (const def of row) {
        const label = def[0];
        const key = def[1] == null ? label : def[1];
        const extra = def[4] || {};
        const letter = key.length === 1 && /[a-z]/.test(key);
        const k = kit.el('button', 'kk' + (letter ? ' letter' : '') + (label.length > 1 ? ' fn' : ''), {
          key: key || null, shift: def[2] || null, mod: extra.mod || null, action: extra.action || null, label: label,
        }, label);
        if (def[3]) k.style.flexGrow = def[3];
        r.appendChild(k);
      }
      root.appendChild(r);
    }
    host.appendChild(root);

    function shiftOn() { return !!(ctl && ctl.mods.shift); }

    const board = {
      resolve(k) {
        const key = k.dataset.key;
        if (k.classList.contains('letter')) return shiftOn() !== caps ? key.toUpperCase() : key;
        if (shiftOn() && k.dataset.shift) return k.dataset.shift;
        return key;
      },
      action(name, k) {
        if (name === 'caps') {
          caps = !caps;
          k.classList.toggle('on', caps);
          board.repaint();
        }
      },
      repaint() {
        const sh = shiftOn();
        root.querySelectorAll('.kk').forEach((k) => {
          if (k.classList.contains('letter')) k.textContent = sh !== caps ? k.dataset.key.toUpperCase() : k.dataset.key;
          else if (k.dataset.shift) k.textContent = sh ? k.dataset.shift : k.dataset.label;
        });
      },
    };
    ctl = kit.bind(root, board);

    return {
      el: root,
      release() {
        ctl.release();
      },
    };
  });
})();
