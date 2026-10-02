/* ============================================================
   FILE: modules/draftly-editor.js
   PROJECT: draftly
   ROLE: Selection, execCommand, font, paste, line-break marks.
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

/* Remove inline format marks so they are not saved or printed. */
Draftly.editor.stripMarks = function stripMarks(root) {
  if (!root) return;
  var marks = root.querySelectorAll('.' + Draftly.config.markClass);
  var i;
  for (i = marks.length - 1; i >= 0; i--) marks[i].remove();
};

/* Build one inline mark. The caret cannot enter it. */
Draftly.editor.makeMark = function makeMark(glyph) {
  var span = document.createElement('span');
  span.className = Draftly.config.markClass;
  span.setAttribute('contenteditable', 'false');
  span.setAttribute('data-np', glyph);
  span.textContent = glyph;
  return span;
};

/* Put ¶ at the end of each block and ↵ just after each br. */
Draftly.editor.syncMarks = function syncMarks() {
  var cfg = Draftly.config;
  var editors = document.querySelectorAll('.' + cfg.editorClass);
  var i;
  var blocks;
  var b;
  var brs;
  var br;
  var next;
  Draftly.editor.stripMarks(document);
  if (!Draftly.ui || !Draftly.ui.isNonPrinting()) return;
  for (i = 0; i < editors.length; i++) {
    blocks = editors[i].querySelectorAll('p, div, li');
    for (b = 0; b < blocks.length; b++) {
      blocks[b].appendChild(Draftly.editor.makeMark('¶'));
    }
    brs = editors[i].querySelectorAll('br');
    for (b = 0; b < brs.length; b++) {
      br = brs[b];
      next = br.nextSibling;
      if (next && next.classList && next.classList.contains(cfg.markClass)) continue;
      br.parentNode.insertBefore(Draftly.editor.makeMark('↵'), next);
    }
  }
};

/* Mark br nodes, then refresh visible format marks if they are on. */
Draftly.editor.markLineBreaks = function markLineBreaks(root) {
  var scope = root || document;
  var list = scope.querySelectorAll('.' + Draftly.config.editorClass + ' br');
  var i;
  for (i = 0; i < list.length; i++) {
    if (!list[i].hasAttribute('data-br')) list[i].setAttribute('data-br', '');
  }
  Draftly.editor.syncMarks();
};

/* Run a contenteditable command, then refresh toolbar and pages. */
Draftly.editor.execCmd = function execCmd(command, value) {
  Draftly.editor.focusEditor();
  document.execCommand(command, false, value == null ? null : value);
  if (Draftly.ui) Draftly.ui.updateToolbarState();
  Draftly.editor.saveSelection();
  if (command === 'insertLineBreak' || command === 'insertParagraph') {
    setTimeout(function () {
      Draftly.editor.markLineBreaks();
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
  Draftly.editor.markLineBreaks();
  if (Draftly.pages) Draftly.pages.checkPagination();
};
