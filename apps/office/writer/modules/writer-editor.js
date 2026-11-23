/* ============================================================
   FILE: modules/writer-editor.js
   DF25: was modules/draftly-editor.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: Selection, execCommand, font, paste, legacy mark cleanup.
         DW23: Enter (insertParagraph) carries ruler indents, line
         spacing and alignment onto the new paragraph.
         DW24: setAlign writes text-align on the enclosing block(s)
         so Shift+Enter lines stay in one paragraph.
   DEPENDS: Writer.config, Writer.ui, Writer.indent (optional, DW23)
   ISOLATION: Commands no-op if no editor is focused.
   ============================================================ */

/* Shared namespace. */
/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

/* Editor command helpers. */
Writer.editor = {};

/* Last range inside an editor, used after toolbar clicks. */
Writer.editor.savedRange = null;

/* Last editor that held the caret. */
Writer.editor.activeEditor = null;

/* True when a node is inside a page editor. */
Writer.editor.isInEditor = function isInEditor(node) {
  var cfg = Writer.config;
  if (!node) return false;
  var el = node.nodeType === 1 ? node : node.parentElement;
  return !!(el && el.closest && el.closest('.' + cfg.editorClass));
};

/* Remember the caret if it sits inside an editor. */
Writer.editor.saveSelection = function saveSelection() {
  var sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  if (Writer.editor.isInEditor(sel.anchorNode)) {
    Writer.editor.savedRange = sel.getRangeAt(0).cloneRange();
    var el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    Writer.editor.activeEditor = el ? el.closest('.' + Writer.config.editorClass) : null;
  }
};

/* Put the caret back. Focus the last editor if needed. */
Writer.editor.restoreSelection = function restoreSelection() {
  var editor = Writer.editor.activeEditor || document.querySelector('.' + Writer.config.editorClass);
  if (Writer.editor.savedRange) {
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(Writer.editor.savedRange);
  } else if (editor) {
    editor.focus();
  }
};

/* Focus the editor that owns the caret. */
Writer.editor.focusEditor = function focusEditor() {
  var editor = Writer.editor.activeEditor || document.querySelector('.' + Writer.config.editorClass);
  if (!editor) return;
  if (document.activeElement !== editor) {
    editor.focus();
    Writer.editor.restoreSelection();
  }
};

/* Remove legacy inline mark spans (older versions inserted ¶ / ↵ as DOM
   nodes). Marks are now drawn by writer-marks.js on an overlay only. */
Writer.editor.stripMarks = function stripMarks(root) {
  if (!root) return;
  var marks = root.querySelectorAll('.' + Writer.config.markClass + ', span[data-np]');
  var i;
  for (i = marks.length - 1; i >= 0; i--) marks[i].remove();
  var brs = root.querySelectorAll('br[data-br]');
  for (i = 0; i < brs.length; i++) brs[i].removeAttribute('data-br');
};

/* Kept for callers: marks are display-only now, so just redraw them. */
Writer.editor.syncMarks = function syncMarks() {
  if (Writer.marks) Writer.marks.schedule();
};
Writer.editor.markLineBreaks = function markLineBreaks() {
  if (Writer.marks) Writer.marks.schedule();
};

/* Shift+Enter: insert a real <br> (Chrome's insertLineBreak types "\n" under
   pre-wrap). A trailing placeholder <br> keeps an empty last line visible. */
Writer.editor.insertLineBreak = function insertLineBreak() {
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  var range = sel.getRangeAt(0);
  range.deleteContents();
  var br = document.createElement('br');
  range.insertNode(br);
  var n = br;
  var needsPlaceholder = true;
  while (n && !(n.classList && n.classList.contains(Writer.config.editorClass))) {
    var sib = n.nextSibling;
    while (sib && sib.nodeType === 3 && !sib.nodeValue.length) sib = sib.nextSibling;
    if (sib) { needsPlaceholder = false; break; }
    n = n.parentNode;
    if (n && n.nodeType === 1 && /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE|TD|TH)$/.test(n.tagName)) break;
  }
  if (needsPlaceholder) br.parentNode.insertBefore(document.createElement('br'), br.nextSibling);
  var r = document.createRange();
  r.setStartAfter(br);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
  var host = br.parentElement && br.parentElement.closest('.' + Writer.config.editorClass);
  if (host) host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertLineBreak' }));
};


