/**
 * Hub phone controller — PeerJS host + QR pairing popover.
 * Forwards D-pad messages into the app iframe as KeyboardEvents + postMessage.
 * Rumble: an app in the iframe may post {type:'hub-rumble', ms:N} or
 * {type:'hub-rumble', pattern:[on, off, on, ...]}; it is relayed to the paired phone as
 * {t:'rumble', ms} / {t:'rumble', pattern} (the phone calls navigator.vibrate).
 *
 * Pairing survives reloads: the code (peer id = PEER_PREFIX + code) is kept in localStorage
 * and registered again as soon as the hub loads, so a phone can reconnect without the
 * popover being opened. If the broker still holds the id from the previous page
 * ('unavailable-id'), registration is retried with backoff (the code is never switched
 * silently). "New code" in the popover makes a fresh code.
 */
(function () {
  'use strict';

  const PEER_PREFIX = 'jtsites-';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  const CODE_KEY = 'jtsites-hub-ctrl-code';              // localStorage: current pairing code
  const CODE_RE = /^[A-Z0-9]{4,8}$/;
  // 'unavailable-id' (old page's peer still registered on the broker): retry delays, then give up
  const ID_RETRY_MS = [1000, 2000, 3000, 5000, 5000, 8000, 10000, 10000, 15000, 15000];
  // broker connection lost / network errors: reconnect delays (last one repeats)
  const NET_RETRY_MS = [2000, 4000, 8000, 15000, 30000];

  // Controller button -> key injected into the app iframe (all buttons also post
  // { type:'hub-dpad', b, s }). key: null = postMessage only, no key event.
  const BTN_MAP = {
    up:     { key: 'ArrowUp',    code: 'ArrowUp',    keyCode: 38 },
    down:   { key: 'ArrowDown',  code: 'ArrowDown',  keyCode: 40 },
    left:   { key: 'ArrowLeft',  code: 'ArrowLeft',  keyCode: 37 },
    right:  { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
    a:      { key: ' ',          code: 'Space',      keyCode: 32 },
    b:      { key: 'x',          code: 'KeyX',       keyCode: 88 },
    x:      { key: 'z',          code: 'KeyZ',       keyCode: 90 },
    y:      { key: 'c',          code: 'KeyC',       keyCode: 67 },
    l:      { key: 'q',          code: 'KeyQ',       keyCode: 81 },
    r:      { key: 'e',          code: 'KeyE',       keyCode: 69 },
    start:  { key: 'Enter',      code: 'Enter',      keyCode: 13 },
    select: { key: 'Escape',     code: 'Escape',     keyCode: 27 },
    home:   { key: null },
  };

  const frame = document.getElementById('app-frame');
  const ctrlBtn = document.getElementById('ctrl-btn');
  const popover = document.getElementById('ctrl-popover');
  const popoverBackdrop = document.getElementById('ctrl-backdrop');
  const qrHost = document.getElementById('ctrl-qr');
  const codeEl = document.getElementById('ctrl-code');
  const urlEl = document.getElementById('ctrl-url');
  const statusEl = document.getElementById('ctrl-status');
  const disconnectBtn = document.getElementById('ctrl-disconnect');
  const closeBtn = document.getElementById('ctrl-close');
  const newCodeBtn = document.getElementById('ctrl-newcode');

  let peer = null;
  let conn = null;
  let code = '';
  let pairing = false;
  let idRetry = 0;       // unavailable-id retries used
  let netRetry = 0;      // network retries used
  let retryTimer = 0;
  const held = Object.create(null);

  function loadCode() {
    try { const c = (localStorage.getItem(CODE_KEY) || '').toUpperCase(); return CODE_RE.test(c) ? c : ''; } catch (_) { return ''; }
  }
  function saveCode(c) {
    try { localStorage.setItem(CODE_KEY, c); } catch (_) { /* ignore */ }
  }

  function randomCode(len) {
    len = len || 6;
    let s = '';
    const buf = new Uint8Array(len);
    (crypto.getRandomValues ? crypto.getRandomValues(buf) : buf.fill(Math.random() * 256));
    for (let i = 0; i < len; i++) s += CODE_CHARS[buf[i] % CODE_CHARS.length];
    return s;
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function setConnectedIndicator(on) {
    if (ctrlBtn) ctrlBtn.classList.toggle('connected', !!on);
  }

  function controllerUrl(c) {
    const u = new URL('controller/controller.html', location.href);
    u.hash = 'code=' + c;
    return u.href;
  }

  function renderQr(url) {
    if (!qrHost) return;
    qrHost.innerHTML = '';
    if (typeof qrcode === 'undefined') {
      qrHost.textContent = 'QR lib missing';
      return;
    }
    try {
      const qr = qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      qrHost.innerHTML = qr.createSvgTag(4, 16);
      const svg = qrHost.querySelector('svg');
      if (svg) {
        svg.setAttribute('width', '188');
        svg.setAttribute('height', '188');
        svg.style.display = 'block';
        // dark modules on white; margin is in px (16 = 4 modules x 4px), the quiet zone scanners need
        svg.style.background = '#fff';
      }
    } catch (err) {
      qrHost.textContent = 'QR error';
      console.warn(err);
    }
  }

  function renderPairing() {
    if (!code) {
      if (codeEl) codeEl.textContent = '——';
      if (urlEl) { urlEl.textContent = ''; urlEl.removeAttribute('href'); }
      if (qrHost) qrHost.innerHTML = '';
      return;
    }
    const url = controllerUrl(code);
    if (codeEl) codeEl.textContent = code;
    if (urlEl) { urlEl.textContent = url; urlEl.href = url; }
    renderQr(url);
  }

  function openPopover() {
    if (!popover) return;
    popover.hidden = false;
    popoverBackdrop.hidden = false;
    if (!code) newCode();                 // first time: make and remember a code
    else if (!peer || peer.destroyed) startPairing(); // stopped / gave up: listen again
    renderPairing();
  }

  function closePopover() {
    if (!popover) return;
    popover.hidden = true;
    popoverBackdrop.hidden = true;
    // Keep connection alive when closing popover; only stop advertising if never connected
    // Hand keyboard focus back to the app (hub.js).
    if (typeof window.__hubFocusFrame === 'function') window.__hubFocusFrame();
  }

  function destroyPeer() {
    clearTimeout(retryTimer);
    retryTimer = 0;
    const c = conn, p = peer;
    conn = null;
    peer = null;
    pairing = false;
    try { if (c) c.close(); } catch (_) {}
    try { if (p) p.destroy(); } catch (_) {}
  }

  function releaseHeld() {
    for (const b of Object.keys(held)) {
      if (held[b]) forwardBtn(b, 0);
    }
  }

  function forwardBtn(b, s) {
    const map = BTN_MAP[b];
    if (!map) return;
    held[b] = !!s;
    const type = s ? 'keydown' : 'keyup';
    try {
      const w = frame && frame.contentWindow;
      if (map.key && w && w.document) {
        const target = w.document.activeElement || w.document.body || w.document;
        const ev = new w.KeyboardEvent(type, {
          key: map.key,
          code: map.code,
          keyCode: map.keyCode,
          which: map.keyCode,
          bubbles: true,
          cancelable: true,
        });
        target.dispatchEvent(ev);
      }
    } catch (err) {
      console.warn('forward key', err);
    }
    try {
      if (frame && frame.contentWindow) {
        frame.contentWindow.postMessage({ type: 'hub-dpad', b: b, s: s ? 1 : 0 }, '*');
      }
    } catch (_) { /* ignore */ }
  }

  function onConnData(data) {
    let msg = data;
    if (typeof data === 'string') {
      try { msg = JSON.parse(data); } catch (_) { return; }
    }
    if (!msg) return;
    if (msg.t === 'btn') {
      forwardBtn(msg.b, msg.s ? 1 : 0);
    } else if (msg.t === 'stick') {
      // Analog stick: forwarded as postMessage only (the controller also sends
      // emulated arrow 'btn' messages, so key-based games need nothing).
      const x = Number(msg.x), y = Number(msg.y);
      if (!isFinite(x) || !isFinite(y)) return;
      try {
        if (frame && frame.contentWindow) {
          frame.contentWindow.postMessage({ type: 'hub-stick', x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }, '*');
        }
      } catch (_) { /* ignore */ }
    }
    // other message types are ignored
  }

  function attachConn(c) {
    if (conn && conn !== c) {
      try { conn.close(); } catch (_) {}
      releaseHeld();
    }
    conn = c;
    setStatus('Controller connected');
    setConnectedIndicator(true);
    c.on('data', onConnData);
    c.on('close', () => {
      if (conn === c) {
        conn = null;
        releaseHeld();
        setConnectedIndicator(false);
        setStatus(pairing ? 'Waiting for controller…' : 'Disconnected');
      }
    });
    c.on('error', (err) => {
      console.warn('hub conn error', err);
    });
  }

  // Rumble relay limits (ms per step / steps in a pattern)
  const RUMBLE_MAX_MS = 5000;
  const RUMBLE_MAX_STEPS = 20;

  /** App (iframe) → phone: {type:'hub-rumble', ms | pattern} → {t:'rumble', ...}. */
  function relayRumble(d) {
    if (!conn || !conn.open) return;
    const clamp = (n) => Math.max(0, Math.min(RUMBLE_MAX_MS, Math.round(Number(n) || 0)));
    let msg = null;
    const pat = Array.isArray(d.pattern) ? d.pattern : (Array.isArray(d.ms) ? d.ms : null);
    if (pat) {
      const p = pat.slice(0, RUMBLE_MAX_STEPS).map(clamp);
      if (p.some((n) => n > 0)) msg = { t: 'rumble', pattern: p };
    } else {
      const ms = clamp(d.ms);
      if (ms > 0) msg = { t: 'rumble', ms: ms };
    }
    if (!msg) return;
    try { conn.send(JSON.stringify(msg)); } catch (err) { console.warn('rumble send', err); }
  }

  window.addEventListener('message', (e) => {
    if (!frame || !e.source || e.source !== frame.contentWindow) return;
    const d = e.data;
    if (d && typeof d === 'object' && d.type === 'hub-rumble') relayRumble(d);
  });

  /** Register PEER_PREFIX + code on the broker and wait for the phone. */
  function startPairing(isRetry) {
    if (typeof Peer === 'undefined') {
      setStatus('PeerJS missing');
      return;
    }
    if (!code) return;
    if (!isRetry) { idRetry = 0; netRetry = 0; }
    destroyPeer();
    releaseHeld();
    setConnectedIndicator(false);
    renderPairing();
    setStatus(isRetry ? 'Re-registering code…' : 'Starting…');
    pairing = true;

    const myPeer = peer = new Peer(PEER_PREFIX + code, { debug: 0 });

    myPeer.on('open', () => {
      if (peer !== myPeer) return;
      idRetry = 0;
      netRetry = 0;
      setStatus(conn ? 'Controller connected' : 'Waiting for controller…');
    });

    myPeer.on('connection', (c) => {
      if (peer !== myPeer) return;
      // One controller at a time
      attachConn(c);
    });

    myPeer.on('error', (err) => {
      if (peer !== myPeer) return;
      const type = err && err.type;
      if (type === 'unavailable-id') {
        // The previous page (reload) may still hold this id on the broker for a while:
        // keep the same code and retry with backoff.
        if (idRetry < ID_RETRY_MS.length) {
          const d = ID_RETRY_MS[idRetry++];
          setStatus('Code still in use (previous session) — retrying ' + idRetry + '/' + ID_RETRY_MS.length + '…');
          scheduleRetry(d);
        } else {
          destroyPeer();
          setStatus('Code ' + code + ' is still in use — press "New code"');
        }
      } else if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') {
        const d = NET_RETRY_MS[Math.min(netRetry++, NET_RETRY_MS.length - 1)];
        setStatus('Network problem — retrying…');
        scheduleRetry(d);
      } else if (type === 'peer-unavailable') {
        /* only happens for outgoing connects; ignore */
      } else {
        setStatus('Error: ' + (type || 'unknown'));
        console.warn('hub peer error', err);
      }
    });

    myPeer.on('disconnected', () => {
      if (peer !== myPeer || myPeer.destroyed) return;
      // Lost the broker (the phone link may still be up): re-register the same id.
      setConnectedIndicator(!!(conn && conn.open));
      setStatus(conn && conn.open ? 'Controller connected (broker offline)' : 'Reconnecting to broker…');
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        if (peer !== myPeer || myPeer.destroyed) return;
        try { myPeer.reconnect(); } catch (_) { startPairing(true); }
      }, NET_RETRY_MS[Math.min(netRetry++, NET_RETRY_MS.length - 1)]);
    });
  }

  function scheduleRetry(ms) {
    const keep = code;
    const c = conn, p = peer;
    conn = null; peer = null;
    try { if (c) c.close(); } catch (_) {}
    try { if (p) p.destroy(); } catch (_) {}
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { if (code === keep) startPairing(true); }, ms);
  }

  /** Make and remember a fresh pairing code, then listen on it. */
  function newCode() {
    releaseHeld();
    destroyPeer();
    code = randomCode(6);
    saveCode(code);
    startPairing();
  }

  /** Close the phone link and stop listening (the code is kept; opening the popover or
   *  reloading the hub listens again). */
  function disconnect() {
    releaseHeld();
    destroyPeer();
    setConnectedIndicator(false);
    setStatus('Disconnected (open this panel again to listen)');
    closePopover();
  }

  if (ctrlBtn) {
    ctrlBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!popover.hidden) closePopover();
      else openPopover();
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closePopover(); });
  if (popoverBackdrop) popoverBackdrop.addEventListener('click', () => closePopover());
  if (popover) popover.addEventListener('click', (e) => e.stopPropagation());
  if (disconnectBtn) disconnectBtn.addEventListener('click', () => disconnect());
  if (newCodeBtn) newCodeBtn.addEventListener('click', (e) => { e.stopPropagation(); newCode(); });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && popover && !popover.hidden) closePopover();
  });

  // Another app picked (iframe src / data-app changes, see hub.js navigateFrame): release held phone buttons so the old
  // page gets its keyup and nothing stays "pressed" for the next one.
  if (frame) new MutationObserver(releaseHeld).observe(frame, { attributes: true, attributeFilter: ['src', 'data-app'] });

  // Leaving / reloading the page: free the peer id on the broker right away so the
  // reloaded hub can register the same code again.
  window.addEventListener('pagehide', () => { releaseHeld(); destroyPeer(); });

  // Boot: a remembered code starts listening at once (phone can reconnect after a reload).
  code = loadCode();
  if (code) startPairing();

  // Expose tiny API for debugging / tests
  window.__hubController = {
    openPopover, closePopover, disconnect, startPairing, newCode,
    get code() { return code; },
    get status() { return statusEl ? statusEl.textContent : ''; },
    get connected() { return !!(conn && conn.open); },
  };
})();
