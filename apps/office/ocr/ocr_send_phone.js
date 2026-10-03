/*
 * OCR — ocr_send_phone.js  (phone side of "send from phone", page ocr_send.html)
 * Reads #s=<peer id>.<token>, connects to the computer over PeerJS and says hello{token}.
 * "Choose file" sends one file at a time: header → wait for go → 16 KB chunks read with
 * file.slice (waiting while more than ~1 MB is queued) → end → wait for ✓. Progress comes
 * from the computer's acks. A dropped link is retried with backoff (like the controller);
 * the computer's "bye" (✕ / idle), a wrong token or "another phone" stop for good.
 * Settings: OCR.config.send (ocr_config.js). Protocol: ocr_send_common.js.
 */
(function (OCR) {
  'use strict';

  const C = OCR.config.send, A = OCR.config.accept, ST = OCR.config.text.status;
  const X = OCR.sendCommon;
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const TXT = {
    badLink: 'This link is incomplete — scan the QR again',
    connecting: 'Connecting…',
    reconnecting: 'Reconnecting…',
    connected: 'Connected',
    sent: '✓ Sent',
    busy: 'Busy, try again',
    expired: 'This QR has expired — tap QR on the computer for a new one',
    refused: 'Another phone is already connected',
    ended: 'Disconnected — tap QR on the computer to connect again',
    lost: 'Connection lost — try again',
    noReply: 'No answer from the computer — try again',
    noPeer: 'App files failed to load — reload the page',
    empty: 'That file is empty'
  };

  // ----- link -----
  const m = /(?:^|[#&])s=([a-z0-9]{8,40})\.([a-z0-9]{6,40})(?:&|$)/i.exec(location.hash);
  const target = m ? { id: m[1], token: m[2] } : null;
  let client = '';
  try { client = sessionStorage.getItem('ocr_send_client') || ''; } catch (_) { /* ignore */ }
  if (!client) { client = X.rand(16); try { sessionStorage.setItem('ocr_send_client', client); } catch (_) { /* ignore */ } }

  // ----- state -----
  let peer = null, conn = null, connected = false, ended = false;
  let seq = 0, retryTimer = 0, attemptTimer = 0, retryIndex = 0, retryStart = 0;
  let sending = false, pending = null, wake = null;
  let everConnected = false, unavailable = 0;   // a QR that never connected and whose id is gone = expired
  const waiters = [];             // { id, kinds, resolve, reject, timer }
  let onAck = null;

  function setState(kind, msg) { const el = $('state'); el.className = 'state ' + kind; el.textContent = msg; }
  function detail(msg) { $('detail').textContent = msg || ''; }
  function progress(f) {
    $('prog').hidden = f == null;
    $('prog-bar').style.width = Math.round(Math.max(0, Math.min(1, f || 0)) * 100) + '%';
  }
  function syncButtons() {
    $('choose').disabled = !connected || sending;
    $('retry').hidden = connected || ended || !!retryTimer || !!attemptTimer || !target;
  }

  // ----- connection (backoff like controller_logic.js) -----
  function teardown() {
    clearTimeout(attemptTimer); attemptTimer = 0;
    const c = conn, p = peer;
    conn = null; peer = null; connected = false;
    try { if (c) c.close(); } catch (_) { /* ignore */ }
    try { if (p) p.destroy(); } catch (_) { /* ignore */ }
    failWaiters(TXT.lost);
  }

  function stop(msg) {        // no more retries
    ended = true;
    seq++;
    clearTimeout(retryTimer); retryTimer = 0;
    teardown();
    setState('disconnected', msg);
    syncButtons();
  }

  function onLost(s) {
    if (s !== seq || ended) return;
    seq++;
    teardown();
    if (!retryStart) retryStart = Date.now();
    if (Date.now() - retryStart > C.reconnectGiveUpMs) {
      clearTimeout(retryTimer); retryTimer = 0;
      setState('disconnected', TXT.ended);
      detail('');
      syncButtons();
      return;
    }
    const d = C.reconnectDelaysMs[Math.min(retryIndex++, C.reconnectDelaysMs.length - 1)];
    setState('connecting', TXT.reconnecting);
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { retryTimer = 0; connect(); }, d);
    syncButtons();
  }

  function connect() {
    if (ended || !target) return;
    clearTimeout(retryTimer); retryTimer = 0;
    seq++;
    teardown();
    const s = seq;
    if (!retryStart) setState('connecting', TXT.connecting);
    const p = peer = new Peer(Object.assign({}, C.peerOptions));
    attemptTimer = setTimeout(() => { attemptTimer = 0; onLost(s); }, 20000);
    syncButtons();
    p.on('open', () => {
      if (s !== seq) return;
      const c = conn = p.connect(target.id, { reliable: true });
      c.on('open', () => { if (s === seq) c.send({ t: 'hello', token: target.token, client: client }); });
      c.on('data', (d) => { if (s === seq) onData(d); });
      c.on('close', () => onLost(s));
      c.on('error', () => onLost(s));
    });
    p.on('error', (err) => {
      if (s !== seq) return;
      const type = err && err.type;
      if (type === 'peer-unavailable') {
        // the computer's id is not on the server: closed QR / page; give a new QR a chance only once connected before
        if (!everConnected && ++unavailable >= 3) { stop(TXT.expired); return; }
      } else console.warn('[send] peer', type);
      onLost(s);
    });
    p.on('disconnected', () => { if (s === seq && !connected) onLost(s); });
  }

  function onData(d) {
    if (!d || typeof d !== 'object') return;
    switch (d.t) {
      case 'welcome':
        clearTimeout(attemptTimer); attemptTimer = 0;
        connected = true; everConnected = true; unavailable = 0; retryIndex = 0; retryStart = 0;
        if (!sending) setState('connected', TXT.connected);
        syncButtons();
        if (pending) { const f = pending; pending = null; send(f); }
        return;
      case 'bad': stop(TXT.expired); return;
      case 'refused': stop(TXT.refused); return;
      case 'bye': stop(TXT.ended); detail(''); progress(null); return;
      case 'ack': if (onAck && d.n) onAck(d.n); return;
      default:
        for (let i = 0; i < waiters.length; i++) {
          const w = waiters[i];
          if (w.id === d.id && w.kinds.indexOf(d.t) !== -1) {
            waiters.splice(i, 1); clearTimeout(w.timer); w.resolve(d); return;
          }
        }
    }
  }

  function waitFor(id, kinds, ms) {
    return new Promise((resolve, reject) => {
      const w = { id: id, kinds: kinds, resolve: resolve, reject: reject, timer: 0 };
      w.timer = setTimeout(() => { const i = waiters.indexOf(w); if (i >= 0) waiters.splice(i, 1); reject(new Error(TXT.noReply)); }, ms);
      waiters.push(w);
    });
  }
  function failWaiters(msg) {
    while (waiters.length) { const w = waiters.shift(); clearTimeout(w.timer); w.reject(new Error(msg)); }
  }

  function queued(c) {
    const dc = c.dataChannel;
    return (dc ? dc.bufferedAmount : 0) + (c.bufferSize || 0) * C.chunkBytes;
  }

  async function lockScreen(on) {
    try {
      if (on && !wake && navigator.wakeLock) wake = await navigator.wakeLock.request('screen');
      else if (!on && wake) { const w = wake; wake = null; await w.release(); }
    } catch (_) { wake = null; }
  }

  // ----- send one file -----
  async function send(file) {
    if (sending) return;
    if (!file.size) { setState('error', TXT.empty); return; }
    if (file.size > A.maxBytes) { setState('error', ST.tooBig); detail(file.name); return; }
    const type = await X.sniffBlob(file);
    if (A.types.indexOf(type) === -1) { setState('error', ST.wrongType); detail(file.name); return; }
    if (!connected || !conn) { pending = file; setState('connecting', TXT.reconnecting); detail('Will send ' + file.name + ' when connected'); return; }

    sending = true; syncButtons();
    lockScreen(true);
    const c = conn;
    const id = X.rand(8), CH = C.chunkBytes, chunks = Math.ceil(file.size / CH);
    detail(file.name);
    setState('sending', 'Sending 0%'); progress(0);
    try {
      c.send({ t: 'file', id: id, name: file.name, type: type, size: file.size, chunks: chunks });
      const r = await waitFor(id, ['go', 'busy', 'err'], C.replyTimeoutMs);
      if (r.t === 'busy') { setState('busy', TXT.busy); progress(null); return; }
      if (r.t === 'err') { setState('error', r.msg || 'Refused'); progress(null); return; }
      let acked = 0;
      onAck = (n) => {
        acked = Math.max(acked, n);
        const f = acked / chunks;
        progress(f); setState('sending', 'Sending ' + Math.round(f * 100) + '%');
      };
      const done = waitFor(id, ['got', 'err'], 10 * 60 * 1000); // resolved by ✓ / error / link loss
      done.catch(() => {});
      for (let i = 0; i < chunks; i++) {
        while (queued(c) > C.maxBuffered) {
          await sleep(15);
          if (conn !== c || !c.open) throw new Error(TXT.lost);
        }
        if (conn !== c || !c.open) throw new Error(TXT.lost);
        c.send(await file.slice(i * CH, Math.min(file.size, (i + 1) * CH)).arrayBuffer());
      }
      c.send({ t: 'end', id: id });
      const fin = await Promise.race([done, sleep(C.replyTimeoutMs + 60000).then(() => { throw new Error(TXT.noReply); })]);
      if (fin.t === 'err') { setState('error', fin.msg || 'Failed'); progress(null); return; }
      progress(1);
      setState('sent', TXT.sent);
    } catch (err) {
      setState('error', (err && err.message) || TXT.lost); progress(null);
    } finally {
      onAck = null;
      sending = false;
      lockScreen(false);
      syncButtons();
    }
  }

  // ----- boot -----
  function boot() {
    $('choose').addEventListener('click', () => { if (!$('choose').disabled) $('file').click(); });
    $('file').addEventListener('change', () => {
      const f = $('file').files && $('file').files[0];
      $('file').value = '';
      if (f) send(f);
    });
    $('retry').addEventListener('click', () => { retryIndex = 0; retryStart = 0; connect(); });
    // Coming back from the camera / another app: reconnect at once if the link dropped.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !connected && !ended && target && !attemptTimer) { retryIndex = 0; connect(); }
    });
    window.addEventListener('pagehide', () => { seq++; clearTimeout(retryTimer); retryTimer = 0; teardown(); });
    window.addEventListener('pageshow', (e) => { if (e.persisted && !ended && target) { retryIndex = 0; connect(); } });
    if (!target) { ended = true; setState('error', TXT.badLink); syncButtons(); return; }
    if (typeof Peer === 'undefined') { ended = true; setState('error', TXT.noPeer); syncButtons(); return; }
    connect();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.OCR);
