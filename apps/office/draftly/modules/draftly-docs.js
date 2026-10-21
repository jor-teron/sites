/* ============================================================
   FILE: modules/draftly-docs.js
   PROJECT: Draftly
   ROLE: Document lifecycle: load, open, new, delete, save,
         Recent list, autosave and save-on-leave.
   DEPENDS: config, storage, ui, editor, pages, history, view
   ============================================================ */

var Draftly = window.Draftly || {};
window.Draftly = Draftly;

Draftly.docs = {};

/* Load the last document, or start a named blank one. */
Draftly.docs.load = function load() {
  var cfg = Draftly.config;
  var editor = Draftly.pages.firstEditor();
  if (!editor) return Promise.resolve();
  Draftly.ui.setNonPrinting(Draftly.storage.loadNonPrinting());
  var page = Draftly.storage.loadPage();
  Draftly.ui.setPage(page.size, page.margins);
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
    /* A backup newer than the stored copy wins (save did not finish). */
    var backup = Draftly.storage.readBackup();
    if (backup && backup.name && (!doc || (doc.name === backup.name && backup.time > (doc.updated || 0)))) {
      doc = { name: backup.name, html: backup.html, updated: backup.time };
    }
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
Draftly.docs.toggleRecent = function toggleRecent() {
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
      var line = document.createElement('div');
      line.className = 'recent-row';
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'recent-del';
      del.title = 'Delete ' + row.name;
      del.setAttribute('aria-label', 'Delete ' + row.name);
      del.textContent = '×';
      del.addEventListener('click', function () {
        Draftly.view.togglePop('recentMenu', 'recentBtn', false);
        Draftly.docs.deleteDoc(row.name);
      });
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'recent-item';
      btn.textContent = row.name;
      btn.addEventListener('click', function () {
        Draftly.docs.openDoc(row.name);
        Draftly.view.togglePop('recentMenu', 'recentBtn', false);
      });
      line.appendChild(btn);
      line.appendChild(del);
      menu.appendChild(line);
    });
    Draftly.view.togglePop('recentMenu', 'recentBtn', true);
  }).catch(function () {
    Draftly.ui.showToast('Could not read recent documents');
  });
};

/* Load one stored document into the editor. */
Draftly.docs.openDoc = function openDoc(name) {
  /* Save the current doc first so edits from the last debounce are kept. */
  clearTimeout(Draftly.app.inputTimer);
  Draftly.storage.save().catch(function () {}).then(function () {
    return Draftly.storage.getDoc(name);
  }).then(function (doc) {
    var editor = Draftly.pages.firstEditor();
    if (!editor || !doc) return;
    Draftly.pages.rebuildSinglePage();
    editor = Draftly.pages.firstEditor();
    editor.innerHTML = doc.html || Draftly.config.defaultHtml;
    Draftly.editor.stripMarks(editor);
    Draftly.storage.setCurrentName(doc.name, true);
    Draftly.pages.layoutAll();
    Draftly.history.reset();
    Draftly.ui.showToast('Opened ' + doc.name);
  }).catch(function () {
    Draftly.ui.showToast('Could not open document');
  });
};

/* Show a blank document under a fresh, unused Doc_ name. */
Draftly.docs.showBlank = function showBlank(rows) {
  var base = Draftly.storage.makeName();
  var name = base;
  var n = 2;
  var taken = function (x) { return rows.some(function (r) { return r.name === x; }); };
  while (taken(name)) name = base + '_' + (n++);
  Draftly.pages.rebuildSinglePage();
  var editor = Draftly.pages.firstEditor();
  if (editor) editor.innerHTML = '<p><br></p>';
  Draftly.storage.loadedName = '';
  Draftly.storage.setCurrentName(name, false);
  Draftly.pages.layoutAll();
  if (editor) { editor.focus(); Draftly.editor.activeEditor = editor; }
  Draftly.history.reset();
  return Draftly.storage.save();
};

/* New: save the current doc, then open a blank one. */
Draftly.docs.newDoc = function newDoc() {
  clearTimeout(Draftly.app.inputTimer);
  return Draftly.storage.save().catch(function () {}).then(function () {
    return Draftly.storage.listDocs();
  }).then(function (rows) {
    return Draftly.docs.showBlank(rows);
  }).then(function (name) {
    Draftly.ui.showToast('New document ' + name);
  }).catch(function () {
    Draftly.ui.showToast('Could not create document');
  });
};

