/* Remote — rm_sftp_view.js: SFTP connect sheet, folder browse, transfers and file management (RM3, still used in RM6). */
(function (root) {
  'use strict';

  /* Modules loaded as script tags before this file. */
  var C = root.RM_CONFIG || (typeof require === 'function' ? require('./rm_config.js') : {});
  var Url = root.RMUrl || (typeof require === 'function' ? require('./rm_url.js') : {});
  var Path = root.RMSftpPath || (typeof require === 'function' ? require('./rm_sftp_path.js') : {});
  var Client = root.RMSftpClient || (typeof require === 'function' ? require('./rm_sftp_client.js') : {});
  var Xfer = root.RMSftpXfer || (typeof require === 'function' ? require('./rm_sftp_xfer.js') : {});

  /* Short getElementById helper. */
  function $(id) {
    return document.getElementById(id);
  }

  /* True when this browser can pick a folder (Chrome / Edge). */
  function canPickDir() {
    return typeof window.showDirectoryPicker === 'function';
  }

  /* True when this browser can show a save-file picker. */
  function canSavePicker() {
    return typeof window.showSaveFilePicker === 'function';
  }

  /* True on wide screens where the local+server two-pane layout is used. */
  function twoPane() {
    var min = C.TWO_PANE_MIN || 900;
    return !!(window.matchMedia && matchMedia('(min-width: ' + min + 'px)').matches);
  }

  /* Wire the SFTP view. opts: { store, tabs, toast, pageProtocol }. */
  function init(opts) {
    var store = opts.store;
    var tabs = opts.tabs;
    /* Connection waiting in the connect sheet, or null. */
    var pending = null;
    /* True while an open is in flight, so Connect cannot be pressed twice. */
    var opening = false;
    /* File currently shown in the details sheet, or null. */
    var detailsOf = null;
    /* Remote entry the overflow menu was opened for, or null. */
    var menuEntry = null;
    /* Resolver waiting on the name dialog, or null. */
    var nameWait = null;
    /* Resolver waiting on the overwrite dialog, or null. */
    var overwriteWait = null;
    /* Last tapped remote entry, used by "Download here" in the local pane. */
    var lastRemote = null;

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
      if (!raw.trim()) return { ok: false, reason: 'Add a Relay URL on this connection first (ws://192.168.x.x:8023 on a LAN, or wss:// on https).' + (C.SFTP_README_HINT || '') };
      if (!norm.ok) return { ok: false, reason: norm.reason || 'Enter a valid relay URL.' };
      if (norm.insecure) return { ok: true, url: norm.url, warn: norm.warn };
      return { ok: true, url: norm.url };
    }

    /* The tab whose SFTP session is currently shown, or null. */
    function activeTab() {
      var t = tabs.current();
      return t && t.client ? t : null;
    }

    /* Open the connect sheet for a saved SFTP connection. */
    function startConnect(conn) {
      if (!conn || conn.protocol !== 'sftp') return;
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
      var wrap = $('connect-token-wrap');
      if (wrap) wrap.hidden = false;
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
      if (!pending) return;
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

    /* Submit the connect sheet: open the relay, then add a tab and browse the start folder. */
    function submitConnect(ev) {
      if (ev) ev.preventDefault();
      if (opening || !pending || pending.protocol !== 'sftp') return;
      var conn = pending;
      var r = relayUrl(conn);
      if (!r.ok) { connectError(r.reason); return; }
      var pass = $('c-pass').value;
      var token = $('c-token').value;
      var remember = $('c-remember').checked;
      var root = (Path.normalizeRoot(conn.folder || '') || { ok: true, value: conn.folder || '' });
      if (!root.ok) { connectError(root.reason); return; }
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
        root: root.value || ''
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
            folder: conn.folder,
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
        ensureQueue(tab);
        return loadFolder(tab, []);
      }).catch(function (err) {
        opening = false;
        $('btn-connect-go').disabled = false;
        connectError((err && (err.explain || err.message)) || String(err));
      });
    }

    /* Attach a transfer queue to a tab and keep tab.busy in sync with it. */
    function ensureQueue(tab) {
      if (!tab) return null;
      if (tab.queue) return tab.queue;
      tab.queue = Xfer.makeQueue();
      tab.busy = false;
      tab.queue.onProgress(function (p) {
        tab.busy = tab.queue.isBusy();
        if (tabs.current().id === tab.id) renderProgress(p);
      });
      return tab.queue;
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

    /* Draw or hide the transfer progress bar for the active tab. */
    function renderProgress(p) {
      var box = $('sftp-progress');
      if (!p || !p.running) {
        if (!p || !p.cancelled) box.hidden = true;
        if (p && p.cancelled) {
          box.hidden = false;
          $('sftp-progress-text').textContent = C.XFER_CANCELLED || 'Cancelled.';
        }
        if (p && !p.running && p.done && !p.cancelled) {
          box.hidden = false;
          var skipped = '';
          $('sftp-progress-text').textContent = 'Done. ' + p.done + (p.total ? ' of ' + p.total : '') + ' item' + (p.done === 1 ? '' : 's') + (p.error ? ' Some errors: ' + p.error : '');
          var pct = p.totalBytes ? Math.min(100, Math.round(100 * p.bytes / p.totalBytes)) : 100;
          $('sftp-progress-bar').style.width = pct + '%';
        }
        return;
      }
      box.hidden = false;
      var pct = p.totalBytes ? Math.min(100, Math.round(100 * p.bytes / p.totalBytes)) : (p.total ? Math.min(100, Math.round(100 * p.done / p.total)) : 0);
      $('sftp-progress-bar').style.width = pct + '%';
      var bits = [];
      if (p.name) bits.push(p.name);
      if (p.total) bits.push((p.done + 1) + ' of ' + p.total);
      if (p.totalBytes) bits.push(Path.formatSize(p.bytes) + ' / ' + Path.formatSize(p.totalBytes));
      $('sftp-progress-text').textContent = bits.join(' · ') || 'Working…';
    }

    /* Draw breadcrumbs, list, local pane and empty state for the active SFTP tab. */
    function renderBrowse(tab) {
      if (!tab || tab.kind === 'connections') return;
      closeEntryMenu();
      $('sftp-open-local').hidden = !canPickDir();
      var rootLabel = tab.root || tab.name || '/';
      drawCrumbs($('sftp-crumbs'), Path.breadcrumbs(tab.path, rootLabel), function (p) { loadFolder(tab, p); });
      $('sftp-up').disabled = !tab.path.length;
      var wrap = $('sftp-list');
      wrap.textContent = '';
      var entries = tab.entries || [];
      $('sftp-empty').hidden = entries.length > 0;
      entries.forEach(function (e) { wrap.appendChild(entryEl(tab, e, 'remote')); });
      if (tab.client && tab.client.isOpen && !tab.client.isOpen()) setStatus('Disconnected.', true);
      else if (!entries.length) setStatus('');
      else setStatus('');
      renderLocal(tab);
      if (tab.queue) renderProgress(tab.queue.snapshot());
    }

    /* Draw a breadcrumb trail into an element. */
    function drawCrumbs(el, crumbs, onGo) {
      el.textContent = '';
      crumbs.forEach(function (c, i, all) {
        if (i) {
          var sep = document.createElement('span');
          sep.className = 'crumb-sep';
          sep.textContent = '/';
          el.appendChild(sep);
        }
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'crumb jelly' + (i === all.length - 1 ? ' current' : '');
        b.textContent = c.label;
        b.addEventListener('click', function () { onGo(c.path); });
        el.appendChild(b);
      });
    }

    /* One folder or file row, with a single overflow button for actions. */
    function entryEl(tab, e, side) {
      var row = document.createElement('div');
      row.className = 'entry jelly' + (side === 'remote' && lastRemote && lastRemote.tab === tab && lastRemote.entry && lastRemote.entry.name === e.name ? ' selected' : '');
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
      var more = document.createElement('button');
      more.type = 'button';
      more.className = 'more jelly';
      more.setAttribute('aria-label', 'Actions for ' + e.name);
      more.textContent = '\u22EF';
      more.addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (side === 'remote') lastRemote = { tab: tab, entry: e };
        openEntryMenu(more, tab, e, side);
      });
      row.appendChild(kind);
      row.appendChild(body);
      row.appendChild(more);
      function open() {
        if (side === 'remote') lastRemote = { tab: tab, entry: e };
        if (e.isDir) {
          if (side === 'local') loadLocal(tab, e.handle, (tab.local.path || []).concat(e.name));
          else {
            var next = Path.join(tab.path, e.name);
            if (typeof next === 'string') { setStatus(next, true); return; }
            loadFolder(tab, next);
          }
        } else if (side === 'remote') {
          showFile(tab, e);
        } else {
          lastRemote = lastRemote;
          tab.local.selected = e;
          renderLocal(tab);
        }
      }
      row.addEventListener('click', open);
      row.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
      });
      return row;
    }

    /* Build and show the overflow menu for a row. */
    function openEntryMenu(btn, tab, e, side) {
      var m = $('entry-menu');
      if (menuEntry && menuEntry.name === e.name && !m.hidden && menuEntry.side === side) { closeEntryMenu(); return; }
      menuEntry = { name: e.name, side: side };
      m.hidden = false;
      m.textContent = '';
      function item(label, fn, danger) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'jelly' + (danger ? ' danger-text' : '');
        b.setAttribute('role', 'menuitem');
        b.textContent = label;
        b.addEventListener('click', function () { closeEntryMenu(); fn(); });
        m.appendChild(b);
      }
      if (side === 'remote') {
        if (e.isDir) {
          item('Open', function () { loadFolder(tab, Path.join(tab.path, e.name)); });
          if (canPickDir() || (tab.local && tab.local.handle)) item('Download folder', function () { downloadFolder(tab, e); });
        } else {
          item('Download', function () { downloadFile(tab, e); });
          item('Details', function () { showFile(tab, e); });
        }
        item('Rename', function () { renameEntry(tab, e); });
        item('Delete', function () { deleteEntry(tab, e); }, true);
      } else {
        if (e.isDir) item('Open', function () { loadLocal(tab, e.handle, (tab.local.path || []).concat(e.name)); });
        item('Upload to server', function () { uploadLocalEntry(tab, e); });
      }
      var r = btn.getBoundingClientRect();
      m.style.top = (window.scrollY + r.bottom + 4) + 'px';
      var left = window.scrollX + r.right - m.offsetWidth;
      var maxLeft = window.scrollX + window.innerWidth - m.offsetWidth - 8;
      m.style.left = Math.max(8, Math.min(left, maxLeft)) + 'px';
    }

    /* Hide the row overflow menu. */
    function closeEntryMenu() {
      var m = $('entry-menu');
      if (m) m.hidden = true;
      menuEntry = null;
    }

    /* File details sheet, now with a Download button. */
    function showFile(tab, e) {
      detailsOf = { tab: tab, entry: e };
      $('file-name').textContent = e.name;
      var p = Path.join(tab.path, e.name);
      $('file-path').textContent = Path.formatPath(typeof p === 'string' ? tab.path.concat(e.name) : p, tab.root || tab.name || '/');
      $('file-size').textContent = Path.formatSize(e.size);
      $('file-date').textContent = Path.formatTime(e.mtime) || '—';
      var cap = tab.client && tab.client.max;
      var chk = Xfer.checkSize(e.size, cap, e.name);
      $('file-hint').textContent = chk.ok ? (C.SFTP_FILE_HINT || '') : chk.message;
      $('btn-file-download').disabled = !chk.ok;
      $('file-details').showModal();
    }

    /* Ask for a name in the name dialog. Resolves to the name, or null if cancelled. */
    function askName(title, initial) {
      return new Promise(function (resolve) {
        if (nameWait) nameWait(null);
        nameWait = resolve;
        $('name-dlg-title').textContent = title;
        $('name-dlg-input').value = initial || '';
        $('name-dlg-err').hidden = true;
        $('name-dlg-err').textContent = '';
        if (!$('name-dlg').open) $('name-dlg').showModal();
        setTimeout(function () { $('name-dlg-input').focus(); $('name-dlg-input').select(); }, 0);
      });
    }

    /* Finish the name dialog with a value (or null). */
    function finishName(val) {
      var fn = nameWait;
      nameWait = null;
      if ($('name-dlg').open) $('name-dlg').close();
      if (fn) fn(val);
    }

    /* Ask what to do when a name already exists. Resolves to overwrite, skip, overwrite-all, or cancel. */
    function askOverwrite(name) {
      return new Promise(function (resolve) {
        if (overwriteWait) overwriteWait('cancel');
        overwriteWait = resolve;
        $('overwrite-text').textContent = name + (C.OVERWRITE_ASK || ' already exists. Overwrite it?');
        if (!$('overwrite-dlg').open) $('overwrite-dlg').showModal();
      });
    }

    /* Finish the overwrite dialog. */
    function finishOverwrite(val) {
      var fn = overwriteWait;
      overwriteWait = null;
      if ($('overwrite-dlg').open) $('overwrite-dlg').close();
      if (fn) fn(val);
    }

    /* Save an ArrayBuffer or Blob under a file name (picker when available, else a blob download). */
    function saveBlob(name, data) {
      var blob = data instanceof Blob ? data : new Blob([data]);
      if (canSavePicker()) {
        return window.showSaveFilePicker({ suggestedName: name }).then(function (h) {
          return h.createWritable().then(function (w) {
            return w.write(blob).then(function () { return w.close(); });
          });
        }).catch(function (err) {
          if (err && err.name === 'AbortError') return;
          fallbackDownload(name, blob);
        });
      }
      fallbackDownload(name, blob);
      return Promise.resolve();
    }

    /* Trigger a browser download of a blob. */
    function fallbackDownload(name, blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    }

    /* Write a file into a local directory handle, creating or replacing it. */
    function writeIntoDir(dirHandle, name, data) {
      return dirHandle.getFileHandle(name, { create: true }).then(function (fh) {
        return fh.createWritable().then(function (w) {
          var blob = data instanceof Blob ? data : new Blob([data]);
          return w.write(blob).then(function () { return w.close(); });
        });
      });
    }

    /* Download one remote file, checking the relay max first. */
    function downloadFile(tab, e) {
      var cap = tab.client.max;
      var chk = Xfer.checkSize(e.size, cap, e.name);
      if (!chk.ok) { setStatus(chk.message, true); toast(chk.message); return Promise.resolve(); }
      var path = Path.parts(tab.path).concat(e.name);
      var into = twoPane() && tab.local && tab.local.handle;
      ensureQueue(tab);
      if (tab.queue.isBusy()) { toast('A transfer is already running.'); return Promise.resolve(); }
      if ($('file-details').open) $('file-details').close();
      return tab.queue.run([{ kind: 'file', path: path, name: e.name, size: e.size || 0 }], function (job) {
        return tab.client.read(job.path).then(function (data) {
          if (into) return writeIntoDir(tab.local.handle, job.name, data);
          return saveBlob(job.name, data);
        });
      }).then(function (r) { afterTransfer(tab, r); });
    }

    /* Recursively download a remote folder into a picked (or current local) directory. */
    function downloadFolder(tab, e) {
      var start = Path.parts(tab.path).concat(e.name);
      var cap = tab.client.max;
      ensureQueue(tab);
      if (tab.queue.isBusy()) { toast('A transfer is already running.'); return Promise.resolve(); }
      var destP = (twoPane() && tab.local && tab.local.handle)
        ? Promise.resolve(tab.local.handle)
        : (canPickDir() ? window.showDirectoryPicker() : Promise.reject(new Error('This browser cannot pick a folder. Use Chrome or Edge.')));
      return destP.then(function (rootHandle) {
        return rootHandle.getDirectoryHandle(e.name, { create: true }).then(function (folderHandle) {
          return Xfer.planRemoteTree(function (p) { return tab.client.list(p); }, start, cap).then(function (plan) {
            if (plan.skipped.length) toast(plan.skipped[0].message || (plan.skipped.length + ' file(s) skipped (too large).'));
            /* Map each planned path so it is relative to the folder being downloaded. */
            var rel = start.length;
            return tab.queue.run(plan.jobs, function (job) {
              var rest = job.path.slice(rel);
              if (job.kind === 'dir') return ensureLocalDir(folderHandle, rest);
              return ensureLocalDir(folderHandle, rest.slice(0, -1)).then(function (dir) {
                return tab.client.read(job.path).then(function (data) {
                  return writeIntoDir(dir, job.name, data);
                });
              });
            }, plan.skipped);
          });
        });
      }).then(function (r) {
        if (r) afterTransfer(tab, r);
        if (tab.local && tab.local.handle) return loadLocal(tab, tab.local.handle, tab.local.path);
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        setStatus((err && (err.explain || err.message)) || String(err), true);
      });
    }

    /* Create nested local directories under a root handle; resolves to the leaf handle. */
    function ensureLocalDir(rootHandle, partsArr) {
      var segs = partsArr || [];
      var i = 0;
      var h = rootHandle;
      function next() {
        if (i >= segs.length) return Promise.resolve(h);
        return h.getDirectoryHandle(segs[i++], { create: true }).then(function (d) { h = d; return next(); });
      }
      return next();
    }

    /* Refresh the list and toast a short transfer summary. */
    function afterTransfer(tab, r) {
      loadFolder(tab, tab.path);
      if (!r) return;
      if (r.cancelled) toast(C.XFER_CANCELLED || 'Cancelled.');
      else if (r.failed && r.failed.length) toast('Finished with ' + r.failed.length + ' error(s).');
      else if (r.skipped && r.skipped.length) toast('Done. ' + r.skipped.length + ' file(s) skipped (too large for the relay).');
      else toast('Done.');
    }

    /* Upload a list of local nodes (relative paths + File) into the current remote folder. */
    function uploadNodes(tab, nodes) {
      var cap = tab.client.max;
      var plan = Xfer.planLocalTree(nodes, cap);
      if (plan.skipped.length) toast(plan.skipped[0].message || (plan.skipped.length + ' file(s) skipped (too large).'));
      if (!plan.jobs.length) {
        if (plan.skipped.length) setStatus(plan.skipped[0].message, true);
        return Promise.resolve();
      }
      ensureQueue(tab);
      if (tab.queue.isBusy()) { toast('A transfer is already running.'); return Promise.resolve(); }
      var mode = 'ask';
      return tab.queue.run(plan.jobs, function (job) {
        var dest = Path.parts(tab.path).concat(job.path);
        if (job.kind === 'dir') {
          return tab.client.mkdir(dest).catch(function (err) {
            if (err && err.sftp === 'exists') return;
            throw err;
          });
        }
        var parent = dest.slice(0, -1);
        return tab.client.list(parent).then(function (entries) {
          var how = Xfer.mergeConflict(job, Xfer.nameConflict(entries, job.name).existing);
          if (how === 'type-mismatch') return Promise.reject(new Error(job.name + ' already exists as a folder.'));
          if (how === 'conflict') {
            if (mode === 'overwrite-all') return writeJob();
            return askOverwrite(job.name).then(function (d) {
              if (d === 'overwrite-all') { mode = 'overwrite-all'; return writeJob(); }
              if (d === 'overwrite') return writeJob();
              if (d === 'skip') return;
              var e = new Error('Cancelled.');
              tab.queue.cancel();
              throw e;
            });
          }
          return writeJob();
        });
        function writeJob() {
          return fileToBuffer(job.node && job.node.file).then(function (buf) {
            return tab.client.write(dest, buf, job.name);
          });
        }
      }, plan.skipped).then(function (r) { afterTransfer(tab, r); });
    }

    /* Read a File or Blob into an ArrayBuffer. */
    function fileToBuffer(file) {
      if (!file) return Promise.resolve(new ArrayBuffer(0));
      if (file.arrayBuffer) return file.arrayBuffer();
      return new Promise(function (resolve, reject) {
        var r = new FileReader();
        r.onload = function () { resolve(r.result); };
        r.onerror = function () { reject(r.error); };
        r.readAsArrayBuffer(file);
      });
    }

    /* Turn a file input or a drop of files into local-tree nodes. */
    function nodesFromFiles(fileList) {
      var nodes = [];
      var i;
      for (i = 0; i < fileList.length; i++) {
        var f = fileList[i];
        var rel = (f.webkitRelativePath || f.name || '').replace(/\\/g, '/');
        var segs = rel.split('/').filter(function (n) { return n && n !== '.'; });
        if (!segs.length) continue;
        /* Ensure parent folders exist in the plan when a relative path is present. */
        var a = [];
        segs.slice(0, -1).forEach(function (n) {
          a = a.concat(n);
          if (!nodes.some(function (x) { return x.isDir && x.parts.join('/') === a.join('/'); })) {
            nodes.push({ parts: a.slice(), name: n, isDir: true, size: 0 });
          }
        });
        nodes.push({ parts: segs, name: segs[segs.length - 1], isDir: false, size: f.size || 0, file: f });
      }
      return nodes;
    }

    /* Recursively walk a webkit directory entry into local-tree nodes. */
    function walkEntry(entry, prefix) {
      prefix = prefix || [];
      return new Promise(function (resolve) {
        if (entry.isFile) {
          entry.file(function (f) {
            resolve([{ parts: prefix.concat(entry.name), name: entry.name, isDir: false, size: f.size || 0, file: f }]);
          }, function () { resolve([]); });
          return;
        }
        if (!entry.isDirectory) { resolve([]); return; }
        var dirNode = { parts: prefix.concat(entry.name), name: entry.name, isDir: true, size: 0 };
        var reader = entry.createReader();
        var all = [];
        function readBatch() {
          reader.readEntries(function (batch) {
            if (!batch.length) {
              var chain = Promise.resolve();
              var kids = [];
              batch = all;
              batch.forEach(function (child) {
                chain = chain.then(function () { return walkEntry(child, dirNode.parts); }).then(function (nodes) { kids = kids.concat(nodes); });
              });
              chain.then(function () { resolve([dirNode].concat(kids)); });
              return;
            }
            all = all.concat(batch);
            readBatch();
          }, function () { resolve([dirNode]); });
        }
        readBatch();
      });
    }

    /* Walk a dropped DataTransfer into local-tree nodes. */
    function nodesFromDrop(dt) {
      var items = dt && dt.items;
      if (items && items.length && items[0].webkitGetAsEntry) {
        var pendingWalk = [];
        var i;
        for (i = 0; i < items.length; i++) {
          var ent = items[i].webkitGetAsEntry && items[i].webkitGetAsEntry();
          if (ent) pendingWalk.push(walkEntry(ent, []));
        }
        return Promise.all(pendingWalk).then(function (groups) {
          return groups.reduce(function (a, b) { return a.concat(b); }, []);
        });
      }
      return Promise.resolve(nodesFromFiles(dt.files || []));
    }

    /* Upload the current local-pane selection into the current server folder. */
    function uploadLocalEntry(tab, e) {
      if (!e) return Promise.resolve();
      if (!e.isDir && e.file) {
        return uploadNodes(tab, [{ parts: [e.name], name: e.name, isDir: false, size: e.size || 0, file: e.file }]);
      }
      if (e.isDir && e.handle) {
        return walkLocalHandle(e.handle, [e.name]).then(function (nodes) {
          nodes.unshift({ parts: [e.name], name: e.name, isDir: true, size: 0 });
          return uploadNodes(tab, nodes);
        });
      }
      return Promise.resolve();
    }

    /* Recursively list a local directory handle into tree nodes, prefixed with prefix. */
    function walkLocalHandle(handle, prefix) {
      var nodes = [];
      function walk(dir, pre) {
        return iterEntries(dir).then(function (list) {
          var i = 0;
          function next() {
            if (i >= list.length) return Promise.resolve();
            var item = list[i++];
            var p = pre.concat(item.name);
            if (item.handle.kind === 'directory') {
              nodes.push({ parts: p, name: item.name, isDir: true, size: 0, handle: item.handle });
              return walk(item.handle, p).then(next);
            }
            return item.handle.getFile().then(function (f) {
              nodes.push({ parts: p, name: item.name, isDir: false, size: f.size || 0, file: f, handle: item.handle });
            }).then(next, next);
          }
          return next();
        });
      }
      return walk(handle, prefix || []).then(function () { return nodes; });
    }

    /* Collect {name, handle} from a directory handle's entries(). */
    function iterEntries(handle) {
      var out = [];
      var it = handle.entries();
      function step() {
        return it.next().then(function (r) {
          if (r.done) return out;
          var v = r.value;
          var name = Array.isArray(v) ? v[0] : v.name;
          var h = Array.isArray(v) ? v[1] : v;
          out.push({ name: name, handle: h });
          return step();
        });
      }
      /* Also support a for-await style sync iterator if next is not a promise. */
      if (!it || typeof it.next !== 'function') return Promise.resolve(out);
      try {
        return step();
      } catch (e) {
        return Promise.resolve(out);
      }
    }

    /* List a local folder handle and store it on the tab. */
    function loadLocal(tab, handle, path) {
      tab.local = tab.local || {};
      tab.local.handle = handle;
      tab.local.path = path || [];
      tab.local.selected = null;
      return iterEntries(handle).then(function (list) {
        var i = 0;
        var entries = [];
        function next() {
          if (i >= list.length) {
            tab.local.entries = Path.sortEntries(entries);
            if (tabs.current().id === tab.id) renderLocal(tab);
            return;
          }
          var item = list[i++];
          var e = { name: item.name, isDir: item.handle.kind === 'directory', size: 0, mtime: 0, handle: item.handle };
          if (e.isDir) { entries.push(e); return next(); }
          return item.handle.getFile().then(function (f) {
            e.size = f.size || 0;
            e.mtime = f.lastModified || 0;
            e.file = f;
            entries.push(e);
          }).then(next, next);
        }
        return next();
      });
    }

    /* Draw the local pane when a folder is picked and the viewport is wide enough. */
    function renderLocal(tab) {
      var pane = $('sftp-local');
      var panes = $('sftp-panes');
      var show = !!(tab.local && tab.local.handle && twoPane());
      panes.classList.toggle('split', show);
      pane.hidden = !show;
      if (!show) return;
      var label = (tab.local.path && tab.local.path.length) ? tab.local.path.join('/') : (tab.local.handle.name || 'This device');
      drawCrumbs($('local-crumbs'), Path.breadcrumbs(tab.local.path || [], tab.local.handle.name || 'This device'), function (p) {
        drillLocal(tab, p);
      });
      $('local-up').disabled = !(tab.local.path && tab.local.path.length);
      var wrap = $('local-list');
      wrap.textContent = '';
      var entries = tab.local.entries || [];
      $('local-empty').hidden = entries.length > 0;
      entries.forEach(function (e) { wrap.appendChild(entryEl(tab, e, 'local')); });
    }

    /* Open a local subfolder by walking from the root handle along path. */
    function drillLocal(tab, path) {
      var segs = path || [];
      var h = tab.local.rootHandle || tab.local.handle;
      /* Keep the picked root on first open. */
      if (!tab.local.rootHandle) tab.local.rootHandle = tab.local.handle;
      h = tab.local.rootHandle;
      var i = 0;
      function next() {
        if (i >= segs.length) return loadLocal(tab, h, segs);
        return h.getDirectoryHandle(segs[i++]).then(function (d) { h = d; return next(); });
      }
      return next();
    }

    /* Pick a local folder (Chrome / Edge) and show it in the two-pane layout when wide enough. */
    function openLocalFolder(tab) {
      if (!canPickDir()) { toast('This browser cannot pick a folder. Use Chrome or Edge.'); return; }
      window.showDirectoryPicker().then(function (h) {
        tab.local = { rootHandle: h, handle: h, path: [], entries: [] };
        return loadLocal(tab, h, []);
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        toast((err && err.message) || 'Could not open that folder.');
      });
    }

    /* New folder on the server. */
    function newFolder(tab) {
      return askName('New folder', '').then(function (name) {
        if (!name) return;
        return tab.client.mkdir(Path.parts(tab.path).concat(name)).then(function () {
          toast('Created ' + name);
          return loadFolder(tab, tab.path);
        }).catch(function (err) {
          setStatus((err && (err.explain || err.message)) || String(err), true);
        });
      });
    }

    /* Rename a remote entry. The relay refuses the new name if it already exists. */
    function renameEntry(tab, e) {
      return askName('Rename', e.name).then(function (name) {
        if (!name || name === e.name) return;
        var from = Path.parts(tab.path).concat(e.name);
        var to = Path.parts(tab.path).concat(name);
        return tab.client.rename(from, to).then(function () {
          toast('Renamed to ' + name);
          return loadFolder(tab, tab.path);
        }).catch(function (err) {
          setStatus((err && (err.explain || err.message)) || String(err), true);
        });
      });
    }

    /* Delete a remote file, or a folder (recursive, after confirm). */
    function deleteEntry(tab, e) {
      var msg = e.isDir ? (C.DELETE_FOLDER || 'Delete this folder and everything inside it?') : (C.DELETE_FILE || 'Delete this file?');
      if (!confirm(msg + '\n' + e.name)) return Promise.resolve();
      var path = Path.parts(tab.path).concat(e.name);
      return tab.client.remove(path, !!e.isDir).then(function () {
        toast('Deleted ' + e.name);
        return loadFolder(tab, tab.path);
      }).catch(function (err) {
        setStatus((err && (err.explain || err.message)) || String(err), true);
      });
    }

    /* Show the browse view when its tab is selected (session stays alive). */
    function showSession(tab) {
      if (!tab || !tab.client) return;
      renderBrowse(tab);
    }

    /* True when any open SFTP tab has a transfer running (for beforeunload and tab close). */
    function anyBusy() {
      return tabs.list().some(function (t) {
        return !!(t.busy || (t.queue && t.queue.isBusy()) || (t.client && t.client.isBusy && t.client.isBusy()));
      });
    }

    /* Wire the sheet, browse, transfer and dialog controls once. */
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
    $('sftp-upload').addEventListener('click', function () { $('sftp-file-input').click(); });
    $('sftp-file-input').addEventListener('change', function (ev) {
      var t = activeTab();
      var files = ev.target.files;
      ev.target.value = '';
      if (t && files && files.length) uploadNodes(t, nodesFromFiles(files));
    });
    $('sftp-mkdir').addEventListener('click', function () {
      var t = activeTab();
      if (t) newFolder(t);
    });
    $('sftp-open-local').addEventListener('click', function () {
      var t = activeTab();
      if (t) openLocalFolder(t);
    });
    $('sftp-cancel').addEventListener('click', function () {
      var t = activeTab();
      if (t && t.queue) t.queue.cancel();
    });
    $('local-up').addEventListener('click', function () {
      var t = activeTab();
      if (t && t.local) drillLocal(t, (t.local.path || []).slice(0, -1));
    });
    $('local-upload').addEventListener('click', function () {
      var t = activeTab();
      if (!t || !t.local) return;
      var sel = t.local.selected || (lastRemote && lastRemote.tab === t && lastRemote.entry && lastRemote.entry.handle ? lastRemote.entry : null);
      /* If nothing is selected, upload the whole current local folder's files. */
      if (sel && sel.handle) uploadLocalEntry(t, sel);
      else if (t.local.handle) {
        walkLocalHandle(t.local.handle, []).then(function (nodes) { return uploadNodes(t, nodes); });
      }
    });
    $('local-download').addEventListener('click', function () {
      var t = activeTab();
      if (!t || !lastRemote || lastRemote.tab !== t) { toast('Tap a server file or folder first.'); return; }
      if (lastRemote.entry.isDir) downloadFolder(t, lastRemote.entry);
      else downloadFile(t, lastRemote.entry);
    });
    $('btn-file-close').addEventListener('click', function () {
      if ($('file-details').open) $('file-details').close();
    });
    $('btn-file-download').addEventListener('click', function () {
      if (detailsOf) downloadFile(detailsOf.tab, detailsOf.entry);
    });
    $('name-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var n = $('name-dlg-input').value.trim();
      if (!Path.isValidName(n)) {
        $('name-dlg-err').textContent = C.BAD_NAME;
        $('name-dlg-err').hidden = false;
        return;
      }
      finishName(n);
    });
    $('name-cancel').addEventListener('click', function (e) { e.preventDefault(); finishName(null); });
    $('name-dlg').addEventListener('close', function () { if (nameWait) finishName(null); });
    $('ov-overwrite').addEventListener('click', function () { finishOverwrite('overwrite'); });
    $('ov-skip').addEventListener('click', function () { finishOverwrite('skip'); });
    $('ov-all').addEventListener('click', function () { finishOverwrite('overwrite-all'); });
    $('ov-cancel').addEventListener('click', function () { finishOverwrite('cancel'); });
    $('overwrite-dlg').addEventListener('close', function () { if (overwriteWait) finishOverwrite('cancel'); });

    /* Drag and drop files or folders onto the server list. */
    var list = $('sftp-list');
    list.addEventListener('dragover', function (e) { e.preventDefault(); list.classList.add('drop-target'); });
    list.addEventListener('dragleave', function () { list.classList.remove('drop-target'); });
    list.addEventListener('drop', function (e) {
      e.preventDefault();
      list.classList.remove('drop-target');
      var t = activeTab();
      if (!t) return;
      nodesFromDrop(e.dataTransfer).then(function (nodes) {
        if (nodes && nodes.length) return uploadNodes(t, nodes);
      }).catch(function (err) { setStatus((err && err.message) || String(err), true); });
    });

    document.addEventListener('click', function (e) {
      if ($('entry-menu').hidden) return;
      if (!e.target.closest('#entry-menu') && !e.target.closest('.more')) closeEntryMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeEntryMenu();
    });
    window.addEventListener('beforeunload', function (e) {
      if (!anyBusy()) return;
      e.preventDefault();
      e.returnValue = '';
    });
    if (window.matchMedia) {
      matchMedia('(min-width: ' + (C.TWO_PANE_MIN || 900) + 'px)').addEventListener('change', function () {
        var t = activeTab();
        if (t) renderLocal(t);
      });
    }

    return {
      startConnect: startConnect,
      showSession: showSession,
      renderBrowse: renderBrowse,
      closeConnect: closeConnect,
      anyBusy: anyBusy
    };
  }

  /* Public API. */
  var api = { init: init };
  root.RMSftpView = api;
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
