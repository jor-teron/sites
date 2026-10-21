/* ============================================================
   FILE: modules/draftly-format.js
   PROJECT: Draftly
   ROLE: Home-tab formatting wiring: B/I/U/S, super/sub, align,
         font and list selects, Ctrl shortcuts, toolbar sync.
   DEPENDS: config, editor, ui, lists (optional)
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.format = {};

/* Ctrl/Cmd shortcuts that only act inside an editor. */
Draftly.format.onKey = function onKey(e) {
  if (!((e.ctrlKey || e.metaKey) && !e.altKey)) return;   /* Ctrl or Cmd */
  var key = e.key.toLowerCase();
  if (key === 's' || (key === 'p' && !e.shiftKey)) return;   /* docs / export own these */
  if (!Draftly.editor.isInEditor(e.target) && document.activeElement &&
      !document.activeElement.classList.contains(Draftly.config.editorClass)) return;
  if (key === 'b' || key === 'i' || key === 'u') {
    e.preventDefault();
    if (key === 'b') Draftly.editor.execCmd('bold');
    if (key === 'i') Draftly.editor.execCmd('italic');
    if (key === 'u') Draftly.editor.execCmd('underline');
    return;
  }
  if (key === 'x' && e.shiftKey) { e.preventDefault(); Draftly.editor.execCmd('strikeThrough'); return; }
  if (e.shiftKey) return;
  if (e.key === '.' || e.code === 'Period') { e.preventDefault(); Draftly.editor.setScript('superscript'); }
  else if (e.key === ',' || e.code === 'Comma') { e.preventDefault(); Draftly.editor.setScript('subscript'); }
};

Draftly.format.bind = function bind() {
  var cfg = Draftly.config;
  var on = Draftly.ui.onClick;
  document.addEventListener('keydown', Draftly.format.onKey);

  on('boldBtn', function () { Draftly.editor.execCmd('bold'); });
  on('italicBtn', function () { Draftly.editor.execCmd('italic'); });
  on('underlineBtn', function () { Draftly.editor.execCmd('underline'); });
  on('strikeBtn', function () { Draftly.editor.execCmd('strikeThrough'); });
  on('superBtn', function () { Draftly.editor.setScript('superscript'); });
  on('subBtn', function () { Draftly.editor.setScript('subscript'); });
  on('alignLeftBtn', function () { Draftly.editor.execCmd('justifyLeft'); });
  on('alignCenterBtn', function () { Draftly.editor.execCmd('justifyCenter'); });
  on('alignRightBtn', function () { Draftly.editor.execCmd('justifyRight'); });

  var fontFamilySelect = document.getElementById('fontFamilySelect');
  if (fontFamilySelect) {
    fontFamilySelect.addEventListener('change', function (e) {
      Draftly.editor.setFontFamily(e.target.value);
    });
  }
  var fontSizeSelect = document.getElementById('fontSizeSelect');
  if (fontSizeSelect) {
    fontSizeSelect.addEventListener('change', function (e) {
      Draftly.editor.restoreSelection();
      Draftly.editor.applyFontSize(e.target.value);
    });
  }
  var listKindSelect = document.getElementById('listKindSelect');
  if (listKindSelect) {
    listKindSelect.addEventListener('change', function () {
      Draftly.editor.restoreSelection();
      if (Draftly.lists) Draftly.lists.apply();
    });
  }
  var listSuffixSelect = document.getElementById('listSuffixSelect');
  if (listSuffixSelect) {
    listSuffixSelect.addEventListener('change', function () {
      Draftly.editor.restoreSelection();
      if (Draftly.lists) Draftly.lists.applySuffix();
    });
  }

  /* Keep the toolbar in step with the caret. */
  document.addEventListener('selectionchange', function () {
    var active = document.activeElement;
    if (active && active.classList && active.classList.contains(cfg.editorClass)) {
      Draftly.editor.activeEditor = active;
      Draftly.ui.updateToolbarState();
      Draftly.editor.saveSelection();
    }
  });
};
