/*
 * Gamepad Controller — Send Files board (phone → hub, one way).
 * Registered like the keyboards: CTRL_KB.register('files', build).
 * Opens a second PeerJS connection to the same hub peer (metadata {kind:'files'},
 * serialization 'raw', reliable) so big files never block the gamepad / keyboard link.
 * Chunking and backpressure are ported from File Drop (apps/connectivity/filedrop/
 * filedrop_send.js + filedrop_proto.js; File Drop itself is not used or changed):
 *   phone → hub  {t:'offer', tid, name, type, size}
 *   hub → phone  {t:'go', tid} | {t:'no', tid, reason}
 *   phone → hub  frames [u32 tid][f64 offset][payload] …, then {t:'end', tid}
 *   hub → phone  {t:'ack', tid, bytes} (progress) … {t:'got', tid} (saved)
 * One file at a time, in queue order; the hub saves each file by itself (hub/hub_receive.js).
 * A file that fails (link lost, hub reloaded) can be tapped to send again.
 * Settings: CONTROLLER_CONFIG.sendFiles.
 */
(function () {
  'use strict';
  if (!window.CTRL_KB) return;

  const HEAD = 12;
  function frame(tid, offset, payload) {
    const u = new Uint8Array(HEAD + payload.byteLength);
    const dv = new DataView(u.buffer);
    dv.setUint32(0, tid);
    dv.setFloat64(4, offset);
    u.set(payload, HEAD);
    return u.buffer;
  }
  function chunkSize(maxMessage, c) {
    const m = Number(maxMessage) > 0 ? Number(maxMessage) : c.chunkMin;
    return Math.max(c.chunkMin, Math.min(c.chunkMax, m)) - HEAD;
  }
  function newTid() {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] || 1;
  }
  function fmtSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    const u = ['KB', 'MB', 'GB'];
    let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return (n >= 100 ? Math.round(n) : n.toFixed(1)) + ' ' + u[i];
  }

  CTRL_KB.register('files', function build(host, kit) {
    const CFG = CONTROLLER_CONFIG;
    const SC = CFG.sendFiles;
    const TXT = CFG.text;
    const api = kit.api;
    const el = kit.el;

    const root = el('div', 'kb sf');
    const left = el('div', 'sf-left');
    const choose = el('button', 'gloss-btn sf-choose', null, '📤 ' + TXT.sfChoose);
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.hidden = true;
    const hint = el('p', 'sf-hint', null, TXT.sfHint);
    const clear = el('button', 'chip sf-clear', null, TXT.sfClear);
    left.append(choose, input, hint, clear);
    const list = el('div', 'sf-list');
    const empty = el('div', 'sf-empty', null, TXT.sfEmpty);
    list.appendChild(empty);
    root.append(left, list);
    host.appendChild(root);

    // Let the browser handle taps / scrolling here (the keyboard view blocks touch defaults).
    ['touchstart', 'touchmove'].forEach((t) => root.addEventListener(t, (e) => e.stopPropagation(), { passive: true }));
    root.addEventListener('pointerdown', () => api.firstTouch());

    const items = [];          // { id, tid, file, name, size, type, state, bytes, acked, row, ... }
    let cur = null;            // item being sent
    let fconn = null;          // files link
    let linking = null;        // Promise while it opens
    let retryTimer = 0;

    /* ---------- list UI ---------- */
    function row(it) {
      const n = el('div', 'sf-item');
      const top = el('div', 'sf-row');
      it.nameEl = el('span', 'sf-name', null, it.name);
      it.sizeEl = el('span', 'sf-size', null, fmtSize(it.size));
      top.append(it.nameEl, it.sizeEl);
      const bar = el('div', 'sf-bar');
      it.fill = el('i');
      bar.appendChild(it.fill);
      it.stEl = el('div', 'sf-state');
      n.append(top, bar, it.stEl);
      n.addEventListener('click', () => {
        if (it.state === 'failed') { setState(it, 'queued'); pump(); }
      });
      it.row = n;
      return n;
    }
    function paint(it) {
      const shown = shownBytes(it);
      const pct = it.size ? Math.floor(shown / it.size * 100) : (it.state === 'done' ? 100 : 0);
      it.fill.style.width = pct + '%';
      let s = '';
      switch (it.state) {
        case 'queued': s = api.isOpen() ? TXT.sfQueued : TXT.sfWaiting; break;
        case 'offer': s = TXT.sfSending + '…'; break;
        case 'active': s = TXT.sfSending + ' ' + pct + '% · ' + fmtSize(shown) + ' / ' + fmtSize(it.size); break;
        case 'sent': s = TXT.sfSending + ' 100%'; break;
        case 'done': s = TXT.sfDone; break;
        case 'failed': s = (it.note ? it.note + ' — ' : '') + TXT.sfFailed; break;
        case 'refused': s = TXT.sfRefused + (it.note ? ': ' + it.note : ''); break;
        case 'toobig': s = TXT.sfTooBig; break;
      }
      it.stEl.textContent = s;
      it.row.dataset.state = it.state;
    }
    function setState(it, st, note) {
      it.state = st;
      it.note = note || '';
      paint(it);
    }
    function paintAll() { for (const it of items) paint(it); }

    function queuedBytes(c) {
      const dc = c && c.dataChannel;
      return (dc ? dc.bufferedAmount : 0) + ((c && c.bufferSize) || 0) * SC.chunkMax;
    }
    function shownBytes(it) {
      if (it.state === 'done') return it.size;
      if (it.state !== 'active' && it.state !== 'sent') return it.acked || 0;
      const q = cur === it && fconn ? queuedBytes(fconn) : 0;
      return Math.max(it.acked || 0, Math.min(it.size, it.bytes - q));
    }

    function addFiles(files) {
      for (const f of files) {
        const it = { id: 'f' + items.length, tid: newTid(), file: f, name: f.name || 'file', size: f.size, type: f.type || '', state: 'queued', bytes: 0, acked: 0 };
        items.push(it);
        list.appendChild(row(it));
        if (f.size > SC.maxBytes) setState(it, 'toobig'); else paint(it);
      }
      empty.hidden = items.length > 0;
      list.scrollTop = list.scrollHeight;
      pump();
    }

    choose.addEventListener('click', () => { input.value = ''; input.click(); });
    input.addEventListener('change', () => { if (input.files && input.files.length) addFiles(Array.from(input.files)); });
    clear.addEventListener('click', () => {
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].state === 'done' || items[i].state === 'refused' || items[i].state === 'toobig') {
          items[i].row.remove();
          items.splice(i, 1);
        }
      }
      empty.hidden = items.length > 0;
    });

    /* ---------- files link ---------- */
    function dropLink() {
      const c = fconn;
      fconn = null;
      linking = null;
      try { if (c) c.close(); } catch (_) { /* ignore */ }
    }

    function link() {
      if (fconn && fconn.open) return Promise.resolve(fconn);
      if (linking) return linking;
      const peer = api.peer();
      if (!peer || peer.destroyed || !api.isOpen()) return Promise.reject(new Error('no hub link'));
      linking = new Promise((resolve, reject) => {
        let c;
        try {
          c = peer.connect(api.hubId(), { reliable: true, serialization: 'raw', metadata: { kind: 'files' } });
        } catch (err) { reject(err); return; }
        fconn = c;
        const tm = setTimeout(() => { if (fconn === c) dropLink(); reject(new Error('timeout')); }, SC.openTimeoutMs);
        c.on('open', () => { clearTimeout(tm); if (fconn === c) { linking = null; resolve(c); } });
        c.on('data', onData);
        c.on('close', () => { clearTimeout(tm); onLinkLost(c); reject(new Error('closed')); });
        c.on('error', (err) => { console.warn('files link', err); });
      });
      return linking;
    }

    function onLinkLost(c) {
      if (fconn && fconn !== c) return;
      fconn = null;
      linking = null;
      if (cur) {
        const it = cur;
        cur = null;
        it.run = (it.run || 0) + 1;
        if (it.state !== 'done') setState(it, 'failed', 'Connection lost');
      }
      paintAll();
    }

    /* ---------- protocol ---------- */
    let answerTimer = 0;
    function expectAnswer(it) {
      clearTimeout(answerTimer);
      answerTimer = setTimeout(() => {
        if (cur !== it) return;
        cur = null;
        it.run = (it.run || 0) + 1;
        setState(it, 'failed', 'No answer');
        pump();
      }, SC.answerTimeoutMs);
    }
    function sendCtl(m) { try { if (fconn && fconn.open) fconn.send(JSON.stringify(m)); } catch (_) { /* ignore */ } }

    function onData(d) {
      if (typeof d !== 'string') return;
      let m = null;
      try { m = JSON.parse(d); } catch (_) { return; }
      const it = cur;
      if (!m || !it || (Number(m.tid) >>> 0) !== it.tid) return;
      switch (m.t) {
        case 'go': clearTimeout(answerTimer); stream(it); return;
        case 'no': clearTimeout(answerTimer); cur = null; setState(it, 'refused', String(m.reason || '').slice(0, 40)); pump(); return;
        case 'ack': { const b = Number(m.bytes); if (b >= 0 && b <= it.size) it.acked = Math.max(it.acked, b); paint(it); return; }
        case 'got': clearTimeout(answerTimer); cur = null; it.acked = it.bytes = it.size; setState(it, 'done'); api.vibrate(30); pump(); return;
        case 'cancel': clearTimeout(answerTimer); cur = null; it.run = (it.run || 0) + 1; setState(it, 'failed', 'Cancelled by the hub'); pump(); return;
      }
    }

    function waitLow(c) {
      const dc = c.dataChannel;
      return new Promise((resolve) => {
        let tm = 0;
        const done = () => { clearTimeout(tm); if (dc) dc.removeEventListener('bufferedamountlow', done); resolve(); };
        if (dc) { dc.bufferedAmountLowThreshold = SC.bufferLow; dc.addEventListener('bufferedamountlow', done); }
        tm = setTimeout(done, 40);
      });
    }

    let paintTimer = 0;
    function paintSoon(it) {
      if (paintTimer) return;
      paintTimer = setTimeout(() => { paintTimer = 0; paint(it); }, 100);
    }

    async function stream(it) {
      const run = it.run = (it.run || 0) + 1;
      const c = fconn;
      if (!c) return;
      const pc = c.peerConnection;
      const chunk = chunkSize(pc && pc.sctp && pc.sctp.maxMessageSize, SC);
      const block = chunk * 16;
      let off = 0;
      it.bytes = 0;
      setState(it, 'active');
      try {
        while (off < it.size) {
          const end = Math.min(it.size, off + block);
          const buf = await it.file.slice(off, end).arrayBuffer();
          for (let p = 0; p < buf.byteLength; p += chunk) {
            while (queuedBytes(c) > SC.bufferHigh) {
              await waitLow(c);
              if (it.run !== run || fconn !== c) return;
            }
            if (it.run !== run || fconn !== c) return;
            const len = Math.min(chunk, buf.byteLength - p);
            c.send(frame(it.tid, off + p, new Uint8Array(buf, p, len)));
            it.bytes = off + p + len;
            paintSoon(it);
          }
          off = end;
        }
        if (it.run !== run || fconn !== c) return;
        sendCtl({ t: 'end', tid: it.tid });
        setState(it, 'sent');
        expectAnswer(it);
        // keep the bar moving while the buffer drains
        const drain = setInterval(() => { if (cur !== it || it.state !== 'sent') clearInterval(drain); else paint(it); }, 200);
      } catch (err) {
        if (it.run !== run) return;
        console.warn('send file', err);
        cur = null;
        setState(it, 'failed', err && err.name === 'NotReadableError' ? 'Could not read the file' : 'Error');
        pump();
      }
    }

    function next() { return items.find((it) => it.state === 'queued') || null; }

    function pump() {
      clearTimeout(retryTimer);
      if (cur) return;
      const it = next();
      if (!it) return;
      if (!api.isOpen()) { paintAll(); retryTimer = setTimeout(pump, SC.retryEveryMs); return; }
      link().then((c) => {
        if (cur || it.state !== 'queued' || fconn !== c) { if (!cur) pump(); return; }
        cur = it;
        it.acked = 0;
        setState(it, 'offer');
        sendCtl({ t: 'offer', tid: it.tid, name: it.name, type: it.type, size: it.size });
        expectAnswer(it);
      }).catch(() => {
        paintAll();
        retryTimer = setTimeout(pump, SC.retryEveryMs);
      });
    }

    // The main link dropped (hub reload, Wi-Fi): the files link goes with it.
    setInterval(() => {
      if (fconn && !api.isOpen()) { const c = fconn; dropLink(); onLinkLost(c); }
    }, 1000);

    // Tests / debugging
    window.__ctrlSendFiles = { addFiles: addFiles, items: items };

    return { el: root, release() { /* transfers keep going across mode switches */ } };
  });
})();
