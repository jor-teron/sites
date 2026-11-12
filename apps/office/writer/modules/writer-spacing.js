/*
  ============================================================
  FILE: modules/writer-spacing.js
  DF25: was modules/draftly-spacing.js (global Draftly is now Writer).
  PROJECT: Writer
  ROLE: FT9 line spacing dropdown and indent buttons.
        Written as inline line-height / margin-left on the block
        (p, div, li, td/th) so save, print, PDF and DOCX keep them.
  ============================================================
*/
/* (before DF25) window.Draftly = window.Draftly || {}; */
window.Writer = window.Writer || {};
Writer.spacing = { STEP: 1.27, MAX: 7, BLOCKS: 'p,div,li,h1,h2,h3,h4,h5,h6,blockquote,td,th' };

Writer.spacing.blockOf = function blockOf(node) {
  var el = node && (node.nodeType === 1 ? node : node.parentElement);
  if (!el || !Writer.editor.isInEditor(el)) return null;
  var b = el.closest(Writer.spacing.BLOCKS);
  if (!b || b.classList.contains(Writer.config.editorClass) || b.classList.contains('dr-pagebreak')) return null;
  if (!b.closest('.' + Writer.config.editorClass)) return null;
  return b;
};

/* Innermost blocks touched by the selection. */
Writer.spacing.blocks = function blocks() {
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount) return [];
  var r = sel.getRangeAt(0);
  var first = Writer.spacing.blockOf(r.startContainer);
  if (sel.isCollapsed) return first ? [first] : [];
  var host = (first || r.commonAncestorContainer);
  host = host.nodeType === 1 ? host : host.parentElement;
  var ed = host && host.closest('.' + Writer.config.editorClass);
  if (!ed) return first ? [first] : [];
  var all = ed.querySelectorAll(Writer.spacing.BLOCKS), out = [], i;
  for (i = 0; i < all.length; i++) {
    var b = all[i];
    if (b.classList.contains('dr-pagebreak') || !r.intersectsNode(b)) continue;
    if (b.querySelector(Writer.spacing.BLOCKS)) continue;   /* keep innermost */
    out.push(b);
  }
  if (!out.length && first) out.push(first);
  return out;
};

Writer.spacing.changed = function changed() {
  /* Style-only change: the incremental reflow only notices moved nodes, so lay out fully. */
  Writer.pages.layoutAll();
  if (Writer.app && Writer.app.ready) {
    clearTimeout(Writer.app.inputTimer);
    Writer.app.inputTimer = setTimeout(function () { Writer.storage.save(); }, Writer.config.inputDebounceMs);
  }
  Writer.ui.updateToolbarState();
};

Writer.spacing.restore = function restore() {
  var sel = window.getSelection();
  if (sel && sel.rangeCount && Writer.spacing.blockOf(sel.anchorNode)) return;
  if (Writer.editor.restoreSelection) Writer.editor.restoreSelection();
};

Writer.spacing.setLineHeight = function setLineHeight(v) {
  Writer.spacing.restore();
  var bl = Writer.spacing.blocks();
  if (!bl.length) return;
  bl.forEach(function (b) { b.style.lineHeight = String(v); });
  Writer.spacing.changed();
};

Writer.spacing.marginOf = function marginOf(b) {
  var m = /([\d.]+)cm/.exec(b.style.marginLeft || '');
  return m ? Math.round(parseFloat(m[1]) / Writer.spacing.STEP) : 0;
};

/* dir = +1 increase, -1 decrease. Lists use the browser's nesting. */
Writer.spacing.indent = function indent(dir) {
  var S = Writer.spacing;
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
Writer.spacing.onKey = function onKey(e) {
  if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
  if (!Writer.editor.isInEditor(e.target)) return;
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
  var b = Writer.spacing.blockOf(sel.anchorNode);
  if (!b || b.closest('td,th')) return;
  if (!Writer.breaks.atEdge(sel.getRangeAt(0), b, -1)) return;
  e.preventDefault();
  Writer.spacing.indent(e.shiftKey ? -1 : 1);
};

/* Show the line spacing at the caret. */
Writer.spacing.sync = function sync() {
  var s = document.getElementById('lineSpacingSelect');
  if (!s) return;
  var sel = window.getSelection();
  var b = sel && sel.anchorNode && Writer.spacing.blockOf(sel.anchorNode);
  if (!b) return;
  var v = '', el = b;
  while (el && !el.classList.contains(Writer.config.editorClass)) {
    if (el.style && el.style.lineHeight) { v = el.style.lineHeight; break; }
    el = el.parentElement;
  }
  var n = parseFloat(v);
  var opts = ['1', '1.15', '1.5', '2'];
  s.value = isNaN(n) ? '' : (opts.filter(function (o) { return Math.abs(parseFloat(o) - n) < 0.01; })[0] || '');
};

Writer.spacing.init = function init() {
  var S = Writer.spacing;
  Writer.history.wrap(S, 'setLineHeight');
  Writer.history.wrap(S, 'indent');
  document.addEventListener('keydown', S.onKey);
  var s = document.getElementById('lineSpacingSelect');
  if (s) s.addEventListener('change', function () { if (s.value) S.setLineHeight(s.value); });
  [['indentDecBtn', -1], ['indentIncBtn', 1]].forEach(function (p) {
    var b = document.getElementById(p[0]);
    if (b) b.addEventListener('click', function () { S.indent(p[1]); });
  });
};

Writer.spacing.init();
