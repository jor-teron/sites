/* Messages MS3 — files, peer to peer over the same direct PeerJS DataConnection (reliable).
   Wire: {t:'fmeta', id, from, name, fname, size, mime, ts, n, thumb?} → n × {t:'fchunk', id, i, d:ArrayBuffer (64 KB)} → {t:'fend', id};
   receiver sends {t:'ack', id} when every chunk is in (→ ✓✓). Duplicate chunks / a finished id are ignored (re-acked).
   Cap 100 MB a file. Files only go while the person is online; otherwise queued in memory (lost if the app closes).
   Bytes stay in memory as blob URLs until saved; only a small JPEG thumbnail (≤ 200 px) goes into history. */
(function () {
  'use strict';
  var CH = 64 * 1024, MAX = 100 * 1024 * 1024, HIGH = 1024 * 1024;
  var out = {}, inc = {}, urls = {}, prog = {}, ev = {};
  function on(n, f) { (ev[n] = ev[n] || []).push(f); }
  function emit(n, a, b) { (ev[n] || []).forEach(function (f) { try { f(a, b); } catch (e) { console.warn(e); } }); }
  function rid() { return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function size(n) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }
  function thumb(file) {
    if (!/^image\/(png|jpeg|webp|gif|bmp)$/.test(file.type)) return Promise.resolve('');
    return new Promise(function (res) {
      var u = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try { var k = Math.min(1, 200 / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.6)); } catch (_) { res(''); }
        URL.revokeObjectURL(u);
      };
      img.onerror = function () { URL.revokeObjectURL(u); res(''); };
      img.src = u;
    });
  }
  function drain(c) {   // wait while the channel buffer is full (keeps RAM low on big files)
    return new Promise(function (res) {
      (function w() { var dc = c.dataChannel; if (!c.open) return res(false); if (!dc || dc.bufferedAmount < HIGH) return res(true); setTimeout(w, 30); })();
    });
  }
  /* queue a file to num; returns the history entry, or null when too big */
  function send(num, name, me, file) {
    if (file.size > MAX) return Promise.resolve(null);
    return thumb(file).then(function (t) {
      var f = { id: rid(), fname: file.name || 'file', size: file.size, mime: file.type || '', ts: Date.now(), thumb: t };
      var e = MSStore.addFileOut(num, name, f);
      out[f.id] = { num: num, file: file, me: me, busy: false };
      urls[f.id] = URL.createObjectURL(file);
      go(f.id); return e;
    });
  }
  function go(id) {
    var o = out[id]; if (!o || o.busy || !MSPeer.peerOf(o.num)) return;
    var e = MSStore.find(o.num, id); if (!e || e.st === 'delivered' || e.st === 'read') { delete out[id]; return; }
    o.busy = true; prog[id] = 0; emit('change', o.num);
    var n = Math.ceil(o.file.size / CH), fail = function () { o.busy = false; delete prog[id]; MSStore.setSt(o.num, id, 'queued'); emit('change', o.num); };
    MSPeer.link(o.num).then(function (c) {
      if (!c) return fail();
      var me = o.me();
      c.send({ t: 'fmeta', id: id, from: me.num, name: me.name, fname: e.fname, size: e.size, mime: e.mime, ts: e.ts, n: n, thumb: e.thumb || '' });
      var i = 0;
      (function next() {
        if (i >= n) { c.send({ t: 'fend', id: id }); o.busy = false; delete prog[id]; MSStore.setSt(o.num, id, 'sent'); emit('change', o.num); return; }
        drain(c).then(function (ok) {
          if (!ok) return fail();
          return o.file.slice(i * CH, (i + 1) * CH).arrayBuffer().then(function (d) {
            try { c.send({ t: 'fchunk', id: id, i: i, d: d }); } catch (_) { return fail(); }
            i++; prog[id] = i / n; emit('progress', id, prog[id]); next();
          });
        }).catch(fail);
      })();
    });
  }
  function flush() { Object.keys(out).forEach(go); }
  function acked(id) { if (out[id]) { delete out[id]; } }
  /* receiver; returns true when a new file finished */
  function data(m, conn, num) {
    var id = String(m.id || '').slice(0, 80); if (!id) return;
    if (m.t === 'fmeta') {
      if (urls[id] && !inc[id]) { try { conn.send({ t: 'ack', id: id }); } catch (_) { /* */ } return; }
      if (!(+m.size >= 0) || +m.size > MAX) return;
      var isNew = MSStore.addFileIn(num, m.name, { id: id, fname: m.fname, size: +m.size, mime: m.mime, ts: m.ts, thumb: m.thumb });
      inc[id] = { num: num, n: +m.n || 0, got: 0, parts: [], mime: String(m.mime || ''), size: +m.size };
      prog[id] = 0; emit('change', num, isNew ? { id: id, fname: m.fname, name: m.name } : null);
      if (inc[id].n === 0) done(id, conn);
    } else if (m.t === 'fchunk') {
      var r = inc[id], i = +m.i; if (!r || !(i >= 0 && i < r.n) || r.parts[i]) return;
      r.parts[i] = m.d; r.got++; prog[id] = r.got / r.n; emit('progress', id, prog[id]);
      if (r.got === r.n) done(id, conn);
    }
  }
  function done(id, conn) {
    var r = inc[id]; delete inc[id]; delete prog[id];
    urls[id] = URL.createObjectURL(new Blob(r.parts, { type: r.mime || 'application/octet-stream' }));
    try { conn.send({ t: 'ack', id: id }); } catch (_) { /* */ }
    emit('change', r.num);
  }
  function save(id, fname) { var u = urls[id]; if (!u) return; var a = document.createElement('a'); a.href = u; a.download = fname || 'file'; document.body.appendChild(a); a.click(); a.remove(); }
  window.MSFiles = { MAX: MAX, send: send, flush: flush, data: data, acked: acked, save: save, size: size, on: on,
    url: function (id) { return urls[id] || ''; }, progress: function (id) { return id in prog ? prog[id] : -1; }, inMemory: function (id) { return !!out[id]; } };
})();
