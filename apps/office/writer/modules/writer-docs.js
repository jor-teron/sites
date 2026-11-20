/* ============================================================
   FILE: modules/writer-docs.js
   DF25: was modules/draftly-docs.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: Document lifecycle: load, open, new, delete, save,
         Recent list, autosave and save-on-leave.
         HOW1: .how files (writer-how.js). In the Hub the newest
         .how in Documents reopens; Recent lists those files.
         DF3: a blank document is kept in memory only; it is
         stored on its first real edit.
         (before HOW1) load / Recent / save used IndexedDB.
         DW14: one Open... in the File menu, routed by openKind.
         DW14a: Open... uses showOpenFilePicker when it is available,
         so Save can write back to a picked .docx / .odt.
         DW15: File > New opens a new Hub window (desktop) or a new
         browser tab (standalone). Phone mode and a blocked popup
         keep the old same-window newDoc.
   DEPENDS: config, storage, ui, editor, pages, history, view
   ============================================================ */

/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

Writer.docs = {};

/* Start a blank document, then open a .how from the page hash (Files
   double-click) or, in the Hub, the newest .how in Documents.
   (before HOW1) IndexedDB last-document load:
Draftly.docs.load = function load() {
  var cfg = Draftly.config;
  var editor = Draftly.pages.firstEditor();
  if (!editor) return Promise.resolve();
  Draftly.ui.setNonPrinting(Draftly.storage.loadNonPrinting());
  var page = Draftly.storage.loadPage();
  Draftly.ui.setPage(page.size, page.margins, page.custom);
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
    // A backup newer than the stored copy wins (save did not finish).
    var backup = Draftly.storage.readBackup();
    if (backup && backup.name && (!doc || (doc.name === backup.name && backup.time > (doc.updated || 0)))) {
      doc = { name: backup.name, html: backup.html, hf: backup.hf, updated: backup.time };
    }
    editor = Draftly.pages.firstEditor();
    if (doc && editor) {
      editor.innerHTML = doc.html || cfg.defaultHtml;
      Draftly.storage.setCurrentName(doc.name, true);
      if (Draftly.hf) Draftly.hf.set(doc.hf);
    } else if (editor) {
      if (Draftly.hf) Draftly.hf.set(null);
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
*/
Writer.docs.load = function load() {
  var cfg = Writer.config;
  var editor = Writer.pages.firstEditor();
  if (!editor) return Promise.resolve();
  Writer.ui.setNonPrinting(Writer.storage.loadNonPrinting());
  var page = Writer.storage.loadPage();
  Writer.ui.setPage(page.size, page.margins, page.custom);
  Writer.ui.setOrientation(Writer.storage.loadOrientation());
  Writer.storage.loadedName = '';
  if (Writer.hf && Writer.hf.blank) Writer.hf.set(Writer.hf.blank());
  editor.innerHTML = cfg.defaultHtml;
  Writer.storage.fillNameIfEmpty();
  if (Writer.editor) Writer.editor.stripMarks(editor);
  /* DW15: a New window or tab starts blank instead of reopening the last document. */
  var fresh = false;
  try {
    fresh = Writer.docs.consumeNewLaunch(Date.now(), window.localStorage, window.location, window.history);
  } catch (e) {}
  if (fresh) {
    return Writer.docs.showBlank().then(function (name) {
      if (Writer.settings && Writer.settings.applyNewPage) Writer.settings.applyNewPage();
      Writer.app.ready = true;
      return name;
    }).catch(function () {
      Writer.app.ready = true;
    });
  }
  var start = (Writer.how && Writer.how.start) ? Writer.how.start() : Promise.resolve(false);
  return start.then(function () {
    Writer.app.ready = true;
  }, function () {
    Writer.app.ready = true;
  });
};

