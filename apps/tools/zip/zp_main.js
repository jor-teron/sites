/* Zip — zp_main.js: wire Make / Open modes, folder save, progress + cancel. ZP1+ZP2 */
(function () {
  'use strict';

  var H = window.ZPHelpers;
  var UI = window.ZPUI;
  var Save = window.ZPSave;
  var Make = window.ZPMake;
  var Open = window.ZPOpen;
  var $ = UI.$;

  var makeItems = [];
  var openHandle = null;
  var openRows = [];
  var abortCtrl = null;
  var busy = false;

  function refreshMake() {
    UI.renderMakeList(makeItems, function (id) {
      makeItems = makeItems.filter(function (x) { return x.id !== id; });
      refreshMake();
      if (!makeItems.length) UI.setStatus('');
    });
    if (makeItems.length && !$('make-name').value) {
      $('make-name').value = H.suggestZipName(makeItems);
    }
  }

  function addFiles(fileList) {
    var added = Make.filesFromList(fileList);
    if (!added.length) return;
    makeItems = makeItems.concat(added);
    refreshMake();
    UI.setStatus('Added ' + added.length + ' file' + (added.length === 1 ? '' : 's'), 'ok');
  }

  function syncFolderLabels() {
    var st = Save.state();
    var name = Save.folderName();
    UI.updateFolderUI('make', st, name, Save.supported);
    UI.updateFolderUI('open', st, name, Save.supported);
  }

  async function chooseFolder() {
    try {
      await Save.pick();
      syncFolderLabels();
      UI.setStatus('Folder ready: ' + Save.folderName(), 'ok');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      UI.setStatus(String(err && err.message || err), 'error');
    }
  }

  async function reconnectFolder() {
    try {
      await Save.reconnect();
      syncFolderLabels();
      UI.setStatus(Save.ready() ? ('Folder ready: ' + Save.folderName()) : 'Folder access not granted', Save.ready() ? 'ok' : 'warn');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      UI.setStatus(String(err && err.message || err), 'error');
    }
  }

  function setBusy(on, which) {
    busy = on;
    $('make-create').disabled = on || !makeItems.length;
    $('make-clear').disabled = on || !makeItems.length;
    $('open-extract').disabled = on || !openHandle;
    $('make-cancel').hidden = !(on && which === 'make');
    $('open-cancel').hidden = !(on && which === 'open');
    if (!on) {
      UI.hideProgress('make');
      UI.hideProgress('open');
      abortCtrl = null;
    }
  }

  async function createZip() {
    if (busy || !makeItems.length) return;
    var name = H.ensureZipExt($('make-name').value);
    var protect = $('make-protect').checked;
    var password = protect ? $('make-pass').value : '';
    if (protect && !password) {
      UI.setStatus('Enter a password, or turn off Protect.', 'warn');
      return;
    }
    abortCtrl = new AbortController();
    setBusy(true, 'make');
    UI.setStatus('Creating zip…', 'busy');
    UI.setProgress('make', 0, 'Starting…');
    try {
      var blob = await Make.createZip(makeItems, {
        password: password,
        signal: abortCtrl.signal,
        onProgress: function (done, total) {
          var r = total ? done / total : 0;
          UI.setProgress('make', r, Math.round(r * 100) + '%');
        }
      });
      if (Save.ready()) {
        var path = await Save.streamToFolder(name, blob);
        UI.setStatus('Saved ' + path + ' (' + H.formatBytes(blob.size) + ')', 'ok');
      } else {
        Save.downloadBlob(blob, name);
        UI.setStatus('Downloaded ' + name + ' (' + H.formatBytes(blob.size) + ')', 'ok');
      }
    } catch (err) {
      if (err && err.name === 'AbortError') UI.setStatus('Cancelled', 'warn');
      else UI.setStatus(String(err && err.message || err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function loadZip(file) {
    if (!file) return;
    if (openHandle) await Open.closeZip(openHandle);
    openHandle = null;
    openRows = [];
    UI.setStatus('Opening…', 'busy');
    try {
      openHandle = await Open.openZip(file);
      openRows = H.buildEntryTree(openHandle.entries);
      UI.renderOpenList(openRows, extractOne);
      $('open-zip-name').textContent = file.name + ' · ' + openRows.filter(function (r) { return !r.isDir && !r.unsafe; }).length + ' files';
      var need = Open.needsPassword(openHandle.entries);
      $('open-pass-row').hidden = !need;
      $('open-extract').disabled = false;
      UI.setStatus(need ? 'This zip has encrypted files — enter the password before extracting.' : 'Zip opened', need ? 'warn' : 'ok');
    } catch (err) {
      UI.setStatus(String(err && err.message || err), 'error');
      $('open-extract').disabled = true;
    }
  }

  async function extractOne(row) {
    if (busy || !row || !row.raw) return;
    var password = $('open-pass').value || '';
    if (row.encrypted && !password) {
      $('open-pass-row').hidden = false;
      UI.setStatus('Enter the password for this file.', 'warn');
      return;
    }
    abortCtrl = new AbortController();
    setBusy(true, 'open');
    UI.setStatus('Extracting ' + row.name + '…', 'busy');
    try {
      var blob = await Open.extractEntryBlob(row.raw, password, abortCtrl.signal);
      if (Save.ready()) {
        var path = await Save.streamToFolder(row.path, blob);
        UI.setStatus('Saved ' + path, 'ok');
      } else {
        Save.downloadBlob(blob, row.name);
        UI.setStatus('Downloaded ' + row.name, 'ok');
      }
    } catch (err) {
      if (err && err.name === 'AbortError') UI.setStatus('Cancelled', 'warn');
      else if (err && err.name === 'PasswordError') {
        $('open-pass-row').hidden = false;
        UI.setStatus('Wrong password', 'error');
      } else UI.setStatus(String(err && err.message || err), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function extractAll() {
    if (busy || !openHandle) return;
    var password = $('open-pass').value || '';
    if (Open.needsPassword(openHandle.entries) && !password) {
      $('open-pass-row').hidden = false;
      UI.setStatus('Enter the password to extract encrypted files.', 'warn');
      return;
    }
    abortCtrl = new AbortController();
    setBusy(true, 'open');
    UI.setStatus('Extracting…', 'busy');
    UI.setProgress('open', 0, 'Starting…');
    try {
      var result = await Open.extractAll(openHandle.entries, {
        mode: Save.ready() ? 'folder' : 'download',
        save: Save,
        password: password,
        signal: abortCtrl.signal,
        onProgress: function (done, total) {
          var r = total ? done / total : 0;
          UI.setProgress('open', r, Math.round(r * 100) + '% · ' + Math.min(Math.floor(done) + 1, total) + '/' + total);
        }
      });
      var msg = 'Extracted ' + result.saved.length + ' file' + (result.saved.length === 1 ? '' : 's');
      if (result.skipped.length) msg += ' · skipped ' + result.skipped.length + ' unsafe path' + (result.skipped.length === 1 ? '' : 's');
      UI.setStatus(msg, result.skipped.length ? 'warn' : 'ok');
    } catch (err) {
      if (err && err.name === 'AbortError') UI.setStatus('Cancelled', 'warn');
      else if (err && err.name === 'PasswordError') {
        $('open-pass-row').hidden = false;
        UI.setStatus('Wrong password', 'error');
      } else UI.setStatus(String(err && err.message || err), 'error');
    } finally {
      setBusy(false);
    }
  }

  function cancel() {
    if (abortCtrl) abortCtrl.abort();
  }

  function wireDrop() {
    var dragDepth = 0;
    function hasFiles(e) {
      var dt = e.dataTransfer;
      if (!dt) return false;
      if (dt.types && (dt.types.indexOf('Files') !== -1 || (dt.types.contains && dt.types.contains('Files')))) return true;
      return !!(dt.files && dt.files.length);
    }
    window.addEventListener('dragenter', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth++;
      UI.showOverlay(true);
    });
    window.addEventListener('dragleave', function (e) {
      if (!hasFiles(e) && dragDepth === 0) return;
      e.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) UI.showOverlay(false);
    });
    window.addEventListener('dragover', function (e) {
      if (!hasFiles(e)) return;
      e.preventDefault();
    });
    window.addEventListener('drop', function (e) {
      e.preventDefault();
      dragDepth = 0;
      UI.showOverlay(false);
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;
      var makeMode = !$('panel-make').hidden;
      if (makeMode) {
        addFiles(files);
      } else {
        var zipFile = null;
        for (var i = 0; i < files.length; i++) {
          if (H.isZipFileName(files[i].name)) { zipFile = files[i]; break; }
        }
        if (!zipFile) {
          UI.setStatus('Drop a .zip file to open', 'warn');
          return;
        }
        loadZip(zipFile);
      }
    });
  }

  function init() {
    $('mode-make').addEventListener('click', function () { UI.setMode('make'); });
    $('mode-open').addEventListener('click', function () { UI.setMode('open'); });

    $('make-files').addEventListener('change', function () {
      addFiles($('make-files').files);
      $('make-files').value = '';
    });
    $('make-folder').addEventListener('change', function () {
      addFiles($('make-folder').files);
      $('make-folder').value = '';
    });
    $('make-clear').addEventListener('click', function () {
      makeItems = [];
      refreshMake();
      UI.setStatus('List cleared');
    });
    $('make-protect').addEventListener('change', function () {
      $('make-pass-row').hidden = !$('make-protect').checked;
    });
    $('make-create').addEventListener('click', createZip);
    $('make-cancel').addEventListener('click', cancel);
    $('make-folder-btn').addEventListener('click', chooseFolder);
    $('make-reconnect').addEventListener('click', reconnectFolder);

    $('open-file').addEventListener('change', function () {
      var f = $('open-file').files && $('open-file').files[0];
      $('open-file').value = '';
      if (f) loadZip(f);
    });
    $('open-extract').addEventListener('click', extractAll);
    $('open-cancel').addEventListener('click', cancel);
    $('open-folder-btn').addEventListener('click', chooseFolder);
    $('open-reconnect').addEventListener('click', reconnectFolder);

    wireDrop();
    Save.onChange(syncFolderLabels);
    Save.init().then(syncFolderLabels);
    refreshMake();
    UI.setStatus('Ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
