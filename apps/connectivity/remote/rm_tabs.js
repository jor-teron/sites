/* Remote — rm_tabs.js: Remmina-style session tabs. State only, no DOM, so node can unit-test it.
 * The first tab is always "Connections" and cannot be closed. Opening a connection adds a session
 * tab; switching keeps each session (and its SFTP client) alive; closing disconnects.
 */
(function (root) {
  'use strict';

  /* Config is loaded first in the page; tests pass it in via the same global or require. */
  var C = root.RM_CONFIG || (typeof require === 'function' ? require('./rm_config.js') : {});

  /* Build a tab list. Optional onChange(api) is called after every select / open / close. */
  function make(opts) {
    opts = opts || {};
    /* Id of the fixed list tab, never removed. */
    var listId = C.CONNECTIONS_TAB_ID || 'connections';
    /* The immovable first tab. */
    var listTab = {
      id: listId,
      kind: 'connections',
      name: C.CONNECTIONS_TAB_LABEL || 'Connections',
      closable: false,
      protocol: '',
      connId: '',
      client: null,
      path: [],
      busy: false
    };
    /* Open session tabs, in the order they were opened. */
    var sessions = [];
    /* Id of the tab currently shown. */
    var active = listId;
    /* Monotonic counter used to mint session tab ids. */
    var seq = 0;
    /* Listeners notified after a change (the UI redraws from these). */
    var listeners = [];
    if (typeof opts.onChange === 'function') listeners.push(opts.onChange);

    /* All tabs, list tab first. */
    function list() {
      return [listTab].concat(sessions);
    }

    /* Find a tab by id, or null. */
    function get(id) {
      var want = String(id || '');
      var all = list();
      for (var i = 0; i < all.length; i++) if (all[i].id === want) return all[i];
      return null;
    }

    /* The tab that is currently shown. */
    function current() {
      return get(active) || listTab;
    }

    /* True when the connections list is the active tab. */
    function isConnections() {
      return active === listId;
    }

    /* Existing session for a saved connection, if any (one tab per connection). */
    function findByConn(connId) {
      var want = String(connId || '');
      for (var i = 0; i < sessions.length; i++) if (sessions[i].connId === want) return sessions[i];
      return null;
    }

    /* Notify listeners after a mutation. */
    function notify() {
      for (var i = 0; i < listeners.length; i++) listeners[i](api);
    }

    /* Show a tab by id. Returns the tab, or null if it is unknown. */
    function select(id) {
      var t = get(id);
      if (!t) return null;
      active = t.id;
      notify();
      return t;
    }

    /**
     * Open or focus a session tab.
     * meta: { connId, name, protocol, client, path, root, entries }.
     * If a tab for this connId already exists, it is selected and its client is left running.
     */
    function openSession(meta) {
      meta = meta || {};
      var existing = findByConn(meta.connId);
      if (existing) {
        /* Keep the live session; just bring its tab to the front. */
        active = existing.id;
        notify();
        return existing;
      }
      seq += 1;
      var tab = {
        id: 's' + seq,
        kind: meta.protocol || 'sftp',
        name: meta.name || 'Session',
        closable: true,
        protocol: meta.protocol || 'sftp',
        connId: String(meta.connId || ''),
        client: meta.client || null,
        path: meta.path ? meta.path.slice() : [],
        root: meta.root || '',
        entries: meta.entries || [],
        busy: false
      };
      sessions.push(tab);
      active = tab.id;
      notify();
      return tab;
    }

    /**
     * Close a session tab and disconnect its client.
     * The list tab cannot be closed.
     * If the tab is busy (a transfer later in RM3) and opts.confirmed is not true,
     * returns { ok: false, reason: 'busy', tab } so the UI can confirm.
     */
    function close(id, flags) {
      flags = flags || {};
      if (String(id) === listId) return { ok: false, reason: 'fixed', tab: listTab };
      var i;
      for (i = 0; i < sessions.length; i++) if (sessions[i].id === String(id)) break;
      if (i === sessions.length) return { ok: false, reason: 'not-found' };
      var tab = sessions[i];
      /* A running transfer (or a client that reports isBusy) needs a confirm. */
      var busy = !!(tab.busy || (tab.client && typeof tab.client.isBusy === 'function' && tab.client.isBusy()));
      if (busy && !flags.confirmed) return { ok: false, reason: 'busy', tab: tab };
      if (tab.client && typeof tab.client.close === 'function') {
        try { tab.client.close(); } catch (e) { /* already closed */ }
      }
      tab.client = null;
      sessions.splice(i, 1);
      if (active === tab.id) {
        /* Prefer the neighbour to the right, else the one to the left, else the list. */
        var next = sessions[i] || sessions[i - 1] || listTab;
        active = next.id;
      }
      notify();
      return { ok: true, tab: tab };
    }

    /* Subscribe to changes. */
    function onChange(fn) {
      if (typeof fn === 'function') listeners.push(fn);
    }

    var api = {
      list: list,
      get: get,
      current: current,
      isConnections: isConnections,
      findByConn: findByConn,
      select: select,
      openSession: openSession,
      close: close,
      onChange: onChange,
      CONNECTIONS_ID: listId
    };
    return api;
  }

  /* Public API, also exported for Node tests. */
  var api = { make: make };
  root.RMTabs = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
