/* ============================================================
   FILE: modules/writer-editor.js
   DF25: was modules/draftly-editor.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: Selection, execCommand, font, paste, legacy mark cleanup.
   DEPENDS: Writer.config, Writer.ui
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

/* Plain text paste (R7: takes the toolbar font), then reflow. */
Writer.editor.pastePlain = function pastePlain(text) {
  var fontSelect = document.getElementById('fontFamilySelect');
  var font = fontSelect ? fontSelect.value : Writer.config.fontCommandName;
  Writer.editor.setFontFamily(font);
  document.execCommand('insertText', false, text);
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

/* Enter / Shift+Enter, paste and focus from every page editor. */
Writer.editor.bind = function bind() {
  var cfg = Writer.config;
  /* Enter = new <p>, Shift+Enter = <br> line break. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (!Writer.editor.isInEditor(e.target)) return;
    e.preventDefault();
    if (e.shiftKey) Writer.editor.insertLineBreak();
    else Writer.editor.execCmd('insertParagraph');
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
