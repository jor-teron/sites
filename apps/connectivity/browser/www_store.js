/* Web Browser — www_store.js: WWW1 localStorage wrapper. Every key starts with browser_. Storage may be blocked (file://, private mode); then data lives for this visit only. */
(function (root) {
  'use strict';

  var C = root.WWW_CONFIG || (typeof require === 'function' ? require('./www_config.js') : null);

  /* storage: a localStorage-like object (getItem/setItem/removeItem); tests pass an in-memory one. */
  function createStore(storage) {
    var mem = {};
    function get(key, fallback) {
      var raw = null;
      var memRaw = Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
      try { raw = storage ? storage.getItem(key) : null; } catch (_) { raw = null; }
      if (raw == null) raw = memRaw;
      if (raw == null) return fallback;
      try { return JSON.parse(raw); } catch (_) {
        /* Corrupt saved value: use this visit's copy if there is one. */
        try { return memRaw != null ? JSON.parse(memRaw) : fallback; } catch (__) { return fallback; }
      }
    }
    function set(key, value) {
      if (key.indexOf(C.LS_PREFIX) !== 0) throw new Error('key must start with ' + C.LS_PREFIX);
      var raw = JSON.stringify(value);
      mem[key] = raw;
      try { if (storage) storage.setItem(key, raw); } catch (_) { /* quota or blocked: memory copy kept */ }
    }
    function has(key) {
      try { if (storage && storage.getItem(key) != null) return true; } catch (_) { /* blocked */ }
      return Object.prototype.hasOwnProperty.call(mem, key);
    }
    function arr(v) { return Array.isArray(v) ? v : []; }
    return {
      bookmarks: function () {
        if (!has(C.LS_BOOKMARKS)) return C.SEED_BOOKMARKS.slice();
        return arr(get(C.LS_BOOKMARKS, [])).filter(function (b) { return b && typeof b.url === 'string'; });
      },
      saveBookmarks: function (list) { set(C.LS_BOOKMARKS, list); },
      history: function () {
        return arr(get(C.LS_HISTORY, [])).filter(function (e) { return e && typeof e.url === 'string'; });
      },
      saveHistory: function (list) { set(C.LS_HISTORY, list); },
      settings: function () { return get(C.LS_SETTINGS, null); },
      saveSettings: function (s) { set(C.LS_SETTINGS, s); },
      tabs: function () { return get(C.LS_TABS, null); },
      saveTabs: function (t) { set(C.LS_TABS, t); }
    };
  }

  var WWW_STORE = { createStore: createStore };
  root.WWW_STORE = WWW_STORE;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = WWW_STORE;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