/* .how files in Documents (Hub). (before HOW1) this listed IndexedDB documents via storage.listDocs. */
Writer.docs.toggleRecent = function toggleRecent() {
  var menu = document.getElementById('recentMenu');
  if (!menu) return;
  if (!menu.hidden) {
    Writer.view.togglePop('recentMenu', 'recentBtn', false);
    return;
  }
  var pending = (Writer.how && Writer.how.list) ? Writer.how.list() : Promise.resolve([]);
  pending.then(function (rows) {
    menu.innerHTML = '';
    if (!rows.length) {
      var empty = (Writer.how && Writer.how.inHub && Writer.how.inHub()) ? 'No .how files in Documents' : 'No saved documents';
      menu.innerHTML = '<div class="recent-empty">' + empty + '</div>';
    }
    rows.forEach(function (row) {
      var label = Writer.how.stem(row.name);
      var line = document.createElement('div');
      line.className = 'recent-row';
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'recent-del';
      del.title = 'Delete ' + label;
      del.setAttribute('aria-label', 'Delete ' + label);
      del.textContent = '×';
      del.addEventListener('click', function () {
        Writer.view.togglePop('recentMenu', 'recentBtn', false);
        Writer.docs.deleteDoc(row.name);
      });
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'recent-item';
      btn.textContent = label;
      btn.addEventListener('click', function () {
        Writer.docs.openDoc(row.name);
        Writer.view.togglePop('recentMenu', 'recentBtn', false);
      });
      line.appendChild(btn);
      line.appendChild(del);
      menu.appendChild(line);
    });
    Writer.view.togglePop('recentMenu', 'recentBtn', true);
  }).catch(function () {
    Writer.ui.showToast('Could not read recent documents');
  });
};

/* Open one .how file from Documents. (before HOW1) storage.getDoc loaded an IndexedDB record:
Draftly.docs.openDoc = function openDoc(name) {
  // Save the current doc first so edits from the last debounce are kept.
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
    if (Draftly.hf) Draftly.hf.set(doc.hf);
    Draftly.pages.layoutAll();
    Draftly.history.reset();
    Draftly.ui.showToast('Opened ' + doc.name);
  }).catch(function () {
    Draftly.ui.showToast('Could not open document');
  });
};
*/
Writer.docs.openDoc = function openDoc(name) {
  clearTimeout(Writer.app.inputTimer);
  if (!Writer.how) { Writer.ui.showToast('Could not open document'); return Promise.resolve(false); }
  return Writer.how.openName(name);
};

/* Blank document. (before HOW1) showBlank picked an unused Doc_ name from IndexedDB rows:
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
  if (Draftly.hf) Draftly.hf.set(null);
  Draftly.pages.layoutAll();
  if (editor) { editor.focus(); Draftly.editor.activeEditor = editor; }
  Draftly.history.reset();
  return Promise.resolve(name);
};
*/
Writer.docs.showBlank = function showBlank() {
  return Writer.how ? Writer.how.fresh() : Promise.resolve('');
};

/* New: save the current .how, then open a blank one.
   (before HOW1) storage.save then listDocs then showBlank. */
Writer.docs.newDoc = function newDoc() {
  clearTimeout(Writer.app.inputTimer);
  var flushed = Writer.how ? Writer.how.autosave() : Promise.resolve();
  return flushed.catch(function () {}).then(function () {
    return Writer.docs.showBlank();
  }).then(function (name) {
    Writer.ui.showToast('New document ' + name);
  }).catch(function () {
    Writer.ui.showToast('Could not create document');
  });
};

/* DW15: how File > New should open.
   inFrame + inHub + phone === true → same window (Hub phone mode).
   inFrame + inHub otherwise (desktop, or phone unknown) → a new Hub window.
   inFrame === false → a new browser tab.
   Anything else (an unknown frame) → same window. */
Writer.docs.OPEN_NEW_KEY = 'writer_open_new';
Writer.docs.OPEN_NEW_MS = 30000;

Writer.docs.newMode = function newMode(opts) {
  opts = opts || {};
  if (opts.inFrame && opts.inHub) {
    if (opts.phone === true) return 'same';
    return 'hub-window';
  }
  if (opts.inFrame === false) return 'tab';
  return 'same';
};

/* Hub phone mode, when the parent is same-origin and exposes HubMode.
   true = phone, false = desktop, null = unknown. */
Writer.docs.hubPhone = function hubPhone(win) {
  if (!win) return null;
  try {
    var p = win.parent;
    if (!p || p === win) return null;
    if (p.HubMode && typeof p.HubMode.isDesktop === 'function') {
      return !(p.HubMode.isDesktop() && p.HubWM);
    }
  } catch (e) { /* cross-origin or file:// */ }
  return null;
};

