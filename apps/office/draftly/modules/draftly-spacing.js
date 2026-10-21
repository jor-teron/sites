/*
  ============================================================
  FILE: modules/draftly-spacing.js
  PROJECT: Draftly
  ROLE: FT9 line spacing dropdown and indent buttons.
        Written as inline line-height / margin-left on the block
        (p, div, li, td/th) so save, print, PDF and DOCX keep them.
  ============================================================
*/
window.Draftly = window.Draftly || {};
Draftly.spacing = { STEP: 1.27, MAX: 7, BLOCKS: 'p,div,li,h1,h2,h3,h4,h5,h6,blockquote,td,th' };

Draftly.spacing.blockOf = function blockOf(node) {
  var el = node && (node.nodeType === 1 ? node : node.parentElement);
  if (!el || !Draftly.editor.isInEditor(el)) return null;
  var b = el.closest(Draftly.spacing.BLOCKS);
  if (!b || b.classList.contains(Draftly.config.editorClass) || b.classList.contains('dr-pagebreak')) return null;
  if (!b.closest('.' + Draftly.config.editorClass)) return null;
  return b;
};

/* Innermost blocks touched by the selection. */
Draftly.spacing.blocks = function blocks() {
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount) return [];
  var r = sel.getRangeAt(0);
  var first = Draftly.spacing.blockOf(r.startContainer);
  if (sel.isCollapsed) return first ? [first] : [];
  var host = (first || r.commonAncestorContainer);
  host = host.nodeType === 1 ? host : host.parentElement;
  var ed = host && host.closest('.' + Draftly.config.editorClass);
  if (!ed) return first ? [first] : [];
  var all = ed.querySelectorAll(Draftly.spacing.BLOCKS), out = [], i;
  for (i = 0; i < all.length; i++) {
    var b = all[i];
    if (b.classList.contains('dr-pagebreak') || !r.intersectsNode(b)) continue;
    if (b.querySelector(Draftly.spacing.BLOCKS)) continue;   /* keep innermost */
    out.push(b);
  }
  if (!out.length && first) out.push(first);
  return out;
};

Draftly.spacing.changed = function changed() {
  /* Style-only change: the incremental reflow only notices moved nodes, so lay out fully. */
  Draftly.pages.layoutAll();
  if (Draftly.app && Draftly.app.ready) {
    clearTimeout(Draftly.app.inputTimer);
    Draftly.app.inputTimer = setTimeout(function () { Draftly.storage.save(); }, Draftly.config.inputDebounceMs);
  }
  Draftly.ui.updateToolbarState();
};

Draftly.spacing.restore = function restore() {
  var sel = window.getSelection();
  if (sel && sel.rangeCount && Draftly.spacing.blockOf(sel.anchorNode)) return;
  if (Draftly.editor.restoreSelection) Draftly.editor.restoreSelection();
};

Draftly.spacing.setLineHeight = function setLineHeight(v) {
  Draftly.spacing.restore();
  var bl = Draftly.spacing.blocks();
  if (!bl.length) return;
  bl.forEach(function (b) { b.style.lineHeight = String(v); });
  Draftly.spacing.changed();
};

Draftly.spacing.marginOf = function marginOf(b) {
  var m = /([\d.]+)cm/.exec(b.style.marginLeft || '');
  return m ? Math.round(parseFloat(m[1]) / Draftly.spacing.STEP) : 0;
};

/* dir = +1 increase, -1 decrease. Lists use the browser's nesting. */
Draftly.spacing.indent = function indent(dir) {
  var S = Draftly.spacing;
  S.restore();
  var bl = S.blocks();
  if (!bl.length) return;
  if (bl.every(function (b) { return b.closest('li'); })) {
    document.execCommand(dir > 0 ? 'indent' : 'outdent', false, null);
  } else {
    bl.forEach(function (b) {
      if (b.closest('li')) b = b.closest('ul,ol');
      var n = Math.max(0, Math.min(S.MAX, S.marginOf(b) + dir));
      b.style.marginLeft = n ? (n * S.STEP).toFixed(2) + 'cm' : '';
      if (!b.getAttribute('style')) b.removeAttribute('style');
    });
  }
  S.changed();
};

/* Tab / Shift+Tab at the start of a paragraph (tables handle their own Tab first). */
Draftly.spacing.onKey = function onKey(e) {
  if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  if (!Draftly.editor.isInEditor(e.target)) return;
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
  var b = Draftly.spacing.blockOf(sel.anchorNode);
  if (!b || b.closest('td,th')) return;
  if (!Draftly.breaks.atEdge(sel.getRangeAt(0), b, -1)) return;
  e.preventDefault();
  Draftly.spacing.indent(e.shiftKey ? -1 : 1);
};

/* Show the line spacing at the caret. */
Draftly.spacing.sync = function sync() {
  var s = document.getElementById('lineSpacingSelect');
  if (!s) return;
  var sel = window.getSelection();
  var b = sel && sel.anchorNode && Draftly.spacing.blockOf(sel.anchorNode);
  if (!b) return;
  var v = '', el = b;
  while (el && !el.classList.contains(Draftly.config.editorClass)) {
    if (el.style && el.style.lineHeight) { v = el.style.lineHeight; break; }
    el = el.parentElement;
  }
  var n = parseFloat(v);
  var opts = ['1', '1.15', '1.5', '2'];
  s.value = isNaN(n) ? '' : (opts.filter(function (o) { return Math.abs(parseFloat(o) - n) < 0.01; })[0] || '');
};

Draftly.spacing.init = function init() {
  var S = Draftly.spacing;
  Draftly.history.wrap(S, 'setLineHeight');
  Draftly.history.wrap(S, 'indent');
  document.addEventListener('keydown', S.onKey);
  var s = document.getElementById('lineSpacingSelect');
  if (s) s.addEventListener('change', function () { if (s.value) S.setLineHeight(s.value); });
  [['indentDecBtn', -1], ['indentIncBtn', 1]].forEach(function (p) {
    var b = document.getElementById(p[0]);
    if (b) b.addEventListener('click', function () { S.indent(p[1]); });
  });
};

Draftly.spacing.init();
