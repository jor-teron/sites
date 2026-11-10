/* Remote — rm_ssh_known.js: accepted SSH host-key fingerprints and the terminal font size,
 * stored under Remote's own localStorage keys. No DOM, so node can unit-test it.
 * Fingerprints live in LS_SSH_KNOWN (a map of "host:port" -> { alg, fp, first, last }).
 * The font size lives in LS_SSH_FONT. Passwords are never stored. This module does not
 * read or write the SSH app's storage keys.
 */
(function (root) {
  'use strict';

  /* Config is loaded first in the page; tests pass it in via the same global or require. */
  var C = root.RM_CONFIG || (typeof require === 'function' ? require('./rm_config.js') : {});

  /* Trim and cap a value so stored strings stay short and safe. */
  function str(v, max) {
    return String(v == null ? '' : v).trim().slice(0, max);
  }

  /**
   * Stable id for a host key entry, e.g. "box:22" or "[2001:db8::1]:22".
   * The host is lower-cased and IPv6 brackets are normalized.
   */
  function hostId(host, port) {
    var h = str(host, C.MAX_HOST || 255).toLowerCase().replace(/^\[|\]$/g, '');
    var p = parseInt(port, 10) || (C.DEFAULT_PORTS && C.DEFAULT_PORTS.ssh) || 22;
    return (h.indexOf(':') >= 0 ? '[' + h + ']' : h) + ':' + p;
  }

  /* Clamp a font size into the allowed range, or the default when the value is not a number. */
  function clampFont(n) {
    var v = parseInt(n, 10);
    var min = C.SSH_FONT_MIN || 9;
    var max = C.SSH_FONT_MAX || 28;
    var def = C.SSH_FONT_DEFAULT || 15;
    if (!v) return def;
    if (v < min) return min;
    if (v > max) return max;
    return v;
  }

  /* True when a stored entry looks like a real fingerprint record. */
  function validKey(e) {
    return !!(e && typeof e === 'object' && typeof e.fp === 'string' && /^SHA256:/.test(e.fp) && typeof e.alg === 'string');
  }

  /* Build a known-hosts + font store bound to a storage object (localStorage, or a fake in tests). */
  function make(storage, now) {
    /* Clock used for first/last seen; tests can pass a fixed function. */
    now = now || function () { return Date.now(); };
    /* In-memory fallback used when storage.setItem throws (private mode, quota). */
    var mem = {};

    /* Read a JSON value, or def when the key is missing or corrupt. */
    function read(k, def) {
      var raw = null;
      try { raw = storage.getItem(k); } catch (e) { raw = null; }
      if (raw == null) return Object.prototype.hasOwnProperty.call(mem, k) ? JSON.parse(mem[k]) : def;
      try { return JSON.parse(raw); } catch (e) { return def; }
    }

    /* Write a JSON value, keeping an in-memory copy if storage fails. */
    function write(k, v) {
      var s = JSON.stringify(v);
      mem[k] = s;
      try { storage.setItem(k, s); } catch (e) { /* keep the in-memory copy */ }
    }

    /* Load the fingerprint map, dropping entries that are not valid. */
    function kmap() {
      var key = C.LS_SSH_KNOWN || 'remote-known-hosts-v1';
      var m = read(key, {});
      var out = {};
      if (m && typeof m === 'object' && !Array.isArray(m)) {
        Object.keys(m).forEach(function (id) {
          if (validKey(m[id])) out[id] = m[id];
        });
      }
      return out;
    }

    /* Persist the fingerprint map. */
    function saveMap(m) {
      write(C.LS_SSH_KNOWN || 'remote-known-hosts-v1', m);
    }

    /* Compare a live fingerprint with the saved one: 'known', 'new', or 'changed'. */
    function check(id, info) {
      var e = kmap()[id];
      if (!e) return { status: 'new', entry: null };
      var same = e.fp === info.fp && e.alg === info.alg;
      return { status: same ? 'known' : 'changed', entry: e };
    }

    /* Remember (or replace) a fingerprint, keeping the original first-seen time when it is unchanged. */
    function trust(id, info) {
      var m = kmap();
      var t = now();
      var old = m[id];
      var same = old && old.fp === info.fp && old.alg === info.alg;
      m[id] = {
        alg: str(info.alg, 64),
        fp: str(info.fp, 128),
        first: same ? old.first : t,
        last: t
      };
      saveMap(m);
      return m[id];
    }

    /* Update the last-seen time of an already-trusted host. */
    function seen(id) {
      var m = kmap();
      if (m[id]) {
        m[id].last = now();
        saveMap(m);
      }
    }

    /* Drop one saved fingerprint so the next connect will ask again. */
    function forget(id) {
      var m = kmap();
      delete m[id];
      saveMap(m);
    }

    /* Drop every saved fingerprint. */
    function forgetAll() {
      saveMap({});
    }

    /* List saved fingerprints, sorted by id, each with its id field filled in. */
    function list() {
      var m = kmap();
      return Object.keys(m).sort().map(function (id) {
        return Object.assign({ id: id }, m[id]);
      });
    }

    /* Read the saved terminal font size, or the default. */
    function getFont() {
      var key = C.LS_SSH_FONT || 'remote-ssh-font-v1';
      return clampFont(read(key, C.SSH_FONT_DEFAULT || 15));
    }

    /* Save a clamped terminal font size and return it. */
    function setFont(n) {
      var key = C.LS_SSH_FONT || 'remote-ssh-font-v1';
      var v = clampFont(n);
      write(key, v);
      return v;
    }

    return {
      hostId: hostId,
      check: check,
      trust: trust,
      seen: seen,
      forget: forget,
      forgetAll: forgetAll,
      list: list,
      getFont: getFont,
      setFont: setFont,
      clampFont: clampFont
    };
  }

  /* Public API, also exported for Node tests. */
  var api = { make: make, hostId: hostId, clampFont: clampFont };
  root.RMSshKnown = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