/* Delete one stored doc after confirm. If it is open, move to another. */
Draftly.docs.deleteDoc = function deleteDoc(name) {
  if (!window.confirm('Delete "' + name + '"? This cannot be undone.')) return Promise.resolve(false);
  var isOpen = name === Draftly.storage.loadedName || name === Draftly.storage.currentName();
  if (isOpen) clearTimeout(Draftly.app.inputTimer);
  return Draftly.storage.deleteDoc(name).then(function () {
    if (!isOpen) return null;
    return Draftly.storage.listDocs().then(function (rows) {
      Draftly.storage.loadedName = '';
      if (rows.length) {
        Draftly.pages.rebuildSinglePage();
        var editor = Draftly.pages.firstEditor();
        editor.innerHTML = rows[0].html || Draftly.config.defaultHtml;
        Draftly.editor.stripMarks(editor);
        Draftly.storage.setCurrentName(rows[0].name, true);
        Draftly.pages.layoutAll();
        Draftly.history.reset();
        return null;
      }
      return Draftly.docs.showBlank(rows);
    });
  }).then(function () {
    Draftly.ui.showToast('Deleted ' + name);
    return true;
  }).catch(function () {
    Draftly.ui.showToast('Could not delete document');
    return false;
  });
};

/* Save the open name. No prompt. */
Draftly.docs.save = function save() {
  Draftly.storage.save().then(function (name) {
    Draftly.ui.showToast('Saved ' + name);
  }).catch(function () {
    Draftly.ui.showToast('Could not save');
  });
};

/* Buttons, Ctrl+S, autosave after input, save when leaving. */
Draftly.docs.bind = function bind() {
  var cfg = Draftly.config;
  Draftly.ui.onClick('recentBtn', function () { Draftly.docs.toggleRecent(); });
  Draftly.ui.onClick('newBtn', function () { Draftly.docs.newDoc(); });
  Draftly.ui.onClick('saveBtn', function () { Draftly.docs.save(); });

  /* Margins come from the Page panel preset (see Draftly.docs.load). Drop the old free-form key. */
  try { localStorage.removeItem(cfg.storageKeyMargins); } catch (e) {}

  document.addEventListener('keydown', function (e) {
    if (!((e.ctrlKey || e.metaKey) && !e.altKey)) return;   /* Ctrl or Cmd */
    if (e.key.toLowerCase() !== 's') return;
    e.preventDefault();
    Draftly.docs.save();
  });

  /* Flow pages quickly after typing; save on a slower timer. */
  var flowTimer = null;
  document.addEventListener('input', function (e) {
    if (!Draftly.editor.isInEditor(e.target)) return;
    clearTimeout(flowTimer);
    flowTimer = setTimeout(function () {
      if (Draftly.app.ready) Draftly.pages.checkPagination();
    }, cfg.flowDebounceMs);
    clearTimeout(Draftly.app.inputTimer);
    Draftly.app.inputTimer = setTimeout(function () {
      if (Draftly.app.ready) Draftly.storage.save();
    }, cfg.inputDebounceMs);
  });

  /* Leaving: write a sync backup first, then the normal async save. */
  function saveOnLeave() {
    if (!Draftly.app.ready) return;
    clearTimeout(Draftly.app.inputTimer);
    Draftly.storage.writeBackup();
    Draftly.storage.save().catch(function () {});
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') saveOnLeave();
  });
  window.addEventListener('pagehide', saveOnLeave);
  window.addEventListener('beforeunload', saveOnLeave);
};

/* Old names kept for callers that still use Draftly.app.* */
Draftly.app = Draftly.app || {};
['load:loadDocument', 'toggleRecent', 'openDoc', 'showBlank', 'newDoc', 'deleteDoc', 'save:saveDocument'].forEach(function (pair) {
  var p = pair.split(':');
  Draftly.app[p[1] || p[0]] = function () { return Draftly.docs[p[0]].apply(Draftly.docs, arguments); };
});
