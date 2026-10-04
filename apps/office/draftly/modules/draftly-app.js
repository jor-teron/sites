/* ============================================================
   FILE: modules/draftly-app.js
   PROJECT: Draftly
   ROLE: Boot and event wiring. Does not own paper math.
   DEPENDS: config, storage, ui, editor, pages, export
   ISOLATION: Each feature is started only if its module
              object exists. A missing module is logged
              and skipped.
   ============================================================ */

/* Shared namespace. */
var Draftly = window.Draftly || {};
window.Draftly = Draftly;

/* Boot record. Missing names are listed, not thrown. */
Draftly.app = {};

/* Names required for a full editor. */
Draftly.app.required = ['config', 'storage', 'ui', 'editor', 'pages', 'export', 'lists'];

/* True after the last file has been applied. Blocks early autosave. */
Draftly.app.ready = false;

/* Log any module that failed to attach. Returns true if all exist. */
Draftly.app.guard = function guard() {
  var missing = [];
  var i;
  for (i = 0; i < Draftly.app.required.length; i++) {
    if (!Draftly[Draftly.app.required[i]]) missing.push(Draftly.app.required[i]);
  }
  if (missing.length) {
    console.warn('draftly: skipped missing modules: ' + missing.join(', '));
  }
  return missing.length === 0;
};

/* Bind one click that does not steal the caret. */
Draftly.app.onClick = function onClick(id, fn) {
  var node = document.getElementById(id);
  if (!node) return;
  node.addEventListener('mousedown', function (e) { e.preventDefault(); });
  node.addEventListener('click', function (e) {
    e.preventDefault();
    try { fn(e); } catch (err) { console.warn('draftly: ' + id, err); }
  });
};

/* Load the last document, or start a named blank one. */
Draftly.app.loadDocument = function loadDocument() {
  var cfg = Draftly.config;
  var editor = Draftly.pages.firstEditor();
  if (!editor) return Promise.resolve();
  Draftly.ui.setNonPrinting(Draftly.storage.loadNonPrinting());
  Draftly.ui.setOrientation(Draftly.storage.loadOrientation());
  var last = '';
  try { last = localStorage.getItem(cfg.storageKeyLastName) || ''; } catch (e) {}
  return Draftly.storage.listDocs().then(function (rows) {
    var doc = null;
    var i;
    if (last) {
      for (i = 0; i < rows.length; i++) if (rows[i].name === last) doc = rows[i];
    }
    if (!doc && rows.length) doc = rows[0];
    editor = Draftly.pages.firstEditor();
    if (doc && editor) {
      editor.innerHTML = doc.html || cfg.defaultHtml;
      Draftly.storage.setCurrentName(doc.name, true);
    } else if (editor) {
      editor.innerHTML = cfg.defaultHtml;
      Draftly.storage.fillNameIfEmpty();
    }
    if (editor) Draftly.editor.stripMarks(editor);
    Draftly.app.ready = true;
  }).catch(function () {
    if (editor) editor.innerHTML = cfg.fallbackHtml;
    Draftly.storage.fillNameIfEmpty();
    Draftly.app.ready = true;
  });
};

/* Fill and toggle the recent menu. */
Draftly.app.toggleRecent = function toggleRecent() {
  var menu = document.getElementById('recentMenu');
  if (!menu) return;
  if (!menu.hidden) {
    Draftly.view.togglePop('recentMenu', 'recentBtn', false);
    return;
  }
  Draftly.storage.listDocs().then(function (rows) {
    menu.innerHTML = '';
    if (!rows.length) {
      menu.innerHTML = '<div class="recent-empty">No saved documents</div>';
    }
    rows.forEach(function (row) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'recent-item';
      btn.textContent = row.name;
      btn.addEventListener('click', function () {
        Draftly.app.openDoc(row.name);
        Draftly.view.togglePop('recentMenu', 'recentBtn', false);
      });
      menu.appendChild(btn);
    });
    Draftly.view.togglePop('recentMenu', 'recentBtn', true);
  }).catch(function () {
    Draftly.ui.showToast('Could not read recent documents');
  });
};

/* Load one stored document into the editor. */
Draftly.app.openDoc = function openDoc(name) {
  Draftly.storage.getDoc(name).then(function (doc) {
    var editor = Draftly.pages.firstEditor();
    if (!editor || !doc) return;
    Draftly.pages.rebuildSinglePage();
    editor = Draftly.pages.firstEditor();
    editor.innerHTML = doc.html || Draftly.config.defaultHtml;
    Draftly.editor.stripMarks(editor);
    Draftly.storage.setCurrentName(doc.name, true);
    Draftly.pages.layoutAll();
    Draftly.ui.showToast('Opened ' + doc.name);
  }).catch(function () {
    Draftly.ui.showToast('Could not open document');
  });
};

/* Save the open name. No prompt. */
Draftly.app.saveDocument = function saveDocument() {
  Draftly.storage.save().then(function (name) {
    Draftly.ui.showToast('Saved ' + name);
  }).catch(function () {
    Draftly.ui.showToast('Could not save');
  });
};

