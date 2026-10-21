/* ============================================================
   FILE: modules/draftly-storage.js
   PROJECT: Draftly
   ROLE: IndexedDB documents, plus theme and orientation flags.
   DEPENDS: Draftly.config
   ISOLATION: Failures are swallowed. A bad store does not
              stop the editor from opening.
   ============================================================ */

/* Shared namespace. */
var Draftly = window.Draftly || {};
window.Draftly = Draftly;

/* Storage helpers. Other modules call these; they do not touch keys. */
Draftly.storage = {};

/* Open IndexedDB handle, cached after the first success. */
Draftly.storage.dbPromise = null;

/* Open or create the document database. */
Draftly.storage.open = function open() {
  if (Draftly.storage.dbPromise) return Draftly.storage.dbPromise;
  Draftly.storage.dbPromise = new Promise(function (resolve, reject) {
    var cfg = Draftly.config;
    var req = indexedDB.open(cfg.dbName, cfg.dbVersion);
    req.onupgradeneeded = function () {
      var db = req.result;
      if (!db.objectStoreNames.contains(cfg.storeName)) {
        db.createObjectStore(cfg.storeName, { keyPath: 'name' });
      }
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error); };
  });
  return Draftly.storage.dbPromise;
};

/* Build Doc_YYYY_MM_DD_HH-MM from local time. No colon. */
Draftly.storage.makeName = function makeName(date) {
  var d = date || new Date();
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  return Draftly.config.namePrefix +
    d.getFullYear() + '_' + pad(d.getMonth() + 1) + '_' + pad(d.getDate()) + '_' +
    pad(d.getHours()) + '-' + pad(d.getMinutes());
};

/* Name currently in the toolbar box. Empty string if missing. */
Draftly.storage.currentName = function currentName() {
  var input = document.getElementById('fileNameInput');
  return input ? input.value.trim() : '';
};

/* Put a name in the box. Persist only when asked. */
Draftly.storage.setCurrentName = function setCurrentName(name, persist) {
  var input = document.getElementById('fileNameInput');
  if (input) input.value = name;
  if (persist) {
    Draftly.storage.loadedName = name;
    try { localStorage.setItem(Draftly.config.storageKeyLastName, name); } catch (e) {}
  }
};

/* Fill the name box only when it is empty. */
Draftly.storage.fillNameIfEmpty = function fillNameIfEmpty() {
  if (!Draftly.storage.currentName()) {
    Draftly.storage.setCurrentName(Draftly.storage.makeName());
  }
  return Draftly.storage.currentName();
};

/* Name the open document was loaded or last saved under ('' = never saved). */
Draftly.storage.loadedName = '';

/* Delete one document by name. */
Draftly.storage.deleteDoc = function deleteDoc(name) {
  var cfg = Draftly.config;
  var backup = Draftly.storage.readBackup();
  if (backup && backup.name === name) {
    try { localStorage.removeItem(cfg.storageKeyBackup); } catch (e) {}
  }
  return Draftly.storage.open().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(cfg.storeName, 'readwrite');
      tx.objectStore(cfg.storeName).delete(name);
      tx.oncomplete = function () { resolve(name); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
};

/* Write the open document under its name. If the name box changed, the record moves (rename). */
Draftly.storage.save = function save() {
  var cfg = Draftly.config;
  if (!cfg || !Draftly.pages) return Promise.resolve();
  var name = Draftly.storage.fillNameIfEmpty();
  var holder = document.createElement('div');
  holder.innerHTML = Draftly.pages.combinedHtml();
  if (Draftly.editor) Draftly.editor.stripMarks(holder);
  var html = holder.innerHTML;
  try {
    localStorage.setItem(
      cfg.storageKeyNonPrint,
      Draftly.ui && Draftly.ui.isNonPrinting() ? cfg.nonPrintOnValue : cfg.nonPrintOffValue
    );
    localStorage.setItem(cfg.storageKeyLastName, name);
  } catch (e) {}
  return Draftly.storage.open().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(cfg.storeName, 'readwrite');
      var store = tx.objectStore(cfg.storeName);
      var old = Draftly.storage.loadedName;
      store.put({ name: name, html: html, hf: Draftly.hf ? Draftly.hf.get() : undefined, updated: Date.now() });
      if (old && old !== name) store.delete(old);
      tx.oncomplete = function () {
        if (old && old !== name) {
          var b = Draftly.storage.readBackup();
          if (b && b.name === old) { try { localStorage.removeItem(cfg.storageKeyBackup); } catch (e) {} }
        }
        Draftly.storage.loadedName = name;
        resolve(name);
      };
      tx.onerror = function () { reject(tx.error); };
    });
  });
};

