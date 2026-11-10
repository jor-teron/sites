/* Remote — rm_vnc_view.js: VNC connect sheet, session tab, scale / view-only,
 * Ctrl+Alt+Del, clipboard, on-screen keyboard, fullscreen, quality/compression,
 * disconnect / reconnect, and the overflow menu (RM4).
 */
(function (root) {
  'use strict';

  /* Modules loaded as script tags before this file. */
  var C = root.RM_CONFIG || (typeof require === 'function' ? require('./rm_config.js') : {});
  var Url = root.RMUrl || (typeof require === 'function' ? require('./rm_url.js') : {});
  var Client = root.RMVncClient || (typeof require === 'function' ? require('./rm_vnc_client.js') : {});

  /* Short getElementById helper. */
  function $(id) {
    return document.getElementById(id);
  }

  /* Wire the VNC view. opts: { store, tabs, toast, pageProtocol }. */
  function init(opts) {
    var store = opts.store;
    var tabs = opts.tabs;
    /* Connection waiting in the connect sheet, or null. */
    var pending = null;
    /* Existing tab being reconnected, or null when opening a new session. */
    var pendingTab = null;
    /* True while an open is in flight, so Connect cannot be pressed twice. */
    var opening = false;
    /* Id whose VNC overflow menu is open, or null. */
    var menuFor = null;
    /* Resolver waiting on the clipboard-paste dialog, or null. */
    var clipWait = null;

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
        return { ok: false, reason: C.VNC_ERR_RELAY_URL || 'Add a Relay URL on this connection first.' };
      }
      if (!norm.ok) return { ok: false, reason: norm.reason || 'Enter a valid relay URL.' };
      if (norm.insecure) return { ok: true, url: norm.url, warn: norm.warn, insecure: true };
      return { ok: true, url: norm.url };
    }

    /* The VNC tab currently shown, or null. */
    function activeTab() {
      var t = tabs.current();
      return t && t.protocol === 'vnc' ? t : null;
    }

    /* Open the connect sheet for a saved VNC connection.
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
      $('connect-note').textContent = C.VNC_SECURITY_NOTE || '';
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
      if (!r.ok) err = r.reason;
      else if (r.insecure) err = r.warn || C.VNC_ERR_WS_ON_HTTPS;
      else if (r.warn) warn = r.warn;
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

    /* Create (or return) the screen host living on this tab. */
    function ensureScreen(tab) {
      if (tab.screen) return tab.screen;
      var host = document.createElement('div');
      host.className = 'vnc-screen';
      host.hidden = true;
      $('vnc-sessions').appendChild(host);
      tab.screen = host;
      return host;
    }

    /* Tear down the screen DOM and RFB for a tab that has been closed. */
    function disposeScreen(tab) {
      detachRfb(tab, true);
      if (tab && tab.screen && tab.screen.parentNode) {
        tab.screen.parentNode.removeChild(tab.screen);
        tab.screen = null;
      }
    }

    /* Bind a live session so closing the tab also closes the VNC connection. */
    function bindClient(tab) {
      tab.client = {
        close: function () {
          tab.password = '';
          tab.hasPass = false;
          disposeScreen(tab);
        },
        isBusy: function () { return false; }
      };
    }

    /* Draw the status line for the active tab (or the given tab if it is showing). */
    function setStatus(tab, text, kind) {
      tab.status = text || '';
      tab.statusKind = kind || '';
      if (activeTab() && activeTab().id === tab.id) {
        var el = $('vnc-status');
        el.textContent = tab.status;
        el.className = 'hint' + (kind === 'err' ? ' err' : (kind === 'warn' ? ' warn' : ''));
      }
    }

    /* Apply saved quality and compression to a live RFB and remember them on the tab. */
    function applyLevels(tab, quality, compression) {
      tab.quality = Client.clampLevel(quality, Client.qualityOf({}));
      tab.compression = Client.clampLevel(compression, Client.compressionOf({}));
      if (tab.rfb) {
        try { tab.rfb.qualityLevel = tab.quality; } catch (e) { /* ignore */ }
        try { tab.rfb.compressionLevel = tab.compression; } catch (e) { /* ignore */ }
      }
      persistLevels(tab);
    }

    /* Write quality and compression back onto the saved connection (never the password). */
    function persistLevels(tab) {
      var conn = store.get(tab.connId);
      if (!conn) return;
      store.save({
        id: conn.id,
        name: conn.name,
        protocol: conn.protocol,
        host: conn.host,
        port: conn.port,
        user: conn.user,
        relay: conn.relay,
        token: conn.token,
        folder: conn.folder,
        url: conn.url,
        group: conn.group,
        notes: conn.notes,
        quality: tab.quality,
        compression: tab.compression
      });
    }

    /* Drop the current RFB without forgetting the in-memory password unless silent is false via disconnect(). */
    function detachRfb(tab, silent) {
      if (!tab) return;
      tab.live = false;
      var rfb = tab.rfb;
      tab.rfb = null;
      if (rfb) {
        try { rfb.disconnect(); } catch (e) { /* already closed */ }
      }
      if (!silent && tab.screen) {
        /* Keep the empty host so Reconnect can reuse it. */
      }
    }

    /* Start noVNC against the built relay URL and attach it to this tab. */
    function attachRfb(tab, url, pass) {
      detachRfb(tab, true);
      ensureScreen(tab);
      tab.authFail = false;
      tab.state = 'connecting';
      setStatus(tab, 'Connecting\u2026', 'warn');
      return Client.loadRfb().then(function (RFB) {
        /* The tab may have been closed while the module was loading. */
        if (!tab.screen) return;
        var rfb = new RFB(tab.screen, url, { credentials: { password: pass || '' } });
        tab.rfb = rfb;
        rfb.scaleViewport = tab.scale !== false;
        rfb.clipViewport = !rfb.scaleViewport;
        rfb.resizeSession = false;
        rfb.showDotCursor = true;
        rfb.qualityLevel = tab.quality;
        rfb.compressionLevel = tab.compression;
        rfb.addEventListener('connect', function () {
          tab.live = true;
          tab.state = 'connected';
          tab.authFail = false;
          setStatus(tab, 'Connected to ' + (tab.name || 'VNC') + '.', '');
          toast('Connected');
        });
        rfb.addEventListener('credentialsrequired', function () {
          if (pass && !tab.authFail) {
            try { rfb.sendCredentials({ password: pass }); } catch (e) { /* ignore */ }
            return;
          }
          tab.password = '';
          tab.hasPass = false;
          setStatus(tab, C.VNC_ERR_AUTH || 'Login failed. Check the password.', 'err');
          var conn = store.get(tab.connId);
          if (conn) startConnect(conn, tab);
        });
        rfb.addEventListener('securityfailure', function (ev) {
          tab.authFail = true;
          tab.password = '';
          tab.hasPass = false;
          tab.state = 'authfail';
          var info = Client.explainAuth(ev && ev.detail);
          setStatus(tab, info.message, 'err');
        });
        rfb.addEventListener('disconnect', function (ev) {
          if (tab.rfb !== rfb && tab.rfb) return;
          tab.rfb = null;
          tab.live = false;
          var info = Client.explainClose(ev && ev.detail, tab.state);
          if (tab.authFail && info.code !== 'auth') {
            /* securityfailure already filled the status line. */
            return;
          }
          setStatus(tab, info.message, info.code === 'closed' && ev && ev.detail && ev.detail.clean ? '' : 'err');
        });
        rfb.addEventListener('clipboard', function (ev) {
          var text = ev && ev.detail && ev.detail.text;
          if (text && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(function () { /* ignore */ });
          }
        });
        rfb.addEventListener('desktopname', function (ev) {
          if (ev && ev.detail && ev.detail.name) {
            setStatus(tab, 'Connected: ' + ev.detail.name, '');
          }
        });
      }).catch(function (err) {
        var msg = (err && err.message) || (C.VNC_ERR_LIB || 'The VNC viewer failed to load.');
        setStatus(tab, msg, 'err');
        throw err;
      });
    }

    /* Submit the connect sheet: open VNC, then add or reuse a tab. */
    function submitConnect(ev) {
      if (ev) ev.preventDefault();
      if (opening || !pending || pending.protocol !== 'vnc') return;
      var conn = pending;
      var tabReuse = pendingTab;
      var r = relayUrl(conn);
      if (!r.ok) { connectError(r.reason); return; }
      if (r.insecure) { connectError(r.warn || C.VNC_ERR_WS_ON_HTTPS); return; }
      var built = Client.buildRelayUrl(r.url, conn.host, conn.port);
      if (!built.ok) { connectError(built.reason); return; }
      var pass = $('c-pass').value;
      opening = true;
      $('btn-connect-go').disabled = true;
      connectError('Connecting\u2026', true);
      var tab = tabReuse || null;
      if (!tab) {
        tab = tabs.openSession({
          connId: conn.id,
          name: conn.name,
          protocol: 'vnc',
          client: null
        });
      }
      tab.connId = conn.id;
      tab.name = conn.name;
      tab.password = pass;
      tab.hasPass = true;
      tab.scale = tab.scale !== false;
      tab.viewOnly = !!tab.viewOnly;
      tab.quality = Client.qualityOf(conn);
      tab.compression = Client.compressionOf(conn);
      ensureScreen(tab);
      bindClient(tab);
      attachRfb(tab, built.url, pass).then(function () {
        opening = false;
        $('c-pass').value = '';
        closeConnect();
        showSession(tab);
      }).catch(function (err) {
        opening = false;
        openingCtlSafe();
        var msg = (err && err.message) || String(err);
        connectError(msg);
        setStatus(tab, msg, 'err');
        $('btn-connect-go').disabled = false;
      });
    }

    /* Clear the opening flag if a leftover abort path runs. */
    function openingCtlSafe() {
      opening = false;
      $('btn-connect-go').disabled = false;
    }

    /* Explicit disconnect: close the socket, forget the in-memory password, keep the tab. */
    function disconnect(tab) {
      if (!tab) tab = activeTab();
      if (!tab) return;
      tab.password = '';
      tab.hasPass = false;
      detachRfb(tab, true);
      setStatus(tab, C.VNC_ERR_CLOSED_CLEAN || 'Disconnected.', '');
    }

    /* Reconnect the active (or given) tab, asking for the password again if it was cleared. */
    function reconnect(tab) {
      if (!tab) tab = activeTab();
      if (!tab || tab.live || opening) return;
      var conn = store.get(tab.connId);
      if (!conn) { toast('That connection was not found.'); return; }
      if (tab.hasPass) {
        /* Reuse the in-memory password from this tab (never written to storage),
         * including an empty one used on servers with no VNC password. */
        pending = conn;
        pendingTab = tab;
        $('c-pass').value = tab.password || '';
        submitConnect();
        return;
      }
      startConnect(conn, tab);
    }

    /* Show this VNC tab's screen and status (session stays alive while hidden). */
    function showSession(tab) {
      if (!tab || tab.protocol !== 'vnc') return;
      var hosts = $('vnc-sessions');
      if (hosts) {
        Array.prototype.forEach.call(hosts.children, function (el) {
          el.hidden = !(tab.screen && el === tab.screen);
        });
      }
      if (tab.screen) tab.screen.hidden = false;
      setStatus(tab, tab.status || (tab.live ? 'Connected.' : 'Disconnected.'), tab.statusKind || '');
      updateKbdButton();
      if (tab.rfb && typeof tab.rfb.focus === 'function') {
        setTimeout(function () { try { tab.rfb.focus(); } catch (e) { /* ignore */ } }, 0);
      }
    }

    /* Show the on-screen-keyboard button on a coarse (touch) pointer. */
    function updateKbdButton() {
      var btn = $('vnc-btn-kbd');
      if (!btn) return;
      var touch = window.matchMedia && matchMedia('(pointer: coarse)').matches;
      btn.hidden = !touch || !activeTab();
    }

    /* Focus the hidden input so a phone can type into the remote desktop. */
    function openKeyboard() {
      var tab = activeTab();
      var kbd = $('vnc-kbd');
      if (!tab || !tab.rfb || !kbd) { toast('Not connected'); return; }
      kbd.value = '';
      kbd.focus();
    }

    /* Send one character or a special key through the live RFB. */
    function sendTyped(rfb, key, ch) {
      if (!rfb) return;
      var special = {
        Backspace: [0xff08, 'Backspace'],
        Enter: [0xff0d, 'Enter'],
        Tab: [0xff09, 'Tab'],
        Escape: [0xff1b, 'Escape']
      }[key];
      if (special) {
        rfb.sendKey(special[0], special[1]);
        return;
      }
      if (!ch) return;
      var cp = ch.codePointAt(0);
      rfb.sendKey(cp < 256 ? cp : (0x1000000 + cp));
    }

    /* Toggle scale-to-fit vs 1:1 on the active tab. */
    function toggleScale(tab) {
      if (!tab) return;
      tab.scale = tab.scale === false;
      if (tab.rfb) {
        tab.rfb.scaleViewport = tab.scale;
        tab.rfb.clipViewport = !tab.scale;
      }
      toast(tab.scale ? 'Scale: fit' : 'Scale: 1:1');
    }

    /* Toggle view-only on the active tab. */
    function toggleViewOnly(tab) {
      if (!tab) return;
      tab.viewOnly = !tab.viewOnly;
      if (tab.rfb) tab.rfb.viewOnly = tab.viewOnly;
      toast('View only: ' + (tab.viewOnly ? 'on' : 'off'));
    }

    /* Open or exit fullscreen on the VNC pane. */
    function toggleFullscreen() {
      var pane = $('view-vnc');
      if (!pane) return;
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(function () { toast('Fullscreen not allowed'); });
        return;
      }
      pane.requestFullscreen().catch(function () { toast('Fullscreen not allowed'); });
    }

    /* Open a paste box when the clipboard cannot be read. Resolves to the text or null. */
    function askClip() {
      if (clipWait) clipWait(null);
      $('vnc-clip-text').value = '';
      if ($('vnc-clip') && !$('vnc-clip').open) $('vnc-clip').showModal();
      setTimeout(function () { $('vnc-clip-text').focus(); }, 0);
      return new Promise(function (resolve) { clipWait = resolve; });
    }

    /* Close the clipboard box and resolve with the given text (or null). */
    function finishClip(text) {
      if ($('vnc-clip') && $('vnc-clip').open) $('vnc-clip').close();
      var fn = clipWait;
      clipWait = null;
      if (fn) fn(text == null ? null : String(text));
    }

    /* Send clipboard text to the remote desktop. */
    function sendClipboard(tab) {
      if (!tab || !tab.rfb) { toast('Not connected'); return; }
      var rfb = tab.rfb;
      var fromNav = (navigator.clipboard && navigator.clipboard.readText)
        ? navigator.clipboard.readText()
        : Promise.reject(new Error('no clipboard'));
      fromNav.then(function (t) { return t; }, function () { return askClip(); }).then(function (t) {
        if (!t) return;
        try { rfb.clipboardPasteFrom(t); toast('Clipboard sent'); } catch (e) { toast('Could not send clipboard'); }
      });
    }

    /* Nudge quality or compression by delta (−1 or +1) and save it. */
    function bumpLevel(tab, which, delta) {
      if (!tab) return;
      if (which === 'quality') applyLevels(tab, tab.quality + delta, tab.compression);
      else applyLevels(tab, tab.quality, tab.compression + delta);
      toast('Quality ' + tab.quality + ', compression ' + tab.compression);
    }

    /* Apply the Low-bandwidth preset and save it on the connection. */
    function applyLowBw(tab) {
      if (!tab) return;
      var p = Client.lowBandwidth();
      applyLevels(tab, p.quality, p.compression);
      toast('Low bandwidth (quality ' + tab.quality + ', compression ' + tab.compression + ')');
    }

    /* Refresh overflow-menu labels for the active tab. */
    function syncMenu(tab) {
      if (!tab) return;
      $('vnc-menu-scale').textContent = 'Scale: ' + (tab.scale === false ? '1:1' : 'fit');
      $('vnc-menu-view').textContent = 'View only: ' + (tab.viewOnly ? 'on' : 'off');
      $('vnc-menu-disc').textContent = tab.live ? 'Disconnect' : 'Reconnect';
      $('vnc-menu-q-minus').textContent = 'Quality ' + (typeof tab.quality === 'number' ? tab.quality : '') + ' −';
      $('vnc-menu-q-plus').textContent = 'Quality +';
      $('vnc-menu-c-minus').textContent = 'Compression ' + (typeof tab.compression === 'number' ? tab.compression : '') + ' −';
      $('vnc-menu-c-plus').textContent = 'Compression +';
    }

    /* Open or toggle the VNC overflow menu under the ⋯ button. */
    function toggleMenu(btn) {
      var tab = activeTab();
      if (!tab) return;
      var m = $('vnc-menu');
      if (menuFor === tab.id && !m.hidden) { closeMenu(); return; }
      menuFor = tab.id;
      syncMenu(tab);
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

    /* Hide the VNC overflow menu. */
    function closeMenu() {
      var m = $('vnc-menu');
      /* (before RM7) if (m) m.hidden = true; */
      if (m && root.RMUI) root.RMUI.hideFloat(m);
      else if (m) m.hidden = true;
      menuFor = null;
    }

    /* Wire the sheet, keyboard, overflow menu and dialogs once. */
    $('connect-form').addEventListener('submit', submitConnect);
    $('btn-connect-cancel').addEventListener('click', function (e) {
      e.preventDefault();
      closeConnect();
    });
    $('vnc-btn-more').addEventListener('click', function (e) {
      e.stopPropagation();
      toggleMenu($('vnc-btn-more'));
    });
    if ($('vnc-btn-edit')) $('vnc-btn-edit').addEventListener('click', function () {
      closeMenu();
      var t = activeTab();
      if (t && opts.onEdit) opts.onEdit(t.connId);
    });
    $('vnc-btn-kbd').addEventListener('click', function () {
      openKeyboard();
    });
    $('vnc-menu-cad').addEventListener('click', function () {
      closeMenu();
      var t = activeTab();
      if (!t || !t.rfb || !t.live) { toast('Not connected'); return; }
      t.rfb.sendCtrlAltDel();
      toast('Sent Ctrl+Alt+Del');
    });
    $('vnc-menu-clip').addEventListener('click', function () {
      closeMenu();
      sendClipboard(activeTab());
    });
    $('vnc-menu-kbd').addEventListener('click', function () {
      closeMenu();
      openKeyboard();
    });
    $('vnc-menu-scale').addEventListener('click', function () {
      toggleScale(activeTab());
      syncMenu(activeTab());
    });
    $('vnc-menu-view').addEventListener('click', function () {
      toggleViewOnly(activeTab());
      syncMenu(activeTab());
    });
    $('vnc-menu-full').addEventListener('click', function () {
      closeMenu();
      toggleFullscreen();
    });
    $('vnc-menu-low').addEventListener('click', function () {
      applyLowBw(activeTab());
      syncMenu(activeTab());
    });
    $('vnc-menu-q-minus').addEventListener('click', function () {
      bumpLevel(activeTab(), 'quality', -1);
      syncMenu(activeTab());
    });
    $('vnc-menu-q-plus').addEventListener('click', function () {
      bumpLevel(activeTab(), 'quality', 1);
      syncMenu(activeTab());
    });
    $('vnc-menu-c-minus').addEventListener('click', function () {
      bumpLevel(activeTab(), 'compression', -1);
      syncMenu(activeTab());
    });
    $('vnc-menu-c-plus').addEventListener('click', function () {
      bumpLevel(activeTab(), 'compression', 1);
      syncMenu(activeTab());
    });
    $('vnc-menu-disc').addEventListener('click', function () {
      closeMenu();
      var t = activeTab();
      if (!t) return;
      if (t.live) disconnect(t);
      else reconnect(t);
    });
    $('vnc-clip-form').addEventListener('submit', function (e) {
      e.preventDefault();
      finishClip($('vnc-clip-text').value);
    });
    $('vnc-clip-cancel').addEventListener('click', function (e) {
      e.preventDefault();
      finishClip(null);
    });
    var kbd = $('vnc-kbd');
    kbd.addEventListener('input', function () {
      var t = activeTab();
      if (!t || !t.rfb) { kbd.value = ''; return; }
      var v = kbd.value;
      for (var i = 0; i < v.length; i++) sendTyped(t.rfb, '', v.charAt(i));
      kbd.value = '';
    });
    kbd.addEventListener('keydown', function (e) {
      var t = activeTab();
      if (!t || !t.rfb) return;
      if ({ Backspace: 1, Enter: 1, Tab: 1, Escape: 1 }[e.key]) {
        sendTyped(t.rfb, e.key, '');
        e.preventDefault();
      }
    });
    document.addEventListener('click', function (e) {
      if ($('vnc-menu').hidden) return;
      if (!e.target.closest('#vnc-menu') && !e.target.closest('#vnc-btn-more')) closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      closeMenu();
      if ($('vnc-clip') && $('vnc-clip').open) finishClip(null);
    });
    window.addEventListener('resize', updateKbdButton);
    updateKbdButton();

    /* Drop leftover screen hosts when a tab disappears. */
    tabs.onChange(function () {
      var hosts = $('vnc-sessions');
      if (!hosts) return;
      Array.prototype.forEach.call(hosts.children, function (el) {
        var keep = tabs.list().some(function (t) { return t.screen === el; });
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
  root.RMVncView = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
