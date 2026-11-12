/* ============================================================
   FILE: modules/writer-storage.js
   DF25: was modules/draftly-storage.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: IndexedDB documents, plus theme and orientation flags.
         DF3: save() skips a never-stored blank document (no text,
         image or table in body, header or footer).
   DEPENDS: Writer.config
   ISOLATION: A bad store does not stop the editor from opening.
              HO2: a failed document save shows one notice until a later save works.
              (before HO2) failures were swallowed with no notice.
   ============================================================ */

/* Shared namespace. */
/* (before DF25) var Draftly = window.Draftly || {}; window.Draftly = Draftly; */
var Writer = window.Writer || {};
window.Writer = Writer;

/* Storage helpers. Other modules call these; they do not touch keys. */
Writer.storage = {};

/* Open IndexedDB handle, cached after the first success. */
Writer.storage.dbPromise = null;

/* HO2: one sticky notice until a later save works. Private mode and a full disk share this. */
Writer.storage.noteFailed = function noteFailed(err) {
  if (typeof OfficeNotify !== 'undefined' && OfficeNotify.saveProblem) OfficeNotify.saveProblem('writer', err);
};
Writer.storage.noteSaved = function noteSaved() {
  if (typeof OfficeNotify !== 'undefined' && OfficeNotify.saveOk) OfficeNotify.saveOk('writer');
};

/* Open or create the document database. A failed open is not cached, so a later save can retry. */
Writer.storage.open = function open() {
  if (Writer.storage.dbPromise) return Writer.storage.dbPromise;
  /* (before HO2) the rejected promise was kept, so every later save failed the same way with no notice. */
  var p = new Promise(function (resolve, reject) {
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) {
        var missing = new Error('IndexedDB unavailable');
        missing.name = 'SecurityError';
        reject(missing);
        return;
      }
      var cfg = Writer.config;
      var req = indexedDB.open(cfg.dbName, cfg.dbVersion);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(cfg.storeName)) {
          db.createObjectStore(cfg.storeName, { keyPath: 'name' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      /* (before HO2) req.onerror = function () { reject(req.error); }; */
      req.onerror = function () { reject(req.error || new Error('IndexedDB failed')); };
    } catch (e) { reject(e); }
  });
  p.catch(function () {
    if (Writer.storage.dbPromise === p) Writer.storage.dbPromise = null;
  });
  Writer.storage.dbPromise = p;
  return p;
};

/* Build Doc_YYYY_MM_DD_HH-MM from local time. No colon. */
Writer.storage.makeName = function makeName(date) {
  var d = date || new Date();
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return Writer.config.namePrefix +
    d.getFullYear() + '_' + pad(d.getMonth() + 1) + '_' + pad(d.getDate()) + '_' +
    pad(d.getHours()) + '-' + pad(d.getMinutes());
};

/* Name currently in the toolbar box. Empty string if missing. */
Writer.storage.currentName = function currentName() {
  var input = document.getElementById('fileNameInput');
  return input ? input.value.trim() : '';
};

/* Put a name in the box. Persist only when asked. */
Writer.storage.setCurrentName = function setCurrentName(name, persist) {
  var input = document.getElementById('fileNameInput');
  if (input) input.value = name;
  if (persist) {
    Writer.storage.loadedName = name;
    try { localStorage.setItem(Writer.config.storageKeyLastName, name); } catch (e) {}
  }
};

/* Fill the name box only when it is empty. */
Writer.storage.fillNameIfEmpty = function fillNameIfEmpty() {
  if (!Writer.storage.currentName()) {
    Writer.storage.setCurrentName(Writer.storage.makeName());
  }
  return Writer.storage.currentName();
};

/* Name the open document was loaded or last saved under ('' = never saved). */
Writer.storage.loadedName = '';

