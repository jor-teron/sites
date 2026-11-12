/* ============================================================
   FILE: modules/writer-app.js
   DF25: was modules/draftly-app.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: Thin bootstrap. Checks modules, calls each feature's
         bind(), loads the last document. Holds shared boot state
         (ready, inputTimer). Feature wiring lives in its module.
   DEPENDS: config, storage, ui, editor, pages, export, docs, format
   ISOLATION: A missing module is logged and skipped.
   ============================================================ */

/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.app = Writer.app || {};

/* Names required for a full editor. */
Writer.app.required = ['config', 'storage', 'ui', 'editor', 'pages', 'export', 'lists', 'history', 'docs', 'format'];

/* True after the last file has been applied. Blocks early autosave. */
Writer.app.ready = false;

/* Debounced autosave timer (shared: other modules clear it before saving). */
Writer.app.inputTimer = null;

/* Log any module that failed to attach. Returns true if all exist. */
Writer.app.guard = function guard() {
  var missing = Writer.app.required.filter(function (n) { return !Writer[n]; });
  if (missing.length) console.warn('writer: skipped missing modules: ' + missing.join(', '));
  return missing.length === 0;
};

Writer.app.init = function init() {
  if (!Writer.app.guard()) return;
  try {
    Writer.config.applyToDocument();
    if (Writer.settings) Writer.settings.bind();   /* DF8: before loadTheme (auto theme) */
    Writer.ui.loadTheme();
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}
    Writer.editor.bind();
    Writer.docs.bind();
    Writer.export.bind();
    Writer.format.bind();
    Writer.ui.bind();
    if (Writer.hf) Writer.hf.bind();
    if (Writer.margins) Writer.margins.bind();
    if (Writer.colour) Writer.colour.init();
    if (Writer.view) Writer.view.init();
    Writer.docs.load().then(function () {
      var editor = Writer.pages.firstEditor();
      if (editor) {
        editor.focus();
        Writer.editor.activeEditor = editor;
      }
      Writer.pages.layoutAll();
      Writer.history.reset();
    });
  } catch (err) {
    console.warn('writer: init failed', err);
  }
};

Writer.app.init();
