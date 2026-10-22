/*
 * TV: import (tv/core/tv_import.js), TV7
 * The "Import" tile in More opens a small panel: open a .m3u / .m3u8 file,
 * drop one anywhere on the page, or paste a playlist URL. The list is
 * parsed with TV.playlist.parseM3U, saved in IndexedDB ('tv-import-v1':
 * raw text + name / url) and shown as the 'import' category. tv.html#import
 * opens the panel (and the saved list). Panel text is set with textContent
 * only. Loaded before tv_app.js (which starts the player).
 */
(function () {
  'use strict';
  var TV = window.TV;
  var config = TV.config;
  var state = TV.state;

  var CATEGORY = 'import';
  var STORE = 'playlist';
  var KEY = 'current';
  var saved = null; // {name, url, text, count, savedAt} or null
  var panel = null; // built on first open
  var els = {};
  var busy = false;

  // ---------- IndexedDB (one record) ----------
  var dbPromise = null;
  function openDb() {
    if (!dbPromise) {
      dbPromise = new Promise(function (resolve, reject) {
        if (!window.indexedDB) { reject(new Error('No IndexedDB')); return; }
        var req;
        try { req = window.indexedDB.open(config.IMPORT_DB, 1); } catch (e) { reject(e); return; }
        req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error('IndexedDB open failed')); };
        req.onblocked = function () { reject(new Error('IndexedDB blocked')); };
      });
      dbPromise.catch(function () { dbPromise = null; }); // retry next time
    }
    return dbPromise;
  }

  function run(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var req = fn(tx.objectStore(STORE));
        tx.oncomplete = function () { resolve(req.result); };
        tx.onerror = tx.onabort = function () { reject(tx.error || req.error || new Error('IndexedDB failed')); };
      });
    });
  }

  var db = {
    get: function () { return run('readonly', function (s) { return s.get(KEY); }); },
    put: function (rec) { return run('readwrite', function (s) { return s.put(rec, KEY); }); },
    del: function () { return run('readwrite', function (s) { return s.delete(KEY); }); }
  };

  // The saved list, read once at start (null when none / storage blocked).
  var ready = db.get().then(function (rec) {
    saved = rec && typeof rec.text === 'string' ? rec : null;
  }, function (err) {
    console.warn('Import: no saved list (' + (err && err.message) + ')');
  });

  // Text for TV.playlist.load('import').
  function source() {
    return ready.then(function () {
      if (saved) return saved.text;
      var err = new Error('Nothing imported');
      err.toast = 'Nothing imported yet';
      throw err;
    });
  }
  TV.playlist.registerSource(CATEGORY, source);

  // ---------- import ----------
  // A single HLS stream (segments / variants), not a channel list.
  function isStream(text) {
    return /#EXT-X-(TARGETDURATION|STREAM-INF|MEDIA-SEQUENCE)/i.test(text);
  }

  function baseName(path) {
    var last = String(path || '').split(/[\\/]/).filter(Boolean).pop() || '';
    try { last = decodeURIComponent(last); } catch (e) { /* keep raw */ }
    return last.replace(/\.m3u8?$/i, '');
  }

  // Parse, save, show. meta: {name, url}. Resolves true when imported.
  function importText(text, meta) {
    meta = meta || {};
    var name = meta.name || 'Import';
    text = String(text || '').replace(/^\uFEFF/, '');
    if (isStream(text)) {
      if (!meta.url) {
        TV.ui.toast(name + ' is one video stream, not a channel list');
        return Promise.resolve(false);
      }
      text = '#EXTM3U\n#EXTINF:-1,' + name + '\n' + meta.url + '\n';
    }
    var channels = TV.playlist.parseM3U(text);
    if (!channels.length) {
      TV.ui.toast('No channels in ' + name);
      return Promise.resolve(false);
    }
    saved = { name: name, url: meta.url || '', text: text, count: channels.length, savedAt: Date.now() };
    return db.put(saved).then(null, function (err) {
      console.warn('Import: not saved', err);
      TV.ui.toast('Imported for this visit only (could not save)');
    }).then(function () {
      closePanel();
      TV.playlist.load(CATEGORY);
      return true;
    });
  }

  function importFile(file) {
    if (!file) return Promise.resolve(false);
    var name = baseName(file.name) || 'Import';
    if (file.size > config.IMPORT_MAX_BYTES) {
      TV.ui.toast(name + ' is too large');
      return Promise.resolve(false);
    }
    return file.text().then(function (text) {
      if (!/\.m3u8?$/i.test(file.name || '') && text.indexOf('#EXTINF') < 0) {
        TV.ui.toast(name + ' is not an .m3u playlist');
        return false;
      }
      return importText(text, { name: name });
    }, function (err) {
      console.error(err);
      TV.ui.toast('Could not read ' + name);
      return false;
    });
  }

  function importUrl(raw) {
    raw = String(raw || '').trim();
    if (!raw) { TV.ui.toast('Enter a playlist URL'); return Promise.resolve(false); }
    var u;
    try {
      u = location.protocol === 'file:' ? new URL(raw) : new URL(raw, location.href);
    } catch (e) {
      TV.ui.toast('Not a valid URL');
      return Promise.resolve(false);
    }
    if (!/^https?:$/.test(u.protocol)) {
      TV.ui.toast('Enter an http:// or https:// URL');
      return Promise.resolve(false);
    }
    if (TV.env.secure && u.protocol === 'http:') {
      TV.ui.toast('http:// URLs are blocked on https pages');
      return Promise.resolve(false);
    }
    if (busy) return Promise.resolve(false);
    busy = true;
    setStatus('Loading ' + u.href + ' …');
    return fetch(u.href).then(function (res) {
      if (!res.ok) {
        var err = new Error('HTTP ' + res.status);
        err.toast = 'Could not load URL (HTTP ' + res.status + ')';
        throw err;
      }
      return res.text();
    }).then(function (text) {
      return importText(text, { name: baseName(u.pathname) || u.host, url: u.href });
    }).then(null, function (err) {
      console.error('Import URL failed: ' + u.href, err);
      TV.ui.toast(err.toast || 'Could not load URL (blocked by CORS or offline)');
      return false;
    }).then(function (ok) {
      busy = false;
      renderStatus();
      return ok;
    });
  }

  function clear() {
    saved = null;
    return db.del().then(null, function () { /* nothing saved */ }).then(function () {
      try {
        var last = JSON.parse(localStorage.getItem(config.STORAGE_KEY) || 'null');
        if (last && last.category === CATEGORY) localStorage.removeItem(config.STORAGE_KEY);
      } catch (e) { /* ignore */ }
      TV.ui.toast('Import cleared');
      renderStatus();
      if (state.currentCategory === CATEGORY) TV.playlist.load('more');
    });
  }

  function hasSaved() {
    return ready.then(function () { return !!saved; });
  }

  // ---------- panel ----------
  function make(tag, cls, text) {
    var el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text) el.textContent = text;
    return el;
  }

  function button(act, text) {
    var b = make('button', 'import-btn', text);
    b.type = 'button';
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      doAction(act);
    });
    return b;
  }

  function buildPanel() {
    panel = make('div', 'import-panel');
    panel.id = 'import-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Import playlist');
    panel.hidden = true;
    var box = make('div', 'import-box');
    els.title = make('div', 'import-title', 'Import playlist');
    els.status = make('div', 'import-status');
    els.show = button('show', 'Show channels');
    els.file = button('file', 'Open file (.m3u / .m3u8)');
    var row = make('div', 'import-url-row');
    els.url = make('input', 'import-url');
    els.url.type = 'url';
    els.url.placeholder = 'Playlist URL (https://…)';
    els.url.setAttribute('aria-label', 'Playlist URL');
    els.load = button('url', 'Load URL');
    row.appendChild(els.url);
    row.appendChild(els.load);
    els.clear = button('clear', 'Clear saved list');
    els.close = button('close', 'Close');
    els.hint = make('div', 'import-hint', 'Or drop a .m3u file anywhere on the page. A new file or URL replaces the saved list.');
    els.input = make('input', 'import-file');
    els.input.type = 'file';
    els.input.accept = '.m3u,.m3u8,audio/x-mpegurl,application/x-mpegurl,application/vnd.apple.mpegurl';
    els.input.addEventListener('change', function () {
      var f = els.input.files && els.input.files[0];
      els.input.value = '';
      importFile(f);
    });
    [els.title, els.status, els.show, els.file, row, els.clear, els.close, els.hint, els.input].forEach(function (el) {
      box.appendChild(el);
    });
    panel.appendChild(box);
    panel.addEventListener('click', function (e) {
      e.stopPropagation(); // don't open the grid under the panel
      if (e.target === panel) closePanel();
    });
    document.body.appendChild(panel);
  }

  function setStatus(text) {
    if (els.status) els.status.textContent = text;
  }

  function renderStatus() {
    if (!panel) return;
    setStatus(saved ?
      'Saved: ' + saved.name + ' (' + saved.count + ' channel' + (saved.count === 1 ? '' : 's') + ')' :
      'Nothing imported yet');
    els.show.hidden = !saved;
    els.clear.hidden = !saved;
  }

  function focusables() {
    return [els.show, els.file, els.url, els.load, els.clear, els.close].filter(function (el) {
      return !el.hidden;
    });
  }

  function openPanel() {
    if (!panel) buildPanel();
    renderStatus();
    panel.hidden = false;
    var first = focusables()[0];
    if (first && first.focus) first.focus();
    return ready.then(renderStatus);
  }

  function closePanel() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    TV.ui.showList();
  }

  function isOpen() {
    return !!panel && !panel.hidden;
  }

  function doAction(act) {
    if (act === 'show') {
      closePanel();
      if (state.currentCategory !== CATEGORY) TV.playlist.load(CATEGORY);
    } else if (act === 'file') {
      els.input.click();
    } else if (act === 'url') {
      importUrl(els.url.value);
    } else if (act === 'clear') {
      clear().then(function () {
        var first = focusables()[0];
        if (first && first.focus) first.focus();
      });
    } else if (act === 'close') {
      closePanel();
    }
  }

  // Remote / keyboard while the panel is open (called by tv_input.js):
  // Up / Down (and Left / Right outside the text box) move between
  // controls, Enter presses, Back / Escape closes.
  function onKey(e) {
    var list = focusables();
    var i = list.indexOf(document.activeElement);
    var inText = document.activeElement === els.url;
    var k = e.key;
    if (k === 'Escape' || k === 'GoBack' || k === 'BrowserBack' || (k === 'Backspace' && !inText)) {
      e.preventDefault();
      closePanel();
    } else if (k === 'ArrowDown' || (!inText && k === 'ArrowRight')) {
      e.preventDefault();
      list[(i + 1) % list.length].focus();
    } else if (k === 'ArrowUp' || (!inText && k === 'ArrowLeft')) {
      e.preventDefault();
      list[(i - 1 + list.length) % list.length].focus();
    } else if (k === 'Enter' && inText) {
      e.preventDefault();
      importUrl(els.url.value);
    } else if (k === 'Enter' && i < 0) {
      e.preventDefault();
      if (list[0]) list[0].focus();
    }
    // Enter / Space on a button: the browser clicks it.
  }

  // ---------- drag and drop (anywhere on the page) ----------
  function hasFiles(e) {
    var types = e.dataTransfer && e.dataTransfer.types;
    return !!types && Array.prototype.indexOf.call(types, 'Files') >= 0;
  }
  window.addEventListener('dragover', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    document.body.classList.add('import-drop');
  });
  window.addEventListener('dragleave', function (e) {
    if (!e.relatedTarget) document.body.classList.remove('import-drop');
  });
  window.addEventListener('drop', function (e) {
    var files = e.dataTransfer && e.dataTransfer.files;
    document.body.classList.remove('import-drop');
    if (!files || !files.length) return;
    e.preventDefault(); // don't open the file in the tab
    importFile(files[0]);
  });

  // ---------- deep link tv.html#import ----------
  function isDeepLink() {
    return location.hash === '#import';
  }
  window.addEventListener('hashchange', function () {
    if (isDeepLink()) openPanel();
  });

  TV.actions = TV.actions || {};
  TV.actions['import'] = openPanel;

  TV['import'] = {
    importText: importText,
    importFile: importFile,
    importUrl: importUrl,
    clear: clear,
    hasSaved: hasSaved,
    current: function () { return saved; },
    openPanel: openPanel,
    closePanel: closePanel,
    isOpen: isOpen,
    onKey: onKey,
    isDeepLink: isDeepLink,
    isStream: isStream,
    ready: ready
  };
})();
