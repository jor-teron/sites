/* Torrent — tr_main.js: wire UI, WebTorrent module, one active torrent, destroy on pagehide. TR1+TR2 */
import WebTorrent from './vendor/webtorrent/webtorrent.min.js';

(function () {
  'use strict';

  var H = window.TRHelpers;
  var Save = window.TRSave;
  var Client = window.TRClient;
  var Ui = window.TRUi;

  var els = {
    magnetInput: document.getElementById('magnet-input'),
    btnAdd: document.getElementById('btn-add'),
    fileInput: document.getElementById('torrent-file'),
    fileLabel: document.getElementById('file-label'),
    btnChoose: document.getElementById('btn-choose'),
    btnReconnect: document.getElementById('btn-reconnect'),
    btnRemove: document.getElementById('btn-remove'),
    folderRow: document.getElementById('folder-row'),
    folderLabel: document.getElementById('folder-label'),
    folderFallback: document.getElementById('folder-fallback'),
    card: document.getElementById('card'),
    empty: document.getElementById('empty'),
    cardName: document.getElementById('card-name'),
    cardSize: document.getElementById('card-size'),
    cardPct: document.getElementById('card-pct'),
    progressBar: document.getElementById('progress-bar'),
    cardDown: document.getElementById('card-down'),
    cardUp: document.getElementById('card-up'),
    cardPeers: document.getElementById('card-peers'),
    cardEta: document.getElementById('card-eta'),
    cardStatus: document.getElementById('card-status'),
    peersHint: document.getElementById('peers-hint'),
    status: document.getElementById('status'),
    dropOverlay: document.getElementById('drop-overlay'),
    app: document.getElementById('app')
  };

  var ui = Ui.createUi(els);
  var saving = false;
  var savedForHash = '';

  var tr = Client.createClient(WebTorrent, {
    onUpdate: function (snap) {
      ui.renderCard(snap);
    },
    onError: function (msg) {
      ui.setStatus(msg, 'error');
    },
    onNoPeers: function () {
      ui.showHint(true);
      ui.setStatus('No WebTorrent peers found yet', 'warn');
    },
    onReady: function (snap) {
      ui.showHint(false);
      ui.setStatus('Got metadata: ' + (snap.name || 'torrent'), 'busy');
    },
    onDone: function (snap, torrent) {
      ui.showHint(false);
      maybeSave(snap, torrent);
    }
  });

  async function maybeSave(snap, torrent) {
    if (!torrent) return;
    var hash = snap.infoHash || torrent.infoHash || '';
    if (hash && hash === savedForHash) return;
    if (saving) return;
    saving = true;
    ui.setStatus('Saving files…', 'busy');
    try {
      // Re-check folder permission in case the tab slept.
      if (Save.supported && Save.state() === 'need') {
        ui.setStatus('Tap Reconnect to allow the save folder, then files will save', 'warn');
        saving = false;
        return;
      }
      if (Save.supported && Save.state() === 'ready') {
        try {
          await Save.reconnect();
        } catch (e) { /* stay as-is */ }
      }
      var paths = await Save.saveTorrentFiles(torrent, function (name, i, n) {
        ui.setStatus('Saved ' + (i + 1) + '/' + n + ': ' + name, 'busy');
      });
      savedForHash = hash;
      var where = Save.ready() ? ('folder “' + Save.folderName() + '”') : 'Downloads';
      ui.setStatus('Saved ' + paths.length + ' file(s) to ' + where);
    } catch (err) {
      ui.setStatus('Save failed: ' + (err && err.message ? err.message : err), 'error');
    } finally {
      saving = false;
    }
  }

  async function confirmReplace() {
    var snap = tr.snapshot();
    if (!snap.active) return true;
    return window.confirm('Replace the current torrent? The active download will stop.');
  }

  async function startMagnet() {
    ui.jelly(els.btnAdd);
    if (!(await confirmReplace())) return;
    var text = els.magnetInput ? els.magnetInput.value : '';
    ui.showHint(false);
    savedForHash = '';
    ui.setStatus('Adding magnet…', 'busy');
    try {
      await tr.addMagnet(text);
      ui.setStatus('Looking for peers…', 'busy');
    } catch (err) {
      ui.setStatus(err && err.message ? err.message : String(err), 'error');
    }
  }

  async function startFile(file) {
    if (!file) return;
    if (!H.isTorrentFileName(file.name) && file.type && file.type !== 'application/x-bittorrent') {
      ui.setStatus('Please drop a .torrent file', 'error');
      return;
    }
    if (!(await confirmReplace())) return;
    ui.showHint(false);
    savedForHash = '';
    ui.setStatus('Adding .torrent…', 'busy');
    try {
      await tr.addTorrentFile(file);
      ui.setStatus('Looking for peers…', 'busy');
    } catch (err) {
      ui.setStatus(err && err.message ? err.message : String(err), 'error');
    }
  }

  async function onChooseFolder() {
    ui.jelly(els.btnChoose);
    try {
      await Save.pick();
      ui.setFolderRow(Save);
      ui.setStatus('Saving to “' + Save.folderName() + '”');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      ui.setStatus(err && err.message ? err.message : String(err), 'error');
    }
  }

  async function onReconnect() {
    ui.jelly(els.btnReconnect);
    try {
      await Save.reconnect();
      ui.setFolderRow(Save);
      if (Save.ready()) ui.setStatus('Folder ready: ' + Save.folderName());
      else ui.setStatus('Folder access not granted', 'warn');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      ui.setStatus(err && err.message ? err.message : String(err), 'error');
    }
  }

  async function onRemove() {
    ui.jelly(els.btnRemove);
    await tr.removeCurrent();
    savedForHash = '';
    ui.showHint(false);
    ui.setStatus('Torrent removed');
  }

  // —— events ——
  if (els.btnAdd) els.btnAdd.addEventListener('click', startMagnet);
  if (els.magnetInput) {
    els.magnetInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        startMagnet();
      }
    });
  }
  if (els.fileInput) {
    els.fileInput.addEventListener('change', function () {
      var f = els.fileInput.files && els.fileInput.files[0];
      startFile(f);
      els.fileInput.value = '';
    });
  }
  if (els.btnChoose) els.btnChoose.addEventListener('click', onChooseFolder);
  if (els.btnReconnect) els.btnReconnect.addEventListener('click', onReconnect);
  if (els.btnRemove) els.btnRemove.addEventListener('click', onRemove);

  // Drag & drop .torrent
  var dragDepth = 0;
  function showDrop(on) {
    if (els.dropOverlay) els.dropOverlay.hidden = !on;
  }
  window.addEventListener('dragenter', function (e) {
    e.preventDefault();
    dragDepth++;
    showDrop(true);
  });
  window.addEventListener('dragleave', function (e) {
    e.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) showDrop(false);
  });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) {
    e.preventDefault();
    dragDepth = 0;
    showDrop(false);
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) startFile(f);
  });

  Save.onChange(function () { ui.setFolderRow(Save); });

  window.addEventListener('pagehide', function () {
    tr.destroy();
  });

  // Boot
  Save.init().then(function () {
    ui.setFolderRow(Save);
    ui.setStatus('Paste a magnet or open a .torrent');
  });
})();