/* Keyboard shortcuts on the document, so any page editor works. */
Draftly.app.bindKeys = function bindKeys() {
  /* Enter = new <p>, Shift+Enter = <br> line break. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
    if (!Draftly.editor.isInEditor(e.target)) return;
    e.preventDefault();
    if (e.shiftKey) Draftly.editor.insertLineBreak();
    else Draftly.editor.execCmd('insertParagraph');
  });
  document.addEventListener('keydown', function (e) {
    if (!((e.ctrlKey || e.metaKey) && !e.altKey)) return;   /* Ctrl or Cmd */
    var key = e.key.toLowerCase();
    if (key === 's') {
      e.preventDefault();
      Draftly.app.saveDocument();
      return;
    }
    if (!Draftly.editor.isInEditor(e.target) && document.activeElement &&
        !document.activeElement.classList.contains(Draftly.config.editorClass)) return;
    if (key === 'b' || key === 'i' || key === 'u') {
      e.preventDefault();
      if (key === 'b') Draftly.editor.execCmd('bold');
      if (key === 'i') Draftly.editor.execCmd('italic');
      if (key === 'u') Draftly.editor.execCmd('underline');
    }
  });
};

/* Toolbar, selects, paste, input, resize. */
Draftly.app.bindUi = function bindUi() {
  var cfg = Draftly.config;

  Draftly.app.onClick('boldBtn', function () { Draftly.editor.execCmd('bold'); });
  Draftly.app.onClick('italicBtn', function () { Draftly.editor.execCmd('italic'); });
  Draftly.app.onClick('underlineBtn', function () { Draftly.editor.execCmd('underline'); });
  Draftly.app.onClick('alignLeftBtn', function () { Draftly.editor.execCmd('justifyLeft'); });
  Draftly.app.onClick('alignCenterBtn', function () { Draftly.editor.execCmd('justifyCenter'); });
  Draftly.app.onClick('alignRightBtn', function () { Draftly.editor.execCmd('justifyRight'); });
  Draftly.app.onClick('themeToggleBtn', function () { Draftly.ui.toggleTheme(); });
  Draftly.app.onClick('nonPrintingBtn', function () { Draftly.ui.toggleNonPrinting(); });
  Draftly.app.onClick('recentBtn', function () { Draftly.app.toggleRecent(); });
  Draftly.app.onClick('saveBtn', function () { Draftly.app.saveDocument(); });
  Draftly.app.onClick('printBtn', function () { Draftly.export.printDocument(); });
  Draftly.app.onClick('exportDocxBtn', function () { Draftly.export.exportDocx(); });
  Draftly.app.onClick('exportPdfBtn', function () { Draftly.pdf.download(); });
  Draftly.app.onClick('pageBtn', function () {
    Draftly.view.syncPagePanel();
    Draftly.view.togglePop('pagePanel', 'pageBtn');
  });


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
      if (Draftly.lists) Draftly.lists.syncSuffix();
      if (Draftly.lists) Draftly.lists.apply();
    });
  }
  var listSuffixSelect = document.getElementById('listSuffixSelect');
  if (listSuffixSelect) {
    listSuffixSelect.addEventListener('change', function () {
      if (Draftly.lists) Draftly.lists.apply();
    });
  }

  /* Margins come from draftly-config.js only. Drop margins stored by older versions. */
  try { localStorage.removeItem(cfg.storageKeyMargins); } catch (e) {}
  cfg.docxMarginTop = Math.round(cfg.marginTopCm * 567);
  cfg.docxMarginBottom = Math.round(cfg.marginBottomCm * 567);
  cfg.docxMarginLeft = Math.round(cfg.marginLeftCm * 567);
  cfg.docxMarginRight = Math.round(cfg.marginRightCm * 567);

  document.addEventListener('selectionchange', function () {
    var active = document.activeElement;
    if (active && active.classList && active.classList.contains(cfg.editorClass)) {
      Draftly.editor.activeEditor = active;
      Draftly.ui.updateToolbarState();
      Draftly.editor.saveSelection();
    }
  });

  document.querySelectorAll('.tool-btn').forEach(function (btn) {
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
  });

  /* Paste and input bubble from every page editor. */
  var workspace = document.getElementById('workspace');
  if (workspace) {
    workspace.addEventListener('paste', function (e) {
      if (!Draftly.editor.isInEditor(e.target)) return;
      Draftly.editor.onPaste(e);
    });
    workspace.addEventListener('focusin', function (e) {
      if (e.target && e.target.classList && e.target.classList.contains(cfg.editorClass)) {
        Draftly.editor.activeEditor = e.target;
      }
    });
  }

  /* Flow pages quickly after typing; save on a slower timer. */
  var inputTimer = null;
  var flowTimer = null;
  document.addEventListener('input', function (e) {
    if (!Draftly.editor.isInEditor(e.target)) return;
    clearTimeout(flowTimer);
    flowTimer = setTimeout(function () {
      if (Draftly.app.ready) Draftly.pages.checkPagination();
    }, cfg.flowDebounceMs);
    clearTimeout(inputTimer);
    inputTimer = setTimeout(function () {
      if (Draftly.app.ready) Draftly.storage.save();
    }, cfg.inputDebounceMs);
  });

  var resizeTimer = null;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (Draftly.marks) Draftly.marks.redraw();
    }, cfg.resizeDebounceMs);
  });

  window.addEventListener('beforeunload', function () {
    if (Draftly.app.ready) Draftly.storage.save();
  });

};

/* Start the editor after modules have loaded. */
Draftly.app.init = function init() {
  if (!Draftly.app.guard()) return;
  try {
    Draftly.config.applyToDocument();
    Draftly.ui.loadTheme();
    try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}
    Draftly.app.bindKeys();
    Draftly.app.bindUi();
    if (Draftly.view) Draftly.view.init();
    Draftly.app.loadDocument().then(function () {
      var editor = Draftly.pages.firstEditor();
      if (editor) {
        editor.focus();
        Draftly.editor.activeEditor = editor;
      }
      Draftly.pages.layoutAll();
    });
  } catch (err) {
    console.warn('draftly: init failed', err);
  }
};

Draftly.app.init();