/* Delete one document by name. */
Writer.storage.deleteDoc = function deleteDoc(name) {
  var cfg = Writer.config;
  var backup = Writer.storage.readBackup();
  if (backup && backup.name === name) {
    try { localStorage.removeItem(cfg.storageKeyBackup); } catch (e) {}
  }
  return Writer.storage.open().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(cfg.storeName, 'readwrite');
      tx.objectStore(cfg.storeName).delete(name);
      tx.oncomplete = function () { resolve(name); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
};

/* True when html has no text, image or table. */
Writer.storage.isEmptyHtml = function isEmptyHtml(html) {
  var d = document.createElement('div');
  d.innerHTML = html || '';
  if (d.querySelector('img, table, hr, svg, canvas, video')) return false;
  return !(d.textContent || '').replace(/[\s\u00a0\u200b]+/g, '');
};

/* DF3: open doc was never stored and has nothing in it. */
Writer.storage.isBlankUnsaved = function isBlankUnsaved(html) {
  if (Writer.storage.loadedName) return false;
  if (Writer.hf && !Writer.hf.isEmpty()) return false;
  return Writer.storage.isEmptyHtml(html);
};

/* Write the open document under its name. If the name box changed, the record moves (rename).
   (before HOW1) this IndexedDB write was the native document save. Writer now replaces
   Draftly.storage.save from draftly-how.js (the original stays on saveLegacy). This body
   still runs for the HO2 check, which loads this file without draftly-how.js. */
Writer.storage.save = function save() {
  var cfg = Writer.config;
  if (!cfg || !Writer.pages) return Promise.resolve();
  var name = Writer.storage.fillNameIfEmpty();
  var holder = document.createElement('div');
  holder.innerHTML = Writer.pages.combinedHtml();
  if (Writer.editor) Writer.editor.stripMarks(holder);
  var html = holder.innerHTML;
  /* DF3: never store a blank, never-saved document. */
  if (Writer.storage.isBlankUnsaved(html)) return Promise.resolve(name);
  try {
    localStorage.setItem(
      cfg.storageKeyNonPrint,
      Writer.ui && Writer.ui.isNonPrinting() ? cfg.nonPrintOnValue : cfg.nonPrintOffValue
    );
  } catch (e) {}
  var saved = Writer.storage.open().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(cfg.storeName, 'readwrite');
      var store = tx.objectStore(cfg.storeName);
      var old = Writer.storage.loadedName;
      var rec = { name: name, html: html, hf: Writer.hf ? Writer.hf.get() : undefined, updated: Date.now() };
      /* DF15-B1 legacy (overwrote another saved document with the same name):
      store.put({ name: name, html: html, hf: Writer.hf ? Writer.hf.get() : undefined, updated: Date.now() });
      if (old && old !== name) store.delete(old);
      */
      /* DF15-B1: a new name that another document already has is never written over.
         Check and move happen in one transaction: put new, then delete old (no copy left, nothing lost). */
      var clash = false;
      if (name !== old && Writer.storage.replaceOk !== name) {
        var chk = store.get(name);
        chk.onsuccess = function () {
          if (chk.result) {
            clash = true;
            /* Keep the edits under the old name until the user decides. */
            if (old) { rec.name = old; store.put(rec); }
          } else {
            store.put(rec);
            if (old) store.delete(old);
          }
        };
      } else {
        store.put(rec);
        if (old && old !== name) store.delete(old);
      }
      tx.oncomplete = function () {
        if (Writer.storage.replaceOk === name) Writer.storage.replaceOk = '';
        if (clash) { Writer.storage.askNameClash(name, old); resolve(old || ''); return; }
        if (old && old !== name) {
          var b = Writer.storage.readBackup();
          if (b && b.name === old) { try { localStorage.removeItem(cfg.storageKeyBackup); } catch (e) {} }
        }
        Writer.storage.loadedName = name;
        try { localStorage.setItem(cfg.storageKeyLastName, name); } catch (e) {}
        resolve(name);
      };
      /* (before HO2) tx.onerror = function () { reject(tx.error); }; */
      tx.onerror = function () { reject(tx.error || new Error('IndexedDB failed')); };
    });
  }).then(function (savedName) {
    Writer.storage.noteSaved();
    return savedName;
  }, function (err) {
    Writer.storage.noteFailed(err);
    return Promise.reject(err);
  });
  /* Keep the rejection for callers, and stop an unhandled rejection when autosave ignores it. */
  saved.catch(function () {});
  return saved;
};

/* DF15-B1: name the user may replace on the next save (set only after a confirm). */
Writer.storage.replaceOk = '';
Writer.storage.clashOpen = false;

/* DF15-B1: first free "name (n)" among saved documents. */
Writer.storage.freeName = function freeName(name) {
  return Writer.storage.listDocs().then(function (rows) {
    var taken = {};
    rows.forEach(function (r) { taken[r.name] = true; });
    var base = name.replace(/ \(\d+\)$/, ''), n = 1;
    while (taken[base + ' (' + n + ')']) n++;
    return base + ' (' + n + ')';
  });
};

