/*
 * Gamepad Controller — phone keyboard mode (smartphone style, works in portrait).
 * Layout ported from apps/lab/paper-keyboard (screen keyboard): qwerty letter layer with a
 * one-shot Shift, 123 number / symbol layer, Space / Enter, arrows + Del.
 * Registered as board 'phone' (see CONTROLLER_CONFIG.modes).
 */
(function () {
  'use strict';

  const ROW_TOP = ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'];
  const ROW_MID = ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'];
  const ROW_LOW = ['z', 'x', 'c', 'v', 'b', 'n', 'm'];
  const NUM_TOP = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];
  const NUM_MID = ['-', '/', ':', ';', '(', ')', '$', '&', '@', '"'];
  const NUM_LOW = ['.', ',', '?', '!', "'", '+'];

  CTRL_KB.register('phone', function build(host, kit) {
    const root = kit.el('div', 'kb kb-phone');
    let numbers = false;   // number / symbol layer showing
    let shift = false;     // one-shot capital for the next letter
    let ctl = null;

    function key(label, keyVal, cls, data) {
      const k = kit.el('button', 'kk' + (cls ? ' ' + cls : ''), Object.assign({ key: keyVal }, data || {}), label);
      return k;
    }

    function draw() {
      // Only redraw between presses: kb_common keeps the pressed element captured.
      root.replaceChildren();
      const rows = [];
      for (let i = 0; i < 5; i++) { rows.push(kit.el('div', 'kb-row')); root.appendChild(rows[i]); }
      const chars = (list, row) => list.forEach((c) => {
        const v = !numbers && shift ? c.toUpperCase() : c;
        row.appendChild(key(v, v, 'char'));
      });
      chars(numbers ? NUM_TOP : ROW_TOP, rows[0]);
      chars(numbers ? NUM_MID : ROW_MID, rows[1]);
      if (!numbers) rows[2].appendChild(kit.el('button', 'kk fn wide' + (shift ? ' on' : ''), { action: 'shift' }, '⇧'));
      chars(numbers ? NUM_LOW : ROW_LOW, rows[2]);
      rows[2].appendChild(key('⌫', 'Backspace', 'fn wide'));
      rows[3].appendChild(kit.el('button', 'kk fn wide', { action: 'layer' }, numbers ? 'ABC' : '123'));
      rows[3].appendChild(key('Space', ' ', 'fn space'));
      rows[3].appendChild(key('Enter', 'Enter', 'fn wide'));
      rows[4].appendChild(key('←', 'ArrowLeft', 'arrow'));
      rows[4].appendChild(key('↑', 'ArrowUp', 'arrow'));
      rows[4].appendChild(key('↓', 'ArrowDown', 'arrow'));
      rows[4].appendChild(key('→', 'ArrowRight', 'arrow'));
      rows[4].appendChild(key('Del', 'Delete', 'fn'));
    }

    // Redraw once no key is pressed (a redraw mid-press would drop the captured key).
    let pending = false;
    function redrawSoon() {
      if (pending) return;
      pending = true;
      const go = () => {
        if (root.querySelector('.kk.active')) {
          const once = () => {
            root.removeEventListener('pointerup', once, true);
            root.removeEventListener('pointercancel', once, true);
            setTimeout(go, 0);
          };
          root.addEventListener('pointerup', once, true);
          root.addEventListener('pointercancel', once, true);
          return;
        }
        pending = false;
        draw();
      };
      go();
    }

    const board = {
      action(name) {
        if (name === 'shift') { shift = !shift; redrawSoon(); }
        else if (name === 'layer') { numbers = !numbers; shift = false; redrawSoon(); }
      },
      afterKey() {
        if (shift && !numbers) { shift = false; redrawSoon(); }
      },
    };

    draw();
    host.appendChild(root);
    ctl = kit.bind(root, board);

    return {
      el: root,
      release() {
        ctl.release();
      },
    };
  });
})();
