/* Zip — zp_ui.js: mode switch, lists, progress, status, folder labels. ZP1+ZP2 */
(function (root) {
  'use strict';

  var H = root.ZPHelpers;
  var $ = function (id) { return document.getElementById(id); };

  function setStatus(msg, kind) {
    var el = $('status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  function setMode(mode) {
    var make = mode === 'make';
    $('mode-make').classList.toggle('active', make);
    $('mode-open').classList.toggle('active', !make);
    $('mode-make').setAttribute('aria-selected', make ? 'true' : 'false');
    $('mode-open').setAttribute('aria-selected', make ? 'false' : 'true');
    $('panel-make').hidden = !make;
    $('panel-open').hidden = make;
    $('drop-overlay').textContent = make ? 'Drop files to add' : 'Drop a .zip to open';
  }

  function renderMakeList(items, onRemove) {
    var ul = $('make-list');
    ul.innerHTML = '';
    (items || []).forEach(function (it) {
      var li = document.createElement('li');
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = it.relPath || it.name;
      name.title = it.relPath || it.name;
      var meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = H.formatBytes(it.size);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-tiny btn-danger';
      btn.textContent = 'Remove';
      btn.addEventListener('click', function () { onRemove(it.id); });
      li.appendChild(name);
      li.appendChild(meta);
      li.appendChild(btn);
      ul.appendChild(li);
    });
    $('make-clear').disabled = !(items && items.length);
    $('make-create').disabled = !(items && items.length);
  }

  function renderOpenList(rows, onExtractOne) {
    var ul = $('open-list');
    ul.innerHTML = '';
    (rows || []).forEach(function (row) {
      var li = document.createElement('li');
      if (row.isDir) li.classList.add('entry-dir');
      if (row.unsafe) li.classList.add('entry-unsafe');
      if (row.encrypted) li.classList.add('entry-lock');
      var name = document.createElement('span');
      name.className = 'name pad';
      name.style.setProperty('--d', String(row.depth || 0));
      name.textContent = (row.isDir ? '📁 ' : '') + row.name + (row.unsafe ? ' (skipped: ' + row.reason + ')' : '');
      name.title = row.path;
      var meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = row.isDir ? '' : H.formatBytes(row.size);
      li.appendChild(name);
      li.appendChild(meta);
      if (!row.isDir && !row.unsafe && row.raw) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-tiny';
        btn.textContent = 'Save';
        btn.addEventListener('click', function () { onExtractOne(row); });
        li.appendChild(btn);
      }
      ul.appendChild(li);
    });
  }

  function setProgress(which, ratio, label) {
    var wrap = $(which + '-progress');
    var bar = $(which + '-bar');
    var lab = $(which + '-prog-label');
    if (!wrap) return;
    wrap.hidden = false;
    var pct = Math.max(0, Math.min(100, Math.round((Number(ratio) || 0) * 100)));
    bar.style.width = pct + '%';
    lab.textContent = label || (pct + '%');
  }

  function hideProgress(which) {
    var wrap = $(which + '-progress');
    if (wrap) wrap.hidden = true;
    var bar = $(which + '-bar');
    if (bar) bar.style.width = '0%';
  }

  function updateFolderUI(prefix, saveState, name, supported) {
    var label = $(prefix + '-folder-label');
    var fallback = $(prefix + '-fallback');
    var reconnect = $(prefix + '-reconnect');
    if (!supported) {
      label.textContent = '';
      fallback.hidden = false;
      fallback.textContent = 'Folder save needs Chrome or Edge on desktop. Files will download normally instead.';
      reconnect.hidden = true;
      return;
    }
    fallback.hidden = true;
    if (saveState === 'ready') {
      label.textContent = 'Saving into: ' + (name || 'folder');
      reconnect.hidden = true;
    } else if (saveState === 'need') {
      label.textContent = 'Folder remembered — tap Reconnect to allow access again.';
      reconnect.hidden = false;
    } else {
      label.textContent = 'No folder chosen — finished files will download to your browser Downloads.';
      reconnect.hidden = true;
    }
  }

  function showOverlay(show) {
    var el = $('drop-overlay');
    el.hidden = !show;
    el.setAttribute('aria-hidden', show ? 'false' : 'true');
  }

  root.ZPUI = {
    setStatus: setStatus,
    setMode: setMode,
    renderMakeList: renderMakeList,
    renderOpenList: renderOpenList,
    setProgress: setProgress,
    hideProgress: hideProgress,
    updateFolderUI: updateFolderUI,
    showOverlay: showOverlay,
    $: $
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
