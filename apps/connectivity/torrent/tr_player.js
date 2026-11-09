/* Torrent — tr_player.js: scoped service worker + streamTo / blob-URL playback. TR4 */
(function (root) {
  'use strict';

  var H = root.TRHelpers;
  var SW_URL = 'vendor/webtorrent/sw.min.js';
  var registration = null;
  var registering = null;

  function supported() {
    return typeof navigator !== 'undefined' && !!(navigator.serviceWorker);
  }

  async function ensureRegistration() {
    if (!supported()) return null;
    if (registration && registration.active) return registration;
    if (registering) return registering;
    registering = (async function () {
      // Scope stays inside apps/connectivity/torrent/ (./ relative to this page).
      var reg = await navigator.serviceWorker.register(SW_URL, { scope: './' });
      await navigator.serviceWorker.ready;
      registration = reg;
      return reg;
    })();
    try {
      return await registering;
    } finally {
      registering = null;
    }
  }

  /**
   * Play a WebTorrent file into a media element.
   * Prefers streamTo/streamURL after client.createServer(SW); falls back to blob URL.
   */
  async function playFile(clientApi, entryId, filePath, mediaEl, onStatus) {
    var say = onStatus || function () {};
    if (!mediaEl) throw new Error('No media element');
    var torrent = clientApi.getTorrent(entryId);
    if (!torrent) throw new Error('Torrent not ready');
    var file = null;
    for (var i = 0; i < torrent.files.length; i++) {
      if (torrent.files[i].path === filePath) { file = torrent.files[i]; break; }
    }
    if (!file) throw new Error('File not found');

    if (H.mayNotPlay(file.name)) {
      say('This container/codec (e.g. MKV / HEVC) may not play in the browser', 'warn');
    }

    // Prefer streaming via WebTorrent's browser server (needs SW).
    try {
      var reg = await ensureRegistration();
      if (reg) {
        var ok = await clientApi.attachServer(reg);
        if (ok && typeof file.streamTo === 'function') {
          try {
            // Select + critical path for the file being played
            if (typeof file.select === 'function') file.select(1);
            file.streamTo(mediaEl);
            say('Streaming “' + file.name + '”', 'busy');
            return { mode: 'stream', name: file.name };
          } catch (err) {
            // fall through to blob
          }
        }
        if (ok && file.streamURL) {
          mediaEl.src = file.streamURL;
          say('Streaming “' + file.name + '”', 'busy');
          return { mode: 'streamURL', name: file.name };
        }
      }
    } catch (err) {
      // SW unavailable — blob fallback
    }

    say('Building a temporary blob for “' + file.name + '”…', 'busy');
    var blob = await file.blob();
    var url = URL.createObjectURL(blob);
    mediaEl.src = url;
    mediaEl.addEventListener('emptied', function once() {
      URL.revokeObjectURL(url);
    }, { once: true });
    say('Playing “' + file.name + '” (blob)', 'busy');
    return { mode: 'blob', name: file.name, url: url };
  }

  function stop(mediaEl) {
    if (!mediaEl) return;
    try {
      mediaEl.pause();
      mediaEl.removeAttribute('src');
      mediaEl.load();
    } catch (e) { /* ignore */ }
  }

  root.TRPlayer = {
    supported: supported,
    ensureRegistration: ensureRegistration,
    playFile: playFile,
    stop: stop,
    SW_URL: SW_URL
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
