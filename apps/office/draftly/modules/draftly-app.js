/* ============================================================
   FILE: modules/draftly-app.js
   PROJECT: Draftly
   ROLE: Thin bootstrap. Checks modules, calls each feature's
         bind(), loads the last document. Holds shared boot state
         (ready, inputTimer). Feature wiring lives in its module.
   DEPENDS: config, storage, ui, editor, pages, export, docs, format
   ISOLATION: A missing module is logged and skipped.
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.app = Draftly.app || {};

/* Names required for a full editor. */
Draftly.app.required = ['config', 'storage', 'ui', 'editor', 'pages', 'export', 'lists', 'history', 'docs', 'format'];

/* True after the last file has been applied. Blocks early autosave. */
Draftly.app.ready = false;

/* Debounced autosave timer (shared: other modules clear it before saving). */
Draftly.app.inputTimer = null;

/* Log any module that failed to attach. Returns true if all exist. */
Draftly.app.guard = function guard() {
  var missing = Draftly.app.required.filter(function (n) { return !Draftly[n]; });
  if (missing.length) console.warn('draftly: skipped missing modules: ' + missing.join(', '));
  return missing.length === 0;
};

Draftly.app.init = function init() {
  if (!Draftly.app.guard()) return;
  try {
    Draftly.config.applyToDocument();
    Draftly.ui.loadTheme();
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}
    Draftly.editor.bind();
    Draftly.docs.bind();
    Draftly.export.bind();
    Draftly.format.bind();
    Draftly.ui.bind();
    if (Draftly.colour) Draftly.colour.init();
    if (Draftly.view) Draftly.view.init();
    Draftly.docs.load().then(function () {
      var editor = Draftly.pages.firstEditor();
      if (editor) {
        editor.focus();
        Draftly.editor.activeEditor = editor;
      }
      Draftly.pages.layoutAll();
      Draftly.history.reset();
    });
  } catch (err) {
    console.warn('draftly: init failed', err);
  }
};

Draftly.app.init();