/* DF15-B1: three-button choice in the Office dialog style. Resolves 'use' | 'replace' | null. */
Writer.storage.clashDialog = function clashDialog(name, free) {
  return new Promise(function (resolve) {
    function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
    var back = el('div', 'dlg-backdrop'), box = el('div', 'dlg');
    box.setAttribute('role', 'alertdialog'); box.setAttribute('aria-modal', 'true');
    var t = el('div', 'dlg-title', 'Name already used'); t.id = 'dlgTitle'; box.setAttribute('aria-labelledby', 'dlgTitle');
    var m = el('div', 'dlg-message', 'A document named "' + name + '" already exists.'); m.id = 'dlgMsg'; box.setAttribute('aria-describedby', 'dlgMsg');
    var row = el('div', 'dlg-actions');
    var bc = el('button', 'dlg-btn dlg-cancel', 'Cancel');
    var br = el('button', 'dlg-btn dlg-cancel dlg-danger', 'Replace');
    var bu = el('button', 'dlg-btn dlg-ok', 'Use "' + free + '"');
    var btns = [bc, br, bu];
    btns.forEach(function (b) { b.type = 'button'; row.appendChild(b); });
    box.appendChild(t); box.appendChild(m); box.appendChild(row); back.appendChild(box);
    document.body.appendChild(back);
    var done = false;
    function close(v) { if (done) return; done = true; document.removeEventListener('keydown', onKey, true); back.remove(); resolve(v); }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
      else if (e.key === 'Tab') { e.preventDefault(); var i = btns.indexOf(document.activeElement); btns[(i + (e.shiftKey ? -1 : 1) + 3) % 3].focus(); }
    }
    document.addEventListener('keydown', onKey, true);
    bc.onclick = function () { close(null); };
    br.onclick = function () { close('replace'); };
    bu.onclick = function () { close('use'); };
    back.addEventListener('mousedown', function (e) { if (e.target === back) close(null); });
    bu.focus();
  });
};

/* DF15-B1: the typed name belongs to another document. Ask once; edits stay under the old name meanwhile. */
Writer.storage.askNameClash = function askNameClash(name, old) {
  var S = Writer.storage;
  if (S.clashOpen) return;
  S.clashOpen = true;
  var free = '';
  S.freeName(name).then(function (f) { free = f; return S.clashDialog(name, f); }).then(function (pick) {
    if (pick === 'use') return 'use';
    if (pick !== 'replace') return null;
    return Writer.dialog.confirm({ title: 'Replace document?', message: 'The other document "' + name + '" will be deleted and this one renamed to it. This cannot be undone.', okLabel: 'Replace', danger: true })
      .then(function (yes) { return yes ? 'replace' : null; });
  }).then(function (pick) {
    S.clashOpen = false;
    if (pick === 'use') { S.setCurrentName(free, false); }
    else if (pick === 'replace') { if (S.currentName() !== name) return; S.replaceOk = name; }
    else { S.setCurrentName(old || free, false); if (old) return; }
    return S.save().then(function (n) { if (Writer.ui && Writer.ui.showToast && n) Writer.ui.showToast('Renamed to ' + n); });
  }).catch(function () { S.clashOpen = false; });
};

/* Quick synchronous backup for page close; IndexedDB may not finish. */
Writer.storage.writeBackup = function writeBackup() {
  if (!Writer.pages) return;
  var holder = document.createElement('div');
  holder.innerHTML = Writer.pages.combinedHtml();
  if (Writer.editor) Writer.editor.stripMarks(holder);
  if (Writer.storage.isBlankUnsaved(holder.innerHTML)) return;
  try {
    localStorage.setItem(Writer.config.storageKeyBackup, JSON.stringify({
      name: Writer.storage.fillNameIfEmpty(), html: holder.innerHTML,
      hf: Writer.hf ? Writer.hf.get() : undefined, time: Date.now()
    }));
  /* (before HO2) } catch (e) {} */
  } catch (e) { Writer.storage.noteFailed(e); }
};

/* Read the backup, or null. */
Writer.storage.readBackup = function readBackup() {
  try {
    var raw = localStorage.getItem(Writer.config.storageKeyBackup);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
};

/* Read one document by name. Resolves null if missing. */
Writer.storage.getDoc = function getDoc(name) {
  var cfg = Writer.config;
  return Writer.storage.open().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(cfg.storeName, 'readonly');
      var req = tx.objectStore(cfg.storeName).get(name);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  });
};

