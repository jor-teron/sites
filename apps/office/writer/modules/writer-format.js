/* ============================================================
   FILE: modules/writer-format.js
   DF25: was modules/draftly-format.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: Home-tab formatting wiring: B/I/U/S, super/sub, align,
         font and list selects, Ctrl shortcuts, toolbar sync.
   DEPENDS: config, editor, ui, lists (optional)
   ============================================================ */

/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.format = {};

/* Ctrl/Cmd shortcuts that only act inside an editor. */
Writer.format.onKey = function onKey(e) {
  if (!((e.ctrlKey || e.metaKey) && !e.altKey)) return;   /* Ctrl or Cmd */
  var key = e.key.toLowerCase();
  if (key === 's' || (key === 'p' && !e.shiftKey)) return;   /* docs / export own these */
  if (!Writer.editor.isInEditor(e.target) && document.activeElement &&
      !document.activeElement.classList.contains(Writer.config.editorClass)) return;
  if (key === 'b' || key === 'i' || key === 'u') {
    e.preventDefault();
    if (key === 'b') Writer.editor.execCmd('bold');
    if (key === 'i') Writer.editor.execCmd('italic');
    if (key === 'u') Writer.editor.execCmd('underline');
    return;
  }
  if (key === 'j' && !e.shiftKey) { e.preventDefault(); Writer.editor.execCmd('justifyFull'); return; }   /* DF1 */
  if (key === 'x' && e.shiftKey) { e.preventDefault(); Writer.editor.execCmd('strikeThrough'); return; }
  if (e.shiftKey) return;
  if (e.key === '.' || e.code === 'Period') { e.preventDefault(); Writer.editor.setScript('superscript'); }
  else if (e.key === ',' || e.code === 'Comma') { e.preventDefault(); Writer.editor.setScript('subscript'); }
};

Writer.format.bind = function bind() {
  var cfg = Writer.config;
  var on = Writer.ui.onClick;
  document.addEventListener('keydown', Writer.format.onKey);

  on('boldBtn', function () { Writer.editor.execCmd('bold'); });
  on('italicBtn', function () { Writer.editor.execCmd('italic'); });
  on('underlineBtn', function () { Writer.editor.execCmd('underline'); });
  on('strikeBtn', function () { Writer.editor.execCmd('strikeThrough'); });
  on('superBtn', function () { Writer.editor.setScript('superscript'); });
  on('subBtn', function () { Writer.editor.setScript('subscript'); });
  on('alignLeftBtn', function () { Writer.editor.execCmd('justifyLeft'); });
  on('alignCenterBtn', function () { Writer.editor.execCmd('justifyCenter'); });
  on('alignRightBtn', function () { Writer.editor.execCmd('justifyRight'); });
  on('alignJustifyBtn', function () { Writer.editor.execCmd('justifyFull'); });

  var fontFamilySelect = document.getElementById('fontFamilySelect');
  if (fontFamilySelect) {
    fontFamilySelect.addEventListener('change', function (e) {
      Writer.editor.setFontFamily(e.target.value);
    });
  }
  var fontSizeSelect = document.getElementById('fontSizeSelect');
  if (fontSizeSelect) {
    fontSizeSelect.addEventListener('change', function (e) {
      Writer.editor.restoreSelection();
      Writer.editor.applyFontSize(e.target.value);
    });
  }
  var listKindSelect = document.getElementById('listKindSelect');
  if (listKindSelect) {
    listKindSelect.addEventListener('change', function () {
      Writer.editor.restoreSelection();
      if (Writer.lists) Writer.lists.apply();
    });
  }
  var listSuffixSelect = document.getElementById('listSuffixSelect');
  if (listSuffixSelect) {
    listSuffixSelect.addEventListener('change', function () {
      Writer.editor.restoreSelection();
      if (Writer.lists) Writer.lists.applySuffix();
    });
  }

  /* Keep the toolbar in step with the caret. */
  document.addEventListener('selectionchange', function () {
    var active = document.activeElement;
    if (active && active.classList && active.classList.contains(cfg.editorClass)) {
      Writer.editor.activeEditor = active;
      Writer.ui.updateToolbarState();
      Writer.editor.saveSelection();
    }
  });
};