/* DW24: alignment is a paragraph style, not an execCommand. Chrome's
   justify* treats a <br> as a paragraph break and would split a
   Shift+Enter line out into its own block. */
Writer.editor.ALIGN_BLOCKS = 'p,div,li,h1,h2,h3,h4,h5,h6,blockquote,td,th';
Writer.editor.alignNames = { left: 'left', center: 'center', right: 'right', justify: 'justify',
  justifyLeft: 'left', justifyCenter: 'center', justifyRight: 'right', justifyFull: 'justify' };

Writer.editor.alignValue = function alignValue(el) {
  if (!el) return '';
  var a = (el.style && el.style.textAlign) || (el.getAttribute && el.getAttribute('align')) || '';
  a = String(a).toLowerCase().replace(/\s+/g, '');
  if (a === 'middle') a = 'center';
  if (a === 'justify' || a === 'center' || a === 'right' || a === 'left') return a;
  return '';
};

Writer.editor.alignBlockOf = function alignBlockOf(node) {
  var el = node && (node.nodeType === 1 ? node : node.parentElement);
  if (!el || !Writer.editor.isInEditor(el)) return null;
  var b = el.closest(Writer.editor.ALIGN_BLOCKS);
  if (!b || b.classList.contains(Writer.config.editorClass) || b.classList.contains('dr-pagebreak')) return null;
  if (!b.closest('.' + Writer.config.editorClass)) return null;
  return b;
};

/* Innermost blocks touched by the selection (same idea as Writer.spacing.blocks). */
Writer.editor.alignBlocks = function alignBlocks() {
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount) return [];
  var r = sel.getRangeAt(0);
  var first = Writer.editor.alignBlockOf(r.startContainer);
  if (sel.isCollapsed) return first ? [first] : [];
  var host = (first || r.commonAncestorContainer);
  host = host.nodeType === 1 ? host : host.parentElement;
  var ed = host && host.closest('.' + Writer.config.editorClass);
  if (!ed) return first ? [first] : [];
  var all = ed.querySelectorAll(Writer.editor.ALIGN_BLOCKS), out = [], i;
  for (i = 0; i < all.length; i++) {
    var b = all[i];
    if (b.classList.contains('dr-pagebreak') || (r.intersectsNode && !r.intersectsNode(b))) continue;
    if (b.querySelector(Writer.editor.ALIGN_BLOCKS)) continue;
    out.push(b);
  }
  if (!out.length && first) out.push(first);
  return out;
};

Writer.editor.alignAtCaret = function alignAtCaret() {
  var bl = Writer.editor.alignBlocks(), i, v;
  if (!bl.length) return '';
  v = Writer.editor.alignValue(bl[0]);
  for (i = 1; i < bl.length; i++) if (Writer.editor.alignValue(bl[i]) !== v) return '';
  return v;
};

/* kind is left|center|right|justify (or a justify* execCommand name).
   Already-aligned blocks stay as they are (no toggle off). */
