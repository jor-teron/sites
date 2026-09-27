/**
 * Hub phone controller — PeerJS host + QR pairing popover.
 * Forwards D-pad messages into the app iframe as KeyboardEvents + postMessage.
 */
(function () {
  'use strict';

  const PEER_PREFIX = 'jtsites-';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

  const BTN_MAP = {
    up:     { key: 'ArrowUp',    code: 'ArrowUp',    keyCode: 38 },
    down:   { key: 'ArrowDown',  code: 'ArrowDown',  keyCode: 40 },
    left:   { key: 'ArrowLeft',  code: 'ArrowLeft',  keyCode: 37 },
    right:  { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
    a:      { key: ' ',          code: 'Space',      keyCode: 32 },
    b:      { key: 'x',          code: 'KeyX',       keyCode: 88 },
    start:  { key: 'Enter',      code: 'Enter',      keyCode: 13 },
    select: { key: 'Escape',     code: 'Escape',     keyCode: 27 },
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

  let peer = null;
  let conn = null;
  let code = '';
  let pairing = false;
  const held = Object.create(null);

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
      qrHost.innerHTML = qr.createSvgTag(4, 0);
      const svg = qrHost.querySelector('svg');
      if (svg) {
        svg.setAttribute('width', '160');
        svg.setAttribute('height', '160');
        svg.style.display = 'block';
        // invert for dark bg: white modules on dark
        svg.style.background = '#fff';
        svg.style.borderRadius = '6px';
      }
    } catch (err) {
      qrHost.textContent = 'QR error';
      console.warn(err);
    }
  }

  function openPopover() {
    if (!popover) return;
    popover.hidden = false;
    popoverBackdrop.hidden = false;
    startPairing();
  }

  function closePopover() {
    if (!popover) return;
    popover.hidden = true;
    popoverBackdrop.hidden = true;
    // Keep connection alive when closing popover; only stop advertising if never connected
  }

  function destroyPeer() {
    try { if (conn) conn.close(); } catch (_) {}
    conn = null;
    try { if (peer) peer.destroy(); } catch (_) {}
    peer = null;
    pairing = false;
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
      if (w && w.document) {
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
    if (!msg || msg.t !== 'btn') return;
    forwardBtn(msg.b, msg.s ? 1 : 0);
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

  function startPairing() {
    if (typeof Peer === 'undefined') {
      setStatus('PeerJS missing');
      return;
    }
    // Always regenerate code when (re)starting pairing UI
    destroyPeer();
    releaseHeld();
    setConnectedIndicator(false);
    code = randomCode(6);
    if (codeEl) codeEl.textContent = code;
    const url = controllerUrl(code);
    if (urlEl) {
      urlEl.textContent = url;
      urlEl.href = url;
    }
    renderQr(url);
    setStatus('Starting…');
    pairing = true;

    const id = PEER_PREFIX + code;
    peer = new Peer(id, { debug: 0 });

    peer.on('open', () => {
      setStatus('Waiting for controller…');
    });

    peer.on('connection', (c) => {
      // One controller at a time
      attachConn(c);
    });

    peer.on('error', (err) => {
      const type = err && err.type;
      if (type === 'unavailable-id') {
        // regenerate and retry
        setStatus('Code taken, retrying…');
        setTimeout(() => { if (pairing) startPairing(); }, 200);
      } else {
        setStatus('Error: ' + (type || 'unknown'));
        console.warn('hub peer error', err);
      }
    });

    peer.on('disconnected', () => {
      setStatus('Peer disconnected');
      setConnectedIndicator(false);
    });
  }

  function disconnect() {
    releaseHeld();
    destroyPeer();
    setConnectedIndicator(false);
    setStatus('Disconnected');
    if (codeEl) codeEl.textContent = '——';
    if (urlEl) { urlEl.textContent = ''; urlEl.removeAttribute('href'); }
    if (qrHost) qrHost.innerHTML = '';
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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && popover && !popover.hidden) closePopover();
  });

  // Expose tiny API for debugging
  window.__hubController = { openPopover, closePopover, disconnect, startPairing };
})();
