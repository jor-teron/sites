/* Remote — rm_ui.js: DOM for the RM1 connections list (theme, list, editor, toast, overflow menu). */
(function (root) {
  'use strict';

  /* Config, store helpers and the relay normalizer are loaded as script tags before this file. */
  var C = root.RM_CONFIG || (typeof require === 'function' ? require('./rm_config.js') : {});
  var Url = root.RMUrl || (typeof require === 'function' ? require('./rm_url.js') : {});

  /* Short getElementById helper used everywhere in this file. */
  function $(id) {
    return document.getElementById(id);
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
      more.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleMenu(more, conn);
      });

      row.appendChild(badge);
      row.appendChild(body);
      row.appendChild(more);
      row.addEventListener('click', function () {
        var a = store.tapAction(conn);
        toast(a.message);
      });
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          row.click();
        }
      });
      return row;
    }

    /* Hide the overflow menu. */
    function closeMenu() {
      var m = $('menu');
      m.hidden = true;
      menuFor = null;
    }

    /* Open or toggle the overflow menu under a row's ⋯ button. */
    function toggleMenu(btn, conn) {
      var m = $('menu');
      if (menuFor === conn.id && !m.hidden) { closeMenu(); return; }
      menuFor = conn.id;
      m.hidden = false;
      m.dataset.id = conn.id;
      /* Place the menu just under the button, kept on screen. */
      var r = btn.getBoundingClientRect();
      m.style.top = (window.scrollY + r.bottom + 4) + 'px';
      /* Measure after it is shown so offsetWidth is correct. */
      var left = window.scrollX + r.right - m.offsetWidth;
      var maxLeft = window.scrollX + window.innerWidth - m.offsetWidth - 8;
      m.style.left = Math.max(8, Math.min(left, maxLeft)) + 'px';
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
      f.elements.group.value = conn && conn.group ? conn.group : '';
      f.elements.notes.value = conn && conn.notes ? conn.notes : '';
      portProtocol = proto;
      portEdited = !!(conn && String(conn.port) !== String(C.DEFAULT_PORTS[proto]));
      $('edit-title').textContent = conn && conn.id ? 'Edit connection' : 'Add connection';
      $('edit-err').hidden = true;
      $('edit-err').textContent = '';
      updateRelayHint();
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
        group: f.elements.group.value,
        notes: f.elements.notes.value,
        _relayNorm: norm
      };
    }

    /* Live hint under the relay field: preview, warning, or error. */
    function updateRelayHint() {
      var raw = $('edit-form').elements.relay.value;
      var hint = $('relay-hint');
      var norm = Url.normalizeRelay(raw, pageProtocol());
      if (!raw.trim()) {
        hint.textContent = 'Optional. Accepts ws:// or wss://, or a bare host.';
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
    }

    /* Validate and save the open editor. */
    function saveEditor(ev) {
      if (ev) ev.preventDefault();
      var v = formValues();
      if (v.relay && !v._relayNorm.ok) {
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
      render();
      toast('Saved ' + r.name);
    }

    /* Confirm and delete a connection. */
    function onDelete(id) {
      var c = store.get(id);
      if (!c) return;
      if (!confirm('Delete "' + c.name + '"?')) return;
      store.remove(id);
      closeMenu();
      closeEditor();
      render();
      toast('Deleted ' + c.name);
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
    $('menu-edit').addEventListener('click', function () {
      var id = $('menu').dataset.id;
      closeMenu();
      openEditor(store.get(id));
    });
    $('menu-dup').addEventListener('click', function () { onDuplicate($('menu').dataset.id); });
    $('menu-del').addEventListener('click', function () { onDelete($('menu').dataset.id); });
    document.addEventListener('click', function (e) {
      if ($('menu').hidden) return;
      if (!e.target.closest('#menu') && !e.target.closest('.more')) closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      closeMenu();
      if ($('edit').open) closeEditor();
    });
    window.addEventListener('storage', function (e) {
      if (e.key === C.LS_CONNS) render();
      if (e.key === C.HUB_THEME_KEY) applyTheme();
    });
    if (window.matchMedia) {
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    }
    applyTheme();
    render();
    return { render: render, toast: toast, applyTheme: applyTheme, openEditor: openEditor };
  }

  /* Public API, also exported for Node tests (init itself needs a document). */
  var api = { init: init, applyTheme: applyTheme };
  root.RMUI = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