Writer.editor.setAlign = function setAlign(kind) {
  var v = Writer.editor.alignNames[kind] || kind;
  if (!/^(left|center|right|justify)$/.test(v)) return;
  Writer.editor.focusEditor();
  if (Writer.editor.restoreSelection) Writer.editor.restoreSelection();
  var bl = Writer.editor.alignBlocks();
  if (!bl.length) return;
  bl.forEach(function (b) {
    if (b.removeAttribute && b.getAttribute && b.getAttribute('align')) b.removeAttribute('align');
    b.style.textAlign = v;
  });
  /* Style-only change: the incremental reflow only notices moved nodes, so lay out fully. */
  if (Writer.pages && Writer.pages.layoutAll) Writer.pages.layoutAll();
  if (Writer.app && Writer.app.ready) {
    clearTimeout(Writer.app.inputTimer);
    Writer.app.inputTimer = setTimeout(function () { Writer.storage.save(); }, Writer.config.inputDebounceMs);
  }
  if (Writer.ui) Writer.ui.updateToolbarState();
  Writer.editor.saveSelection();
};

/* Run a contenteditable command, then refresh toolbar and pages. */
Writer.editor.execCmd = function execCmd(command, value) {
  Writer.editor.focusEditor();
  document.execCommand(command, false, value == null ? null : value);
  if (Writer.ui) Writer.ui.updateToolbarState();
  Writer.editor.saveSelection();
  if (command === 'insertLineBreak' || command === 'insertParagraph') {
    setTimeout(function () {
      if (Writer.pages) Writer.pages.checkPagination();
    }, Writer.config.paginationAfterInsertMs);
  }
};

/* Superscript / subscript: one at a time. Turning one on clears the other. */
Writer.editor.setScript = function setScript(kind) {
  var other = kind === 'superscript' ? 'subscript' : 'superscript';
  Writer.editor.focusEditor();
  var st = function (c) { try { return document.queryCommandState(c); } catch (e) { return false; } };
  if (!st(kind) && st(other)) document.execCommand(other, false, null);
  Writer.editor.execCmd(kind);
};

/* Apply a font family name to the current selection. */
Writer.editor.setFontFamily = function setFontFamily(name) {
  Writer.editor.focusEditor();
  document.execCommand('fontName', false, name || Writer.config.fontCommandName);
  if (Writer.ui) Writer.ui.updateToolbarState();
  Writer.editor.saveSelection();
};

/* Force Times New Roman on the current selection. */
Writer.editor.setTimesNewRoman = function setTimesNewRoman() {
  Writer.editor.setFontFamily(Writer.config.fontCommandName);
};

/* Apply a real point size (8–36) to the selection.
   execCommand only knows sizes 1–7, so mark with 7 and swap in a pt span. */
Writer.editor.applyFontSize = function applyFontSize(pt) {
  var size = parseInt(pt, 10);
  if (!size) return;
  Writer.editor.focusEditor();
  try { document.execCommand('styleWithCSS', false, false); } catch (e) {}
  document.execCommand('fontSize', false, '7');
  var marks = document.querySelectorAll('.' + Writer.config.editorClass + ' font[size="7"]');
  var i;
  for (i = 0; i < marks.length; i++) {
    var span = document.createElement('span');
    span.style.fontSize = size + 'pt';
    if (marks[i].face) span.style.fontFamily = marks[i].face;
    while (marks[i].firstChild) span.appendChild(marks[i].firstChild);
    var inner = span.querySelectorAll('[style*="font-size"]');
    var j;
    for (j = 0; j < inner.length; j++) inner[j].style.fontSize = '';
    var sel = window.getSelection();
    var range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    var wasStart = range && marks[i].contains(range.startContainer);
    var wasEnd = range && marks[i].contains(range.endContainer);
    marks[i].parentNode.replaceChild(span, marks[i]);
    if (wasStart || wasEnd) {
      var r = document.createRange();
      r.selectNodeContents(span);
      sel.removeAllRanges();
      sel.addRange(r);
    }
  }
  if (Writer.ui) Writer.ui.updateToolbarState();
  Writer.editor.saveSelection();
  var host = Writer.editor.activeEditor;
  if (host) host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'formatFontSize' }));
};