Writer.docs.inHubFrame = function inHubFrame() {
  if (Writer.hub && Writer.hub.linked) return true;
  try {
    if (typeof document !== 'undefined' && document.body && document.body.classList.contains('in-hub')) return true;
  } catch (e) {}
  return false;
};

Writer.docs.markOpenNew = function markOpenNew(now, store) {
  if (!store || typeof store.setItem !== 'function') return false;
  try { store.setItem(Writer.docs.OPEN_NEW_KEY, String(now)); return true; } catch (e) { return false; }
};

/* True when the one-shot flag is present and under 30 s old. Always removes the key. */
Writer.docs.takeOpenNew = function takeOpenNew(now, store) {
  if (!store || typeof store.getItem !== 'function') return false;
  var raw = null;
  try { raw = store.getItem(Writer.docs.OPEN_NEW_KEY); } catch (e) { return false; }
  try { if (store.removeItem) store.removeItem(Writer.docs.OPEN_NEW_KEY); } catch (e) {}
  if (raw == null || raw === '') return false;
  var t = Number(raw);
  if (!isFinite(t)) return false;
  var age = now - t;
  return age >= 0 && age < Writer.docs.OPEN_NEW_MS;
};

/* Standalone New uses #new (not ?new=1, which Hub Office already uses). */
Writer.docs.launchIsNew = function launchIsNew(loc) {
  if (!loc) return false;
  return String(loc.hash || '') === '#new';
};

