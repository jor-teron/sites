/*
 * OCR — ocr_send.js  (computer side of "send from phone")
 * The QR button opens a small box with a QR code for ocr_send.html#s=<peer id>.<token>.
 * This page registers that fresh random peer id on the public PeerJS server (like the hub
 * controller). The first message on a new connection must be hello{token}; the first phone
 * that says it binds the session, so later phones are refused (one phone at a time). The
 * same phone may reconnect after a drop. The session ends on ✕ or after config.send.idleMs
 * without activity; every QR is a new id + token.
 * A received file goes through the same path as a dropped one: image → OCR at once,
 * PDF → page 1 is read at once (PDF text first, OCR fallback). See ocr_send_common.js for
 * the message protocol.
 */
(function (OCR) {
  'use strict';

  const SND = OCR.send = {};
  const X = OCR.sendCommon;
  const S = OCR.state;
  const C = () => OCR.config.send;
  const A = () => OCR.config.accept;
  const ST = () => OCR.config.text.status;
  const $ = (id) => document.getElementById(id);

  let sess = null;     // { id, token, client, peer, conn }
  let rx = null;       // file being received
  let idleTimer = 0, stallTimer = 0, brokerTimer = 0, brokerTry = 0;

  // ----- link + QR -----
  function isLocalHost(h) {
    return !h || h === 'localhost' || /^127\./.test(h) || h === '[::1]' || /^10\./.test(h) ||
      /^192\.168\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /\.local$/i.test(h);
  }
  SND.phoneUrl = (s) => {
    const base = (location.protocol === 'file:' || isLocalHost(location.hostname))
      ? new URL(C().phonePage, C().publicBaseUrl) : new URL(C().phonePage, location.href);
    base.search = ''; base.hash = 's=' + s.id + '.' + s.token;
    return base.href;
  };

  function renderQr(url) {
    const host = $('qr-img');
    host.innerHTML = '';
    if (typeof qrcode === 'undefined') { host.textContent = 'QR library missing'; return; }
    try {
      const qr = qrcode(0, 'M');
      qr.addData(url); qr.make();
      host.innerHTML = qr.createSvgTag(4, 16);
      const svg = host.querySelector('svg');
      if (svg) {
        const px = Math.max(120, Math.min(200, window.innerHeight - 140));
        svg.setAttribute('width', px); svg.setAttribute('height', px);
        svg.style.display = 'block'; svg.style.background = '#fff';
      }
    } catch (err) { host.textContent = 'QR error'; console.warn('[ocr] qr', err); }
  }

  function qrState(msg, err) {
    const el = $('qr-state');
    el.textContent = msg;
    el.classList.toggle('err', !!err);
  }

  // ----- UI: QR box, phone chip -----
  function syncUi() {
    const bound = !!(sess && sess.client);
    $('qr-btn').hidden = bound;
    $('phone-chip').hidden = !bound;
    if (bound) {
      const on = !!(sess.conn && sess.conn.open);
      $('phone-chip-text').textContent = on ? '📱 Connected' : '📱 Reconnecting…';
      $('phone-chip').classList.toggle('off', !on);
    }
  }

  SND.openQr = () => {
    if (sess && sess.client) return;
    if (typeof Peer === 'undefined' || typeof qrcode === 'undefined') {
      OCR.status('Send from phone is not available (files missing)', 'err');
      return;
    }
    if (OCR.ui && OCR.ui.closeKey) OCR.ui.closeKey();
    newSession();
    $('qr-pop').hidden = false;
  };

  // Closing the box before a phone connected throws the session away (the QR is one-time).
  SND.closeQr = () => {
    $('qr-pop').hidden = true;
    if (sess && !sess.client) endSession('', true);
  };
  SND.isQrOpen = () => !$('qr-pop').hidden;

  // ----- session / peer -----
  function newSession() {
    endSession('', true);
    const c = C();
    sess = {
      id: c.peerPrefix + X.rand(Math.max(8, c.peerIdLength - c.peerPrefix.length)),
      token: X.rand(c.tokenLength), client: null, peer: null, conn: null
    };
    const url = SND.phoneUrl(sess);
    renderQr(url);
    const a = $('qr-link');
    a.textContent = url; a.href = url;
    qrState('Starting…');
    brokerTry = 0;
    startPeer(sess);
    syncUi();
  }

  function startPeer(s) {
    const p = s.peer = new Peer(s.id, Object.assign({}, C().peerOptions));
    p.on('open', () => {
      if (sess !== s) return;
      brokerTry = 0;
      if (!s.client) qrState('Waiting for phone…');
    });
    p.on('connection', (c) => { if (sess === s) incoming(s, c); else try { c.close(); } catch (_) { /* ignore */ } });
    p.on('error', (err) => {
      if (sess !== s) return;
      const type = err && err.type;
      if (type === 'unavailable-id' && !s.client) { newSession(); return; }   // (practically never)
      if (type === 'peer-unavailable') return;
      if (type === 'browser-incompatible') { qrState('This browser cannot do WebRTC', true); return; }
      if (!s.client) qrState(navigator.onLine === false ? 'Offline — needs internet to connect a phone' : 'Network problem — retrying…', true);
      scheduleBroker(s);
    });
    p.on('disconnected', () => { if (sess === s && !p.destroyed) scheduleBroker(s); });
  }

  // Lost the PeerJS server: re-register the same id (an open phone link keeps working meanwhile).
  function scheduleBroker(s) {
    clearTimeout(brokerTimer);
    const d = C().brokerRetryMs;
    brokerTimer = setTimeout(() => {
      if (sess !== s || !s.peer || s.peer.destroyed) return;
      if (s.peer.disconnected) { try { s.peer.reconnect(); } catch (_) { /* next error retries */ } }
    }, d[Math.min(brokerTry++, d.length - 1)]);
  }

  function sendTo(c, msg) { try { if (c && c.open) c.send(msg); } catch (_) { /* ignore */ } }
  function drop(c, ms) { setTimeout(() => { try { c.close(); } catch (_) { /* ignore */ } }, ms || 0); }

  function incoming(s, c) {
    let ok = false;
    const t = setTimeout(() => { if (!ok) drop(c); }, C().helloTimeoutMs);
    c.on('data', (d) => {
      if (sess !== s) return;
      if (!ok) {
        clearTimeout(t);
        if (!d || d.t !== 'hello' || d.token !== s.token || typeof d.client !== 'string') {
          sendTo(c, { t: 'bad' }); drop(c, 400); return;
        }
        if (s.client && d.client !== s.client) { sendTo(c, { t: 'refused' }); drop(c, 400); return; }
        ok = true;
        const old = s.conn;
        s.client = d.client;
        s.conn = c;
        if (old && old !== c) { abortRx('Phone reconnected — send the file again'); drop(old); }
        sendTo(c, { t: 'welcome' });
        $('qr-pop').hidden = true;
        touch();
        syncUi();
        OCR.status('📱 Phone connected — choose a file on the phone', 'ok');
        return;
      }
      if (c === s.conn) onData(s, c, d);
    });
    c.on('close', () => {
      clearTimeout(t);
      if (sess !== s || c !== s.conn) return;
      s.conn = null;
      abortRx('Phone disconnected during transfer');
      syncUi();
    });
    c.on('error', (err) => { if (sess === s && c === s.conn) console.warn('[ocr] phone link', err && err.type); });
  }

  function touch() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!sess) return;
      endSession('idle');
      OCR.status('Phone disconnected (idle ' + Math.round(C().idleMs / 60000) + ' min)', '');
    }, C().idleMs);
  }

  // reason → sent to the phone so it does not try to reconnect. quiet: no status message.
  function endSession(reason, quiet) {
    const s = sess;
    sess = null;
    clearTimeout(idleTimer); clearTimeout(brokerTimer);
    abortRx('');
    if (!s) { syncUi(); return; }
    const c = s.conn, p = s.peer;
    if (c && c.open) sendTo(c, { t: 'bye', reason: reason || 'closed' });
    setTimeout(() => {
      try { if (c) c.close(); } catch (_) { /* ignore */ }
      try { if (p) p.destroy(); } catch (_) { /* ignore */ }
    }, c && c.open ? 300 : 0);
    if (s.client && !quiet && reason === 'user') OCR.status('Phone disconnected', '');
    $('qr-pop').hidden = true;
    syncUi();
  }
  SND.disconnect = () => endSession('user');
  SND.connected = () => !!(sess && sess.conn && sess.conn.open);

  // ----- receiving -----
  function stall() {
    clearTimeout(stallTimer);
    stallTimer = setTimeout(() => abortRx('Transfer from phone stalled', true), C().rxStallMs);
  }

  function abortRx(msg, tell) {
    clearTimeout(stallTimer);
    if (!rx) return;
    const r = rx;
    rx = null;
    if (tell && sess) sendTo(sess.conn, { t: 'err', id: r.id, msg: 'Transfer stalled — try again' });
    if (S.busy && S.job === 'recv') OCR.setBusy(false);
    if (msg) OCR.status(msg, 'err');
  }
  SND.abort = () => abortRx('Transfer cancelled', true);

  function onData(s, c, d) {
    touch();
    if (d instanceof ArrayBuffer || ArrayBuffer.isView(d)) { chunk(c, d); return; }
    if (!d || typeof d !== 'object') return;
    if (d.t === 'file') header(c, d);
    else if (d.t === 'end') finish(c, d);
  }

  function header(c, d) {
    const id = String(d.id || '').slice(0, 40);
    const size = Number(d.size), chunks = Number(d.chunks);
    if (rx || S.busy) {
      sendTo(c, { t: 'busy', id: id });
      OCR.status('Busy — file from phone refused', 'err');
      return;
    }
    if (!(size > 0) || size > A().maxBytes) { sendTo(c, { t: 'err', id: id, msg: ST().tooBig }); return; }
    if (A().types.indexOf(d.type) === -1) { sendTo(c, { t: 'err', id: id, msg: ST().wrongType }); return; }
    if (chunks !== Math.ceil(size / C().chunkBytes)) { sendTo(c, { t: 'err', id: id, msg: 'Bad file header' }); return; }
    rx = { id: id, name: String(d.name || ''), type: d.type, size: size, chunks: chunks, parts: [], bytes: 0 };
    OCR.setBusy(true, 'recv');
    OCR.status('Receiving from phone… 0%', 'work');
    stall();
    sendTo(c, { t: 'go', id: id });
  }

  function chunk(c, d) {
    if (!rx) return;
    const buf = d instanceof ArrayBuffer ? d : d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength);
    rx.parts.push(buf);
    rx.bytes += buf.byteLength;
    if (rx.bytes > rx.size || rx.parts.length > rx.chunks) {
      const id = rx.id;
      abortRx('Transfer from phone failed');
      sendTo(c, { t: 'err', id: id, msg: 'Transfer failed — try again' });
      return;
    }
    const n = rx.parts.length;
    if (n % C().ackEvery === 0 || n === rx.chunks) {
      sendTo(c, { t: 'ack', id: rx.id, n: n });
      OCR.status('Receiving from phone… ' + Math.round(100 * rx.bytes / rx.size) + '%', 'work');
    }
    stall();
  }

  async function finish(c, d) {
    if (!rx || d.id !== rx.id) return;
    const r = rx;
    clearTimeout(stallTimer);
    if (r.parts.length !== r.chunks || r.bytes !== r.size) {
      abortRx('Transfer from phone incomplete');
      sendTo(c, { t: 'err', id: r.id, msg: 'Transfer incomplete — try again' });
      return;
    }
    const blob = new Blob(r.parts);
    const type = await X.sniffBlob(blob);
    if (rx !== r) return;
    rx = null;
    if (S.busy && S.job === 'recv') OCR.setBusy(false);
    if (!type || A().types.indexOf(type) === -1) {
      sendTo(c, { t: 'err', id: r.id, msg: ST().wrongType });
      OCR.status(ST().wrongType + ' (from phone)', 'err');
      return;
    }
    const file = new File([blob], X.safeName(r.name, type), { type: type });
    sendTo(c, { t: 'got', id: r.id });
    OCR.jobs.openFiles([file], [], { auto: true });
  }

  // ----- init -----
  SND.init = () => {
    const tap = OCR.ui.onTap;
    tap($('qr-btn'), () => (SND.isQrOpen() ? SND.closeQr() : SND.openQr()));
    tap($('qr-close'), () => SND.closeQr());
    tap($('phone-x'), () => SND.disconnect());
    document.addEventListener('pointerdown', (e) => {
      if (SND.isQrOpen() && !e.target.closest('#qr-pop, #qr-btn')) SND.closeQr();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && SND.isQrOpen()) { e.preventDefault(); e.stopImmediatePropagation(); SND.closeQr(); }
    }, true);
    window.addEventListener('pagehide', () => endSession('closed', true));
    syncUi();
  };
})(window.OCR);