/* Quick synchronous backup for page close; IndexedDB may not finish. */
Draftly.storage.writeBackup = function writeBackup() {
  if (!Draftly.pages) return;
  var holder = document.createElement('div');
  holder.innerHTML = Draftly.pages.combinedHtml();
  if (Draftly.editor) Draftly.editor.stripMarks(holder);
  try {
    localStorage.setItem(Draftly.config.storageKeyBackup, JSON.stringify({
      name: Draftly.storage.fillNameIfEmpty(), html: holder.innerHTML,
      hf: Draftly.hf ? Draftly.hf.get() : undefined, time: Date.now()
    }));
  } catch (e) {}
};

/* Read the backup, or null. */
Draftly.storage.readBackup = function readBackup() {
  try {
    var raw = localStorage.getItem(Draftly.config.storageKeyBackup);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
};

/* Read one document by name. Resolves null if missing. */
Draftly.storage.getDoc = function getDoc(name) {
  var cfg = Draftly.config;
  return Draftly.storage.open().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(cfg.storeName, 'readonly');
      var req = tx.objectStore(cfg.storeName).get(name);
      req.onsuccess = function () { resolve(req.result || null); };
      req.onerror = function () { reject(req.error); };
    });
  });
};

/* Newest documents first. */
Draftly.storage.listDocs = function listDocs() {
  var cfg = Draftly.config;
  return Draftly.storage.open().then(function (db) {
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
Draftly.storage.loadNonPrinting = function loadNonPrinting() {
  var cfg = Draftly.config;
  try {
    return localStorage.getItem(cfg.storageKeyNonPrint) === cfg.nonPrintOnValue;
  } catch (e) {
    return false;
  }
};

/* Read orientation. Falls back to config default. */
Draftly.storage.loadOrientation = function loadOrientation() {
  var cfg = Draftly.config;
  try {
    var orient = localStorage.getItem(cfg.storageKeyOrientation);
    if (orient === 'landscape' || orient === 'portrait') return orient;
  } catch (e) {}
  return cfg.defaultOrientation;
};

/* Persist orientation. */
Draftly.storage.saveOrientation = function saveOrientation(mode) {
  var cfg = Draftly.config;
  try {
    localStorage.setItem(cfg.storageKeyOrientation, mode);
  } catch (e) {}
};

/* Read paper size and margin preset. */
Draftly.storage.loadPage = function loadPage() {
  var cfg = Draftly.config;
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
Draftly.storage.savePage = function savePage(size, margins) {
  var cfg = Draftly.config;
  try {
    localStorage.setItem(cfg.storageKeyPaperSize, size);
    localStorage.setItem(cfg.storageKeyMarginPreset, margins);
    if (margins === 'custom') localStorage.setItem(cfg.storageKeyMarginCustom, JSON.stringify(cfg.marginCustom));
  } catch (e) {}
};

/* Read theme. True when stored value is the dark token. */
Draftly.storage.loadThemeDark = function loadThemeDark() {
  var cfg = Draftly.config;
  try {
    return localStorage.getItem(cfg.storageKeyTheme) === cfg.themeDarkValue;
  } catch (e) {
    return false;
  }
};

/* Persist theme. */
Draftly.storage.saveTheme = function saveTheme(dark) {
  var cfg = Draftly.config;
  try {
    localStorage.setItem(cfg.storageKeyTheme, dark ? cfg.themeDarkValue : 'light');
  } catch (e) {}
};
