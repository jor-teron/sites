/* Remote — rm_sftp_view.js: SFTP connect sheet and folder browse (RM2). Downloads arrive in RM3. */
(function (root) {
  'use strict';

  /* Modules loaded as script tags before this file. */
  var C = root.RM_CONFIG || (typeof require === 'function' ? require('./rm_config.js') : {});
  var Url = root.RMUrl || (typeof require === 'function' ? require('./rm_url.js') : {});
  var Path = root.RMSftpPath || (typeof require === 'function' ? require('./rm_sftp_path.js') : {});
  var Client = root.RMSftpClient || (typeof require === 'function' ? require('./rm_sftp_client.js') : {});

  /* Short getElementById helper. */
  function $(id) {
    return document.getElementById(id);
  }

  /* Wire the SFTP view. opts: { store, tabs, toast, pageProtocol, onTabs }. */
  function init(opts) {
    var store = opts.store;
    var tabs = opts.tabs;
    /* Connection waiting in the connect sheet, or null. */
    var pending = null;
    /* True while an open is in flight, so Connect cannot be pressed twice. */
    var opening = false;

    /* Protocol of this page, used to fill in ws:// vs wss:// on a bare relay host. */
    function pageProtocol() {
      return opts.pageProtocol ? opts.pageProtocol() : ((location.protocol || 'https:').toLowerCase());
    }

    /* Normalize the connection's relay URL for this page, or an error string. */
    function relayUrl(conn) {
      var raw = (conn && conn.relay) || '';
      var norm = Url.normalizeRelay(raw, pageProtocol());
      if (!raw.trim()) return { ok: false, reason: 'Add a Relay URL on this connection first (ws://192.168.x.x:8023 on a LAN, or wss:// on https).' + (C.SFTP_README_HINT || '') };
      if (!norm.ok) return { ok: false, reason: norm.reason || 'Enter a valid relay URL.' };
      if (norm.insecure) return { ok: true, url: norm.url, warn: norm.warn };
      return { ok: true, url: norm.url };
    }

    /* Open the connect sheet for a saved SFTP connection. */
    function startConnect(conn) {
      if (!conn) return;
      /* Re-focus an already-open session instead of asking for the password again. */
      var existing = tabs.findByConn(conn.id);
      if (existing) {
        tabs.select(existing.id);
        return;
      }
      pending = conn;
      opening = false;
      $('connect-title').textContent = 'Connect to ' + conn.name;
      $('connect-note').textContent = C.SFTP_SECURITY_NOTE;
      var r = relayUrl(conn);
      $('connect-relay').textContent = r.ok ? r.url : (conn.relay || '(no relay URL)');
      $('c-pass').value = '';
      $('c-token').value = conn.token || '';
      $('c-remember').checked = false;
      $('connect-err').hidden = true;
      $('connect-err').textContent = r.ok ? (r.warn || '') : r.reason;
      if (!r.ok || r.warn) {
        $('connect-err').hidden = false;
        $('connect-err').className = r.ok ? 'form-err warn' : 'form-err';
      } else {
        $('connect-err').className = 'form-err';
      }
      $('btn-connect-go').disabled = !r.ok;
      $('connect').showModal();
      setTimeout(function () { $('c-pass').focus(); }, 0);
    }

    /* Hide the connect sheet and forget the typed password. */
    function closeConnect() {
      if ($('connect').open) $('connect').close();
      $('c-pass').value = '';
      pending = null;
      opening = false;
      $('btn-connect-go').disabled = false;
    }

    /* Show a message in the connect sheet. */
    function connectError(msg, warn) {
      $('connect-err').textContent = msg || '';
      $('connect-err').hidden = !msg;
      $('connect-err').className = warn ? 'form-err warn' : 'form-err';
    }

    /* Submit the connect sheet: open the relay, then add a tab and browse the root. */
    function submitConnect(ev) {
      if (ev) ev.preventDefault();
      if (opening || !pending) return;
      var conn = pending;
      var r = relayUrl(conn);
      if (!r.ok) { connectError(r.reason); return; }
      var pass = $('c-pass').value;
      var token = $('c-token').value;
      var remember = $('c-remember').checked;
      opening = true;
      $('btn-connect-go').disabled = true;
      connectError('Connecting…', true);
      Client.connect({
        relay: r.url,
        token: token,
        host: conn.host,
        port: conn.port,
        user: conn.user,
        pass: pass,
        root: ''
      }).then(function (client) {
        /* Optionally store the token (never the password) on this connection. */
        if (remember) {
          store.save({
            id: conn.id,
            name: conn.name,
            protocol: conn.protocol,
            host: conn.host,
            port: conn.port,
            user: conn.user,
            relay: conn.relay,
            token: token,
            group: conn.group,
            notes: conn.notes
          });
        }
        $('c-pass').value = '';
        closeConnect();
        var tab = tabs.openSession({
          connId: conn.id,
          name: conn.name,
          protocol: 'sftp',
          client: client,
          path: [],
          root: client.root || conn.name,
          entries: []
        });
        return loadFolder(tab, []);
      }).catch(function (err) {
        opening = false;
        $('btn-connect-go').disabled = false;
        connectError((err && (err.explain || err.message)) || String(err));
      });
    }

    /* List a folder and redraw the browse view for this tab. */
    function loadFolder(tab, path) {
      if (!tab || !tab.client) return Promise.resolve();
      tab.path = Path.parts(path);
      setStatus('Loading…');
      return tab.client.list(tab.path).then(function (entries) {
        tab.entries = Path.sortEntries(entries);
        if (tabs.current().id === tab.id) renderBrowse(tab);
      }).catch(function (err) {
        tab.entries = tab.entries || [];
        if (tabs.current().id === tab.id) {
          renderBrowse(tab);
          setStatus((err && (err.explain || err.message)) || String(err), true);
        }
      });
    }

    /* Status / error line in the browse view. */
    function setStatus(msg, isErr) {
      var el = $('sftp-status');
      el.textContent = msg || '';
      el.className = isErr ? 'hint err' : 'hint';
    }

    /* Draw breadcrumbs, list and empty state for the active SFTP tab. */
    function renderBrowse(tab) {
      if (!tab || tab.kind === 'connections') return;
      var rootLabel = tab.root || tab.name || '/';
      var crumbs = $('sftp-crumbs');
      crumbs.textContent = '';
      Path.breadcrumbs(tab.path, rootLabel).forEach(function (c, i, all) {
        if (i) {
          var sep = document.createElement('span');
          sep.className = 'crumb-sep';
          sep.textContent = '/';
          crumbs.appendChild(sep);
        }
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'crumb jelly' + (i === all.length - 1 ? ' current' : '');
        b.textContent = c.label;
        b.addEventListener('click', function () { loadFolder(tab, c.path); });
        crumbs.appendChild(b);
      });
      $('sftp-up').disabled = !tab.path.length;
      var wrap = $('sftp-list');
      wrap.textContent = '';
      var entries = tab.entries || [];
      $('sftp-empty').hidden = entries.length > 0;
      entries.forEach(function (e) {
        wrap.appendChild(entryEl(tab, e));
      });
      if (tab.client && tab.client.isOpen && !tab.client.isOpen()) setStatus('Disconnected.', true);
      else setStatus(entries.length ? '' : '');
    }

    /* One folder or file row. Folders open; files show details only (no download in RM2). */
    function entryEl(tab, e) {
      var row = document.createElement('div');
      row.className = 'entry jelly';
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      var kind = document.createElement('span');
      kind.className = 'entry-kind ' + (e.isDir ? 'dir' : 'file');
      kind.textContent = e.isDir ? 'Folder' : 'File';
      var body = document.createElement('div');
      body.className = 'conn-body';
      var nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = e.name;
      var sub = document.createElement('div');
      sub.className = 'sub';
      var bits = [];
      if (!e.isDir) bits.push(Path.formatSize(e.size));
      var when = Path.formatTime(e.mtime);
      if (when) bits.push(when);
      sub.textContent = bits.join(' · ');
      body.appendChild(nm);
      body.appendChild(sub);
      row.appendChild(kind);
      row.appendChild(body);
      function open() {
        if (e.isDir) {
          var next = Path.join(tab.path, e.name);
          if (typeof next === 'string') { setStatus(next, true); return; }
          loadFolder(tab, next);
        } else {
          showFile(tab, e);
        }
      }
      row.addEventListener('click', open);
      row.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
      });
      return row;
    }

    /* File details sheet: name, path, size, date. No download button (RM3). */
    function showFile(tab, e) {
      $('file-name').textContent = e.name;
      $('file-path').textContent = Path.formatPath(Path.join(tab.path, e.name) === 'bad name' ? tab.path.concat(e.name) : Path.join(tab.path, e.name), tab.root || tab.name || '/');
      $('file-size').textContent = Path.formatSize(e.size);
      $('file-date').textContent = Path.formatTime(e.mtime) || '—';
      $('file-hint').textContent = C.SFTP_FILE_HINT || 'Download arrives in RM3.';
      $('file-details').showModal();
    }

    /* Refresh or go up in the active SFTP tab. */
    function activeTab() {
      var t = tabs.current();
      return t && t.client ? t : null;
    }

    /* Show the browse view when its tab is selected (session stays alive). */
    function showSession(tab) {
      if (!tab || !tab.client) return;
      renderBrowse(tab);
    }

    /* Wire the sheet and browse controls once. */
    $('connect-form').addEventListener('submit', submitConnect);
    $('btn-connect-cancel').addEventListener('click', function (e) { e.preventDefault(); closeConnect(); });
    $('sftp-up').addEventListener('click', function () {
      var t = activeTab();
      if (t) loadFolder(t, Path.parent(t.path));
    });
    $('sftp-refresh').addEventListener('click', function () {
      var t = activeTab();
      if (t) loadFolder(t, t.path);
    });
    $('btn-file-close').addEventListener('click', function () {
      if ($('file-details').open) $('file-details').close();
    });

    return {
      startConnect: startConnect,
      showSession: showSession,
      renderBrowse: renderBrowse,
      closeConnect: closeConnect
    };
  }

  /* Public API. */
  var api = { init: init };
  root.RMSftpView = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
