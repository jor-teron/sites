/* ============================================================
   FILE: modules/draftly-editor.js
   PROJECT: draftly
   ROLE: Selection, execCommand, font, paste, legacy mark cleanup.
   DEPENDS: Draftly.config, Draftly.ui
   ISOLATION: Commands no-op if no editor is focused.
   ============================================================ */

/* Shared namespace. */
var Draftly = window.Draftly || {};
window.Draftly = Draftly;

/* Editor command helpers. */
Draftly.editor = {};

/* Last range inside an editor, used after toolbar clicks. */
Draftly.editor.savedRange = null;

/* Last editor that held the caret. */
Draftly.editor.activeEditor = null;

/* True when a node is inside a page editor. */
Draftly.editor.isInEditor = function isInEditor(node) {
  var cfg = Draftly.config;
  if (!node) return false;
  var el = node.nodeType === 1 ? node : node.parentElement;
  return !!(el && el.closest && el.closest('.' + cfg.editorClass));
};

/* Remember the caret if it sits inside an editor. */
Draftly.editor.saveSelection = function saveSelection() {
  var sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  if (Draftly.editor.isInEditor(sel.anchorNode)) {
    Draftly.editor.savedRange = sel.getRangeAt(0).cloneRange();
    var el = sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement;
    Draftly.editor.activeEditor = el ? el.closest('.' + Draftly.config.editorClass) : null;
  }
};

/* Put the caret back. Focus the last editor if needed. */
Draftly.editor.restoreSelection = function restoreSelection() {
  var editor = Draftly.editor.activeEditor || document.querySelector('.' + Draftly.config.editorClass);
  if (Draftly.editor.savedRange) {
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(Draftly.editor.savedRange);
  } else if (editor) {
    editor.focus();
  }
};

/* Focus the editor that owns the caret. */
Draftly.editor.focusEditor = function focusEditor() {
  var editor = Draftly.editor.activeEditor || document.querySelector('.' + Draftly.config.editorClass);
  if (!editor) return;
  if (document.activeElement !== editor) {
    editor.focus();
    Draftly.editor.restoreSelection();
  }
};

/* Remove legacy inline mark spans (older versions inserted ¶ / ↵ as DOM
   nodes). Marks are now drawn by draftly-marks.js on an overlay only. */
Draftly.editor.stripMarks = function stripMarks(root) {
  if (!root) return;
  var marks = root.querySelectorAll('.' + Draftly.config.markClass + ', span[data-np]');
  var i;
  for (i = marks.length - 1; i >= 0; i--) marks[i].remove();
  var brs = root.querySelectorAll('br[data-br]');
  for (i = 0; i < brs.length; i++) brs[i].removeAttribute('data-br');
};

/* Kept for callers: marks are display-only now, so just redraw them. */
Draftly.editor.syncMarks = function syncMarks() {
  if (Draftly.marks) Draftly.marks.schedule();
};
Draftly.editor.markLineBreaks = function markLineBreaks() {
  if (Draftly.marks) Draftly.marks.schedule();
};

/* Shift+Enter: insert a real <br> (Chrome's insertLineBreak types "\n" under
   pre-wrap). A trailing placeholder <br> keeps an empty last line visible. */
Draftly.editor.insertLineBreak = function insertLineBreak() {
  var sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;
  var range = sel.getRangeAt(0);
  range.deleteContents();
  var br = document.createElement('br');
  range.insertNode(br);
  var n = br;
  var needsPlaceholder = true;
  while (n && !(n.classList && n.classList.contains(Draftly.config.editorClass))) {
    var sib = n.nextSibling;
    while (sib && sib.nodeType === 3 && !sib.nodeValue.length) sib = sib.nextSibling;
    if (sib) { needsPlaceholder = false; break; }
    n = n.parentNode;
    if (n && n.nodeType === 1 && /^(P|DIV|LI|H[1-6]|BLOCKQUOTE|PRE)$/.test(n.tagName)) break;
  }
  if (needsPlaceholder) br.parentNode.insertBefore(document.createElement('br'), br.nextSibling);
  var r = document.createRange();
  r.setStartAfter(br);
  r.collapse(true);
  sel.removeAllRanges();
  sel.addRange(r);
  var host = br.parentElement && br.parentElement.closest('.' + Draftly.config.editorClass);
  if (host) host.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertLineBreak' }));
};

/* Run a contenteditable command, then refresh toolbar and pages. */
Draftly.editor.execCmd = function execCmd(command, value) {
  Draftly.editor.focusEditor();
  document.execCommand(command, false, value == null ? null : value);
  if (Draftly.ui) Draftly.ui.updateToolbarState();
  Draftly.editor.saveSelection();
  if (command === 'insertLineBreak' || command === 'insertParagraph') {
    setTimeout(function () {
      if (Draftly.pages) Draftly.pages.checkPagination();
    }, Draftly.config.paginationAfterInsertMs);
  }
};

/* Apply a font family name to the current selection. */
Draftly.editor.setFontFamily = function setFontFamily(name) {
  Draftly.editor.focusEditor();
  document.execCommand('fontName', false, name || Draftly.config.fontCommandName);
  if (Draftly.ui) Draftly.ui.updateToolbarState();
  Draftly.editor.saveSelection();
};

/* Force Times New Roman on the current selection. */
Draftly.editor.setTimesNewRoman = function setTimesNewRoman() {
  Draftly.editor.setFontFamily(Draftly.config.fontCommandName);
};

/* Apply an execCommand font-size token (1–7). */
Draftly.editor.applyFontSize = function applyFontSize(size) {
  Draftly.editor.focusEditor();
  document.execCommand('fontSize', false, size);
  if (Draftly.ui) Draftly.ui.updateToolbarState();
  Draftly.editor.saveSelection();
};

/* Paste plain text only, then restyle and reflow. */
Draftly.editor.onPaste = function onPaste(e) {
  e.preventDefault();
  var text = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
  Draftly.editor.setTimesNewRoman();
  Draftly.editor.saveSelection();
  if (Draftly.pages) Draftly.pages.checkPagination();
};
