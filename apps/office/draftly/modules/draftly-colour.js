/*
  ============================================================
  FILE: modules/draftly-colour.js
  PROJECT: Draftly
  ROLE: FT3 text colour and highlight. Split buttons + palettes come
        from ../shared/office-colour.js (SH1); this file keeps the
        palettes and how a colour is applied to the selection.
        Colours are written as <span style="color / background-color">
        so print, PDF and DOCX keep them.
  ============================================================
*/
window.Draftly = window.Draftly || {};
Draftly.colour = {
  /* null value = Automatic / No colour */
  text: [
    ['Automatic', null], ['Black', '#000000'], ['Dark grey', '#595959'],
    ['Red', '#ff0000'], ['Dark red', '#c00000'], ['Orange', '#ed7d31'],
    ['Gold', '#bf9000'], ['Green', '#00b050'], ['Blue', '#0070c0'],
    ['Dark blue', '#002060'], ['Purple', '#7030a0']
  ],
  hilite: [
    ['No colour', null], ['Yellow', '#ffff00'], ['Bright green', '#00ff00'],
    ['Turquoise', '#00ffff'], ['Pink', '#ff00ff'], ['Blue', '#0000ff'],
    ['Red', '#ff0000'], ['Grey', '#d9d9d9'], ['Light orange', '#ffd966'],
    ['Light green', '#c6efce'], ['Light blue', '#bdd7ee']
  ],
  keys: { text: 'draftly.lastTextColour', hilite: 'draftly.lastHiliteColour' },
  defaults: { text: '#ff0000', hilite: '#ffff00' },
  /* Sentinel colours: execCommand marks the selection, we then rewrite. */
  marker: { text: 'rgb(1, 2, 3)', hilite: 'rgb(3, 2, 1)' },
  openKind: null,
  pickers: {}
};

Draftly.colour.last = function last(kind) { return Draftly.colour.pickers[kind] ? Draftly.colour.pickers[kind].last() : Draftly.colour.defaults[kind]; };
Draftly.colour.remember = function remember(kind, value) { if (Draftly.colour.pickers[kind]) Draftly.colour.pickers[kind].remember(value); };
Draftly.colour.syncBars = function syncBars() { var P = Draftly.colour.pickers; if (P.text) P.text.syncBar(); if (P.hilite) P.hilite.syncBar(); };

/* Apply a colour (or null to remove) to the current selection. */
Draftly.colour.apply = function apply(kind, value) {
  var C = Draftly.colour;
  var prop = kind === 'text' ? 'color' : 'backgroundColor';
  if (Draftly.history && Draftly.history.commit) Draftly.history.commit();
  Draftly.editor.focusEditor();
  var sel = window.getSelection();
  if (C.range) {
    var host0 = C.range.startContainer.parentElement && C.range.startContainer.parentElement.closest('.' + Draftly.config.editorClass);
    if (host0) host0.focus({ preventScroll: true });
    sel.removeAllRanges(); sel.addRange(C.range); C.range = null;
  }
  if (!sel || !sel.rangeCount || sel.isCollapsed) { Draftly.ui.showToast && Draftly.ui.showToast('Select text first'); return; }
  try { document.execCommand('styleWithCSS', false, true); } catch (e) {}
  var mark = C.marker[kind];
  if (kind === 'text') document.execCommand('foreColor', false, mark);
  else if (!document.execCommand('hiliteColor', false, mark)) document.execCommand('backColor', false, mark);
  try { document.execCommand('styleWithCSS', false, false); } catch (e) {}
  var nodes = document.querySelectorAll('.' + Draftly.config.editorClass + ' [style]');
  var first = null, lastNode = null, i;
  for (i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (n.style[prop] !== mark) continue;
    /* clear inner colours so the new one wins */
    var inner = n.querySelectorAll('[style]'), j;
    for (j = 0; j < inner.length; j++) inner[j].style[prop] = '';
    n.style[prop] = value || '';
    if (!first) first = n;
    lastNode = n;
  }
  /* Removing: also clear ancestors that colour the whole selection */
  if (!value && first) {
    var a = first.parentElement;
    while (a && !a.classList.contains(Draftly.config.editorClass)) {
      if (a.style && a.style[prop] && a.contains(lastNode)) {
        var t = a.textContent.trim(), s = sel.toString().trim();
        if (t === s) a.style[prop] = '';
      }
      a = a.parentElement;
    }
  }
  if (first && lastNode) {
    try {
      var r = document.createRange();
      r.setStartBefore(first.firstChild || first); r.setEndAfter(lastNode.lastChild || lastNode);
      sel.removeAllRanges(); sel.addRange(r);
    } catch (e) {}
  }
  C.remember(kind, value);
  Draftly.editor.saveSelection();
  var host = first && first.closest('.' + Draftly.config.editorClass);
  if (host) host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'formatFontColor' }));
  if (Draftly.history && Draftly.history.commit) Draftly.history.commit();
  if (Draftly.ui) Draftly.ui.updateToolbarState();
};

Draftly.colour.open = function open(kind) { if (Draftly.colour.pickers[kind]) Draftly.colour.pickers[kind].open(); };
Draftly.colour.close = function close(refocus, keepRange) {
  var C = Draftly.colour;
  if (C.openKind && C.pickers[C.openKind]) C.pickers[C.openKind].close(refocus, keepRange);
};

/* Keep the editor selection while the palette has focus. */
Draftly.colour.grab = function grab() {
  var cur = window.getSelection();
  Draftly.colour.range = (cur && cur.rangeCount && !cur.isCollapsed && Draftly.editor.isInEditor(cur.anchorNode.nodeType === 1 ? cur.anchorNode : cur.anchorNode.parentElement)) ? cur.getRangeAt(0).cloneRange() : null;
};

Draftly.colour.init = function init() {
  var C = Draftly.colour;
  if (!document.getElementById('textColourBtn') || typeof OfficeColour === 'undefined') return;
  [['text', 'textColour', 'textColourMenu', '#000000'], ['hilite', 'hiliteColour', 'hiliteColourMenu', null]].forEach(function (p) {
    var kind = p[0];
    C.pickers[kind] = OfficeColour.create({
      btn: document.getElementById(p[1] + 'Btn'), arrow: document.getElementById(p[1] + 'Arrow'),
      menu: document.getElementById(p[2]), bar: document.getElementById(p[1] + 'Bar'),
      palette: C[kind], autoRemember: false, key: C.keys[kind], fallback: C.defaults[kind], autoBar: p[3],
      onOpen: function () { C.grab(); C.openKind = kind; },
      onClose: function (keep) { if (!keep) C.range = null; C.openKind = null; },
      onPick: function (v) { C.apply(kind, v); }
    });
  });
};
