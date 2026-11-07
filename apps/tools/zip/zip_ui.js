/* ZIP ZP1 — page behaviour. In-app dialogs only. No network. */
(function () {
  'use strict';

  var C = window.ZipCore;
  var items = [];
  var opened = null;
  var busy = false;
  var pending = null;
  var dlg = document.getElementById('dialog');
  var dlgTitle = document.getElementById('dlg-title');
  var dlgBody = document.getElementById('dlg-body');
  var dlgYes = document.getElementById('dlg-yes');
  var dlgNo = document.getElementById('dlg-no');
  var statusEl = document.getElementById('status');

  function setStatus(text) { statusEl.textContent = text || ''; }

  function ask(opts) {
    return new Promise(function (resolve) {
      dlgTitle.textContent = opts.title;
      dlgBody.textContent = opts.body || '';
      dlgYes.textContent = opts.yes || 'OK';
      dlgNo.hidden = !opts.no;
      if (opts.no) dlgNo.textContent = opts.no;
      dlg.hidden = false;
      dlgYes.focus();
      pending = function (value) {
        dlg.hidden = true;
        pending = null;
        resolve(value);
      };
    });
  }

  function saveBytes(bytes, name) {
    var blob = new Blob([bytes], { type: 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function baseName(path, taken) {
    var base = path.split('/').pop();
    var sp = C.safePath(base);
    if (!sp.ok || sp.path.indexOf('/') !== -1) base = 'file';
    else base = sp.path;
    if (taken[base]) base = C.uniqueName(base, taken) || 'file';
    taken[base] = 1;
    return base;
  }

  function zipFileName() {
    var raw = document.getElementById('zip-name').value.trim() || 'archive.zip';
    var sp = C.safePath(raw);
    if (!sp.ok || sp.dir || sp.path.indexOf('/') !== -1) return 'archive.zip';
    return /\.zip$/i.test(sp.path) ? sp.path : sp.path + '.zip';
  }

  function showTab(which) {
    var open = which === 'open';
    document.getElementById('pane-new').hidden = open;
    document.getElementById('pane-open').hidden = !open;
    document.getElementById('tab-new').setAttribute('aria-selected', open ? 'false' : 'true');
    document.getElementById('tab-open').setAttribute('aria-selected', open ? 'true' : 'false');
  }

  function renderNew(keepStatus) {
    var list = document.getElementById('new-list');
    list.replaceChildren();
    var total = 0;
    items.forEach(function (it, index) {
      total += it.data.length;
      var li = document.createElement('li');
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = it.name;
      var meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = C.formatBytes(it.data.length);
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.textContent = 'Remove';
      rm.addEventListener('click', function () {
        items.splice(index, 1);
        renderNew();
      });
      li.append(name, meta, rm);
      list.appendChild(li);
    });
    document.getElementById('make').disabled = !items.length || busy;
    if (keepStatus) return;
    if (items.length) setStatus(items.length + ' file' + (items.length === 1 ? '' : 's') + ', ' + C.formatBytes(total));
    else if (!busy) setStatus('');
  }

  async function addFiles(fileList) {
    if (busy || !fileList) return;
    var skipped = [];
    var total = items.reduce(function (sum, it) { return sum + it.data.length; }, 0);
    var seen = Object.create(null);
    items.forEach(function (it) { seen[it.name] = 1; });
    for (var i = 0; i < fileList.length; i++) {
      var f = fileList[i];
      var sp = C.safePath(f.name);
      if (!sp.ok || sp.dir || sp.path.indexOf('/') !== -1) { skipped.push((f.name || 'file') + ': unsafe name'); continue; }
      if (items.length >= C.LIMITS.maxFiles) { skipped.push(f.name + ': too many files'); break; }
      if (f.size > C.LIMITS.maxEntryBytes || total + f.size > C.LIMITS.maxTotalBytes) {
        skipped.push(f.name + ': too large'); continue;
      }
      var data;
      try { data = new Uint8Array(await f.arrayBuffer()); }
      catch (e) { skipped.push(f.name + ': could not read'); continue; }
      if (data.length > C.LIMITS.maxEntryBytes || total + data.length > C.LIMITS.maxTotalBytes) {
        skipped.push(f.name + ': too large'); continue;
      }
      var name = seen[sp.path] ? C.uniqueName(sp.path, seen) : sp.path;
      if (!name || !C.safePath(name).ok) { skipped.push(f.name + ': duplicate path'); continue; }
      seen[name] = 1;
      total += data.length;
      items.push({ name: name, data: data });
    }
    renderNew();
    if (skipped.length) await ask({ title: 'Some files were skipped', body: skipped.slice(0, 8).join('\n'), yes: 'OK' });
  }

  function renderOpen() {
    var list = document.getElementById('open-list');
    list.replaceChildren();
    var view = opened && opened.view;
    var files = 0;
    if (view) view.entries.forEach(function (entry) {
      var li = document.createElement('li');
      var name = document.createElement('span');
      name.className = entry.dir ? 'name dir' : 'name';
      name.textContent = entry.path;
      var meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = entry.dir ? 'folder' : C.formatBytes(entry.size);
      li.append(name, meta);
      if (!entry.dir) {
        files++;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Download';
        btn.addEventListener('click', function () { extractOne(entry.path); });
        li.appendChild(btn);
      } else {
        li.appendChild(document.createElement('span'));
      }
      list.appendChild(li);
    });
    document.getElementById('extract-all').disabled = !files || busy;
    document.getElementById('close-zip').disabled = !opened || busy;
  }

  async function openFiles(fileList) {
    if (busy || !fileList || !fileList.length) return;
    var f = fileList[0];
    if (f.size > C.LIMITS.maxArchiveBytes) {
      await ask({ title: 'Cannot open ZIP', body: 'This ZIP is larger than ' + C.formatBytes(C.LIMITS.maxArchiveBytes) + '.', yes: 'OK' });
      return;
    }
    busy = true;
    setStatus('Opening…');
    try {
      var data = new Uint8Array(await f.arrayBuffer());
      opened = await C.openArchive(data, window.JSZip);
      renderOpen();
      var n = opened.view.entries.filter(function (e) { return !e.dir; }).length;
      var msg = n + ' file' + (n === 1 ? '' : 's');
      if (opened.view.skipped.length) msg += ', ' + opened.view.skipped.length + ' skipped';
      setStatus(msg);
      if (opened.view.skipped.length) {
        var lines = opened.view.skipped.slice(0, 8).map(function (s) { return s.name + ' — ' + s.reason; });
        await ask({ title: 'Some entries were skipped', body: lines.join('\n'), yes: 'OK' });
      }
    } catch (e) {
      opened = null;
      renderOpen();
      setStatus('');
      await ask({ title: 'Cannot open ZIP', body: C.classifyError(e), yes: 'OK' });
    } finally {
      busy = false;
      renderOpen();
    }
  }

  async function extractOne(path) {
    if (busy || !opened) return;
    busy = true;
    try {
      var bytes = await C.readEntry(opened.zip, path, null, 0);
      saveBytes(bytes, baseName(path, Object.create(null)));
      setStatus('Downloaded ' + path);
    } catch (e) {
      await ask({ title: 'Cannot extract', body: C.classifyError(e), yes: 'OK' });
    } finally { busy = false; }
  }

  function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }

  async function extractAll() {
    if (busy || !opened) return;
    var files = opened.view.entries.filter(function (e) { return !e.dir; });
    if (!files.length) {
      await ask({ title: 'Nothing to extract', body: 'No files in this ZIP can be saved.', yes: 'OK' });
      return;
    }
    var ok = await ask({
      title: 'Extract all',
      body: 'Download ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '? Your browser may ask before each save.',
      yes: 'Download',
      no: 'Cancel'
    });
    if (!ok) return;
    busy = true;
    var used = 0, taken = Object.create(null);
    try {
      for (var i = 0; i < files.length; i++) {
        var bytes = await C.readEntry(opened.zip, files[i].path, null, used);
        used += bytes.length;
        saveBytes(bytes, baseName(files[i].path, taken));
        setStatus('Saved ' + (i + 1) + ' of ' + files.length);
        if (i + 1 < files.length) await sleep(200);
      }
    } catch (e) {
      await ask({ title: 'Extract stopped', body: C.classifyError(e), yes: 'OK' });
    } finally { busy = false; renderOpen(); }
  }

  async function makeZip() {
    if (busy) return;
    if (!items.length) {
      await ask({ title: 'Nothing to zip', body: 'Add at least one file.', yes: 'OK' });
      return;
    }
    busy = true;
    renderNew();
    setStatus('Creating ZIP…');
    var done = false;
    try {
      var built = await C.buildArchive(items, window.JSZip);
      saveBytes(built.bytes, zipFileName());
      setStatus('Downloaded ' + built.names.length + ' file' + (built.names.length === 1 ? '' : 's') + '.');
      done = true;
    } catch (e) {
      await ask({ title: 'Cannot create ZIP', body: C.classifyError(e), yes: 'OK' });
    } finally {
      busy = false;
      renderNew(done);
    }
  }

  function bindDrop(id, handler) {
    var el = document.getElementById(id);
    el.addEventListener('dragover', function (e) { e.preventDefault(); el.classList.add('over'); });
    el.addEventListener('dragleave', function () { el.classList.remove('over'); });
    el.addEventListener('drop', function (e) {
      e.preventDefault();
      el.classList.remove('over');
      if (e.dataTransfer && e.dataTransfer.files) handler(e.dataTransfer.files);
    });
  }

  function pick(inputId, handler) {
    var input = document.getElementById(inputId);
    input.addEventListener('change', function () {
      var files = input.files;
      input.value = '';
      if (files && files.length) handler(files);
    });
    return input;
  }

  document.getElementById('tab-new').addEventListener('click', function () { showTab('new'); });
  document.getElementById('tab-open').addEventListener('click', function () { showTab('open'); });
  document.getElementById('pick').addEventListener('click', function () { document.getElementById('pick-in').click(); });
  document.getElementById('open-btn').addEventListener('click', function () { document.getElementById('open-in').click(); });
  pick('pick-in', addFiles);
  pick('open-in', openFiles);
  bindDrop('drop-new', addFiles);
  bindDrop('drop-open', openFiles);
  document.getElementById('make').addEventListener('click', makeZip);
  document.getElementById('extract-all').addEventListener('click', extractAll);
  document.getElementById('clear-new').addEventListener('click', async function () {
    if (!items.length) return;
    var ok = await ask({ title: 'Clear the list?', body: 'Added files are dropped from this page.', yes: 'Clear', no: 'Cancel' });
    if (!ok) return;
    items = [];
    renderNew();
  });
  document.getElementById('close-zip').addEventListener('click', async function () {
    if (!opened) return;
    var ok = await ask({ title: 'Close this ZIP?', body: 'The list is cleared from this page. Nothing was uploaded.', yes: 'Close', no: 'Cancel' });
    if (!ok) return;
    opened = null;
    renderOpen();
    setStatus('');
  });
  dlgYes.addEventListener('click', function () { if (pending) pending(true); });
  dlgNo.addEventListener('click', function () { if (pending) pending(false); });
  dlg.addEventListener('click', function (e) { if (e.target === dlg && pending) pending(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pending) pending(false); });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) { e.preventDefault(); });

  renderNew();
  renderOpen();
  if (typeof window.JSZip !== 'function' || !C) {
    ask({ title: 'ZIP library missing', body: 'The local JSZip file did not load, so this page cannot create or open archives.', yes: 'OK' });
  }
})();
