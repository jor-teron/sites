/* Remote — rm_ui.js: DOM for the RM7 connections list, session tabs, editor, toast and overflow menu. */
(function (root) {
  'use strict';

  /* Config, store helpers and the relay normalizer are loaded as script tags before this file. */
  var C = root.RM_CONFIG || (typeof require === 'function' ? require('./rm_config.js') : {});
  var Url = root.RMUrl || (typeof require === 'function' ? require('./rm_url.js') : {});

  /* Short getElementById helper used everywhere in this file. */
  function $(id) {
    return document.getElementById(id);
  }

  /**
   * Where an overflow menu should sit in the visible window.
   * anchor and view are viewport coordinates (the same space as getBoundingClientRect
   * and position:fixed). size is the menu's width and height.
   * The menu opens under the anchor and flips above it when the bottom would fall
   * outside the window, then shifts in from the edges. Document scroll is not added:
   * a Hub window clips anything painted past the iframe.
   */
  function placeMenuBox(anchor, size, view) {
    var margin = 8;
    var gap = 4;
    var w = size && size.w ? size.w : 0;
    var h = size && size.h ? size.h : 0;
    var vw = view && view.w ? view.w : 0;
    var vh = view && view.h ? view.h : 0;
    anchor = anchor || { left: margin, right: margin, top: margin, bottom: margin };
    var top = anchor.bottom + gap;
    var left = anchor.right - w;
    if (top + h > vh - margin) top = anchor.top - gap - h;
    if (top + h > vh - margin) top = vh - margin - h;
    if (top < margin) top = margin;
    if (left + w > vw - margin) left = vw - margin - w;
    if (left < margin) left = margin;
    return { top: top, left: left };
  }

  /* Viewport rect of an element, for placeMenuBox. */
  function anchorRect(el) {
    var r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
  }

  /* A point in the viewport (right-click or long-press). The menu opens beside it. */
  function anchorPoint(x, y) {
    return { left: x, top: y, right: x, bottom: y };
  }

  /* Show a menu in the top layer when the browser supports popover, and always un-hide it. */
  function showFloat(el) {
    if (!el) return;
    el.hidden = false;
    el.classList.add('is-open');
    if (typeof el.showPopover === 'function') {
      try {
        if (!el.matches(':popover-open')) el.showPopover();
      } catch (e) { /* already open, or this browser has no top layer */ }
    }
  }

  /* Hide a menu and leave the top layer. */
  function hideFloat(el) {
    if (!el) return;
    if (typeof el.hidePopover === 'function') {
      try {
        if (el.matches(':popover-open')) el.hidePopover();
      } catch (e) { /* already hidden */ }
    }
    el.classList.remove('is-open');
    el.hidden = true;
  }

  /* Pin a shown menu to the visible window. Call after showFloat so the size is real. */
  function placeMenu(el, anchor) {
    if (!el) return { top: 0, left: 0 };
    var box = placeMenuBox(anchor, { w: el.offsetWidth, h: el.offsetHeight }, {
      w: window.innerWidth,
      h: window.innerHeight
    });
    el.style.top = box.top + 'px';
    el.style.left = box.left + 'px';
    return box;
  }

  /* Resolver for the in-app confirm card, or null. */
  var confirmWait = null;

  /* Ask with the in-app card. Resolves true for the OK button, false for Cancel or Escape. */
  function confirmAsk(o) {
    o = o || {};
    var dlg = document.getElementById('confirm-dlg');
    if (!dlg || typeof dlg.showModal !== 'function') return Promise.resolve(false);
    return new Promise(function (resolve) {
      if (confirmWait) {
        var prev = confirmWait;
        confirmWait = null;
        prev(false);
      }
      confirmWait = resolve;
      var title = document.getElementById('confirm-title');
      var text = document.getElementById('confirm-text');
      var ok = document.getElementById('confirm-ok');
      if (title) title.textContent = o.title || 'Are you sure?';
      if (text) {
        text.textContent = o.text || '';
        text.hidden = !o.text;
      }
      if (ok) {
        ok.textContent = o.ok || 'OK';
        ok.classList.toggle('danger', !!o.danger);
      }
      if (!dlg.open) dlg.showModal();
      setTimeout(function () {
        var cancel = document.getElementById('confirm-cancel');
        if (cancel) cancel.focus();
      }, 0);
    });
  }

  /* Close the confirm card and answer the waiting caller. */
  function finishConfirm(yes) {
    var fn = confirmWait;
    confirmWait = null;
    var dlg = document.getElementById('confirm-dlg');
    if (dlg && dlg.open) dlg.close();
    if (fn) fn(!!yes);
  }

  /* Wire the confirm card once. Safe to call again. */
  function wireConfirm() {
    if (wireConfirm.done || typeof document === 'undefined') return;
    var dlg = document.getElementById('confirm-dlg');
    var cancel = document.getElementById('confirm-cancel');
    var ok = document.getElementById('confirm-ok');
    if (!dlg || !cancel || !ok) return;
    wireConfirm.done = true;
    cancel.addEventListener('click', function (e) {
      e.preventDefault();
      finishConfirm(false);
    });
    ok.addEventListener('click', function (e) {
      e.preventDefault();
      finishConfirm(true);
    });
    dlg.addEventListener('close', function () {
      if (!confirmWait) return;
      var fn = confirmWait;
      confirmWait = null;
      fn(false);
    });
  }

  /* Apply the Hub theme (sites-hub.theme) or fall back to the system color scheme. */
  function applyTheme() {
    /* Saved Hub value: 'dark', 'light', or empty meaning follow the device. */
    var t = '';
    try { t = localStorage.getItem(C.HUB_THEME_KEY) || ''; } catch (e) { t = ''; }
    /* Dark when the Hub says so, or when the Hub is unset and the device is dark. */
    var dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }

  /* Wire the page. opts.store is a RMStore.make(...) instance. */
  function init(opts) {
    /* The connections store bound to this page's localStorage. */
    var store = opts.store;
    /* Live text of the search box. */
    var query = '';
    /* Id of the connection in the editor, or null when adding. */
    var editingId = null;
    /* True once the user has typed in the port field of the open editor. */
    var portEdited = false;
    /* Protocol the port field was last auto-filled for. */
    var portProtocol = C.DEFAULT_PROTOCOL;
    /* Id whose overflow menu is open, or null. */
    var menuFor = null;
    /* Timer that hides the toast. */
    var toastTimer = null;

    /* Show a short message at the bottom of the screen. */
    function toast(msg) {
      var el = $('toast');
      el.textContent = msg;
      el.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(function () { el.hidden = true; }, C.TOAST_MS);
    }

    /* Protocol of this page, used to fill in ws:// vs wss:// on a bare relay host. */
    function pageProtocol() {
      return (location.protocol || 'https:').toLowerCase();
    }

    /* Redraw the list from the current store and search box. */
    function render() {
      var list = store.search(query);
      var groups = store.grouped(list);
      var wrap = $('list');
      wrap.textContent = '';
      $('empty').hidden = list.length > 0;
      groups.forEach(function (g) {
        if (g.label) {
          var h = document.createElement('h2');
          h.className = 'group-head';
          h.textContent = g.label;
          wrap.appendChild(h);
        }
        g.items.forEach(function (conn) {
          wrap.appendChild(rowEl(conn));
        });
      });
      closeMenu();
      renderTabs();
      showPane();
    }

    /* Build one 48px tap row with a protocol badge and a single overflow button. */
    function rowEl(conn) {
      var row = document.createElement('div');
      row.className = 'conn jelly';
      row.setAttribute('role', 'button');
      row.tabIndex = 0;
      row.dataset.id = conn.id;

      var badge = document.createElement('span');
      badge.className = 'badge badge-' + conn.protocol;
      badge.textContent = C.PROTOCOL_LABELS[conn.protocol] || conn.protocol;

      var body = document.createElement('div');
      body.className = 'conn-body';
      var nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = conn.name;
      var sub = document.createElement('div');
      sub.className = 'sub';
      /* user@host:port, with IPv6 hosts wrapped in brackets. */
      var who = conn.user ? conn.user + '@' : '';
      var host = conn.host.indexOf(':') >= 0 ? '[' + conn.host + ']' : conn.host;
      sub.textContent = who + host + ':' + conn.port;
      body.appendChild(nm);
      body.appendChild(sub);

      var more = document.createElement('button');
      more.type = 'button';
      more.className = 'more jelly';
      more.setAttribute('aria-label', 'Actions for ' + conn.name);
      more.setAttribute('aria-haspopup', 'menu');
      more.textContent = '\u22EF';
      /* (before RM7) more.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleMenu(more, conn);
      }); */
      more.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleMenu(more, conn);
      });

      row.appendChild(badge);
      row.appendChild(body);
      row.appendChild(more);

      /* Long-press opens the same menu as the ⋯ button. A short tap still opens the session. */
      var hold = null;
      var holdX = 0;
      var holdY = 0;
      var suppressClick = false;
      function clearHold() {
        if (hold) { clearTimeout(hold); hold = null; }
      }
      row.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        if (e.target.closest && e.target.closest('button')) return;
        holdX = e.clientX;
        holdY = e.clientY;
        clearHold();
        hold = setTimeout(function () {
          hold = null;
          suppressClick = true;
          armSwallow();
          openMenu(conn, anchorPoint(holdX, holdY));
        }, C.LONG_PRESS_MS || 500);
      });
      row.addEventListener('pointermove', function (e) {
        if (!hold) return;
        if (Math.hypot(e.clientX - holdX, e.clientY - holdY) > 10) clearHold();
      });
      row.addEventListener('pointerup', clearHold);
      row.addEventListener('pointercancel', clearHold);
      row.addEventListener('contextmenu', function (e) {
        /* Shift keeps the browser menu (the Hub's escape hatch). */
        if (e.shiftKey) return;
        e.preventDefault();
        e.stopPropagation();
        clearHold();
        suppressClick = true;
        armSwallow();
        openMenu(conn, anchorPoint(e.clientX, e.clientY));
      });

      row.addEventListener('click', function (e) {
        if (suppressClick) {
          suppressClick = false;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        var a = store.tapAction(conn);
        if ((a.action === 'sftp' || a.action === 'ssh' || a.action === 'webdav' || a.action === 'vnc') && opts.onOpen) opts.onOpen(conn);
        else toast(a.message);
      });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          row.click();
        }
      });
      return row;
    }

    /* Clicks that belong to the gesture which opened the menu (long-press / right-click). */
    var swallowUntil = 0;
    function armSwallow() { swallowUntil = Date.now() + 350; }

    /* Hide the overflow menu. */
    function closeMenu() {
      /* (before RM7) var m = $('menu'); m.hidden = true; menuFor = null; */
      hideFloat($('menu'));
      menuFor = null;
    }

    /*
     * RM7: the menu used to be position:absolute at window.scrollY + the button bottom.
     * A Hub window clips its iframe, and a saved row sits low in that short frame, so
     * Edit / Duplicate / Delete opened below the fold and could not be clicked.
     * The menu is now position:fixed to the visible window and flips upward when it
     * would not fit. It is also a manual popover so it paints above tabs and dialogs.
     */
    function openMenu(conn, anchor) {
      var m = $('menu');
      menuFor = conn.id;
      m.dataset.id = conn.id;
      m.style.top = '0px';
      m.style.left = '0px';
      showFloat(m);
      placeMenu(m, anchor);
    }

    /* Open or toggle the overflow menu under a row's ⋯ button. */
    /* (before RM7)
    function toggleMenu(btn, conn) {
      var m = $('menu');
      if (menuFor === conn.id && !m.hidden) { closeMenu(); return; }
      menuFor = conn.id;
      m.hidden = false;
      m.dataset.id = conn.id;
      var r = btn.getBoundingClientRect();
      m.style.top = (window.scrollY + r.bottom + 4) + 'px';
      var left = window.scrollX + r.right - m.offsetWidth;
      var maxLeft = window.scrollX + window.innerWidth - m.offsetWidth - 8;
      m.style.left = Math.max(8, Math.min(left, maxLeft)) + 'px';
    }
    */
    function toggleMenu(btn, conn) {
      var m = $('menu');
      if (menuFor === conn.id && !m.hidden) { closeMenu(); return; }
      openMenu(conn, anchorRect(btn));
    }

    /* Draw the Remmina-style tab strip: Connections first, then open sessions. */
    function renderTabs() {
      var nav = $('tabs');
      if (!nav || !opts.tabs) return;
      nav.textContent = '';
      var cur = opts.tabs.current();
      opts.tabs.list().forEach(function (tab) {
        var b = document.createElement('div');
        b.className = 'tab jelly' + (cur && cur.id === tab.id ? ' active' : '');
        b.setAttribute('role', 'tab');
        b.tabIndex = 0;
        b.setAttribute('aria-selected', cur && cur.id === tab.id ? 'true' : 'false');
        b.setAttribute('aria-label', tab.name);
        if (tab.protocol) {
          var badge = document.createElement('span');
          badge.className = 'badge badge-' + tab.protocol;
          badge.textContent = C.PROTOCOL_LABELS[tab.protocol] || tab.protocol;
          b.appendChild(badge);
        }
        var label = document.createElement('span');
        label.className = 'tab-name';
        label.textContent = tab.name;
        b.appendChild(label);
        b.addEventListener('click', function () { opts.tabs.select(tab.id); });
        b.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.tabs.select(tab.id); }
        });
        if (tab.closable) {
          var x = document.createElement('button');
          x.type = 'button';
          x.className = 'tab-close jelly';
          x.setAttribute('aria-label', 'Close ' + tab.name);
          x.textContent = '\u00d7';
          x.addEventListener('click', function (e) {
            e.stopPropagation();
            requestClose(tab.id);
          });
          b.appendChild(x);
        }
        nav.appendChild(b);
      });
    }

    /* Show the connections list or the active session view. Sessions stay alive while hidden. */
    function showPane() {
      var onList = !opts.tabs || opts.tabs.isConnections();
      var tab = opts.tabs ? opts.tabs.current() : null;
      var isFiles = !onList && tab && (tab.protocol === 'sftp' || tab.protocol === 'webdav');
      var isSsh = !onList && tab && tab.protocol === 'ssh';
      var isVnc = !onList && tab && tab.protocol === 'vnc';
      if ($('view-list')) $('view-list').hidden = !onList;
      if ($('view-sftp')) $('view-sftp').hidden = !isFiles;
      if ($('view-ssh')) $('view-ssh').hidden = !isSsh;
      if ($('view-vnc')) $('view-vnc').hidden = !isVnc;
      if ($('app')) $('app').classList.toggle('wide', !!(isSsh || isVnc));
      if (!onList && opts.onShowSession) opts.onShowSession(tab);
    }

    /* Close a session tab. Confirm only if a transfer is running (hook for RM3). */
    function requestClose(id) {
      if (!opts.tabs) return;
      var r = opts.tabs.close(id);
      if (!r.ok && r.reason === 'busy') {
        /* (before RM7) if (confirm(C.TAB_CLOSE_BUSY)) opts.tabs.close(id, { confirmed: true }); */
        confirmAsk({ title: C.TAB_CLOSE_BUSY, ok: 'Close', danger: true }).then(function (yes) {
          if (yes && opts.tabs) opts.tabs.close(id, { confirmed: true });
          renderTabs();
          showPane();
        });
        return;
      }
      renderTabs();
      showPane();
    }

    /* Fill the editor with a connection, or with SFTP defaults when adding. */

    function fillForm(conn) {
      var f = $('edit-form');
      var proto = conn && conn.protocol ? conn.protocol : C.DEFAULT_PROTOCOL;
      f.elements.name.value = conn && conn.name ? conn.name : '';
      f.elements.protocol.value = proto;
      f.elements.host.value = conn && conn.host ? conn.host : '';
      f.elements.port.value = conn && conn.port ? conn.port : String(C.DEFAULT_PORTS[proto]);
      f.elements.user.value = conn && conn.user ? conn.user : '';
      f.elements.relay.value = conn && conn.relay ? conn.relay : '';
      f.elements.token.value = conn && conn.token ? conn.token : '';
      f.elements.folder.value = conn && conn.folder ? conn.folder : '';
      f.elements.group.value = conn && conn.group ? conn.group : '';
      f.elements.notes.value = conn && conn.notes ? conn.notes : '';
      if (f.elements.url) f.elements.url.value = conn && conn.url ? conn.url : '';
      if (f.elements.quality) f.elements.quality.value = String(conn && typeof conn.quality === 'number' ? conn.quality : (C.VNC_QUALITY_DEFAULT || 6));
      if (f.elements.compression) f.elements.compression.value = String(conn && typeof conn.compression === 'number' ? conn.compression : (C.VNC_COMPRESSION_DEFAULT || 2));
      portProtocol = proto;
      portEdited = !!(conn && String(conn.port) !== String(C.DEFAULT_PORTS[proto]));
      $('edit-title').textContent = conn && conn.id ? 'Edit connection' : 'Add connection';
      $('edit-err').hidden = true;
      $('edit-err').textContent = '';
      updateProtocolFields();
      updateRelayHint();
      updateUrlHint();
    }

    /* Open the add/edit dialog. */
    function openEditor(conn) {
      editingId = conn && conn.id ? conn.id : null;
      fillForm(conn || null);
      $('edit').showModal();
      setTimeout(function () { $('f-name').focus(); }, 0);
    }

    /* Close the add/edit dialog. */
    function closeEditor() {
      if ($('edit').open) $('edit').close();
      editingId = null;
    }

    /* Read the form, normalizing the relay against this page's protocol. */
    function formValues() {
      var f = $('edit-form');
      var relayRaw = f.elements.relay.value;
      var norm = Url.normalizeRelay(relayRaw, pageProtocol());
      return {
        id: editingId || undefined,
        name: f.elements.name.value,
        protocol: f.elements.protocol.value,
        host: f.elements.host.value,
        port: f.elements.port.value,
        user: f.elements.user.value,
        relay: relayRaw.trim() ? (norm.ok ? norm.url : relayRaw) : '',
        token: f.elements.token.value,
        folder: f.elements.folder.value,
        url: f.elements.url ? f.elements.url.value : '',
        group: f.elements.group.value,
        notes: f.elements.notes.value,
        quality: f.elements.quality ? f.elements.quality.value : '',
        compression: f.elements.compression ? f.elements.compression.value : '',
        _relayNorm: norm
      };
    }

    /* Live hint under the relay field: preview, warning, or error. */
    function updateRelayHint() {
      var raw = $('edit-form').elements.relay.value;
      var hint = $('relay-hint');
      var norm = Url.normalizeRelay(raw, pageProtocol());
      if (!raw.trim()) {
        hint.textContent = 'Optional. Accepts ws:// or wss://, or a bare host. SSH and VNC use port 8022, SFTP uses 8023.';
        hint.className = 'hint';
        return;
      }
      if (!norm.ok) {
        hint.textContent = norm.reason;
        hint.className = 'hint err';
        return;
      }
      if (norm.insecure) {
        hint.textContent = norm.warn;
        hint.className = 'hint warn';
        return;
      }
      hint.textContent = norm.url;
      hint.className = 'hint';
    }


    /* Fill the VNC quality and compression fields with the Low-bandwidth preset. */
    function applyLowBandwidthPreset() {
      var pset = { quality: C.VNC_QUALITY_LOW, compression: C.VNC_COMPRESSION_LOW };
      if (typeof pset.quality !== 'number') pset.quality = 0;
      if (typeof pset.compression !== 'number') pset.compression = 9;
      if ($('f-quality')) $('f-quality').value = String(pset.quality);
      if ($('f-compression')) $('f-compression').value = String(pset.compression);
    }

    /* Show or hide URL / host / relay fields so the editor matches the chosen protocol. */
    function updateProtocolFields() {
      var proto = $('edit-form').elements.protocol.value;
      var isDav = proto === 'webdav';
      var isVnc = proto === 'vnc';
      if ($('field-url')) $('field-url').hidden = !isDav;
      if ($('field-host')) $('field-host').hidden = isDav;
      if ($('field-relay')) $('field-relay').hidden = isDav;
      if ($('field-token')) $('field-token').hidden = isDav || isVnc;
      if ($('field-vnc')) $('field-vnc').hidden = !isVnc;
      if ($('field-folder')) $('field-folder').hidden = isVnc;
      if ($('folder-hint')) {
        $('folder-hint').textContent = isDav
          ? 'WebDAV only. A folder under the base URL. Leave empty for the base URL itself.'
          : 'SFTP only. Sent as the relay start folder (root). Leave empty for the account home.';
      }
    }

    /* Live hint under the WebDAV URL: preview, mixed-content warning, or error. */
    function updateUrlHint() {
      var hint = $('url-hint');
      if (!hint || !$('edit-form').elements.url) return;
      var raw = $('edit-form').elements.url.value;
      var DavUrl = root.RMDavUrl;
      if (!DavUrl) return;
      var norm = DavUrl.normalize(raw, { port: $('edit-form').elements.port.value, pageProtocol: pageProtocol() });
      if (!raw.trim()) {
        hint.textContent = 'https:// or http://. No relay. The server must allow CORS. See the README.';
        hint.className = 'hint';
        return;
      }
      if (!norm.ok) {
        hint.textContent = norm.reason;
        hint.className = 'hint err';
        return;
      }
      if (norm.insecure) {
        hint.textContent = norm.warn;
        hint.className = 'hint warn';
        return;
      }
      hint.textContent = norm.url;
      hint.className = 'hint';
      /* Keep the port field in sync when it is still the previous default. */
      if (!portEdited && $('edit-form').elements.port.value !== String(norm.port)) {
        $('edit-form').elements.port.value = String(norm.port);
        portProtocol = 'webdav';
      }
    }

    /* When the protocol changes, auto-fill the port unless the user edited it. */
    function onProtocolChange() {
      var f = $('edit-form');
      var next = f.elements.protocol.value;
      var n = store.portAfterProtocolChange(next, f.elements.port.value, portProtocol);
      f.elements.port.value = String(n);
      if (!portEdited) {
        /* Still auto-filled, so a later protocol change may replace it again. */
        portEdited = false;
      } else {
        /* Keep the edited flag only if the kept value is not the new default. */
        portEdited = String(n) !== String(store.defaultPort(next));
      }
      portProtocol = next;
      /* Switching to WebDAV can prefill the URL from a host already typed in the form. */
      if (next === 'webdav' && f.elements.url && !f.elements.url.value.trim() && f.elements.host.value.trim()) {
        f.elements.url.value = 'https://' + f.elements.host.value.trim() + '/';
      }
      updateProtocolFields();
      updateUrlHint();
    }

    /* Validate and save the open editor. */
    function saveEditor(ev) {
      if (ev) ev.preventDefault();
      var v = formValues();
      if (v.protocol !== 'webdav' && v.relay && !v._relayNorm.ok) {
        $('edit-err').textContent = v._relayNorm.reason;
        $('edit-err').hidden = false;
        return;
      }
      var r = store.save(v);
      if (typeof r === 'string') {
        $('edit-err').textContent = r;
        $('edit-err').hidden = false;
        return;
      }
      closeEditor();
      if (opts.tabs) {
        opts.tabs.list().forEach(function (t) {
          if (t.connId === r.id) t.name = r.name;
        });
      }
      render();
      toast('Saved ' + r.name);
    }

    /* Confirm and delete a connection. The card is in-app: a Hub window blocks confirm(). */
    function onDelete(id) {
      var c = store.get(id);
      if (!c) return;
      closeMenu();
      /* (before RM7)
      if (!confirm('Delete "' + c.name + '"?')) return;
      store.remove(id);
      closeMenu();
      closeEditor();
      render();
      toast('Deleted ' + c.name);
      */
      confirmAsk({ title: 'Delete "' + c.name + '"?', ok: 'Delete', danger: true }).then(function (yes) {
        if (!yes || !store.get(id)) return;
        store.remove(id);
        closeEditor();
        render();
        toast('Deleted ' + c.name);
      });
    }

    /* Duplicate a connection and refresh the list. */
    function onDuplicate(id) {
      var r = store.duplicate(id);
      closeMenu();
      if (typeof r === 'string') { toast(r); return; }
      render();
      toast('Duplicated ' + r.name);
    }

    /* Download the list as a JSON file. */
    function exportJson() {
      var text = store.exportJSON();
      var blob = new Blob([text], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = C.EXPORT_FILENAME;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      toast('Exported');
    }

    /* Read a JSON file and merge it into the store. */
    function importJsonFile(file) {
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var r = store.importJSON(String(reader.result || ''));
        if (typeof r === 'string') { toast(r); return; }
        render();
        var msg = 'Imported ' + r.added + (r.added === 1 ? ' connection' : ' connections');
        if (r.skipped) msg += ', skipped ' + r.skipped;
        toast(msg);
      };
      reader.onerror = function () { toast('Could not read that file.'); };
      reader.readAsText(file);
    }

    /* Wire every control once. */
    $('btn-add').addEventListener('click', function () { openEditor(null); });
    $('btn-export').addEventListener('click', exportJson);
    $('btn-import').addEventListener('click', function () { $('import-file').click(); });
    $('import-file').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0];
      importJsonFile(f);
      e.target.value = '';
    });
    $('search').addEventListener('input', function (e) { query = e.target.value; render(); });
    $('edit-form').addEventListener('submit', saveEditor);
    $('btn-cancel').addEventListener('click', function (e) { e.preventDefault(); closeEditor(); });
    $('f-protocol').addEventListener('change', onProtocolChange);
    $('f-port').addEventListener('input', function () { portEdited = true; });
    $('f-relay').addEventListener('input', updateRelayHint);
    if ($('f-url')) $('f-url').addEventListener('input', updateUrlHint);
    if ($('btn-vnc-lowbw')) $('btn-vnc-lowbw').addEventListener('click', function (e) { e.preventDefault(); applyLowBandwidthPreset(); });
    $('menu-edit').addEventListener('click', function () {
      var id = $('menu').dataset.id;
      closeMenu();
      openEditor(store.get(id));
    });
    $('menu-dup').addEventListener('click', function () { onDuplicate($('menu').dataset.id); });
    $('menu-del').addEventListener('click', function () { onDelete($('menu').dataset.id); });
    document.addEventListener('click', function (e) {
      if (Date.now() < swallowUntil) {
        swallowUntil = 0;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }, true);
    document.addEventListener('click', function (e) {
      if ($('menu').hidden) return;
      if (!e.target.closest('#menu') && !e.target.closest('.more')) closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      closeMenu();
      /* A dialog handles its own Escape. Don't also close the editor behind a confirm card. */
      if (e.target && e.target.closest && e.target.closest('dialog')) return;
      if ($('edit').open) closeEditor();
    });
    window.addEventListener('scroll', function () { closeMenu(); }, true);
    window.addEventListener('resize', function () {
      if ($('menu') && !$('menu').hidden) closeMenu();
    });
    wireConfirm();
    window.addEventListener('storage', function (e) {
      if (e.key === C.LS_CONNS) render();
      if (e.key === C.HUB_THEME_KEY) applyTheme();
    });
    if (window.matchMedia) {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    }
    applyTheme();
    render();
    return { render: render, renderTabs: renderTabs, showPane: showPane, toast: toast, applyTheme: applyTheme, openEditor: openEditor, pageProtocol: pageProtocol, requestClose: requestClose };
  }

  /* Public API, also exported for Node tests (init itself needs a document). */
  var api = {
    init: init,
    applyTheme: applyTheme,
    placeMenuBox: placeMenuBox,
    placeMenu: placeMenu,
    showFloat: showFloat,
    hideFloat: hideFloat,
    anchorRect: anchorRect,
    anchorPoint: anchorPoint,
    confirm: confirmAsk
  };
  root.RMUI = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