/* Newest documents first. */
Writer.storage.listDocs = function listDocs() {
  var cfg = Writer.config;
  return Writer.storage.open().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(cfg.storeName, 'readonly');
      var req = tx.objectStore(cfg.storeName).getAll();
      req.onsuccess = function () {
        var rows = req.result || [];
        rows.sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
        resolve(rows);
      };
      req.onerror = function () { reject(req.error); };
    });
  });
};

/* Read non-printing flag. False if missing or blocked. */
Writer.storage.loadNonPrinting = function loadNonPrinting() {
  var cfg = Writer.config;
  try {
    return localStorage.getItem(cfg.storageKeyNonPrint) === cfg.nonPrintOnValue;
  } catch (e) {
    return false;
  }
};

/* True for a stored orientation value ('portrait' / 'landscape'). */
Writer.storage.isOrientation = function isOrientation(v) {
  return Writer.config.orientations.indexOf(v) !== -1;
};

/* One-time move of the old orientation pref. Until 2026-10-21 it was saved under the
   literal key 'undefined'. Copies it to storageKeyOrientation if that is empty, then
   removes the old key, but only when it holds an orientation value (anything else
   there belongs to some other page and is left alone). `ls` is for tests. */
Writer.storage.migrateOrientation = function migrateOrientation(ls) {
  var cfg = Writer.config;
  var oldKey = cfg.storageKeyOrientationLegacy;
  var newKey = cfg.storageKeyOrientation;
  if (!oldKey || !newKey || oldKey === newKey) return false;
  try {
    ls = ls || localStorage;
    var old = ls.getItem(oldKey);
    if (!Writer.storage.isOrientation(old)) return false;
    if (ls.getItem(newKey) === null) ls.setItem(newKey, old);
    ls.removeItem(oldKey);
    return true;
  } catch (e) {
    return false;
  }
};

/* Read orientation (after migrating the old key). Falls back to config default. */
Writer.storage.loadOrientation = function loadOrientation() {
  var cfg = Writer.config;
  Writer.storage.migrateOrientation();
  try {
    var orient = localStorage.getItem(cfg.storageKeyOrientation);
    if (Writer.storage.isOrientation(orient)) return orient;
  } catch (e) {}
  return cfg.defaultOrientation;
};

/* Persist orientation. */
Writer.storage.saveOrientation = function saveOrientation(mode) {
  var cfg = Writer.config;
  if (!Writer.storage.isOrientation(mode)) return;
  try {
    localStorage.setItem(cfg.storageKeyOrientation, mode);
  } catch (e) {}
};

/* Read paper size and margin preset. */
Writer.storage.loadPage = function loadPage() {
  var cfg = Writer.config;
  var out = { size: cfg.defaultPaperSize, margins: cfg.defaultMarginPreset };
  try {
    var s = localStorage.getItem(cfg.storageKeyPaperSize);
    var m = localStorage.getItem(cfg.storageKeyMarginPreset);
    if (cfg.paperSizes[s]) out.size = s;
    if (cfg.marginPresets[m] || m === 'custom') out.margins = m;
    var c = JSON.parse(localStorage.getItem(cfg.storageKeyMarginCustom) || 'null');
    if (c) out.custom = cfg.clampMargins(c);
  } catch (e) {}
  if (out.margins === 'custom' && !out.custom) out.margins = cfg.defaultMarginPreset;
  return out;
};

/* Persist paper size and margin preset. */
Writer.storage.savePage = function savePage(size, margins) {
  var cfg = Writer.config;
  try {
    localStorage.setItem(cfg.storageKeyPaperSize, size);
    localStorage.setItem(cfg.storageKeyMarginPreset, margins);
    if (margins === 'custom') localStorage.setItem(cfg.storageKeyMarginCustom, JSON.stringify(cfg.marginCustom));
  } catch (e) {}
};

/* Read theme. True when stored value is the dark token. */
Writer.storage.loadThemeDark = function loadThemeDark() {
  var cfg = Writer.config;
  try {
    return localStorage.getItem(cfg.storageKeyTheme) === cfg.themeDarkValue;
  } catch (e) {
    return false;
  }
};

/* Persist theme. */
Writer.storage.saveTheme = function saveTheme(dark) {
  var cfg = Writer.config;
  try {
    localStorage.setItem(cfg.storageKeyTheme, dark ? cfg.themeDarkValue : 'light');
  } catch (e) {}
};
