/* ============================================================
   FILE: modules/draftly-storage.js
   PROJECT: Draftly
   ROLE: IndexedDB documents, plus theme and orientation flags.
         DF3: save() skips a never-stored blank document (no text,
         image or table in body, header or footer).
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

/* True when html has no text, image or table. */
Draftly.storage.isEmptyHtml = function isEmptyHtml(html) {
  var d = document.createElement('div');
  d.innerHTML = html || '';
  if (d.querySelector('img, table, hr, svg, canvas, video')) return false;
  return !(d.textContent || '').replace(/[\s\u00a0\u200b]+/g, '');
};

/* DF3: open doc was never stored and has nothing in it. */
Draftly.storage.isBlankUnsaved = function isBlankUnsaved(html) {
  if (Draftly.storage.loadedName) return false;
  if (Draftly.hf && !Draftly.hf.isEmpty()) return false;
  return Draftly.storage.isEmptyHtml(html);
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
  /* DF3: never store a blank, never-saved document. */
  if (Draftly.storage.isBlankUnsaved(html)) return Promise.resolve(name);
  try {
    localStorage.setItem(
      cfg.storageKeyNonPrint,
      Draftly.ui && Draftly.ui.isNonPrinting() ? cfg.nonPrintOnValue : cfg.nonPrintOffValue
    );
  } catch (e) {}
  return Draftly.storage.open().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(cfg.storeName, 'readwrite');
      var store = tx.objectStore(cfg.storeName);
      var old = Draftly.storage.loadedName;
      var rec = { name: name, html: html, hf: Draftly.hf ? Draftly.hf.get() : undefined, updated: Date.now() };
      /* DF15-B1 legacy (overwrote another saved document with the same name):
      store.put({ name: name, html: html, hf: Draftly.hf ? Draftly.hf.get() : undefined, updated: Date.now() });
      if (old && old !== name) store.delete(old);
      */
      /* DF15-B1: a new name that another document already has is never written over.
         Check and move happen in one transaction: put new, then delete old (no copy left, nothing lost). */
      var clash = false;
      if (name !== old && Draftly.storage.replaceOk !== name) {
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
        if (Draftly.storage.replaceOk === name) Draftly.storage.replaceOk = '';
        if (clash) { Draftly.storage.askNameClash(name, old); resolve(old || ''); return; }
        if (old && old !== name) {
          var b = Draftly.storage.readBackup();
          if (b && b.name === old) { try { localStorage.removeItem(cfg.storageKeyBackup); } catch (e) {} }
        }
        Draftly.storage.loadedName = name;
        try { localStorage.setItem(cfg.storageKeyLastName, name); } catch (e) {}
        resolve(name);
      };
      tx.onerror = function () { reject(tx.error); };
    });
  });
};

/* DF15-B1: name the user may replace on the next save (set only after a confirm). */
Draftly.storage.replaceOk = '';
Draftly.storage.clashOpen = false;

/* DF15-B1: first free "name (n)" among saved documents. */
Draftly.storage.freeName = function freeName(name) {
  return Draftly.storage.listDocs().then(function (rows) {
    var taken = {};
    rows.forEach(function (r) { taken[r.name] = true; });
    var base = name.replace(/ \(\d+\)$/, ''), n = 1;
    while (taken[base + ' (' + n + ')']) n++;
    return base + ' (' + n + ')';
  });
};

/* DF15-B1: three-button choice in the Office dialog style. Resolves 'use' | 'replace' | null. */
Draftly.storage.clashDialog = function clashDialog(name, free) {
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
Draftly.storage.askNameClash = function askNameClash(name, old) {
  var S = Draftly.storage;
  if (S.clashOpen) return;
  S.clashOpen = true;
  var free = '';
  S.freeName(name).then(function (f) { free = f; return S.clashDialog(name, f); }).then(function (pick) {
    if (pick === 'use') return 'use';
    if (pick !== 'replace') return null;
    return Draftly.dialog.confirm({ title: 'Replace document?', message: 'The other document "' + name + '" will be deleted and this one renamed to it. This cannot be undone.', okLabel: 'Replace', danger: true })
      .then(function (yes) { return yes ? 'replace' : null; });
  }).then(function (pick) {
    S.clashOpen = false;
    if (pick === 'use') { S.setCurrentName(free, false); }
    else if (pick === 'replace') { if (S.currentName() !== name) return; S.replaceOk = name; }
    else { S.setCurrentName(old || free, false); if (old) return; }
    return S.save().then(function (n) { if (Draftly.ui && Draftly.ui.showToast && n) Draftly.ui.showToast('Renamed to ' + n); });
  }).catch(function () { S.clashOpen = false; });
};

/* Quick synchronous backup for page close; IndexedDB may not finish. */
Draftly.storage.writeBackup = function writeBackup() {
  if (!Draftly.pages) return;
  var holder = document.createElement('div');
  holder.innerHTML = Draftly.pages.combinedHtml();
  if (Draftly.editor) Draftly.editor.stripMarks(holder);
  if (Draftly.storage.isBlankUnsaved(holder.innerHTML)) return;
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

/* True for a stored orientation value ('portrait' / 'landscape'). */
Draftly.storage.isOrientation = function isOrientation(v) {
  return Draftly.config.orientations.indexOf(v) !== -1;
};

/* One-time move of the old orientation pref. Until 2026-10-21 it was saved under the
   literal key 'undefined'. Copies it to storageKeyOrientation if that is empty, then
   removes the old key, but only when it holds an orientation value (anything else
   there belongs to some other page and is left alone). `ls` is for tests. */
Draftly.storage.migrateOrientation = function migrateOrientation(ls) {
  var cfg = Draftly.config;
  var oldKey = cfg.storageKeyOrientationLegacy;
  var newKey = cfg.storageKeyOrientation;
  if (!oldKey || !newKey || oldKey === newKey) return false;
  try {
    ls = ls || localStorage;
    var old = ls.getItem(oldKey);
    if (!Draftly.storage.isOrientation(old)) return false;
    if (ls.getItem(newKey) === null) ls.setItem(newKey, old);
    ls.removeItem(oldKey);
    return true;
  } catch (e) {
    return false;
  }
};

/* Read orientation (after migrating the old key). Falls back to config default. */
Draftly.storage.loadOrientation = function loadOrientation() {
  var cfg = Draftly.config;
  Draftly.storage.migrateOrientation();
  try {
    var orient = localStorage.getItem(cfg.storageKeyOrientation);
    if (Draftly.storage.isOrientation(orient)) return orient;
  } catch (e) {}
  return cfg.defaultOrientation;
};

/* Persist orientation. */
Draftly.storage.saveOrientation = function saveOrientation(mode) {
  var cfg = Draftly.config;
  if (!Draftly.storage.isOrientation(mode)) return;
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
