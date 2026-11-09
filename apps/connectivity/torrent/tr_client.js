/* Torrent — tr_client.js: multi-torrent WebTorrent client, 2-active queue, pause/seed/select. TR3–TR5 */
(function (root) {
  'use strict';

  var H = root.TRHelpers;
  var NO_PEERS_MS = 30_000;

  function createClient(WebTorrent, opts) {
    opts = opts || {};
    var onUpdate = opts.onUpdate || function () {};
    var onError = opts.onError || function () {};
    var onNoPeers = opts.onNoPeers || function () {};
    var onDone = opts.onDone || function () {};
    var onPersist = opts.onPersist || function () {};

    var client = null;
    var serverReady = false;
    var entries = []; // { id, magnet, infoHash, name, userPaused, done, seed, selectedPaths, addedAt, torrent, noPeersTimer, noPeersFired, saved }
    var settings = {
      uploadLimitKBs: -1,
      downloadLimitKBs: -1,
      seedDefault: true
    };
    var pollTimer = null;
    var destroyed = false;

    function ensureClient() {
      if (client) return client;
      if (typeof WebTorrent !== 'function') throw new Error('WebTorrent is not loaded');
      client = new WebTorrent();
      client.on('error', function (err) {
        onError(err && err.message ? err.message : String(err));
      });
      applyThrottles();
      return client;
    }

    function applyThrottles() {
      if (!client) return;
      var up = H.parseThrottleKBs(settings.uploadLimitKBs);
      var down = H.parseThrottleKBs(settings.downloadLimitKBs);
      if (typeof client.throttleUpload === 'function') client.throttleUpload(up.bytesPerSec);
      if (typeof client.throttleDownload === 'function') client.throttleDownload(down.bytesPerSec);
    }

    function findEntry(id) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].id === id) return entries[i];
      }
      return null;
    }

    function findByHash(hash) {
      if (!hash) return null;
      var h = String(hash).toLowerCase();
      for (var i = 0; i < entries.length; i++) {
        if ((entries[i].infoHash || '').toLowerCase() === h) return entries[i];
      }
      return null;
    }


    function entrySnapshot(e) {
      var t = e.torrent;
      var files = [];
      if (t && t.files) {
        var sel = e.selectedPaths;
        files = t.files.map(function (f) {
          var selected = !sel || sel.indexOf(f.path) !== -1;
          return {
            name: f.name,
            path: f.path,
            length: f.length,
            progress: f.progress || 0,
            done: !!f.done,
            selected: selected,
            type: f.type || '',
            playable: H.isPlayableMediaName(f.name),
            mayNotPlay: H.mayNotPlay(f.name)
          };
        });
      }
      var done = !!(e.done || (t && t.done));
      var progress = t ? (t.progress || 0) : (done ? 1 : 0);
      var slots = H.reconcileQueue(entries.map(function (x) {
        return { id: x.id, userPaused: x.userPaused, done: !!(x.done || (x.torrent && x.torrent.done)) };
      }), H.MAX_ACTIVE);
      var slot = slots[e.id] || (e.userPaused ? 'paused' : 'queued');
      var status = slot;
      if (done) status = e.seed && t && !t.paused ? 'seeding' : 'done';
      else if (slot === 'active') status = (t && t.numPeers > 0) ? 'downloading' : 'looking';
      else if (slot === 'queued') status = 'queued';
      else status = 'paused';

      return {
        id: e.id,
        active: !!t,
        name: e.name || (t && t.name) || 'Torrent',
        infoHash: e.infoHash || (t && t.infoHash) || '',
        magnet: e.magnet || '',
        length: t ? (t.length || 0) : 0,
        downloaded: t ? (t.downloaded || 0) : 0,
        uploaded: t ? (t.uploaded || 0) : 0,
        received: t ? (t.received || 0) : 0,
        progress: progress,
        downloadSpeed: t && slot === 'active' ? (t.downloadSpeed || 0) : 0,
        uploadSpeed: t ? (t.uploadSpeed || 0) : 0,
        numPeers: t ? (t.numPeers || 0) : 0,
        timeRemaining: t ? t.timeRemaining : Infinity,
        done: done,
        seed: !!e.seed,
        userPaused: !!e.userPaused,
        slot: slot,
        status: status,
        files: files,
        ratio: H.formatRatio(t ? t.uploaded : 0, t ? (t.downloaded || t.received || 0) : 0),
        noPeers: !!e.noPeersFired,
        saved: !!e.saved
      };
    }

    function snapshotAll() {
      return {
        torrents: entries.map(entrySnapshot),
        settings: {
          uploadLimitKBs: settings.uploadLimitKBs,
          downloadLimitKBs: settings.downloadLimitKBs,
          seedDefault: settings.seedDefault
        },
        clientRatio: client ? H.formatRatio(
          client.torrents.reduce(function (s, t) { return s + (t.uploaded || 0); }, 0),
          client.torrents.reduce(function (s, t) { return s + (t.downloaded || t.received || 0); }, 0)
        ) : '0.00',
        serverReady: serverReady
      };
    }

    function persist() {
      onPersist(entries.map(function (e) {
        return {
          id: e.id,
          magnet: e.magnet,
          infoHash: e.infoHash,
          name: e.name,
          userPaused: e.userPaused,
          done: e.done,
          seed: e.seed,
          selectedPaths: e.selectedPaths,
          addedAt: e.addedAt
        };
      }), settings);
    }

    function pushUpdate() {
      onUpdate(snapshotAll());
    }

    function armNoPeers(e) {
      e.noPeersFired = false;
      if (e.noPeersTimer) clearTimeout(e.noPeersTimer);
      e.noPeersTimer = setTimeout(function () {
        if (!e.torrent || e.done || e.userPaused) return;
        var slots = H.reconcileQueue(entries.map(function (x) {
          return { id: x.id, userPaused: x.userPaused, done: !!x.done };
        }), H.MAX_ACTIVE);
        if (slots[e.id] !== 'active') return;
        if ((e.torrent.numPeers || 0) === 0) {
          e.noPeersFired = true;
          onNoPeers(entrySnapshot(e));
          pushUpdate();
        }
      }, NO_PEERS_MS);
      if (e.torrent && typeof e.torrent.on === 'function') {
        e.torrent.on('noPeers', function () {
          if (e.noPeersFired || e.done || e.userPaused) return;
          e.noPeersFired = true;
          onNoPeers(entrySnapshot(e));
          pushUpdate();
        });
      }
    }

    function applyFileSelection(e) {
      var t = e.torrent;
      if (!t || !t.files) return;
      var sel = e.selectedPaths;
      t.files.forEach(function (f) {
        var want = !sel || sel.indexOf(f.path) !== -1;
        try {
          if (want) f.select();
          else f.deselect();
        } catch (err) { /* ignore */ }
      });
    }

    function syncTorrentPauseState(e) {
      var t = e.torrent;
      if (!t) return;
      var slots = H.reconcileQueue(entries.map(function (x) {
        return { id: x.id, userPaused: x.userPaused, done: !!(x.done || (x.torrent && x.torrent.done)) };
      }), H.MAX_ACTIVE);
      var slot = slots[e.id];
      var shouldRun;
      if (e.done) {
        // Respect userPaused so a restored list stays quiet until Resume
        shouldRun = !!e.seed && !e.userPaused;
      } else {
        shouldRun = slot === 'active';
      }
      try {
        if (shouldRun) {
          if (t.paused) t.resume();
        } else {
          if (!t.paused) t.pause();
        }
      } catch (err) { /* ignore */ }
    }

    function reconcileAll() {
      entries.forEach(syncTorrentPauseState);
      pushUpdate();
      persist();
    }

    function wireTorrent(e, t) {
      e.torrent = t;
      t.on('infoHash', function () {
        e.infoHash = t.infoHash || e.infoHash;
        if (!e.magnet && e.infoHash) {
          e.magnet = 'magnet:?xt=urn:btih:' + e.infoHash;
        }
        persist();
      });
      t.on('metadata', function () {
        e.name = t.name || e.name;
        if (!e.selectedPaths) {
          e.selectedPaths = t.files.map(function (f) { return f.path; });
        }
        applyFileSelection(e);
        pushUpdate();
        persist();
      });
      t.on('ready', function () {
        e.name = t.name || e.name;
        e.infoHash = t.infoHash || e.infoHash;
        applyFileSelection(e);
        armNoPeers(e);
        syncTorrentPauseState(e);
        pushUpdate();
        persist();
      });
      t.on('download', pushUpdate);
      t.on('upload', pushUpdate);
      t.on('done', function () {
        e.done = true;
        e.noPeersFired = false;
        if (!e.seed) {
          try { t.pause(); } catch (err) { /* ignore */ }
        }
        onDone(entrySnapshot(e), t, e);
        reconcileAll();
      });
      t.on('error', function (err) {
        onError((e.name || 'Torrent') + ': ' + (err && err.message ? err.message : String(err)));
      });
    }

    async function addMagnet(text, addOpts) {
      addOpts = addOpts || {};
      var magnet = H.parseTorrentInput(text);
      if (!magnet) throw new Error('Paste a magnet link or a 40-character info-hash');
      var hashMatch = /btih:([a-zA-Z0-9]+)/i.exec(magnet);
      var hash = hashMatch ? hashMatch[1].toLowerCase() : '';
      if (hash && findByHash(hash)) throw new Error('That torrent is already in the list');
      ensureClient();
      var e = {
        id: addOpts.id || H.newId(),
        magnet: magnet,
        infoHash: hash.length === 40 ? hash : '',
        name: addOpts.name || '',
        userPaused: !!addOpts.userPaused,
        done: !!addOpts.done,
        seed: addOpts.seed != null ? !!addOpts.seed : !!settings.seedDefault,
        selectedPaths: addOpts.selectedPaths || null,
        addedAt: addOpts.addedAt || Date.now(),
        torrent: null,
        noPeersTimer: null,
        noPeersFired: false,
        saved: false
      };
      entries.push(e);
      var t = client.add(magnet, { paused: true });
      wireTorrent(e, t);
      reconcileAll();
      return e.id;
    }

    async function addTorrentFile(file, addOpts) {
      addOpts = addOpts || {};
      if (!file) throw new Error('No .torrent file');
      ensureClient();
      var buf = new Uint8Array(await file.arrayBuffer());
      var e = {
        id: addOpts.id || H.newId(),
        magnet: '',
        infoHash: '',
        name: file.name.replace(/\.torrent$/i, '') || 'Torrent',
        userPaused: !!addOpts.userPaused,
        done: !!addOpts.done,
        seed: addOpts.seed != null ? !!addOpts.seed : !!settings.seedDefault,
        selectedPaths: addOpts.selectedPaths || null,
        addedAt: addOpts.addedAt || Date.now(),
        torrent: null,
        noPeersTimer: null,
        noPeersFired: false,
        saved: false
      };
      entries.push(e);
      var t = client.add(buf, { paused: true });
      wireTorrent(e, t);
      reconcileAll();
      return e.id;
    }

    function pause(id) {
      var e = findEntry(id);
      if (!e) return;
      e.userPaused = true;
      reconcileAll();
    }

    function resume(id) {
      var e = findEntry(id);
      if (!e) return;
      e.userPaused = false;
      if (e.done && e.seed && e.torrent) {
        try { e.torrent.resume(); } catch (err) { /* ignore */ }
      }
      reconcileAll();
    }

    function setSeed(id, on) {
      var e = findEntry(id);
      if (!e) return;
      e.seed = !!on;
      if (e.done && e.torrent) {
        try {
          if (e.seed) e.torrent.resume();
          else e.torrent.pause();
        } catch (err) { /* ignore */ }
      }
      persist();
      pushUpdate();
    }

    function setSelectedPaths(id, paths) {
      var e = findEntry(id);
      if (!e) return;
      e.selectedPaths = Array.isArray(paths) ? paths.slice() : null;
      applyFileSelection(e);
      persist();
      pushUpdate();
    }

    async function remove(id) {
      var e = findEntry(id);
      if (!e) return;
      if (e.noPeersTimer) clearTimeout(e.noPeersTimer);
      var t = e.torrent;
      e.torrent = null;
      entries = entries.filter(function (x) { return x.id !== id; });
      if (t) {
        await new Promise(function (resolve) {
          try {
            t.destroy({ destroyStore: false }, function () { resolve(); });
          } catch (err) {
            resolve();
          }
        });
      }
      reconcileAll();
    }

    function getTorrent(id) {
      var e = findEntry(id);
      return e ? e.torrent : null;
    }

    function getEntry(id) {
      return findEntry(id);
    }

    function markSaved(id) {
      var e = findEntry(id);
      if (e) { e.saved = true; pushUpdate(); }
    }

    function setSettings(next) {
      if (!next) return;
      if (next.uploadLimitKBs != null) {
        var up = H.parseThrottleKBs(next.uploadLimitKBs);
        if (up.ok) settings.uploadLimitKBs = up.kBs;
      }
      if (next.downloadLimitKBs != null) {
        var down = H.parseThrottleKBs(next.downloadLimitKBs);
        if (down.ok) settings.downloadLimitKBs = down.kBs;
      }
      if (next.seedDefault != null) settings.seedDefault = !!next.seedDefault;
      applyThrottles();
      persist();
      pushUpdate();
    }

    function getSettings() {
      return {
        uploadLimitKBs: settings.uploadLimitKBs,
        downloadLimitKBs: settings.downloadLimitKBs,
        seedDefault: settings.seedDefault
      };
    }

    async function attachServer(registration) {
      ensureClient();
      if (serverReady) return true;
      if (!registration) return false;
      try {
        client.createServer({ controller: registration });
        serverReady = true;
        pushUpdate();
        return true;
      } catch (err) {
        onError('Player server: ' + (err && err.message ? err.message : String(err)));
        return false;
      }
    }

    async function restoreFromList(list, restoredSettings) {
      if (restoredSettings) setSettings(restoredSettings);
      ensureClient();
      for (var i = 0; i < (list || []).length; i++) {
        var row = list[i];
        if (!row || !row.magnet) continue;
        if (row.infoHash && findByHash(row.infoHash)) continue;
        await addMagnet(row.magnet, {
          id: row.id,
          name: row.name,
          userPaused: true,
          done: !!row.done,
          seed: row.seed !== false,
          selectedPaths: row.selectedPaths,
          addedAt: row.addedAt
        });
      }
      // Keep everything paused after restore until user resumes
      entries.forEach(function (e) { e.userPaused = true; });
      reconcileAll();
    }

    function startPolling() {
      if (pollTimer) return;
      pollTimer = setInterval(pushUpdate, 500);
    }

    function stopPolling() {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    }

    async function destroy() {
      destroyed = true;
      stopPolling();
      entries.forEach(function (e) {
        if (e.noPeersTimer) clearTimeout(e.noPeersTimer);
      });
      var list = entries.slice();
      entries = [];
      for (var i = 0; i < list.length; i++) {
        var t = list[i].torrent;
        if (!t) continue;
        await new Promise(function (resolve) {
          try { t.destroy({ destroyStore: false }, function () { resolve(); }); }
          catch (err) { resolve(); }
        });
      }
      if (client) {
        await new Promise(function (resolve) {
          try { client.destroy(function () { resolve(); }); }
          catch (err) { resolve(); }
        });
        client = null;
      }
      serverReady = false;
    }

    startPolling();

    return {
      addMagnet: addMagnet,
      addTorrentFile: addTorrentFile,
      pause: pause,
      resume: resume,
      setSeed: setSeed,
      setSelectedPaths: setSelectedPaths,
      remove: remove,
      getTorrent: getTorrent,
      getEntry: getEntry,
      markSaved: markSaved,
      setSettings: setSettings,
      getSettings: getSettings,
      attachServer: attachServer,
      restoreFromList: restoreFromList,
      snapshot: snapshotAll,
      destroy: destroy,
      NO_PEERS_MS: NO_PEERS_MS,
      MAX_ACTIVE: H.MAX_ACTIVE
    };
  }

  root.TRClient = { createClient: createClient, NO_PEERS_MS: NO_PEERS_MS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
