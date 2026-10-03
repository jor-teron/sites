/*
 * File Drop — filedrop_send.js
 * Outgoing queue: one file at a time, offer → go{from} → frames → end → got.
 * Files picked before a link exists wait in the queue. When the link drops the current file
 * pauses; on the next link it is offered again with the same id and the receiver answers
 * go{from: bytes it has}, so it resumes where it stopped. Backpressure keeps at most
 * config.bufferHigh bytes queued in the data channel.
 *
 * Items (shared shape with filedrop_recv.js, rendered by filedrop_ui.js):
 *   {dir:'out', id, tid, name, size, type, status, bytes, file, note}
 *   status: queued | offered | active | sent | done | failed | cancelled
 */
(function (FD) {
  'use strict';
  const P = FD.proto;
  const C = () => FD.config;
  const PAIR = FD.pair;
  const SEND = FD.send = {};
  const items = [];
  let cur = null;
  const FINAL = { done: 1, failed: 1, cancelled: 1 };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isIOS = P.isIOS(navigator.userAgent, navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  SEND.items = items;
  SEND.isIOS = isIOS;
  SEND.maxBytes = () => (isIOS ? C().maxBytesIOS : C().maxBytes);

  function update(t, status, note) {
    if (status) t.status = status;
    if (note !== undefined) t.note = note;
    FD.emit('item', t);
  }

  SEND.add = (files) => {
    let n = 0, warned = false;
    for (const file of files) {
      const name = P.cleanName(file.name);
      if (file.size > SEND.maxBytes()) { FD.emit('toast', name + ' is over ' + P.bytes(SEND.maxBytes()) + '.', 'err'); continue; }
      if (isIOS && file.size > C().warnBytesIOS && !warned) {
        warned = true;
        FD.emit('toast', 'Large file on iPhone: keep File Drop open and the screen on until it finishes.');
      }
      const t = { dir: 'out', id: P.rand(10), tid: P.tid(), name: name, size: file.size, type: P.safeMime(file.type),
        status: 'queued', bytes: 0, file: file, note: '' };
      items.push(t);
      update(t, 'queued', PAIR.link() ? 'Queued' : 'Waiting for a device');
      n++;
    }
    if (n) pump();
    return n;
  };

  SEND.cancel = (t) => {
    if (FINAL[t.status]) return;
    const live = t === cur;
    t.run = (t.run || 0) + 1;
    if (live) { PAIR.send({ t: 'cancel', id: t.id }); cur = null; }
    update(t, 'cancelled', 'Cancelled');
    pump();
  };

  function next() {
    for (const t of items) if (!FINAL[t.status]) return t;
    return null;
  }

  function pump() {
    if (cur || !PAIR.link()) return;
    const t = next();
    if (!t) return;
    cur = t;
    t.run = (t.run || 0) + 1;
    update(t, 'offered', t.bytes ? 'Resuming…' : 'Starting…');
    PAIR.send({ t: 'offer', id: t.id, tid: t.tid, name: t.name, type: t.type, size: t.size });
  }

  function queuedBytes(conn) {
    const dc = conn.dataChannel;
    return (dc ? dc.bufferedAmount : 0) + (conn.bufferSize || 0) * C().chunkMax;
  }
  function waitLow(conn) {
    const dc = conn.dataChannel;
    return new Promise((resolve) => {
      let tm = 0;
      const done = () => { clearTimeout(tm); if (dc) dc.removeEventListener('bufferedamountlow', done); resolve(); };
      if (dc) { dc.bufferedAmountLowThreshold = C().bufferLow; dc.addEventListener('bufferedamountlow', done); }
      tm = setTimeout(done, 40);
    });
  }

  async function stream(t, from) {
    const run = t.run = (t.run || 0) + 1;
    const conn = PAIR.link();
    if (!conn) return;
    const pc = conn.peerConnection;
    const chunk = P.chunkSize(pc && pc.sctp && pc.sctp.maxMessageSize, C());
    const block = chunk * 16;
    let off = Math.max(0, Math.min(t.size, from || 0));
    t.bytes = off; t.acked = off;
    update(t, 'active', '');
    FD.emit('wake', true);
    try {
      while (off < t.size) {
        const end = Math.min(t.size, off + block);
        const buf = await t.file.slice(off, end).arrayBuffer();
        for (let p = 0; p < buf.byteLength; p += chunk) {
          while (queuedBytes(conn) > C().bufferHigh) {
            await waitLow(conn);
            if (t.run !== run || PAIR.link() !== conn) return;
          }
          if (t.run !== run || PAIR.link() !== conn) return;
          const len = Math.min(chunk, buf.byteLength - p);
          conn.send(P.frame(t.tid, off + p, new Uint8Array(buf, p, len)));
          t.bytes = off + p + len;
          FD.emit('progress', t);
        }
        off = end;
      }
      if (t.run !== run || PAIR.link() !== conn) return;
      PAIR.send({ t: 'end', id: t.id });
      update(t, 'sent', 'Finishing…');
    } catch (err) {
      if (t.run !== run) return;
      console.warn('[fd] send', err);
      if (err && err.name === 'NotReadableError') { cur = null; update(t, 'failed', 'Could not read the file'); pump(); }
      // otherwise the link went away: resumes on the next link
    }
  }

  // Shown progress: what has actually left the buffer (never below what the receiver confirmed).
  SEND.shownBytes = (t) => {
    if (t.status !== 'active' && t.status !== 'sent') return t.status === 'done' ? t.size : (t.acked || 0);
    const conn = PAIR.link();
    const q = conn && cur === t ? queuedBytes(conn) : 0;
    return Math.max(t.acked || 0, Math.min(t.size, t.bytes - q));
  };

  FD.on('msg', (m) => {
    if (!m || typeof m.id !== 'string') return;
    const t = cur && cur.id === m.id ? cur : null;
    if (!t) return;
    switch (m.t) {
      case 'go': {
        const from = Number(m.from);
        if (!(from >= 0 && from <= t.size)) return;
        stream(t, from);
        return;
      }
      case 'ack': { const b = Number(m.bytes); if (b >= 0 && b <= t.size) t.acked = Math.max(t.acked || 0, b); FD.emit('progress', t); return; }
      case 'got': cur = null; t.bytes = t.acked = t.size; update(t, 'done', 'Sent'); FD.emit('sent', t); pump(); return;
      case 'no': cur = null; update(t, 'failed', 'Refused: ' + String(m.reason || '').slice(0, 60)); pump(); return;
      case 'cancel': cur = null; t.run++; update(t, 'cancelled', 'Cancelled by the other device'); pump(); return;
    }
  });

  FD.on('link', () => {
    if (cur) { cur.run++; cur = null; }
    for (const t of items) if (t.status === 'queued' && t.note !== 'Queued') update(t, null, 'Queued');
    pump();
  });
  FD.on('unlink', () => {
    if (cur) { cur.run++; if (!FINAL[cur.status]) update(cur, 'queued', 'Paused · reconnecting'); cur = null; }
  });
  FD.on('forget', () => {
    for (const t of items) if (!FINAL[t.status]) { t.run = (t.run || 0) + 1; update(t, 'cancelled', 'Not sent (disconnected)'); }
    cur = null;
  });
  SEND.busy = () => !!cur || items.some((t) => !FINAL[t.status]);
})(window.FD);