Writer.docs.newTabUrl = function newTabUrl(href) {
  try {
    var u = new URL(href);
    u.hash = 'new';
    return u.href;
  } catch (e) {
    return String(href || '').replace(/#.*$/, '') + '#new';
  }
};

Writer.docs.cleanNewUrl = function cleanNewUrl(loc, hist) {
  if (!loc || !Writer.docs.launchIsNew(loc) || !hist || typeof hist.replaceState !== 'function') return;
  try {
    var u = new URL(loc.href);
    u.hash = '';
    hist.replaceState(null, '', u.href);
  } catch (e) {
    try { hist.replaceState(null, '', String(loc.href).replace(/#new$/, '')); } catch (e2) {}
  }
};

Writer.docs.consumeNewLaunch = function consumeNewLaunch(now, store, loc, hist) {
  var fromFlag = Writer.docs.takeOpenNew(now, store);
  var fromUrl = Writer.docs.launchIsNew(loc);
  if (fromUrl) Writer.docs.cleanNewUrl(loc, hist);
  return !!(fromFlag || fromUrl);
};

Writer.docs.hubOpenTarget = function hubOpenTarget(loc) {
  if (!loc) return '*';
  return loc.protocol === 'file:' || loc.origin === 'null' ? '*' : loc.origin;
};

Writer.docs.hubWriterUrl = function hubWriterUrl(href) {
  try { return new URL('./', href).href; } catch (e) {
    var s = String(href || '');
    var hash = s.indexOf('#');
    if (hash >= 0) s = s.slice(0, hash);
    var q = s.indexOf('?');
    if (q >= 0) s = s.slice(0, q);
    if (/\/[^/]+\.[^/]+$/.test(s)) s = s.replace(/\/[^/]+$/, '/');
    else if (s && s.slice(-1) !== '/') s += '/';
    return s;
  }
};

Writer.docs.postHubNew = function postHubNew(win) {
  if (!win || !win.parent || typeof win.parent.postMessage !== 'function') return false;
  var loc = win.location || {};
  var msg = { type: 'hub-open-app', url: Writer.docs.hubWriterUrl(loc.href), name: 'Writer', newInstance: true };
  win.parent.postMessage(msg, Writer.docs.hubOpenTarget(loc));
  return true;
};

Writer.docs.openNewTab = function openNewTab(win) {
  if (!win || typeof win.open !== 'function') return false;
  var url = Writer.docs.newTabUrl(win.location ? win.location.href : '');
  var w = win.open(url, '_blank');
  return !!w;
};

/* File > New: open a new window or tab when we can, else the old same-window newDoc. */
Writer.docs.requestNew = function requestNew(win) {
  if (win === undefined && typeof window !== 'undefined') win = window;
  var inFrame = false;
  try { inFrame = !!(win && win.parent && win.parent !== win); } catch (e) { inFrame = true; }
  var mode = Writer.docs.newMode({
    inFrame: inFrame,
    inHub: Writer.docs.inHubFrame(),
    phone: Writer.docs.hubPhone(win)
  });
  if (mode === 'hub-window') {
    Writer.docs.markOpenNew(Date.now(), win && win.localStorage);
    try {
      if (Writer.docs.postHubNew(win)) return Promise.resolve();
    } catch (e) { /* fall through */ }
    try { if (win && win.localStorage && win.localStorage.removeItem) win.localStorage.removeItem(Writer.docs.OPEN_NEW_KEY); } catch (e2) {}
    return Writer.docs.newDoc();
  }
  if (mode === 'tab') {
    var opened = false;
    try { opened = Writer.docs.openNewTab(win); } catch (e) { opened = false; }
    if (!opened) return Writer.docs.newDoc();
    return Promise.resolve();
  }
  return Writer.docs.newDoc();
};

/* Delete one .how file after confirm. If it is open, open another or a blank page.
   (before HOW1) deleteNow called storage.deleteDoc and then opened the next IndexedDB record. */
Writer.docs.deleteDoc = function deleteDoc(name) {
  var label = Writer.how ? Writer.how.stem(name) : name;
  var onDisk = Writer.how && Writer.how.inHub && Writer.how.inHub() && Writer.how.canLocal();
  var message = onDisk
    ? '"' + label + '" will be deleted from Documents. This cannot be undone.'
    : 'Close "' + label + '"? A downloaded file is left as it is.';
  return Writer.dialog.confirm({ title: onDisk ? 'Delete document?' : 'Close document?', message: message, okLabel: onDisk ? 'Delete' : 'Close', danger: !!onDisk })
    .then(function (yes) { return yes ? Writer.docs.deleteNow(name) : false; });
};

/* Delete without asking (after the confirm above). */
Writer.docs.deleteNow = function deleteNow(name) {
  var stem = Writer.how ? Writer.how.stem(name) : name;
  var file = Writer.how ? Writer.how.fileName(name) : name;
  var dest = Writer.how && Writer.how.dest;
  var isOpen = stem === Writer.storage.loadedName || stem === Writer.storage.currentName() ||
    name === Writer.storage.loadedName || name === Writer.storage.currentName() ||
    (dest && (dest.name === file || dest.name === name));
  if (isOpen) clearTimeout(Writer.app.inputTimer);
  var gone = (Writer.how && Writer.how.inHub && Writer.how.inHub() && Writer.how.canLocal())
    ? Writer.how.remove(file)
    : Promise.resolve();
  return gone.then(function () {
    if (!isOpen) return null;
    if (!Writer.how) return Writer.docs.showBlank();
    Writer.how.dest = null;
    Writer.how.skipWrite = true;
    Writer.storage.loadedName = '';
    var editor = Writer.pages.firstEditor();
    if (editor) editor.innerHTML = '<p><br></p>';
    if (Writer.hf && Writer.hf.blank) Writer.hf.set(Writer.hf.blank());
    return Writer.how.list().then(function (rows) {
      var next = null;
      var i;
      for (i = 0; i < rows.length; i++) if (rows[i].name !== file) { next = rows[i]; break; }
      var opened = next ? Writer.how.openName(next.name, { quiet: true }) : Writer.docs.showBlank();
      return Promise.resolve(opened).then(function (out) {
        Writer.how.skipWrite = false;
        return out;
      }, function (err) {
        Writer.how.skipWrite = false;
        throw err;
      });
    });
  }).then(function () {
    var onDisk = Writer.how && Writer.how.inHub && Writer.how.inHub();
    Writer.ui.showToast((onDisk ? 'Deleted ' : 'Closed ') + stem);
    return true;
  }).catch(function () {
    Writer.ui.showToast('Could not delete document');
    return false;
  });
};

/* (before DW12) Save the open document as .how. Save As asks for a name in the Hub. */
/* DW12: Save writes the open document in its format (.how, or the .docx / .odt it was opened from);
   Save As asks for a name and a format (writer-how.js). */
Writer.docs.save = function save() {
  var p = Writer.how ? Writer.how.save({ explicit: true }) : Writer.storage.save();
  return p.then(function (res) {
    if (res && res.wrote) Writer.ui.showToast((res.verb || 'Saved') + ' ' + (res.name || ''));
    else if (typeof res === 'string' && res) Writer.ui.showToast('Saved ' + res);
  }).catch(function () {
    Writer.ui.showToast('Could not save');
  });
};
Writer.docs.saveAs = function saveAs() {
  var p = Writer.how ? Writer.how.save({ explicit: true, saveAs: true }) : Writer.storage.save();
  return p.then(function (res) {
    if (res && res.wrote) Writer.ui.showToast((res.verb || 'Saved') + ' ' + (res.name || ''));
  }).catch(function () {
    Writer.ui.showToast('Could not save');
  });
};

/* DW14: which opener a picked file should use, from its name only. */
Writer.docs.openKind = function openKind(fileName) {
  var name = String(fileName || '').trim();
  var dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return null;
  var ext = name.slice(dot + 1).toLowerCase();
  if (ext === 'how') return 'how';
  if (ext === 'docx') return 'docx';
  if (ext === 'odt') return 'odt';
  if (ext === 'txt') return 'txt';
  return null;
};

/* DW14: send a picked file to the opener that already handles that kind. */
Writer.docs.openPicked = function openPicked(file) {
  if (!file) return;
  var kind = Writer.docs.openKind(file.name);
  if (kind === 'how') {
    if (Writer.how) Writer.how.openFile(file, null);
    return;
  }
  if (kind === 'docx' || kind === 'odt' || kind === 'txt') {
    if (Writer.docxopen) Writer.docxopen.open(file);
    return;
  }
  if (Writer.ui && Writer.ui.showToast) Writer.ui.showToast('Choose a .how, .docx, .odt or .txt file to open it');
};

/* DW14a: use the browser's open picker when the window has it. */
Writer.docs.openMode = function openMode(win) {
  if (win === undefined && typeof window !== 'undefined') win = window;
  return (win && typeof win.showOpenFilePicker === 'function') ? 'picker' : 'input';
};

/* DW14a: user cancel is silent; any other picker failure falls back to the hidden input. */
Writer.docs.openPickerFail = function openPickerFail(err) {
  if (err && err.name === 'AbortError') return 'silent';
  return 'input';
};

/* DW14a: types for the handle picker (includes .how, which DW12's docx picker did not). */
Writer.docs.pickTypes = function pickTypes() {
  return [{
    description: 'Documents (.how, .docx, .odt, .txt)',
    accept: {
      'application/json': ['.how'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.oasis.opendocument.text': ['.odt'],
      'text/plain': ['.txt']
    }
  }];
};

/* DW14a: open a file from a FileSystemFileHandle so Save can write back. */
Writer.docs.openPickedHandle = function openPickedHandle(handle) {
  if (!handle || !handle.getFile) return Promise.resolve();
  return handle.getFile().then(function (file) {
    if (!file) return;
    var kind = Writer.docs.openKind(file.name);
    if (kind === 'how') {
      /* How.openFile already accepts a handle dest, so Save can write back to the .how. */
      if (Writer.how) Writer.how.openFile(file, { kind: 'handle', handle: handle, name: handle.name || file.name });
      return;
    }
    if (kind === 'docx' || kind === 'odt' || kind === 'txt') {
      /* Same handle path DW12 used on Open .docx / .odt / .txt. A .txt still becomes a .how copy. */
      if (Writer.docxopen) Writer.docxopen.open(file, { handle: handle });
      return;
    }
    if (Writer.ui && Writer.ui.showToast) Writer.ui.showToast('Choose a .how, .docx, .odt or .txt file to open it');
  });
};

/* DW14a: the hidden <input type=file> used when the handle picker is missing or fails. */
Writer.docs.openWithInput = function openWithInput() {
  var inp = document.getElementById('openFile');
  if (!inp) return;
  inp.value = '';
  inp.click();
};

/* DW14a: File > Open.... Uses the handle picker when it is available and not in the Hub
   (same Hub rule as Writer.docxopen.canPick from DW12). */
Writer.docs.openFromMenu = function openFromMenu(win) {
  if (win === undefined && typeof window !== 'undefined') win = window;
  if (Writer.docs.openMode(win) !== 'picker' || (Writer.how && Writer.how.inHub && Writer.how.inHub())) {
    Writer.docs.openWithInput();
    return Promise.resolve();
  }
  return win.showOpenFilePicker({ types: Writer.docs.pickTypes(), multiple: false }).then(function (hs) {
    var h = hs && hs[0];
    if (!h) return;
    return Writer.docs.openPickedHandle(h);
  }).catch(function (e) {
    if (Writer.docs.openPickerFail(e) === 'silent') return;
    Writer.docs.openWithInput();
  });
};

/* Buttons, Ctrl+S, autosave after input, save when leaving. */
Writer.docs.bind = function bind() {
  var cfg = Writer.config;
  Writer.ui.onClick('recentBtn', function () { Writer.docs.toggleRecent(); });
  /* (before DW15) Writer.ui.onClick('newBtn', function () { Writer.docs.newDoc(); }); */
  Writer.ui.onClick('newBtn', function () { Writer.docs.requestNew(); });
  Writer.ui.onClick('saveBtn', function () { Writer.docs.save(); });
  Writer.ui.onClick('saveAsBtn', function () { Writer.docs.saveAs(); });
  /* (before DW14) Writer.ui.onClick('openHowBtn', function () {
    var inp = document.getElementById('howFile');
    if (!inp) return;
    inp.value = '';
    inp.click();
  });
  var howFile = document.getElementById('howFile');
  if (howFile) howFile.addEventListener('change', function () {
    if (howFile.files && howFile.files[0] && Writer.how) Writer.how.openFile(howFile.files[0], null);
  }); */
  /* (before DW14a) Writer.ui.onClick('openFileBtn', function () {
    var inp = document.getElementById('openFile');
    if (!inp) return;
    inp.value = '';
    inp.click();
  }); */
  Writer.ui.onClick('openFileBtn', function () { Writer.docs.openFromMenu(); });
  var openFile = document.getElementById('openFile');
  if (openFile) openFile.addEventListener('change', function () {
    if (openFile.files && openFile.files[0]) Writer.docs.openPicked(openFile.files[0]);
  });

  /* Margins come from the Page panel preset (see Writer.docs.load). Drop the old free-form key. */
  try { localStorage.removeItem(cfg.storageKeyMargins); } catch (e) {}

  /* HO1: Ctrl/Cmd+S goes through ../shared/office-quick.js (save now + ✓ Saved tick). */

  /* Flow pages quickly after typing; save on a slower timer. */
  var flowTimer = null;
  document.addEventListener('input', function (e) {
    if (!Writer.editor.isInEditor(e.target)) return;
    clearTimeout(flowTimer);
    flowTimer = setTimeout(function () {
      if (Writer.app.ready) Writer.pages.checkPagination();
    }, cfg.flowDebounceMs);
    clearTimeout(Writer.app.inputTimer);
    Writer.app.inputTimer = setTimeout(function () {
      /* (before HO2) Draftly.storage.save();  — rejection was unhandled, so a full disk failed silently */
      /* (before HOW1) if (Draftly.app.ready && (!Draftly.settings || Draftly.settings.autosave())) Draftly.storage.save().catch(function () {}); */
      /* (before DW12) if (Writer.app.ready && (!Writer.settings || Writer.settings.autosave()) && Writer.how) Writer.how.autosave(); */
      /* DW12: timer: never rewrites an open .docx / .odt (that is written on Save; see writer-how.js saveNow) */
      if (Writer.app.ready && (!Writer.settings || Writer.settings.autosave()) && Writer.how) Writer.how.autosave({ timer: true });
    }, cfg.inputDebounceMs);
  });

  /* Leaving: flush the .how file when a Hub document or a picked file is open.
     (before HOW1) writeBackup() then storage.save() — IndexedDB plus a localStorage copy. */
  function saveOnLeave() {
    if (!Writer.app.ready) return;
    clearTimeout(Writer.app.inputTimer);
    /* (before HOW1) Draftly.storage.writeBackup(); */
    /* (before HOW1) Draftly.storage.save().catch(function () {}); */
    if (Writer.how) Writer.how.autosave();
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') saveOnLeave();
  });
  window.addEventListener('pagehide', saveOnLeave);
  window.addEventListener('beforeunload', saveOnLeave);
};

/* Old names kept for callers that still use Writer.app.* */
Writer.app = Writer.app || {};
['load:loadDocument', 'toggleRecent', 'openDoc', 'showBlank', 'newDoc', 'deleteDoc', 'save:saveDocument'].forEach(function (pair) {
  var p = pair.split(':');
  Writer.app[p[1] || p[0]] = function () { return Writer.docs[p[0]].apply(Writer.docs, arguments); };
});
