/**
 * Phone D-Pad controller — PeerJS client that sends button press/release
 * messages to the sites hub.
 * Settings and text come from CONTROLLER_CONFIG (controller_config.js).
 */
(function () {
  'use strict';

  const CFG = CONTROLLER_CONFIG;
  const TXT = CFG.text;
  const CLS = CFG.classes;
  const PEER_PREFIX = CFG.peer.idPrefix;
  const BTNS = CFG.buttons;

  const pairScreen = document.getElementById('pair-screen');
  const pad = document.getElementById('pad');
  const rotateOverlay = document.getElementById('rotate-overlay');
  const codeInput = document.getElementById('code-input');
  const connectBtn = document.getElementById('connect-btn');
  const pairError = document.getElementById('pair-error');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const reconnectBtn = document.getElementById('reconnect-btn');
  const codeDisplay = document.getElementById('code-display');
  const dpadEl = document.getElementById('dpad');

  let peer = null;
  let conn = null;
  let code = '';
  let wakeLock = null;
  let fullscreenTried = false;
  const pressed = Object.create(null);
  const activePointers = new Map(); // pointerId -> btn

  function parseCodeFromHash() {
    const h = (location.hash || '').replace(/^#/, '');
    const params = new URLSearchParams(h.includes('=') ? h : '');
    let c = (params.get(CFG.code.hashParam) || '').trim().toUpperCase();
    if (!c && CFG.code.bareHashPattern.test(h)) c = h.toUpperCase();
    return c.replace(/[^A-Z0-9]/g, '');
  }

  function setStatus(state, msg) {
    statusDot.className = CLS.dot + ' ' + state;
    statusText.textContent = msg || state;
    reconnectBtn.hidden = state === 'connected' || state === 'connecting';
  }

  function showPairError(msg) {
    pairError.hidden = !msg;
    pairError.textContent = msg || '';
  }

  function updateOrientation() {
    const portrait = window.matchMedia(CFG.browser.portraitQuery).matches;
    rotateOverlay.hidden = !portrait;
    if (portrait) {
      // keep pad mounted but overlay covers; CSS also hides pad visibility
    }
  }

  async function tryFullscreenAndLock() {
    if (fullscreenTried) return;
    fullscreenTried = true;
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (_) { /* ignore */ }
    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock(CFG.browser.orientationLock);
      }
    } catch (_) { /* ignore — many browsers disallow */ }
  }

  async function requestWakeLock() {
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        wakeLock = await navigator.wakeLock.request(CFG.browser.wakeLockType);
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (_) { /* ignore */ }
  }

  function vibrate() {
    try {
      if (navigator.vibrate) navigator.vibrate(CFG.touch.vibrateMs);
    } catch (_) { /* ignore */ }
  }

  function sendBtn(b, s) {
    if (!BTNS.includes(b)) return;
    const was = !!pressed[b];
    const now = s ? 1 : 0;
    if (was === !!now) return;
    pressed[b] = !!now;
    const msg = JSON.stringify({ t: CFG.messageType, b: b, s: now });
    if (conn && conn.open) {
      try { conn.send(msg); } catch (_) { /* ignore */ }
    }
  }

  function releaseAll() {
    for (const b of BTNS) {
      if (pressed[b]) sendBtn(b, 0);
    }
    document.querySelectorAll(CLS.activeSelector).forEach((el) => {
      el.classList.remove(CLS.active);
    });
    activePointers.clear();
  }

  function setBtnVisual(b, on) {
    const el = document.querySelector('[data-btn="' + b + '"]');
    if (el) el.classList.toggle(CLS.active, !!on);
  }

  function press(b) {
    if (!b) return;
    sendBtn(b, 1);
    setBtnVisual(b, true);
    vibrate();
  }

  function release(b) {
    if (!b) return;
    sendBtn(b, 0);
    setBtnVisual(b, false);
  }

  function hitTestDpad(clientX, clientY) {
    const rect = dpadEl.getBoundingClientRect();
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return null;
    }
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    // Prefer cardinal zones; center is dead
    const dx = x - 0.5;
    const dy = y - 0.5;
    if (Math.abs(dx) < CFG.touch.dpadDeadZone && Math.abs(dy) < CFG.touch.dpadDeadZone) return null;
    if (Math.abs(dx) > Math.abs(dy)) {
      return dx < 0 ? 'left' : 'right';
    }
    return dy < 0 ? 'up' : 'down';
  }

  function bindButton(el) {
    const b = el.dataset.btn;
    if (!b) return;

    const onDown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      tryFullscreenAndLock();
      requestWakeLock();
      const id = e.pointerId != null ? e.pointerId : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].identifier : 'mouse');
      activePointers.set(id, b);
      press(b);
      if (el.setPointerCapture && e.pointerId != null) {
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
      }
    };
    const onUp = (e) => {
      e.preventDefault();
      const id = e.pointerId != null ? e.pointerId : (e.changedTouches && e.changedTouches[0] ? e.changedTouches[0].identifier : 'mouse');
      if (activePointers.get(id) === b) {
        activePointers.delete(id);
        release(b);
      }
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', (e) => {
      // only release if captured leave for face/sys (not dpad — handled separately)
      if (el.classList.contains('face') || el.classList.contains('sys')) onUp(e);
    });
    el.addEventListener('touchstart', (e) => { e.preventDefault(); onDown(e); }, { passive: false });
    el.addEventListener('touchend', (e) => { e.preventDefault(); onUp(e); }, { passive: false });
    el.addEventListener('touchcancel', (e) => { e.preventDefault(); onUp(e); }, { passive: false });
  }

  // D-pad: support sliding across directions with one finger
  function setupDpadSliding() {
    const pointerDir = new Map(); // pointerId -> current dir

    function updateFromPoint(id, clientX, clientY, isDown) {
      const dir = hitTestDpad(clientX, clientY);
      const prev = pointerDir.get(id) || null;
      if (dir !== prev) {
        if (prev) release(prev);
        if (dir) press(dir);
        if (dir) pointerDir.set(id, dir);
        else pointerDir.delete(id);
      } else if (isDown && dir && !pressed[dir]) {
        press(dir);
        pointerDir.set(id, dir);
      }
    }

    function clearPointer(id) {
      const prev = pointerDir.get(id);
      if (prev) release(prev);
      pointerDir.delete(id);
    }

    dpadEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      tryFullscreenAndLock();
      requestWakeLock();
      try { dpadEl.setPointerCapture(e.pointerId); } catch (_) {}
      updateFromPoint(e.pointerId, e.clientX, e.clientY, true);
    });
    dpadEl.addEventListener('pointermove', (e) => {
      if (!pointerDir.has(e.pointerId) && e.buttons === 0) return;
      e.preventDefault();
      updateFromPoint(e.pointerId, e.clientX, e.clientY, false);
    });
    dpadEl.addEventListener('pointerup', (e) => {
      e.preventDefault();
      clearPointer(e.pointerId);
    });
    dpadEl.addEventListener('pointercancel', (e) => {
      clearPointer(e.pointerId);
    });

    // Touch fallback (some browsers)
    dpadEl.addEventListener('touchstart', (e) => {
      e.preventDefault();
      tryFullscreenAndLock();
      requestWakeLock();
      for (const t of e.changedTouches) updateFromPoint(t.identifier, t.clientX, t.clientY, true);
    }, { passive: false });
    dpadEl.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) updateFromPoint(t.identifier, t.clientX, t.clientY, false);
    }, { passive: false });
    dpadEl.addEventListener('touchend', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) clearPointer(t.identifier);
    }, { passive: false });
    dpadEl.addEventListener('touchcancel', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) clearPointer(t.identifier);
    }, { passive: false });
  }

  function disconnectPeer() {
    releaseAll();
    try { if (conn) conn.close(); } catch (_) {}
    conn = null;
    try { if (peer) peer.destroy(); } catch (_) {}
    peer = null;
  }

  function connectToHub(pairingCode) {
    code = String(pairingCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < CFG.code.minLength) {
      showPairError(TXT.invalidCode);
      return;
    }
    showPairError('');
    disconnectPeer();
    codeDisplay.textContent = code;
    pairScreen.hidden = true;
    pad.hidden = false;
    setStatus('connecting', TXT.connecting);

    if (typeof Peer === 'undefined') {
      setStatus('disconnected', TXT.peerMissing);
      return;
    }

    peer = new Peer(Object.assign({}, CFG.peer.options));
    peer.on('open', () => {
      const remoteId = PEER_PREFIX + code;
      conn = peer.connect(remoteId, Object.assign({}, CFG.peer.connectOptions));
      conn.on('open', () => {
        setStatus('connected', TXT.connected);
        requestWakeLock();
      });
      conn.on('data', () => { /* hub may send acks later */ });
      conn.on('close', () => {
        setStatus('disconnected', TXT.disconnected);
        releaseAll();
      });
      conn.on('error', (err) => {
        setStatus('disconnected', TXT.error);
        console.warn('conn error', err);
      });
    });
    peer.on('error', (err) => {
      const type = err && err.type;
      if (type === 'peer-unavailable') {
        setStatus('disconnected', TXT.hubNotFound);
        showPairError(TXT.hubNotFoundHint);
        // stay on pad with reconnect
      } else {
        setStatus('disconnected', (type || TXT.genericError));
        console.warn('peer error', err);
      }
    });
    peer.on('disconnected', () => {
      setStatus('disconnected', TXT.disconnected);
      releaseAll();
    });
  }

  // Prevent scrolling / zoom / context menu
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('gesturechange', (e) => e.preventDefault());
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
  document.body.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

  // Bind face/sys buttons (not dpad dirs — sliding handles those)
  document.querySelectorAll(CLS.boundButtons).forEach(bindButton);
  setupDpadSliding();

  connectBtn.addEventListener('click', () => {
    connectToHub(codeInput.value);
  });
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === CFG.keys.connect) connectToHub(codeInput.value);
  });
  reconnectBtn.addEventListener('click', () => connectToHub(code || codeInput.value));

  window.addEventListener('orientationchange', updateOrientation);
  window.addEventListener('resize', updateOrientation);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock();
  });

  // Boot
  updateOrientation();
  const fromHash = parseCodeFromHash();
  if (fromHash) {
    codeInput.value = fromHash;
    connectToHub(fromHash);
  } else {
    pairScreen.hidden = false;
    pad.hidden = true;
  }
})();
