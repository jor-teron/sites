/* Remote — rm_ssh_view.js: SSH connect sheet, terminal tab, special-keys bar,
 * host-key prompt, disconnect / reconnect and the overflow menu (RM6).
 */
(function (root) {
  'use strict';

  /* Modules loaded as script tags before this file. */
  var C = root.RM_CONFIG || (typeof require === 'function' ? require('./rm_config.js') : {});
  var Url = root.RMUrl || (typeof require === 'function' ? require('./rm_url.js') : {});
  var Known = root.RMSshKnown || (typeof require === 'function' ? require('./rm_ssh_known.js') : {});
  var Client = root.RMSshClient || (typeof require === 'function' ? require('./rm_ssh_client.js') : {});
  var Term = root.RMSshTerm || (typeof require === 'function' ? require('./rm_ssh_term.js') : {});

  /* Short getElementById helper. */
  function $(id) {
    return document.getElementById(id);
  }

  /* Wire the SSH view. opts: { store, tabs, toast, pageProtocol, storage }. */
  function init(opts) {
    var store = opts.store;
    var tabs = opts.tabs;
    /* Known-hosts + font store bound to this page's storage. */
    var known = Known.make(opts.storage || (function () {
      try { return localStorage; } catch (e) {
        var mem = {};
        return {
          getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
          setItem: function (k, v) { mem[k] = String(v); },
          removeItem: function (k) { delete mem[k]; }
        };
      }
    })());
    /* Connection waiting in the connect sheet, or null. */
    var pending = null;
    /* Existing tab being reconnected, or null when opening a new session. */
    var pendingTab = null;
    /* True while an open is in flight, so Connect cannot be pressed twice. */
    var opening = false;
    /* AbortController for the in-flight open, or null. */
    var openingCtl = null;
    /* Resolver waiting on the host-key dialog, or null. */
    var hostKeyWait = null;
    /* Resolver waiting on the paste dialog, or null. */
    var pasteWait = null;
    /* Id whose SSH overflow menu is open, or null. */
    var menuFor = null;

    /* Protocol of this page, used to fill in ws:// vs wss:// on a bare relay host. */
    function pageProtocol() {
      return opts.pageProtocol ? opts.pageProtocol() : ((location.protocol || 'https:').toLowerCase());
    }

    /* Show a short toast if the host page provided one. */
    function toast(msg) {
      if (opts.toast) opts.toast(msg);
    }

    /* Normalize the connection's relay URL for this page, or an error string. */
    function relayUrl(conn) {
      var raw = (conn && conn.relay) || '';
      var norm = Url.normalizeRelay(raw, pageProtocol());
      if (!raw.trim()) {
        return { ok: false, reason: C.SSH_ERR_RELAY_URL || 'Add a Relay URL on this connection first.' };
      }
      if (!norm.ok) return { ok: false, reason: norm.reason || 'Enter a valid relay URL.' };
      if (norm.insecure) return { ok: true, url: norm.url, warn: norm.warn };
      return { ok: true, url: norm.url };
    }

    /* The SSH tab currently shown, or null. */
    function activeTab() {
      var t = tabs.current();
      return t && t.protocol === 'ssh' ? t : null;
    }

    /* Open the connect sheet for a saved SSH connection.
     * Re-tapping a connection that already has a tab just focuses that tab.
     * Pass an existing tab to reconnect it (the sheet is shown again if the password is gone).
     */
    function startConnect(conn, tab) {
      if (!conn) return;
      var existing = tabs.findByConn(conn.id);
      if (existing && !tab) {
        tabs.select(existing.id);
        return;
      }
      pending = conn;
      pendingTab = tab || null;
      opening = false;
      $('connect-title').textContent = (tab ? 'Reconnect to ' : 'Connect to ') + conn.name;
      $('connect-note').textContent = C.SSH_SECURITY_NOTE || '';
      var wrap = $('connect-token-wrap');
      if (wrap) wrap.hidden = true;
      var r = relayUrl(conn);
      var built = r.ok ? Client.buildRelayUrl(r.url, conn.host, conn.port) : null;
      $('connect-relay').textContent = (built && built.ok) ? built.url : (r.ok ? r.url : (conn.relay || '(no relay URL)'));
      $('c-pass').value = '';
      $('c-token').value = '';
      $('c-remember').checked = false;
      $('connect-err').hidden = true;
      $('connect-err').textContent = '';
      var err = '';
      var warn = '';
      if (!conn.user) err = C.SSH_ERR_USER || 'Enter a user name on this connection first.';
      else if (!r.ok) err = r.reason;
      else if (r.warn) warn = r.warn;
      if (typeof isSecureContext !== 'undefined' && !isSecureContext) {
        err = C.SSH_ERR_INSECURE || 'SSH needs a secure page (https or localhost) so the browser can use Web Crypto.';
      }
      if (err || warn) {
        $('connect-err').textContent = err || warn;
        $('connect-err').hidden = false;
        $('connect-err').className = err ? 'form-err' : 'form-err warn';
      } else {
        $('connect-err').className = 'form-err';
      }
      $('btn-connect-go').disabled = !!err;
      $('connect').showModal();
      setTimeout(function () { $('c-pass').focus(); }, 0);
    }

    /* Hide the connect sheet and forget the typed password, but only if this view owns it. */
    function closeConnect() {
      if (!pending) return;
      cancelHostKey(false);
      if (openingCtl) {
        try { openingCtl.abort(); } catch (e) { /* already aborted */ }
        openingCtl = null;
      }
      if ($('connect').open) $('connect').close();
      $('c-pass').value = '';
      pending = null;
      pendingTab = null;
      opening = false;
      $('btn-connect-go').disabled = false;
      var wrap = $('connect-token-wrap');
      if (wrap) wrap.hidden = false;
    }

    /* Show a message in the connect sheet. */
    function connectError(msg, warn) {
      $('connect-err').textContent = msg || '';
      $('connect-err').hidden = !msg;
      $('connect-err').className = warn ? 'form-err warn' : 'form-err';
    }

    /* Date label used in the changed-host-key warning. */
    function when(t) {
      try { return new Date(t).toLocaleDateString(undefined, { dateStyle: 'medium' }); } catch (e) { return '?'; }
    }

    /* Prompt for a new or changed host key. Resolves true if the user trusts it. */
    function askHostKey(id, info, check) {
      cancelHostKey(false);
      var title = $('hostkey-title');
      var text = $('hostkey-text');
      var fp = $('hostkey-fp');
      var yes = $('hostkey-yes');
      if (check.status === 'changed') {
        title.textContent = 'Host key changed!';
        text.textContent = id + ' now shows a different key than the one you trusted. This can mean someone is intercepting the connection. Replace the key only if you know the server was reinstalled or its keys were changed.\n\n'
          + 'Saved (first seen ' + when(check.entry && check.entry.first) + '):\n'
          + (check.entry && check.entry.alg) + '\n' + (check.entry && check.entry.fp)
          + '\n\nNow:\n' + info.alg + '\n' + info.fp;
        yes.textContent = 'Replace key';
        yes.className = 'danger jelly';
      } else {
        title.textContent = 'Trust this host?';
        text.textContent = 'First connection to ' + id + '. Check the fingerprint matches the server (ssh-keygen -lf /etc/ssh/ssh_host_*_key.pub). It is saved, so you are only asked again if it changes.';
        fp.textContent = info.alg + '\n' + info.fp;
        yes.textContent = 'Trust and connect';
        yes.className = 'jelly';
      }
      if (check.status !== 'changed') {
        /* The new-key path puts the fingerprint in its own element so it stays monospaced. */
      } else {
        fp.textContent = '';
      }
      return new Promise(function (resolve) {
        hostKeyWait = resolve;
        if ($('hostkey') && !$('hostkey').open) $('hostkey').showModal();
      });
    }

    /* Finish the host-key dialog. accept is true when the user trusted the key. */
    function cancelHostKey(accept) {
      if ($('hostkey') && $('hostkey').open) $('hostkey').close();
      var fn = hostKeyWait;
      hostKeyWait = null;
      if (fn) fn(!!accept);
    }

    /* Open a paste box when the clipboard cannot be read. Resolves to the text or null. */
    function askPaste() {
      if (pasteWait) pasteWait(null);
      $('ssh-paste-text').value = '';
      if ($('ssh-paste') && !$('ssh-paste').open) $('ssh-paste').showModal();
      setTimeout(function () { $('ssh-paste-text').focus(); }, 0);
      return new Promise(function (resolve) { pasteWait = resolve; });
    }

    /* Close the paste box and resolve with the given text (or null). */
    function finishPaste(text) {
      if ($('ssh-paste') && $('ssh-paste').open) $('ssh-paste').close();
      var fn = pasteWait;
      pasteWait = null;
      if (fn) fn(text == null ? null : String(text));
    }

    /* Create (or return) the xterm instance living on this tab. */
    function ensureTerm(tab) {
      if (tab.term) return tab.term;
      var host = document.createElement('div');
      host.className = 'ssh-term-host';
      host.hidden = true;
      $('ssh-sessions').appendChild(host);
      var term = Term.mount(host, {
        fontSize: known.getFont(),
        onCopied: function () { toast('Copied'); },
        onAskPaste: askPaste
      });
      tab.term = term;
      tab.termHost = host;
      return term;
    }

    /* Tear down the terminal DOM for a tab that has been closed. */
    function disposeTerm(tab) {
      if (tab && tab.term) {
        try { tab.term.dispose(); } catch (e) { /* already gone */ }
        tab.term = null;
      }
      if (tab && tab.termHost && tab.termHost.parentNode) {
        tab.termHost.parentNode.removeChild(tab.termHost);
        tab.termHost = null;
      }
    }

    /* Bind a live session so closing the tab also closes the SSH connection and the terminal. */
    function bindClient(tab, session) {
      tab.session = session;
      tab.live = true;
      tab.client = {
        close: function () {
          tab.live = false;
          try { if (tab.session) tab.session.close(); } catch (e) { /* already closed */ }
          tab.session = null;
          disposeTerm(tab);
        }
      };
    }

    /* Update the status line and the Disconnect/Reconnect label for the active tab. */
    function setStatus(tab, msg, kind) {
      if (!tab) return;
      tab.status = msg || '';
      tab.statusKind = kind || '';
      if (activeTab() && activeTab().id === tab.id) {
        var el = $('ssh-status');
        el.textContent = tab.status;
        el.className = 'hint' + (kind === 'err' ? ' err' : kind === 'warn' ? ' warn' : '');
        var size = tab.term ? tab.term.getSize() : null;
        $('ssh-size').textContent = (tab.live && size) ? (size.cols + '\u00d7' + size.rows) : '';
        renderMods(tab);
      }
    }

    /* Paint sticky Ctrl/Alt on the key bar from the active terminal. */
    function renderMods(tab) {
      var t = tab && tab.term;
      $('ssh-k-ctrl').classList.toggle('on', !!(t && t.isCtrl && t.isCtrl()));
      $('ssh-k-alt').classList.toggle('on', !!(t && t.isAlt && t.isAlt()));
    }

    /* Show or hide the special-keys bar (remembered only for this visit, default on for phones). */
    function showKeys(on) {
      var keys = $('ssh-keys');
      keys.hidden = !on;
    }

    /* Fit the visible terminal and tell the server the new size. */
    function refit(tab) {
      if (!tab || !tab.term) return;
      tab.term.fit();
      var s = tab.term.getSize();
      if (tab.live && tab.session && s) tab.session.resize(s.cols, s.rows);
      if (activeTab() && activeTab().id === tab.id) {
        $('ssh-size').textContent = (tab.live && s) ? (s.cols + '\u00d7' + s.rows) : '';
      }
    }

    /* Host-key callback used during open(). */
    function onHostKey(conn, info) {
      var id = known.hostId(conn.host, conn.port);
      var check = known.check(id, info);
      if (check.status === 'known') {
        known.seen(id);
        return Promise.resolve(true);
      }
      return askHostKey(id, info, check).then(function (ok) {
        if (ok) known.trust(id, info);
        return ok;
      });
    }

    /* Submit the connect sheet: open SSH, then add or reuse a tab. */
    function submitConnect(ev) {
      if (ev) ev.preventDefault();
      if (opening || !pending || pending.protocol !== 'ssh') return;
      var conn = pending;
      var tabReuse = pendingTab;
      var r = relayUrl(conn);
      if (!r.ok) { connectError(r.reason); return; }
      if (!conn.user) { connectError(C.SSH_ERR_USER || 'Enter a user name on this connection first.'); return; }
      var pass = $('c-pass').value;
      if (!pass) { connectError(C.SSH_ERR_AUTH || 'Enter the password.'); return; }
      opening = true;
      $('btn-connect-go').disabled = true;
      connectError('Connecting\u2026', true);
      var ctl = new AbortController();
      openingCtl = ctl;
      var tab = tabReuse || null;
      /* Mutable holder so onData/onClose see the tab once it is created. */
      var box = { tab: tab };
      /* Bytes that arrive before the tab/terminal exist (the MOTD can race the open() return). */
      var early = [];
      if (tab) {
        ensureTerm(tab);
        setStatus(tab, 'Connecting\u2026', 'warn');
      }
      var size = tab && tab.term ? tab.term.getSize() : { cols: C.SSH_DEFAULT_COLS || 80, rows: C.SSH_DEFAULT_ROWS || 24 };
      Client.open({
        relay: r.url,
        host: conn.host,
        port: conn.port,
        user: conn.user,
        password: pass,
        cols: size.cols,
        rows: size.rows,
        signal: ctl.signal,
        onHostKey: function (info) { return onHostKey(conn, info); },
        onData: function (u8) {
          if (box.tab && box.tab.term) box.tab.term.write(u8);
          else early.push(u8);
        },
        onClose: function (msg, kind) { if (box.tab) dropped(box.tab, msg, kind); }
      }).then(function (session) {
        $('c-pass').value = '';
        var wasReuse = !!tabReuse;
        /* Open the tab before attaching, so a brand-new session has a place to live. */
        if (!tab) {
          tab = tabs.openSession({
            connId: conn.id,
            name: conn.name,
            protocol: 'ssh',
            client: null
          });
        }
        box.tab = tab;
        ensureTerm(tab);
        early.forEach(function (u8) { tab.term.write(u8); });
        early = [];
        if (wasReuse) {
          tab.term.write(new TextEncoder().encode('\r\n\x1b[2m--- new session ---\x1b[0m\r\n'));
        } else {
          tab.term.reset();
        }
        tab.term.attach(function (d) { if (tab.session) tab.session.write(d); }, function (c, r) {
          if (tab.session) tab.session.resize(c, r);
          if (activeTab() && activeTab().id === tab.id) $('ssh-size').textContent = c + '\u00d7' + r;
        });
        /* Re-bind onData now that tab exists (the first frames may already have arrived). */
        bindClient(tab, session);
        tab.password = pass;
        tab.connId = conn.id;
        closeConnect();
        setStatus(tab, 'Connected ' + conn.user + '@' + conn.host + (String(conn.port) !== '22' ? ':' + conn.port : '') + '.', '');
        showSession(tab);
        var s = tab.term.getSize();
        if (s && (s.cols !== size.cols || s.rows !== size.rows)) session.resize(s.cols, s.rows);
        tab.term.focus();
      }).catch(function (err) {
        opening = false;
        openingCtl = null;
        $('btn-connect-go').disabled = false;
        if (err && err.code === 'cancelled') {
          connectError('');
          return;
        }
        var msg = (err && err.message) || String(err);
        connectError(msg);
        if (tabReuse) setStatus(tabReuse, msg, 'err');
        if (tabReuse && err && err.code === 'auth') {
          tabReuse.password = '';
          /* Show the sheet again so the user can type a new password. */
          startConnect(conn, tabReuse);
          connectError(msg);
        }
      });
    }

    /* The live session closed by itself. Keep the tab and the terminal so Reconnect works. */
    function dropped(tab, msg, kind) {
      if (!tab || !tab.live) return;
      tab.live = false;
      if (tab.term) tab.term.detach();
      tab.session = null;
      setStatus(tab, msg || 'The connection was closed.', kind === 'exit' ? '' : 'err');
    }

    /* Explicit disconnect: close the socket, forget the in-memory password, keep the tab. */
    function disconnect(tab) {
      if (!tab) tab = activeTab();
      if (!tab) return;
      tab.live = false;
      tab.password = '';
      if (tab.term) tab.term.detach();
      try { if (tab.session) tab.session.close(); } catch (e) { /* already closed */ }
      tab.session = null;
      setStatus(tab, 'Disconnected.', '');
    }

    /* Reconnect the active (or given) tab, asking for the password again if it was cleared. */
    function reconnect(tab) {
      if (!tab) tab = activeTab();
      if (!tab || tab.live || opening) return;
      var conn = store.get(tab.connId);
      if (!conn) { toast('That connection was not found.'); return; }
      if (tab.password) {
        /* Reuse the in-memory password from this tab (never written to storage). */
        pending = conn;
        pendingTab = tab;
        $('c-pass').value = tab.password;
        submitConnect();
        return;
      }
      startConnect(conn, tab);
    }

    /* Show this SSH tab's terminal and status (session stays alive while hidden). */
    function showSession(tab) {
      if (!tab || tab.protocol !== 'ssh') return;
      var hosts = $('ssh-sessions');
      if (hosts) {
        Array.prototype.forEach.call(hosts.children, function (el) {
          el.hidden = !(tab.termHost && el === tab.termHost);
        });
      }
      if (tab.termHost) tab.termHost.hidden = false;
      setStatus(tab, tab.status || (tab.live ? 'Connected.' : 'Disconnected.'), tab.statusKind || '');
      if (tab.term) {
        tab.term.theme();
        setTimeout(function () { refit(tab); tab.term.focus(); }, 0);
      }
    }

    /* Apply a saved font size to every open SSH terminal. */
    function applyFont(n) {
      var size = known.setFont(n);
      tabs.list().forEach(function (t) {
        if (t.term) {
          t.term.setFont(size);
          if (t.id === (activeTab() && activeTab().id)) refit(t);
        }
      });
      return size;
    }

    /* Open or toggle the SSH overflow menu under the ⋯ button. */
    function toggleMenu(btn) {
      var tab = activeTab();
      if (!tab) return;
      var m = $('ssh-menu');
      if (menuFor === tab.id && !m.hidden) { closeMenu(); return; }
      menuFor = tab.id;
      $('ssh-menu-disc').textContent = tab.live ? 'Disconnect' : 'Reconnect';
      $('ssh-menu-keys').textContent = $('ssh-keys').hidden ? 'Show keys' : 'Hide keys';
      /* (before RM7)
      m.hidden = false;
      var r = btn.getBoundingClientRect();
      m.style.top = (window.scrollY + r.bottom + 4) + 'px';
      var left = window.scrollX + r.right - m.offsetWidth;
      var maxLeft = window.scrollX + window.innerWidth - m.offsetWidth - 8;
      m.style.left = Math.max(8, Math.min(left, maxLeft)) + 'px';
      */
      m.style.top = '0px';
      m.style.left = '0px';
      if (root.RMUI) {
        root.RMUI.showFloat(m);
        root.RMUI.placeMenu(m, root.RMUI.anchorRect(btn));
      } else {
        m.hidden = false;
      }
    }

    /* Hide the SSH overflow menu. */
    function closeMenu() {
      var m = $('ssh-menu');
      /* (before RM7) if (m) m.hidden = true; */
      if (m && root.RMUI) root.RMUI.hideFloat(m);
      else if (m) m.hidden = true;
      menuFor = null;
    }

    /* Wire the sheet, key bar, overflow menu and dialogs once. */
    $('connect-form').addEventListener('submit', submitConnect);
    $('btn-connect-cancel').addEventListener('click', function (e) {
      e.preventDefault();
      closeConnect();
    });
    $('hostkey-yes').addEventListener('click', function () { cancelHostKey(true); });
    $('hostkey-no').addEventListener('click', function () { cancelHostKey(false); });
    $('ssh-paste-form').addEventListener('submit', function (e) {
      e.preventDefault();
      finishPaste($('ssh-paste-text').value);
    });
    $('ssh-paste-cancel').addEventListener('click', function (e) {
      e.preventDefault();
      finishPaste(null);
    });
    $('ssh-btn-more').addEventListener('click', function (e) {
      e.stopPropagation();
      toggleMenu($('ssh-btn-more'));
    });
    if ($('ssh-btn-edit')) $('ssh-btn-edit').addEventListener('click', function () {
      closeMenu();
      var t = activeTab();
      if (t && opts.onEdit) opts.onEdit(t.connId);
    });
    $('ssh-menu-copy').addEventListener('click', function () {
      closeMenu();
      var t = activeTab();
      if (t && t.term) t.term.copy(false);
    });
    $('ssh-menu-paste').addEventListener('click', function () {
      closeMenu();
      var t = activeTab();
      if (t && t.term) t.term.paste();
    });
    $('ssh-menu-font-minus').addEventListener('click', function () {
      applyFont(known.getFont() - 1);
    });
    $('ssh-menu-font-plus').addEventListener('click', function () {
      applyFont(known.getFont() + 1);
    });
    $('ssh-menu-keys').addEventListener('click', function () {
      showKeys($('ssh-keys').hidden);
      closeMenu();
    });
    $('ssh-menu-disc').addEventListener('click', function () {
      closeMenu();
      var t = activeTab();
      if (!t) return;
      if (t.live) disconnect(t);
      else reconnect(t);
    });
    $('ssh-keys').addEventListener('pointerdown', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      e.preventDefault();
      var t = activeTab();
      if (!t || !t.term || !t.live) return;
      t.term.sendKey(b.getAttribute('data-k'));
      renderMods(t);
    });
    document.addEventListener('click', function (e) {
      if ($('ssh-menu').hidden) return;
      if (!e.target.closest('#ssh-menu') && !e.target.closest('#ssh-btn-more')) closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      closeMenu();
      if ($('hostkey') && $('hostkey').open) cancelHostKey(false);
      if ($('ssh-paste') && $('ssh-paste').open) finishPaste(null);
    });
    window.addEventListener('storage', function (e) {
      if (e.key === C.HUB_THEME_KEY) {
        tabs.list().forEach(function (t) { if (t.term) t.term.theme(); });
      }
    });
    /* Phones start with the special-keys bar open; desktops keep it in the overflow menu. */
    if (window.matchMedia && matchMedia('(pointer: coarse)').matches) showKeys(true);
    else showKeys(false);

    /* When a tab disappears, drop any leftover terminal host (client.close already does this). */
    tabs.onChange(function () {
      var ids = {};
      tabs.list().forEach(function (t) { ids[t.id] = true; });
      var hosts = $('ssh-sessions');
      if (!hosts) return;
      Array.prototype.forEach.call(hosts.children, function (el) {
        var keep = tabs.list().some(function (t) { return t.termHost === el; });
        if (!keep) el.parentNode.removeChild(el);
      });
    });

    return {
      startConnect: startConnect,
      showSession: showSession,
      reconnect: reconnect,
      disconnect: disconnect
    };
  }

  /* Public API, also exported for Node tests (init itself needs a document). */
  var api = { init: init };
  root.RMSshView = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
