/*
 * Hub Photo Studio (HPS6.1) — ps_erase.js: the plain Eraser (E), for people who don't want "masks".
 *
 * Built on the layer masks in ps_mask.js: erasing paints Hide into the selected layer's mask (made if
 * missing), or the Background's mask (S.edits.bg.mask) when no layer is selected. Erased parts show the
 * checkerboard, save see-through in PNG and stay in the .hps as masks, so "Restore" (paints Show) brings
 * them back. ps_mask.js runs the stroke (PE.masks.ext = this), incl. selection clip and one undo per stroke.
 * Options: Size, Hardness, Strength, Restore; [ and ] resize; Esc closes.
 * Plain E used to be Resize (pe_input.js); in Photo Studio it is the Eraser now, Resize stays on its button.
 */
(function (PE) {
  'use strict';
  const S = PE.state, V = PE.view, L = PE.layers, Sel = PE.select, M = PE.masks;
  const $ = (id) => document.getElementById(id);
  const E = PE.erase = { on: false, size: 50, hard: 60, str: 100, restore: false, paint: 'hide' };
  M.ext = E;
  const modal = () => !!document.querySelector('.dlg-wrap:not([hidden])');

  function buildBar() {
    const b = document.createElement('div');
    b.id = 'ps-erasebar'; b.className = 'ps-bar'; b.hidden = true;
    b.innerHTML = '<b id="eb-target" class="ps-mut"></b>' +
      '<label class="ps-barg">Size <input type="range" id="eb-size" min="2" max="400" step="1" tabindex="-1"></label>' +
      '<label class="ps-barg">Hardness <input type="range" id="eb-hard" min="0" max="100" step="1" tabindex="-1"></label>' +
      '<label class="ps-barg">Strength <input type="range" id="eb-str" min="1" max="100" step="1" tabindex="-1"></label>' +
      '<button type="button" tabindex="-1" class="chip" id="eb-restore" title="Paint back what you erased">Restore</button>' +
      '<button type="button" tabindex="-1" class="btn ghost" id="eb-done">Done</button>';
    document.body.appendChild(b);
    const on = PE.ui.onTap;
    $('eb-size').addEventListener('input', () => { E.size = +$('eb-size').value; });
    $('eb-hard').addEventListener('input', () => { E.hard = +$('eb-hard').value; });
    $('eb-str').addEventListener('input', () => { E.str = +$('eb-str').value; });
    on($('eb-restore'), () => { E.restore = !E.restore; E.paint = E.restore ? 'show' : 'hide'; syncBar(); });
    on($('eb-done'), () => E.toggle(false));
  }
  function syncBar() {
    const b = $('ps-erasebar'); if (!b) return;
    b.hidden = !E.on || !S.photo;
    const tb = $('tb-erase'); if (tb) tb.classList.toggle('active', E.on);
    if (b.hidden) return;
    const t = M.target();
    $('eb-target').textContent = (E.restore ? 'Restore: ' : 'Erase: ') + (M.targetId() === 'bg' ? 'Background' : (t && t.name) || 'Layer');
    $('eb-size').value = E.size; $('eb-hard').value = E.hard; $('eb-str').value = E.str;
    $('eb-restore').classList.toggle('sel', E.restore);
  }
  E.toggle = (on) => {
    on = on == null ? !E.on : !!on;
    if (on) {
      if (!S.photo) return;
      if (PE.crop.active) PE.crop.cancel();
      if (L.open) L.toggle(false);
      if (Sel.on) Sel.toggle(false);
      if (M.on) M.toggle(false);
      if (PE.retouch && PE.retouch.on) PE.retouch.toggle(false);
    } else V.stage.style.cursor = '';
    E.on = on; syncBar(); V.requestRender();
  };

  function init() {
    buildBar(); syncBar();
    const lt = L.toggle; L.toggle = (on) => { lt(on); if (L.open && E.on) E.toggle(false); };
    const st = Sel.toggle; Sel.toggle = (on, tool) => { st(on, tool); if (Sel.on && E.on) E.toggle(false); };
    const RT = PE.retouch;
    if (RT) { const rt = RT.toggle; RT.toggle = (on, tool) => { rt(on, tool); if (RT.on && E.on) E.toggle(false); }; }
    PE.on((kind) => { if (kind === 'adjlive') return; if (kind === 'photo' && !S.photo) E.on = false; syncBar(); });
    window.addEventListener('keydown', (e) => {
      if (!S.photo || modal() || PE.resize.open || PE.crop.active || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t && ((t.tagName === 'INPUT' && t.type !== 'range') || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const k = (e.key || '').toLowerCase(), stop = () => { e.preventDefault(); e.stopImmediatePropagation(); };
      if (k === 'e' && !e.shiftKey) { E.toggle(); stop(); }
      else if (k === 'escape' && E.on && !Sel.key()) { E.toggle(false); stop(); }
      else if (E.on && (k === '[' || k === ']')) { E.size = Math.max(2, Math.min(400, Math.round(E.size * (k === ']' ? 1.25 : 0.8)))); syncBar(); V.requestRender(); stop(); }
    }, true);
  }

  PE.studio.feature({ id: 'erase', init: init });
  PE.studio.addTool({
    id: 'erase', title: 'Eraser (E): rub out parts of the photo or layer. Restore paints them back.',
    svg: '<path d="M7 20h13"/><path d="M4.5 15.5l9-9a2 2 0 0 1 2.8 0l3.2 3.2a2 2 0 0 1 0 2.8L13 19H8.5z"/><path d="M9 11l5 5"/>',
    onTap() { E.toggle(); }
  });
})(window.PE);
