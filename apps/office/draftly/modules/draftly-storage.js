/* ============================================================
   FILE: modules/draftly-storage.js
   PROJECT: Draftly
   ROLE: Load and save editor HTML, theme flag, and marks flag.
   DEPENDS: Draftly.config
   ISOLATION: Failures are swallowed. A bad store does not
              stop the editor from opening.
   ============================================================ */

/* Shared namespace. */
var Draftly = window.Draftly || {};
window.Draftly = Draftly;

/* Storage helpers. Other modules call these; they do not touch keys. */
Draftly.storage = {};

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

/* Write the open document under its name. Overwrites that name. */
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
      tx.objectStore(cfg.storeName).put({ name: name, html: html, updated: Date.now() });
      tx.oncomplete = function () { resolve(name); };
      tx.onerror = function () { reject(tx.error); };
    });
  });
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
