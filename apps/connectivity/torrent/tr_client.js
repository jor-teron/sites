/* Torrent — tr_client.js: one-at-a-time WebTorrent client wrapper, status, no-peers hint. TR1 */
(function (root) {
  'use strict';

  var H = root.TRHelpers;
  var NO_PEERS_MS = 30_000;

  function createClient(WebTorrent, opts) {
    opts = opts || {};
    var onUpdate = opts.onUpdate || function () {};
    var onError = opts.onError || function () {};
    var onNoPeers = opts.onNoPeers || function () {};
    var onReady = opts.onReady || function () {};
    var onDone = opts.onDone || function () {};

    var client = null;
    var torrent = null;
    var pollTimer = null;
    var noPeersTimer = null;
    var noPeersFired = false;
    var destroyed = false;

    function ensureClient() {
      if (client) return client;
      if (typeof WebTorrent !== 'function') throw new Error('WebTorrent is not loaded');
      client = new WebTorrent();
      client.on('error', function (err) {
        onError(err && err.message ? err.message : String(err));
      });
      return client;
    }

    function clearTimers() {
      if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
      if (noPeersTimer) { clearTimeout(noPeersTimer); noPeersTimer = null; }
    }

    function snapshot() {
      if (!torrent) {
        return {
          active: false,
          name: '',
          length: 0,
          downloaded: 0,
          uploaded: 0,
          progress: 0,
          downloadSpeed: 0,
          uploadSpeed: 0,
          numPeers: 0,
          timeRemaining: Infinity,
          done: false,
          status: 'idle',
          files: []
        };
      }
      var done = !!torrent.done;
      var status = done ? 'done' : (torrent.numPeers > 0 ? 'downloading' : 'looking');
      return {
        active: true,
        name: torrent.name || 'Torrent',
        infoHash: torrent.infoHash || '',
        length: torrent.length || 0,
        downloaded: torrent.downloaded || 0,
        uploaded: torrent.uploaded || 0,
        progress: torrent.progress || 0,
        downloadSpeed: torrent.downloadSpeed || 0,
        uploadSpeed: torrent.uploadSpeed || 0,
        numPeers: torrent.numPeers || 0,
        timeRemaining: torrent.timeRemaining,
        done: done,
        status: status,
        files: (torrent.files || []).map(function (f) {
          return { name: f.name, path: f.path, length: f.length, progress: f.progress };
        })
      };
    }

    function pushUpdate() {
      onUpdate(snapshot());
    }

    function armNoPeersWatch() {
      noPeersFired = false;
      if (noPeersTimer) clearTimeout(noPeersTimer);
      noPeersTimer = setTimeout(function () {
        if (!torrent || torrent.done) return;
        if ((torrent.numPeers || 0) === 0) {
          noPeersFired = true;
          onNoPeers(snapshot());
        }
      }, NO_PEERS_MS);
      if (torrent && typeof torrent.on === 'function') {
        torrent.on('noPeers', function () {
          if (noPeersFired || (torrent && torrent.done)) return;
          noPeersFired = true;
          onNoPeers(snapshot());
        });
      }
    }

    async function removeCurrent() {
      clearTimers();
      var t = torrent;
      torrent = null;
      if (t) {
        await new Promise(function (resolve) {
          try {
            t.destroy({ destroyStore: false }, function () { resolve(); });
          } catch (e) {
            resolve();
          }
        });
      }
      pushUpdate();
    }

    async function add(id, addOpts) {
      if (destroyed) throw new Error('Client destroyed');
      ensureClient();
      if (torrent) {
        await removeCurrent();
      }
      addOpts = addOpts || {};
      return new Promise(function (resolve, reject) {
        var settled = false;
        function fail(err) {
          if (settled) return;
          settled = true;
          reject(err instanceof Error ? err : new Error(String(err)));
        }
        try {
          var t = client.add(id, addOpts, function (tor) {
            // metadata ready
          });
          torrent = t;
          t.on('error', fail);
          t.on('metadata', function () {
            pushUpdate();
            onReady(snapshot(), t);
          });
          t.on('ready', function () {
            if (!settled) {
              settled = true;
              resolve(t);
            }
            pushUpdate();
            armNoPeersWatch();
            pollTimer = setInterval(pushUpdate, 500);
          });
          t.on('download', pushUpdate);
          t.on('upload', pushUpdate);
          t.on('done', function () {
            pushUpdate();
            onDone(snapshot(), t);
          });
        } catch (err) {
          fail(err);
        }
      });
    }

    async function addMagnet(text) {
      var magnet = H.parseTorrentInput(text);
      if (!magnet) throw new Error('Paste a magnet link or a 40-character info-hash');
      return add(magnet);
    }

    async function addTorrentFile(file) {
      if (!file) throw new Error('No .torrent file');
      var buf = new Uint8Array(await file.arrayBuffer());
      return add(buf);
    }

    function getTorrent() {
      return torrent;
    }

    async function destroy() {
      destroyed = true;
      clearTimers();
      await removeCurrent();
      if (client) {
        await new Promise(function (resolve) {
          try {
            client.destroy(function () { resolve(); });
          } catch (e) {
            resolve();
          }
        });
        client = null;
      }
    }

    return {
      addMagnet: addMagnet,
      addTorrentFile: addTorrentFile,
      removeCurrent: removeCurrent,
      getTorrent: getTorrent,
      snapshot: snapshot,
      destroy: destroy,
      NO_PEERS_MS: NO_PEERS_MS
    };
  }

  root.TRClient = { createClient: createClient, NO_PEERS_MS: NO_PEERS_MS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
