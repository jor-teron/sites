/* Torrent — tr_main.js: multi-torrent wire-up, restore, player, settings, pagehide. TR3–TR5 */
import WebTorrent from './vendor/webtorrent/webtorrent.min.js';

(function () {
  'use strict';

  var H = window.TRHelpers;
  var Save = window.TRSave;
  var Store = window.TRStore;
  var Client = window.TRClient;
  var Player = window.TRPlayer;
  var Ui = window.TRUi;

  var els = {
    magnetInput: document.getElementById('magnet-input'),
    btnAdd: document.getElementById('btn-add'),
    fileInput: document.getElementById('torrent-file'),
    btnChoose: document.getElementById('btn-choose'),
    btnReconnect: document.getElementById('btn-reconnect'),
    folderRow: document.getElementById('folder-row'),
    folderLabel: document.getElementById('folder-label'),
    folderFallback: document.getElementById('folder-fallback'),
    list: document.getElementById('torrent-list'),
    empty: document.getElementById('empty'),
    status: document.getElementById('status'),
    dropOverlay: document.getElementById('drop-overlay'),
    playerPanel: document.getElementById('player-panel'),
    playerTitle: document.getElementById('player-title'),
    playerNote: document.getElementById('player-note'),
    media: document.getElementById('media'),
    btnStopPlay: document.getElementById('btn-stop-play'),
    inUp: document.getElementById('limit-up'),
    inDown: document.getElementById('limit-down'),
    chkSeedDefault: document.getElementById('seed-default'),
    btnSaveSettings: document.getElementById('btn-save-settings'),
    clientRatio: document.getElementById('client-ratio')
  };

  var ui = Ui.createUi(els);
  ui.bindListClicks();

  var savingIds = {};

  var tr = Client.createClient(WebTorrent, {
    onUpdate: function (snap) {
      ui.renderList(snap);
    },
    onError: function (msg) {
      ui.setStatus(msg, 'error');
    },
    onNoPeers: function (snap) {
      ui.setStatus('No WebTorrent peers for “' + (snap.name || 'torrent') + '”', 'warn');
    },
    onDone: function (snap, torrent, entry) {
      maybeSave(snap, torrent, entry);
    },
    onPersist: function (list, settings) {
      Store.save(list, settings);
    }
  });

  async function maybeSave(snap, torrent, entry) {
    if (!torrent || !entry || entry.saved || savingIds[entry.id]) return;
    savingIds[entry.id] = true;
    ui.setStatus('Saving “' + (snap.name || 'torrent') + '”…', 'busy');
    try {
      if (Save.supported && Save.state() === 'need') {
        ui.setStatus('Tap Reconnect to allow the save folder', 'warn');
        savingIds[entry.id] = false;
        return;
      }
      if (Save.supported && Save.state() === 'ready') {
        try { await Save.reconnect(); } catch (e) { /* stay */ }
      }
      var paths = await Save.saveTorrentFiles(torrent, function (name, i, n) {
        ui.setStatus('Saved ' + (i + 1) + '/' + n + ': ' + name, 'busy');
      }, entry.selectedPaths);
      tr.markSaved(entry.id);
      var where = Save.ready() ? ('folder “' + Save.folderName() + '”') : 'Downloads';
      ui.setStatus('Saved ' + paths.length + ' file(s) to ' + where);
    } catch (err) {
      ui.setStatus('Save failed: ' + (err && err.message ? err.message : err), 'error');
    } finally {
      savingIds[entry.id] = false;
    }
  }

  async function startMagnet() {
    ui.jelly(els.btnAdd);
    var text = els.magnetInput ? els.magnetInput.value : '';
    ui.setStatus('Adding magnet…', 'busy');
    try {
      await tr.addMagnet(text, { userPaused: false });
      if (els.magnetInput) els.magnetInput.value = '';
      ui.setStatus('Torrent added (max ' + H.MAX_ACTIVE + ' active downloads)', 'busy');
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
    ui.setStatus('Adding .torrent…', 'busy');
    try {
      await tr.addTorrentFile(file, { userPaused: false });
      ui.setStatus('Torrent added (max ' + H.MAX_ACTIVE + ' active downloads)', 'busy');
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

  ui.handlers.onPause = function (id) {
    tr.pause(id);
    ui.setStatus('Paused');
  };
  ui.handlers.onResume = function (id) {
    tr.resume(id);
    ui.setStatus('Resumed (queue may apply)');
  };
  ui.handlers.onSeed = function (id, on) {
    tr.setSeed(id, on);
  };
  ui.handlers.onToggleFile = function (id, paths) {
    tr.setSelectedPaths(id, paths);
  };
  ui.handlers.onRemove = function (id) {
    var ok = window.confirm(
      'Remove this torrent from the list?\n\nDownloaded files in your folder are kept (never deleted).'
    );
    if (!ok) return;
    Player.stop(els.media);
    ui.showPlayer(false);
    tr.remove(id).then(function () {
      ui.setStatus('Removed (files on disk kept)');
    });
  };
  ui.handlers.onPlay = async function (id, path) {
    ui.showPlayer(true, 'Loading…');
    if (els.playerNote) els.playerNote.textContent = '';
    try {
      var result = await Player.playFile(tr, id, path, els.media, function (msg, kind) {
        ui.setStatus(msg, kind);
        if (els.playerNote) {
          els.playerNote.textContent = msg;
          els.playerNote.className = 'player-note' + (kind ? ' ' + kind : '');
        }
      });
      ui.showPlayer(true, result.name);
      if (els.media && typeof els.media.play === 'function') {
        try { await els.media.play(); } catch (e) { /* autoplay blocked */ }
      }
    } catch (err) {
      ui.setStatus(err && err.message ? err.message : String(err), 'error');
    }
  };

  if (els.btnStopPlay) {
    els.btnStopPlay.addEventListener('click', function () {
      Player.stop(els.media);
      ui.showPlayer(false);
      ui.setStatus('Player stopped');
    });
  }

  if (els.btnSaveSettings) {
    els.btnSaveSettings.addEventListener('click', function () {
      ui.jelly(els.btnSaveSettings);
      var up = H.parseThrottleKBs(els.inUp ? els.inUp.value : '');
      var down = H.parseThrottleKBs(els.inDown ? els.inDown.value : '');
      if (!up.ok || !down.ok) {
        ui.setStatus('Speed limits must be empty (unlimited) or a number of KB/s', 'error');
        return;
      }
      tr.setSettings({
        uploadLimitKBs: up.kBs,
        downloadLimitKBs: down.kBs,
        seedDefault: els.chkSeedDefault ? !!els.chkSeedDefault.checked : true
      });
      ui.setStatus(
        'Limits saved — ↑ ' + (up.kBs < 0 ? 'unlimited' : up.kBs + ' KB/s') +
        ', ↓ ' + (down.kBs < 0 ? 'unlimited' : down.kBs + ' KB/s')
      );
    });
  }

  if (els.btnAdd) els.btnAdd.addEventListener('click', startMagnet);
  if (els.magnetInput) {
    els.magnetInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); startMagnet(); }
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

  var dragDepth = 0;
  function showDrop(on) {
    if (els.dropOverlay) els.dropOverlay.hidden = !on;
  }
  window.addEventListener('dragenter', function (e) {
    e.preventDefault(); dragDepth++; showDrop(true);
  });
  window.addEventListener('dragleave', function (e) {
    e.preventDefault(); dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) showDrop(false);
  });
  window.addEventListener('dragover', function (e) { e.preventDefault(); });
  window.addEventListener('drop', function (e) {
    e.preventDefault(); dragDepth = 0; showDrop(false);
    var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) startFile(f);
  });

  Save.onChange(function () { ui.setFolderRow(Save); });
  window.addEventListener('pagehide', function () { tr.destroy(); });

  // Boot: folder + restore paused list
  Promise.resolve()
    .then(function () { return Save.init(); })
    .then(function () {
      ui.setFolderRow(Save);
      var saved = Store.load();
      ui.setSettingsForm(saved.settings);
      return tr.restoreFromList(saved.torrents, saved.settings);
    })
    .then(function () {
      // Warm the SW early (best-effort) so Play is faster.
      if (Player.supported()) {
        Player.ensureRegistration().then(function (reg) {
          if (reg) return tr.attachServer(reg);
        }).catch(function () { /* offline / insecure context */ });
      }
      ui.setStatus('Paste a magnet or open a .torrent — up to ' + H.MAX_ACTIVE + ' active');
    })
    .catch(function (err) {
      ui.setStatus(err && err.message ? err.message : String(err), 'error');
    });
})();