/* DF16: legacy plain-text paste kept as comment; now Writer.editor.pastePlain.
/* Paste plain text only, then restyle and reflow. * /
Writer.editor.onPaste = function onPaste(e) {
  e.preventDefault();
  var text = (e.clipboardData || window.clipboardData).getData('text/plain');
  var fontSelect = document.getElementById('fontFamilySelect');
  var font = fontSelect ? fontSelect.value : Writer.config.fontCommandName;
  /* Set the typing font first so the inserted text takes it. * /
  Writer.editor.setFontFamily(font);
  document.execCommand('insertText', false, text);
  Writer.editor.saveSelection();
  if (Writer.pages) Writer.pages.checkPagination();
};

*/

/* Normalise clipboard plain text: CRLF / CR become LF, one trailing
   newline is a terminator not a blank line (same idea as DW9 .txt open
   and header/footer paste). Internal blank lines are kept. */
Writer.editor.plainText = function plainText(text) {
  text = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
  if (text.charAt(text.length - 1) === '\n') text = text.slice(0, -1);
  return text;
};

/* Plain text paste (R7: takes the toolbar font), then reflow. */
Writer.editor.pastePlain = function pastePlain(text) {
  var fontSelect = document.getElementById('fontFamilySelect');
  var font = fontSelect ? fontSelect.value : Writer.config.fontCommandName;
  Writer.editor.setFontFamily(font);
  /* (before DW22) document.execCommand('insertText', false, text); */
  document.execCommand('insertText', false, Writer.editor.plainText(text));
  Writer.editor.saveSelection();
  if (Writer.pages) Writer.pages.checkPagination();
};

/* DF16: formatted paste lives in writer-paste.js; plain text otherwise. */
Writer.editor.onPaste = function onPaste(e) {
  if (Writer.paste && Writer.paste.handle) return Writer.paste.handle(e);
  e.preventDefault();
  var cd = e.clipboardData || window.clipboardData;
  Writer.editor.pastePlain(cd.getData('text/plain'));
};


/* DW23: Enter starts a new paragraph and copies the previous block's
   indent, line spacing and alignment onto it (lists are left alone). */
Writer.editor.insertParagraph = function insertParagraph() {
  Writer.editor.focusEditor();
  var I = Writer.indent, snap = null;
  if (I && I.paraStyle && I.blockOf) {
    var sel = window.getSelection();
    if (sel && sel.rangeCount) {
      var n = sel.getRangeAt(0).startContainer;
      snap = I.paraStyle(I.blockOf(n, I.hostOf(n)));
    }
  }
  document.execCommand('insertParagraph', false, null);
  if (snap && I && I.applyParaStyle) {
    var next = I.blockForEnter ? I.blockForEnter() : null;
    if (next) I.applyParaStyle(next, snap);
  }
  if (Writer.ui) Writer.ui.updateToolbarState();
  Writer.editor.saveSelection();
  setTimeout(function () {
    if (Writer.pages) Writer.pages.checkPagination();
  }, Writer.config.paginationAfterInsertMs);
};

/* Enter / Shift+Enter, paste and focus from every page editor. */
Writer.editor.bind = function bind() {
  var cfg = Writer.config;
  /* Enter = new <p>, Shift+Enter = <br> line break. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (!Writer.editor.isInEditor(e.target)) return;
    e.preventDefault();
    if (e.shiftKey) Writer.editor.insertLineBreak();
    /* (before DW23) else Writer.editor.execCmd('insertParagraph'); */
    else Writer.editor.insertParagraph();
  });
  /* Toolbar buttons never steal the caret. */
  document.querySelectorAll('.tool-btn').forEach(function (btn) {
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
  });
  var workspace = document.getElementById('workspace');
  if (workspace) {
    workspace.addEventListener('paste', function (e) {
      if (!Writer.editor.isInEditor(e.target)) return;
      Writer.editor.onPaste(e);
    });
    workspace.addEventListener('focusin', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains(cfg.editorClass)) {
        Writer.editor.activeEditor = e.target;
      }
    });
  }
};
