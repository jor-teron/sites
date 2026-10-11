/*
  Project: sites (shared)
  File: shared/link/link_files.js
  Role: Chunked file transfer over SharedLink. Same frames as Print
  (apps/lab/print/print_common.js) plus routing fields:
    {t:'meta', id, name, mime, size, app?, to?}  {t:'chunk', id, d base64}  {t:'end', id}
  Sender waits for the data-channel buffer to drain between chunks.
  Receiver emits SharedLink 'progress' {id,name,size,done,from,app} and
  'file' {id,name,type,size,blob,app,from}. The host relays frames whose
  `to` names another device (mesh send through the Hub).
*/
(function () {
  'use strict';
  var CHUNK = 8000;            // base64 chars per chunk (one JSON message)
  var HIGH = 64 * 1024;        // pause above this many buffered bytes
  var seq = 0;
  var rx = {};                 // id -> { meta, parts[], have }

  function L() { return window.SharedLink; }

  function drain(conn) {
    var ch = conn && conn.dataChannel;
    if (!ch) return Promise.resolve();
    var spins = 0;
    return new Promise(function (res) {
      (function wait() {
        if (ch.bufferedAmount <= HIGH || spins++ > 400) return res();
        setTimeout(wait, 25);
      })();
    });
  }

  function b64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { var s = String(r.result); res(s.slice(s.indexOf(',') + 1)); };
      r.onerror = function () { rej(r.error); };
      r.readAsDataURL(blob);
    });
  }

  function put(conn, m) { if (!conn || !conn.open) throw new Error('Not connected'); conn.send(m); }

  /* sendFile(file, {app, to, onProgress(done,total)}) → Promise. */
  function sendFile(file, opts) {
    opts = opts || {};
    var conns = L()._targets(opts.to);
    if (!conns.length) return Promise.reject(new Error('Not connected'));
    var conn = conns[0];
    var id = Date.now().toString(36) + '-' + (++seq);
    var size = file.size || 0;
    return b64(file).then(function (data) {
      var meta = { t: 'meta', id: id, name: file.name || 'file', mime: file.type || 'application/octet-stream', size: size };
      if (opts.app) meta.app = String(opts.app);
      if (opts.to) meta.to = opts.to;
      var off = 0;
      function step() {
        if (off >= data.length) return drain(conn).then(function () { put(conn, { t: 'end', id: id, to: opts.to }); });
        return drain(conn).then(function () {
          put(conn, { t: 'chunk', id: id, d: data.slice(off, off + CHUNK), to: opts.to });
          off += CHUNK;
          var done = Math.min(size, Math.floor(off * 3 / 4));
          if (opts.onProgress) opts.onProgress(done, size);
          L().emit('progress', { id: id, name: meta.name, size: size, done: done, out: true });
          return step();
        });
      }
      return drain(conn).then(function () { put(conn, meta); return step(); });
    });
  }

  function toBlob(parts, mime) {
    var bin = atob(parts.join(''));
    var a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new Blob([a], { type: mime });
  }

  /* Called by link_core for every message. Returns true when it was a file frame. */
  function handle(m, from) {
    if (m.t !== 'meta' && m.t !== 'chunk' && m.t !== 'end') return false;
    var link = L();
    if (link.role === 'host' && m.to && m.to !== 'host') {       // relay to another device
      link._targets(m.to).forEach(function (c) { link._safeSend(c, Object.assign({}, m, { from: from })); });
      return true;
    }
    var src = m.from || from;
    if (m.t === 'meta') {
      rx[m.id] = { meta: m, parts: [], have: 0, from: src };
      link.emit('progress', { id: m.id, name: m.name, size: m.size, done: 0, from: src, app: m.app || '' });
      return true;
    }
    var r = rx[m.id];
    if (!r) return true;
    if (m.t === 'chunk') {
      r.parts.push(String(m.d || ''));
      r.have = Math.min(r.meta.size, r.have + Math.floor(String(m.d || '').length * 3 / 4));
      link.emit('progress', { id: m.id, name: r.meta.name, size: r.meta.size, done: r.have, from: src, app: r.meta.app || '' });
      return true;
    }
    delete rx[m.id];
    var mime = r.meta.mime || 'application/octet-stream';
    var blob = toBlob(r.parts, mime);
    link.emit('file', { id: m.id, name: String(r.meta.name || 'file').slice(0, 180), type: mime, size: blob.size, blob: blob, app: r.meta.app || '', from: src });
    return true;
  }

  window.SharedLinkFiles = { sendFile: sendFile, handle: handle };
  if (window.SharedLink) window.SharedLink.sendFile = sendFile;
})();
