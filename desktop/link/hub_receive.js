/**
 * Hub — phone → hub files (receiver). The controller's Send Files tab (controller/ctrl_sendfiles.js)
 * opens a second PeerJS connection to the hub peer with metadata {kind:'files'} and
 * serialization 'raw' (hub-controller.js routes it here). Frame format and chunking follow
 * File Drop (apps/connectivity/filedrop/filedrop_proto.js), without resume:
 *   phone → hub  {t:'offer', tid, name, type, size}      (JSON string)
 *   hub → phone  {t:'go', tid} | {t:'no', tid, reason}
 *   phone → hub  frames [u32 tid][f64 offset][payload] (ArrayBuffer), then {t:'end', tid}
 *   hub → phone  {t:'ack', tid, bytes} every receive.ackEveryBytes, then {t:'got', tid}
 *   either way   {t:'cancel', tid}
 * No approve step: each finished file is downloaded at once under its original name
 * (receive.autoSave) and shown as a card (hub_notify.js). Settings: HUB_CTRL_CONFIG.receive.
 */
(function () {
  'use strict';

  const CFG = Object.assign({
    autoSave: true, maxBytes: 2 * 1024 * 1024 * 1024, ackEveryBytes: 512 * 1024, partBytes: 8 * 1024 * 1024,
  }, (window.HUB_CTRL_CONFIG || {}).receive || {});
  const HEAD = 12;
  let seq = 0;
  const saved = [];          // for tests: { name, size, type }

  function safeName(n) {
    const s = String(n || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim().slice(0, 180);
    return s || 'file';
  }

  function unframe(buf) {
    if (ArrayBuffer.isView(buf)) buf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    if (!buf || buf.byteLength < HEAD) return null;
    const dv = new DataView(buf);
    return { tid: dv.getUint32(0), offset: dv.getFloat64(4), data: buf.slice(HEAD) };
  }

  function assembler(size) {
    const a = { size: size, have: 0, parts: [], pend: [], pendBytes: 0 };
    a.push = (offset, data) => {
      if (offset !== a.have || a.have + data.byteLength > a.size) return false;
      a.pend.push(data); a.pendBytes += data.byteLength; a.have += data.byteLength;
      if (a.pendBytes >= CFG.partBytes) a.fold();
      return true;
    };
    a.fold = () => { if (a.pend.length) { a.parts.push(new Blob(a.pend)); a.pend = []; a.pendBytes = 0; } };
    a.blob = (type) => { a.fold(); const b = new Blob(a.parts, { type: type || '' }); a.parts = []; return b; };
    return a;
  }

  function download(url, name) {
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function attach(conn) {
    const rx = new Map();    // tid -> { id, name, type, size, asm, acked }
    const N = window.HubNotify;
    const send = (m) => { try { if (conn.open) conn.send(JSON.stringify(m)); } catch (_) { /* ignore */ } };

    function finish(t) {
      rx.delete(t.tid);
      const blob = t.asm.blob(t.type);
      const url = URL.createObjectURL(blob);
      if (CFG.autoSave) download(url, t.name);
      saved.push({ name: t.name, size: t.size, type: t.type });
      send({ t: 'got', tid: t.tid });
      if (N) N.done(t.id, { url: url, blob: blob });
    }

    function onControl(m) {
      const tid = Number(m.tid) >>> 0;
      if (m.t === 'offer') {
        const size = Number(m.size);
        if (!(size >= 0) || !isFinite(size)) { send({ t: 'no', tid: tid, reason: 'bad size' }); return; }
        if (size > CFG.maxBytes) { send({ t: 'no', tid: tid, reason: 'too large' }); return; }
        const t = { tid: tid, id: 'rx' + (++seq), name: safeName(m.name), type: String(m.type || '').slice(0, 100), size: size, asm: assembler(size), acked: 0 };
        rx.set(tid, t);
        if (N) N.start(t.id, t);
        send({ t: 'go', tid: tid });
        if (size === 0) { /* waits for 'end' */ }
      } else if (m.t === 'end') {
        const t = rx.get(tid);
        if (!t) return;
        if (t.asm.have === t.size) finish(t);
        else { rx.delete(tid); send({ t: 'cancel', tid: tid }); if (N) N.fail(t.id, 'Incomplete'); }
      } else if (m.t === 'cancel') {
        const t = rx.get(tid);
        if (!t) return;
        rx.delete(tid);
        if (N) N.fail(t.id, 'Cancelled on the phone');
      }
    }

    function onFrame(buf) {
      const f = unframe(buf);
      if (!f) return;
      const t = rx.get(f.tid);
      if (!t) return;
      if (!t.asm.push(f.offset, f.data)) return;
      if (t.asm.have - t.acked >= CFG.ackEveryBytes || t.asm.have === t.size) {
        t.acked = t.asm.have;
        send({ t: 'ack', tid: t.tid, bytes: t.acked });
      }
      if (N) N.progress(t.id, t.asm.have);
    }

    conn.on('data', (d) => {
      if (typeof d === 'string') {
        if (d.length > 4096) return;
        let m = null;
        try { m = JSON.parse(d); } catch (_) { return; }
        if (m && typeof m.t === 'string') onControl(m);
      } else if (d instanceof ArrayBuffer || ArrayBuffer.isView(d)) {
        onFrame(d);
      } else if (d && typeof Blob !== 'undefined' && d instanceof Blob) {
        d.arrayBuffer().then(onFrame);   // only if a browser hands Blobs (PeerJS asks for ArrayBuffers)
      }
    });
    const lost = () => {
      for (const t of rx.values()) if (N) N.fail(t.id, 'Connection lost');
      rx.clear();
    };
    conn.on('close', lost);
    conn.on('error', (err) => { console.warn('hub files conn', err); });
  }

  const ext = window.HubCtrlExt = window.HubCtrlExt || { handlers: [], onClose: [], files: null };
  ext.files = attach;
  window.__hubReceive = { saved: saved };
})();
