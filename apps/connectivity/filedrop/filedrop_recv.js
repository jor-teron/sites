/*
 * File Drop — filedrop_recv.js
 * Incoming files: offer → go{from} (from > 0 = resume), frames folded into ~8 MB Blob parts,
 * ack about every MB (the sender's resume point), end → got, or go{from} again if a gap was found.
 * Partial files survive a dropped link (and are resumed); finished files are kept as blob URLs
 * until the page closes — never removed on disconnect. Auto-save downloads each file when it
 * lands (desktop / Android); iOS cannot save silently, so it gets Save / Share buttons instead.
 *
 * Items: {dir:'in', id, tid, name, size, type, kind, status, bytes, file, url, note}
 *   status: active | done | failed | cancelled
 */
(function (FD) {
  'use strict';
  const P = FD.proto;
  const C = () => FD.config;
  const PAIR = FD.pair;
  const RECV = FD.recv = {};
  const items = [];
  const byId = new Map(), byTid = new Map();
  RECV.items = items;
  const isIOS = FD.send.isIOS;
  RECV.canShareFiles = (file) => {
    try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] })); } catch (_) { return false; }
  };

  function update(r, status, note) {
    if (status) r.status = status;
    if (note !== undefined) r.note = note;
    FD.emit('item', r);
  }

  function onOffer(m) {
    const size = Number(m.size), tid = Number(m.tid);
    if (typeof m.id !== 'string' || m.id.length > 40 || !Number.isInteger(size) || size < 0 || !(tid > 0 && tid <= 0xFFFFFFFF)) return;
    let r = byId.get(m.id);
    if (r) {                                        // resume / repeat
      if (r.status === 'done') { PAIR.send({ t: 'got', id: r.id }); return; }
      if (r.status === 'cancelled' || r.status === 'failed') { PAIR.send({ t: 'cancel', id: r.id }); return; }
      if (r.tid !== tid) { byTid.delete(r.tid); r.tid = tid; byTid.set(tid, r); }
      r.offeredAt = Date.now();
      update(r, 'active', r.asm.have ? 'Resuming…' : '');
      PAIR.send({ t: 'go', id: r.id, from: r.asm.have });
      return;
    }
    const max = FD.send.maxBytes();
    if (size > max) { PAIR.send({ t: 'no', id: m.id, reason: 'over ' + P.bytes(max) + ' on this device' }); return; }
    const name = P.cleanName(m.name), type = P.safeMime(m.type);
    r = { dir: 'in', id: m.id, tid: tid, name: name, size: size, type: type, kind: P.kind(type, name), status: 'active',
      bytes: 0, file: null, url: '', note: '', asm: P.assembler(size, C().partBytes), lastAck: 0, offeredAt: Date.now() };
    items.push(r); byId.set(r.id, r); byTid.set(tid, r);
    if (isIOS && size > C().warnBytesIOS) FD.emit('toast', 'Large file: keep File Drop open on this iPhone until it finishes.');
    update(r, 'active', '');
    FD.emit('wake', true);
    PAIR.send({ t: 'go', id: r.id, from: 0 });
  }

  function onFrame(buf) {
    const f = P.unframe(buf);
    if (!f) return;
    const r = byTid.get(f.tid);
    if (!r || r.status !== 'active') return;
    if (!r.asm.push(f.offset, f.data)) return;      // duplicate / out of order: the end check asks again
    r.bytes = r.asm.have;
    if (r.note) r.note = '';
    if (r.bytes - r.lastAck >= C().ackEveryBytes) { r.lastAck = r.bytes; PAIR.send({ t: 'ack', id: r.id, bytes: r.bytes }); }
    FD.emit('progress', r);
  }

  function onEnd(m) {
    const r = byId.get(m.id);
    if (!r || r.status !== 'active') return;
    if (!r.asm.done()) { PAIR.send({ t: 'go', id: r.id, from: r.asm.have }); return; }
    const blob = r.asm.blob(r.type);
    r.asm = null;
    r.file = new File([blob], r.name, { type: r.type });
    r.url = URL.createObjectURL(r.file);
    r.bytes = r.size;
    byTid.delete(r.tid);
    PAIR.send({ t: 'got', id: r.id });
    update(r, 'done', isIOS || !C().autoSave ? 'Received' : 'Saved to Downloads');
    if (C().autoSave && !isIOS) RECV.download(r);
    FD.emit('received', r);
  }

  RECV.cancel = (r) => {
    if (r.status !== 'active') return;
    r.asm = null;
    byTid.delete(r.tid);
    PAIR.send({ t: 'cancel', id: r.id });
    update(r, 'cancelled', 'Cancelled');
  };

  RECV.download = (r) => {
    if (!r.url) return;
    const a = document.createElement('a');
    a.href = r.url; a.download = r.name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  };
  RECV.share = async (r) => {
    try { await navigator.share({ files: [r.file], title: r.name }); } catch (err) {
      if (!err || err.name !== 'AbortError') RECV.download(r);
    }
  };

  RECV.saveAll = async () => {
    const done = items.filter((r) => r.status === 'done');
    if (!done.length) { FD.emit('toast', 'No received files yet.'); return; }
    if (typeof JSZip === 'undefined') { FD.emit('toast', 'Zip library missing.', 'err'); return; }
    FD.emit('toast', 'Making zip…');
    const zip = new JSZip();
    const seen = {};
    for (const r of done) {
      let n = r.name;
      if (seen[n]) { const i = n.lastIndexOf('.'); n = (i > 0 ? n.slice(0, i) : n) + ' (' + (++seen[r.name]) + ')' + (i > 0 ? n.slice(i) : ''); } else seen[n] = 1;
      zip.file(n, r.file, { binary: true });
    }
    const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const file = new File([blob], 'filedrop-' + stamp + '.zip', { type: 'application/zip' });
    const r = { name: file.name, file: file, url: URL.createObjectURL(file) };
    if (isIOS && RECV.canShareFiles(file)) await RECV.share(r); else RECV.download(r);
  };

  FD.on('msg', (m) => {
    if (!m || typeof m.id !== 'string') return;
    if (m.t === 'offer') onOffer(m);
    else if (m.t === 'end') onEnd(m);
    else if (m.t === 'cancel') {
      const r = byId.get(m.id);
      if (r && r.status === 'active') { r.asm = null; byTid.delete(r.tid); update(r, 'cancelled', 'Cancelled by the sender'); }
    }
  });
  FD.on('frame', onFrame);
  // After a new link the sender re-offers its unfinished file at once. One that is not offered
  // again was lost on the sender's side (page closed / reloaded): mark it so it is not stuck.
  FD.on('link', () => {
    const at = Date.now();
    setTimeout(() => {
      for (const r of items) {
        if (r.status === 'active' && r.offeredAt < at && PAIR.link()) {
          r.asm = null; byTid.delete(r.tid);
          update(r, 'failed', 'Interrupted — the sender closed the page; send it again');
        }
      }
    }, 6000);
  });
  FD.on('unlink', () => { for (const r of items) if (r.status === 'active') update(r, null, 'Paused · reconnecting'); });
  FD.on('forget', () => {
    for (const r of items) if (r.status === 'active') { r.asm = null; byTid.delete(r.tid); update(r, 'failed', 'Interrupted (disconnected)'); }
  });
  RECV.busy = () => items.some((r) => r.status === 'active');
})(window.FD);
