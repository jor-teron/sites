/* Remote — rm_store.js: saved connections in localStorage 'remote-conns-v1'. No DOM, so node can unit-test it.
 * Each entry is { id, name, protocol, host, port, user, relay, token?, group, notes }. Passwords are never stored.
 * An optional relay token is stored only when the user saves it (editor, or the connect-sheet tick box).
 * This app is standalone: it does not read SSH or VNC storage keys, and it does not link to those apps.
 * Store.make(storage, now) -> { list, get, save, remove, duplicate, exportJSON, importJSON, search, grouped,
 *   clean, defaultPort, portAfterProtocolChange, tapAction }.
 */
(function (root) {
  'use strict';

  /* Config is loaded first in the page; tests pass it in via the same global or require. */
  var C = root.RM_CONFIG || (typeof require === 'function' ? require('./rm_config.js') : {});
  /* URL helper, used only to reject a relay with a bad scheme on save/import. */
  var Url = root.RMUrl || (typeof require === 'function' ? require('./rm_url.js') : {});

  /* Trim and cap a value so stored strings stay short and safe. */
  function str(v, max) {
    return String(v == null ? '' : v).trim().slice(0, max);
  }

  /* Default TCP port for a protocol id, or 22 if the id is unknown. */
  function defaultPort(protocol) {
    var p = C.DEFAULT_PORTS[protocol];
    return p == null ? C.DEFAULT_PORTS[C.DEFAULT_PROTOCOL] : p;
  }

  /**
   * Port to use after the protocol picker changes.
   * If currentPort is empty or still the previous protocol's default, switch to the new default.
   * If the user has edited the port (it no longer matches the previous default), keep it.
   */
  function portAfterProtocolChange(newProtocol, currentPort, previousProtocol) {
    /* Parsed copy of whatever is in the port field now. */
    var cur = parseInt(currentPort, 10);
    /* Default that belonged to the protocol before the change. */
    var prevDefault = defaultPort(previousProtocol);
    /* If the field is empty or still auto-filled, use the new protocol's default. */
    if (!cur || cur === prevDefault) return defaultPort(newProtocol);
    /* Keep a port the user typed on purpose, as long as it is in range. */
    if (cur < C.PORT_MIN || cur > C.PORT_MAX) return defaultPort(newProtocol);
    return cur;
  }

  /**
   * What tapping a row should do in RM1: always a toast, never a navigation to another app.
   * SSH and VNC share one message; SFTP and FTP have their own release tags.
   */
  function tapAction(conn) {
    /* Protocol id on the row, or empty if the caller passed nothing. */
    var p = conn && conn.protocol ? String(conn.protocol) : '';
    if (p === 'sftp') return { action: 'sftp' };
    if (p === 'ftp') return { action: 'toast', message: C.TOAST_FTP };
    /* SSH, VNC, and any unknown protocol get the honest "later" toast. */
    return { action: 'toast', message: C.TOAST_VIEWER_LATER };
  }

  /**
   * Validate and normalize one connection. Returns a clean object or a string error.
   * Password fields are ignored even if a caller (or an imported file) sends them.
   */
  function clean(h) {
    /* Treat a missing argument as an empty object so field reads are safe. */
    h = h || {};
    /* Protocol id, lower-cased. An empty value falls back to SFTP. */
    var protocol = str(h.protocol, 8).toLowerCase() || C.DEFAULT_PROTOCOL;
    if (C.PROTOCOLS.indexOf(protocol) < 0) return 'Choose a protocol: SFTP, SSH, VNC or FTP.';
    /* Host name or IP, with IPv6 brackets stripped so we store a bare address. */
    var host = str(h.host, C.MAX_HOST).replace(/^\[|\]$/g, '');
    if (!host || /[\s/@]/.test(host)) return 'Enter a valid host (name or IP address).';
    /* Optional user name; blank is allowed (VNC often has none). */
    var user = str(h.user, C.MAX_USER);
    if (user && /[\s@:]/.test(user)) return 'Enter a valid user name.';
    /* Port, falling back to the protocol default when missing or not a number. */
    var port = parseInt(h.port, 10);
    if (!port) port = defaultPort(protocol);
    if (port < C.PORT_MIN || port > C.PORT_MAX) return 'Port must be 1–65535.';
    /* Optional relay: empty is fine; any other value must normalize as ws:// or wss:// (or a bare host). */
    var relay = str(h.relay, C.MAX_RELAY);
    if (relay && Url.normalizeRelay) {
      /* Use a neutral page protocol so a stored bare host is not forced to ws or wss here. */
      var check = Url.normalizeRelay(relay, '');
      if (!check.ok) return check.reason || 'Enter a valid relay host or ws:// / wss:// URL.';
    }
    /* Optional group and notes, just trimmed and capped. */
    var group = str(h.group, C.MAX_GROUP);
    var notes = str(h.notes, C.MAX_NOTES);
    /* Optional relay token. Never stored unless the caller passed one; passwords are ignored. */
    var token = str(h.token, C.MAX_TOKEN || 200);
    /* Name, or a simple default from user@host or the host alone. */
    var name = str(h.name, C.MAX_NAME) || (user ? user + '@' + host : host);
    /* Built entry; token is omitted when empty so older RM1 rows stay unchanged. */
    var out = {
      name: name,
      protocol: protocol,
      host: host,
      port: String(port),
      user: user,
      relay: relay,
      group: group,
      notes: notes
    };
    if (token) out.token = token;
    return out;
  }

  /* Build a store bound to a storage object (localStorage in the page, a fake in tests). */
  function make(storage, now) {
    /* Clock used for ids; tests can pass a fixed function. */
    now = now || function () { return Date.now(); };
    /* In-memory fallback used when storage.setItem throws (private mode, quota). */
    var mem = {};
    /* Monotonic suffix so two saves in the same millisecond still get unique ids. */
    var seq = 0;

    /* Read a JSON value, or def when the key is missing or corrupt. */
    function read(k, def) {
      /* Raw string from storage, if any. */
      var raw = null;
      try { raw = storage.getItem(k); } catch (e) { raw = null; }
      if (raw == null) return k in mem ? JSON.parse(mem[k]) : def;
      try { return JSON.parse(raw); } catch (e) { return def; }
    }

    /* Write a JSON value, keeping an in-memory copy if storage fails. */
    function write(k, v) {
      /* Serialized form shared by memory and storage. */
      var s = JSON.stringify(v);
      mem[k] = s;
      try { storage.setItem(k, s); } catch (e) { /* keep the in-memory copy */ }
    }

    /* Load the list, dropping entries that no longer clean or have no id. */
    function hlist() {
      /* Parsed array from storage, or an empty list. */
      var a = read(C.LS_CONNS, []);
      if (!Array.isArray(a)) return [];
      return a.map(function (h) {
        var c = clean(h);
        return typeof c === 'string' || !h || !h.id ? null : Object.assign({ id: String(h.id) }, c);
      }).filter(Boolean);
    }

    /* Make a compact unique id from the clock, a sequence, and a little random. */
    function newId() {
      seq += 1;
      return now().toString(36) + seq.toString(36) + Math.random().toString(36).slice(2, 6);
    }

    /* Find one connection by id, or null. */
    function get(id) {
      /* id is compared as a string so number ids from old JSON still match. */
      var want = String(id || '');
      return hlist().filter(function (h) { return h.id === want; })[0] || null;
    }

    /* Add (no id) or update (id). Returns the saved entry or a string error. */
    function save(h) {
      var c = clean(h);
      if (typeof c === 'string') return c;
      var a = hlist();
      var i = h && h.id ? a.findIndex(function (x) { return x.id === String(h.id); }) : -1;
      var e = Object.assign({ id: i >= 0 ? a[i].id : newId() }, c);
      if (i >= 0) a[i] = e; else a.push(e);
      write(C.LS_CONNS, a);
      return e;
    }

    /* Remove one connection by id. Missing ids are a no-op. */
    function remove(id) {
      write(C.LS_CONNS, hlist().filter(function (h) { return h.id !== String(id); }));
    }

    /* Copy a connection with a new id and a " (copy)" name suffix. */
    function duplicate(id) {
      var c = get(id);
      if (!c) return 'That connection was not found.';
      /* Names already in the list, so the copy can pick a free one. */
      var names = {};
      hlist().forEach(function (x) { names[x.name] = true; });
      /* First try "Name (copy)", then "Name (copy) 2", and so on. */
      var n = c.name + C.COPY_SUFFIX;
      var i = 2;
      while (names[n]) {
        n = c.name + C.COPY_SUFFIX + ' ' + i;
        i += 1;
      }
      return save({
        name: n,
        protocol: c.protocol,
        host: c.host,
        port: c.port,
        user: c.user,
        relay: c.relay,
        token: c.token,
        group: c.group,
        notes: c.notes
      });
    }

    /* Pretty-printed JSON of the current list (no passwords; none are stored). */
    function exportJSON() {
      return JSON.stringify(hlist(), null, 2);
    }

    /**
     * Merge connections from a JSON string (an array, or { connections: [...] }).
     * Password / pass / passwd fields are ignored. Existing ids are not reused, so a
     * second import will not overwrite. Returns { added, skipped } or a string error.
     */
    function importJSON(text) {
      /* Parsed value, or an error if the file is not JSON. */
      var data;
      try { data = JSON.parse(text); } catch (e) { return 'That file is not valid JSON.'; }
      /* Accept either a bare array or an object with a connections array. */
      var arr = Array.isArray(data) ? data : (data && Array.isArray(data.connections) ? data.connections : null);
      if (!arr) return 'That file has no connections list.';
      /* Counters returned to the UI toast. */
      var added = 0;
      var skipped = 0;
      arr.forEach(function (raw) {
        if (!raw || typeof raw !== 'object') { skipped += 1; return; }
        /* Only the documented fields are copied; password aliases are dropped on purpose. */
        var r = save({
          name: raw.name,
          protocol: raw.protocol,
          host: raw.host,
          port: raw.port,
          user: raw.user,
          relay: raw.relay,
          token: raw.token,
          group: raw.group,
          notes: raw.notes
        });
        if (typeof r === 'string') skipped += 1; else added += 1;
      });
      return { added: added, skipped: skipped };
    }

    /* Case-insensitive search over name, protocol, host, user, group and notes. */
    function search(query) {
      var q = str(query, 200).toLowerCase();
      var all = hlist();
      if (!q) return all;
      return all.filter(function (h) {
        var blob = [h.name, h.protocol, h.host, h.user, h.group, h.notes, h.port].join(' ').toLowerCase();
        return blob.indexOf(q) >= 0;
      });
    }

    /**
     * Group a list (or the full store) for the UI.
     * Named groups are sorted A–Z; connections with no group come last as "Ungrouped"
     * only when at least one named group exists. Inside a group, items are sorted by name.
     */
    function grouped(items) {
      items = items || hlist();
      /* group-key -> array of connections. */
      var map = {};
      /* First-seen order, later sorted. */
      var order = [];
      items.forEach(function (c) {
        var g = c.group || '';
        if (!map[g]) { map[g] = []; order.push(g); }
        map[g].push(c);
      });
      order.sort(function (a, b) {
        if (!a) return 1;
        if (!b) return -1;
        return a.toLowerCase().localeCompare(b.toLowerCase());
      });
      /* True when we should draw an Ungrouped heading. */
      var hasNamed = order.some(function (g) { return !!g; });
      return order.map(function (g) {
        var list = map[g].slice().sort(function (a, b) {
          return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });
        return { group: g, label: g ? g : (hasNamed ? C.UNGROUPED_LABEL : ''), items: list };
      });
    }

    return {
      list: hlist,
      get: get,
      save: save,
      remove: remove,
      duplicate: duplicate,
      exportJSON: exportJSON,
      importJSON: importJSON,
      search: search,
      grouped: grouped,
      clean: clean,
      defaultPort: defaultPort,
      portAfterProtocolChange: portAfterProtocolChange,
      tapAction: tapAction
    };
  }

  /* Public API, also exported for Node tests. */
  var api = { make: make, clean: clean, defaultPort: defaultPort, portAfterProtocolChange: portAfterProtocolChange, tapAction: tapAction };
  root.RMStore = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
