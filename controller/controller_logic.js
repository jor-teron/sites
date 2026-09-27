/**
 * Phone gamepad controller — PeerJS client that sends button / stick messages to
 * the sites hub (../hub-controller.js).
 *
 * Protocol (JSON strings over the PeerJS data connection):
 *   { t:'btn',   b:<button>, s:1|0 }   press / release (original protocol, unchanged)
 *   { t:'stick', x:-1..1,  y:-1..1 }   analog stick (y -1 = up), sent at stick.sendHz while held
 * The stick also emulates the D-pad by sending 'btn' up/down/left/right, so games that
 * only understand arrows work unchanged.
 *
 * All settings / text come from CONTROLLER_CONFIG (controller_config.js).
 */
(function () {
  'use strict';

  const CFG = CONTROLLER_CONFIG;
  const TXT = CFG.text;
  const CLS = CFG.classes;
  const MSG = CFG.messages;
  const BTNS = CFG.buttons;
  const DIRS = ['up', 'down', 'left', 'right'];

  const $ = (id) => document.getElementById(id);
  const body = document.body;
  const pairScreen = $('pair-screen');
  const pad = $('pad');
  const rotateOverlay = $('rotate-overlay');
  const codeInput = $('code-input');
  const connectBtn = $('connect-btn');
  const pairError = $('pair-error');
  const pairLed = $('pair-led');
  const led = $('led');
  const leftZone = $('left-zone');
  const stickBase = $('stick-base');
  const stickKnob = $('stick-knob');
  const dpadEl = $('dpad');
  const modeToggle = $('mode-toggle');
  const hapticsToggle = $('haptics-toggle');
  const demoTag = $('demo-tag');

  const params = new URLSearchParams(location.search);
  const DEMO = params.get(CFG.demo.param) === '1';

  let peer = null;
  let conn = null;
  let code = '';
  let wakeLock = null;
  let fullscreenTried = false;
  let connState = 'disconnected';

  /* ------------------------------------------------------------------ */
  /* storage helpers                                                     */
  /* ------------------------------------------------------------------ */
  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : v; } catch (_) { return fallback; }
  }
  function save(key, val) {
    try { localStorage.setItem(key, String(val)); } catch (_) { /* ignore */ }
  }

  /* ------------------------------------------------------------------ */
  /* theme, layout, text                                                 */
  /* ------------------------------------------------------------------ */
  function applyLayout() {
    for (const [k, v] of Object.entries(CFG.layout || {})) body.style.setProperty(k, v);
  }

  function applyTheme(id) {
    const themes = CFG.themes || [];
    const theme = themes.find((t) => t.id === id) || themes.find((t) => t.id === CFG.defaultTheme) || themes[0];
    if (!theme) return;
    for (const t of themes) body.classList.remove(CLS.themePrefix + t.id);
    body.classList.add(CLS.themePrefix + theme.id);
    for (const [k, v] of Object.entries(theme.vars || {})) body.style.setProperty(k, v);
  }

  function applyText() {
    document.querySelectorAll('[data-text]').forEach((el) => {
      const v = TXT[el.dataset.text];
      if (typeof v === 'string') el.textContent = v;
    });
    codeInput.placeholder = TXT.placeholder;
    codeInput.maxLength = CFG.code.maxLength;
    modeToggle.title = TXT.modeTitle;
    hapticsToggle.title = TXT.hapticsTitle;
  }

  /* ------------------------------------------------------------------ */
  /* LED / connection state                                              */
  /* ------------------------------------------------------------------ */
  function setStatus(state, msg) {
    connState = state;
    for (const el of [led, pairLed]) {
      el.classList.remove('connecting', 'connected', 'disconnected');
      el.classList.add(state);
    }
    led.title = msg || state;
    led.setAttribute('aria-label', msg || state);
  }

  let blinkTimer = 0;
  function blinkError() {
    for (const el of [led, pairLed]) {
      el.classList.remove('error-blink');
      void el.offsetWidth; // restart animation
      el.classList.add('error-blink');
    }
    clearTimeout(blinkTimer);
    blinkTimer = setTimeout(() => {
      led.classList.remove('error-blink');
      pairLed.classList.remove('error-blink');
    }, CFG.led.errorBlinkMs);
  }

  function showPairError(msg) {
    pairError.hidden = !msg;
    pairError.textContent = msg || '';
  }

  function showPairScreen(msg) {
    releaseAll();
    pad.hidden = true;
    pairScreen.hidden = false;
    showPairError(msg || '');
  }

  function showPad() {
    pairScreen.hidden = true;
    pad.hidden = false;
  }

  /* ------------------------------------------------------------------ */
  /* browser features                                                    */
  /* ------------------------------------------------------------------ */
  function updateOrientation() {
    const portrait = window.matchMedia(CFG.browser.portraitQuery).matches;
    rotateOverlay.hidden = !portrait;
    if (portrait) releaseAll();
  }

  async function tryFullscreenAndLock() {
    if (fullscreenTried || DEMO) return;
    fullscreenTried = true;
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) await el.requestFullscreen();
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    } catch (_) { /* ignore */ }
    try {
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock(CFG.browser.orientationLock);
    } catch (_) { /* ignore — many browsers disallow */ }
  }

  async function requestWakeLock() {
    if (wakeLock) return;
    try {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        wakeLock = await navigator.wakeLock.request(CFG.browser.wakeLockType);
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      }
    } catch (_) { /* ignore */ }
  }

  function onFirstTouch() {
    tryFullscreenAndLock();
    requestWakeLock();
  }

  /* ------------------------------------------------------------------ */
  /* haptics                                                             */
  /* ------------------------------------------------------------------ */
  const canVibrate = typeof navigator.vibrate === 'function';
  let hapticsOn = load(CFG.storage.haptics, CFG.haptics.enabled ? '1' : '0') === '1';

  function vibrate(ms) {
    if (!hapticsOn || !canVibrate || !ms) return;
    try { navigator.vibrate(ms); } catch (_) { /* ignore */ }
  }

  function renderHaptics() {
    hapticsToggle.disabled = !canVibrate;
    hapticsToggle.textContent = !canVibrate ? TXT.hapticsNA : (hapticsOn ? TXT.hapticsOn : TXT.hapticsOff);
    hapticsToggle.classList.toggle('off', !hapticsOn || !canVibrate);
  }

  /* ------------------------------------------------------------------ */
  /* sending                                                             */
  /* ------------------------------------------------------------------ */
  if (DEMO) window.__ctrlOut = [];

  function send(obj) {
    const msg = JSON.stringify(obj);
    if (DEMO) {
      window.__ctrlOut.push(obj);
      if (window.__ctrlOut.length > CFG.demo.logLimit) window.__ctrlOut.shift();
    }
    if (conn && conn.open) {
      try { conn.send(msg); } catch (_) { /* ignore */ }
    }
  }

  /* ------------------------------------------------------------------ */
  /* button state: union of sources (pointers, stick) with ref-counting  */
  /* ------------------------------------------------------------------ */
  const sources = new Map();          // sourceKey -> Set(buttons)
  const sent = Object.create(null);   // button -> true when a press was sent
  const btnEls = Object.create(null); // button -> element
  document.querySelectorAll('[data-btn]').forEach((el) => { btnEls[el.dataset.btn] = el; });

  function flash(el) {
    if (!el) return;
    el.classList.remove(CLS.flash);
    void el.offsetWidth;
    el.classList.add(CLS.flash);
  }

  // Replace the set of buttons held by one source, then send only the changes.
  // Returns the list of newly pressed buttons.
  function setSource(key, btns) {
    if (btns && btns.length) sources.set(key, new Set(btns));
    else sources.delete(key);
    const want = new Set();
    for (const s of sources.values()) for (const b of s) want.add(b);
    const newly = [];
    for (const b of BTNS) {
      const on = want.has(b);
      if (on === !!sent[b]) continue;
      sent[b] = on;
      send({ t: MSG.btn, b: b, s: on ? 1 : 0 });
      const el = btnEls[b];
      if (el) {
        el.classList.toggle(CLS.active, on);
        if (on) flash(el);
      }
      if (on) newly.push(b);
    }
    return newly;
  }

  function releaseAll() {
    sources.clear();
    pointers.clear();
    setSource('__none__', null);
    endStick(true);
  }

  /* ------------------------------------------------------------------ */
  /* pointers                                                            */
  /* ------------------------------------------------------------------ */
  const pointers = new Map(); // pointerId -> { kind:'btn'|'dpad'|'stick', btn?, el }

  function capture(el, e) {
    try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
  }

  // Simple buttons (face, shoulders, sys, home)
  function bindButton(el) {
    const b = el.dataset.btn;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onFirstTouch();
      capture(el, e);
      pointers.set(e.pointerId, { kind: 'btn', btn: b, el });
      if (setSource('p' + e.pointerId, [b]).length) vibrate(CFG.haptics.pressMs);
    });
    const up = (e) => {
      const p = pointers.get(e.pointerId);
      if (!p || p.kind !== 'btn' || p.btn !== b) return;
      pointers.delete(e.pointerId);
      setSource('p' + e.pointerId, null);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
  }

  // Direction sector -> arrow list. ang in radians (screen coords, y down).
  function sectorDirs(dx, dy, diagonals) {
    const ang = Math.atan2(dy, dx); // 0 = right, +pi/2 = down
    const deg = (ang * 180 / Math.PI + 360) % 360;
    if (diagonals) {
      const sector = Math.round(deg / 45) % 8; // 0=R,1=DR,2=D,3=DL,4=L,5=UL,6=U,7=UR
      return [['right'], ['down', 'right'], ['down'], ['down', 'left'], ['left'], ['up', 'left'], ['up'], ['up', 'right']][sector];
    }
    const sector = Math.round(deg / 90) % 4;
    return [['right'], ['down'], ['left'], ['up']][sector];
  }

  // D-pad (sliding, per pointer, optional diagonals)
  function dpadDirs(clientX, clientY) {
    const r = dpadEl.getBoundingClientRect();
    const dx = (clientX - (r.left + r.width / 2)) / r.width;
    const dy = (clientY - (r.top + r.height / 2)) / r.height;
    if (Math.hypot(dx, dy) < CFG.dpad.deadZone) return [];
    return sectorDirs(dx, dy, CFG.dpad.diagonals);
  }

  function setupDpad() {
    dpadEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onFirstTouch();
      capture(dpadEl, e);
      pointers.set(e.pointerId, { kind: 'dpad', el: dpadEl });
      if (setSource('p' + e.pointerId, dpadDirs(e.clientX, e.clientY)).length) vibrate(CFG.haptics.pressMs);
    });
    dpadEl.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p || p.kind !== 'dpad') return;
      e.preventDefault();
      if (setSource('p' + e.pointerId, dpadDirs(e.clientX, e.clientY)).length) vibrate(CFG.haptics.tickMs);
    });
    const up = (e) => {
      const p = pointers.get(e.pointerId);
      if (!p || p.kind !== 'dpad') return;
      pointers.delete(e.pointerId);
      setSource('p' + e.pointerId, null);
    };
    dpadEl.addEventListener('pointerup', up);
    dpadEl.addEventListener('pointercancel', up);
    dpadEl.addEventListener('lostpointercapture', up);
  }

  /* ------------------------------------------------------------------ */
  /* floating analog stick                                               */
  /* ------------------------------------------------------------------ */
  const SC = CFG.stick;
  const stick = {
    id: null,         // owning pointerId
    cx: 0, cy: 0,     // centre (client px)
    radius: 1,        // max travel (px)
    x: 0, y: 0,       // output after dead zone, -1..1
    lastSentX: null, lastSentY: null,
    dirs: [],         // emulated arrows currently held
    timer: 0,
  };

  function round(v) {
    const m = Math.pow(10, MSG.stickDecimals);
    const r = Math.round(v * m) / m;
    return r === 0 ? 0 : r; // no -0
  }

  function stickRest() {
    const solo = body.classList.contains(CLS.modePrefix + 'stick');
    return { x: solo ? SC.restXSolo : SC.restX, y: solo ? SC.restYSolo : SC.restY };
  }

  function placeBase(zx, zy) {
    // zx, zy: position inside the left zone (px)
    stickBase.style.left = zx + 'px';
    stickBase.style.top = zy + 'px';
  }

  function resetBase() {
    stickBase.style.left = '';
    stickBase.style.top = '';
    stickKnob.style.transform = '';
  }

  function sendStick(force) {
    const x = round(stick.x);
    const y = round(stick.y);
    if (!force && x === stick.lastSentX && y === stick.lastSentY) return;
    stick.lastSentX = x;
    stick.lastSentY = y;
    send({ t: MSG.stick, x: x, y: y });
  }

  function updateStick(clientX, clientY) {
    let dx = clientX - stick.cx;
    let dy = clientY - stick.cy;
    const dist = Math.hypot(dx, dy);
    if (dist > stick.radius) {
      dx = dx / dist * stick.radius;
      dy = dy / dist * stick.radius;
    }
    stickKnob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    // normalised -1..1 with radial dead zone + rescale
    const nx = dx / stick.radius;
    const ny = dy / stick.radius;
    const mag = Math.min(1, Math.hypot(nx, ny));
    if (mag <= SC.deadZone) {
      stick.x = 0; stick.y = 0;
    } else {
      const scaled = (mag - SC.deadZone) / (1 - SC.deadZone);
      stick.x = nx / mag * scaled;
      stick.y = ny / mag * scaled;
    }
    // D-pad emulation with hysteresis
    const outMag = Math.hypot(stick.x, stick.y);
    let dirs = stick.dirs;
    if (outMag >= SC.dpadThreshold || (dirs.length && outMag >= SC.dpadRelease)) {
      dirs = sectorDirs(stick.x, stick.y, SC.diagonals);
    } else if (outMag < SC.dpadRelease) {
      dirs = [];
    }
    if (dirs.join() !== stick.dirs.join()) {
      stick.dirs = dirs;
      setSource('stick', dirs);
      if (dirs.length) vibrate(CFG.haptics.tickMs);
    }
  }

  function startStick(e) {
    if (stick.id != null) return false;
    const zr = leftZone.getBoundingClientRect();
    const br = stickBase.offsetWidth || 120;
    let zx = e.clientX - zr.left;
    let zy = e.clientY - zr.top;
    if (SC.keepInZone) {
      const h = br / 2;
      zx = Math.max(h, Math.min(zr.width - h, zx));
      zy = Math.max(h, Math.min(zr.height - h, zy));
    }
    stick.id = e.pointerId;
    stick.cx = zr.left + zx;
    stick.cy = zr.top + zy;
    stick.radius = Math.max(8, br * SC.travel);
    stick.dirs = [];
    stick.lastSentX = null;
    stick.lastSentY = null;
    placeBase(zx, zy);
    body.classList.add(CLS.stickActive);
    updateStick(e.clientX, e.clientY);
    sendStick(true);
    clearInterval(stick.timer);
    stick.timer = setInterval(() => sendStick(false), Math.round(1000 / SC.sendHz));
    return true;
  }

  function endStick(silent) {
    clearInterval(stick.timer);
    stick.timer = 0;
    const wasActive = stick.id != null;
    stick.id = null;
    stick.x = 0; stick.y = 0;
    if (stick.dirs.length) { stick.dirs = []; setSource('stick', null); }
    body.classList.remove(CLS.stickActive);
    resetBase();
    if (wasActive && (stick.lastSentX || stick.lastSentY)) sendStick(true); // final {x:0,y:0}
    stick.lastSentX = null;
    stick.lastSentY = null;
  }

  function setupStick() {
    leftZone.addEventListener('pointerdown', (e) => {
      if (body.classList.contains(CLS.modePrefix + 'dpad')) return;
      e.preventDefault();
      onFirstTouch();
      if (!startStick(e)) return;
      capture(leftZone, e);
      pointers.set(e.pointerId, { kind: 'stick', el: leftZone });
    });
    leftZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== stick.id) return;
      e.preventDefault();
      updateStick(e.clientX, e.clientY);
    });
    const up = (e) => {
      if (e.pointerId !== stick.id) return;
      pointers.delete(e.pointerId);
      endStick(false);
    };
    leftZone.addEventListener('pointerup', up);
    leftZone.addEventListener('pointercancel', up);
    leftZone.addEventListener('lostpointercapture', up);
  }

  /* ------------------------------------------------------------------ */
  /* toggles                                                             */
  /* ------------------------------------------------------------------ */
  let leftMode = load(CFG.storage.leftMode, CFG.defaultLeftMode);
  if (!CFG.leftModes.includes(leftMode)) leftMode = CFG.defaultLeftMode;

  function applyMode(m) {
    releaseAll();
    for (const x of CFG.leftModes) body.classList.remove(CLS.modePrefix + x);
    body.classList.add(CLS.modePrefix + m);
    modeToggle.textContent = TXT.modeLabels[m] || m;
    const rest = stickRest();
    // rest position fractions -> CSS (the base's default position)
    stickBase.style.removeProperty('left');
    stickBase.style.removeProperty('top');
    leftZone.style.setProperty('--rest-x', (rest.x * 100) + '%');
    leftZone.style.setProperty('--rest-y', (rest.y * 100) + '%');
  }

  // Tap = pointerdown + pointerup on the same element (click is suppressed by the
  // touchstart preventDefault on the pad).
  function bindTap(el, fn) {
    let downId = null;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      downId = e.pointerId;
      capture(el, e);
    });
    el.addEventListener('pointerup', (e) => {
      if (e.pointerId !== downId) return;
      downId = null;
      const r = el.getBoundingClientRect();
      const pad = 16;
      if (e.clientX >= r.left - pad && e.clientX <= r.right + pad && e.clientY >= r.top - pad && e.clientY <= r.bottom + pad) fn();
    });
    el.addEventListener('pointercancel', () => { downId = null; });
  }

  bindTap(modeToggle, () => {
    const i = CFG.leftModes.indexOf(leftMode);
    leftMode = CFG.leftModes[(i + 1) % CFG.leftModes.length];
    save(CFG.storage.leftMode, leftMode);
    applyMode(leftMode);
    vibrate(CFG.haptics.pressMs);
  });
  bindTap(hapticsToggle, () => {
    if (!canVibrate) return;
    hapticsOn = !hapticsOn;
    save(CFG.storage.haptics, hapticsOn ? '1' : '0');
    renderHaptics();
    vibrate(CFG.haptics.pressMs);
  });
  bindTap(led, () => {
    if (DEMO) { blinkError(); return; }
    if (connState === 'disconnected') connectToHub(code || codeInput.value);
  });

  /* ------------------------------------------------------------------ */
  /* PeerJS                                                              */
  /* ------------------------------------------------------------------ */
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
      showPairScreen(TXT.invalidCode);
      blinkError();
      return;
    }
    showPairError('');
    disconnectPeer();
    showPad();
    setStatus('connecting', TXT.connecting);

    if (typeof Peer === 'undefined') {
      setStatus('disconnected', TXT.peerMissing);
      blinkError();
      return;
    }

    const myPeer = peer = new Peer(Object.assign({}, CFG.peer.options));
    myPeer.on('open', () => {
      if (peer !== myPeer) return;
      const c = conn = myPeer.connect(CFG.peer.idPrefix + code, Object.assign({}, CFG.peer.connectOptions));
      c.on('open', () => {
        if (conn !== c) return;
        setStatus('connected', TXT.connected);
        requestWakeLock();
      });
      c.on('data', () => { /* hub may send acks later */ });
      c.on('close', () => {
        if (conn !== c) return;
        releaseAll();
        setStatus('disconnected', TXT.disconnected);
      });
      c.on('error', (err) => {
        if (conn !== c) return;
        setStatus('disconnected', TXT.error);
        blinkError();
        console.warn('conn error', err);
      });
    });
    myPeer.on('error', (err) => {
      if (peer !== myPeer) return;
      const type = err && err.type;
      blinkError();
      if (type === 'peer-unavailable') {
        setStatus('disconnected', TXT.hubNotFound);
        codeInput.value = code;
        showPairScreen(TXT.hubNotFoundHint);
      } else {
        setStatus('disconnected', type || TXT.genericError);
        console.warn('peer error', err);
      }
    });
    myPeer.on('disconnected', () => {
      // signalling server lost; an open data connection may survive
      if (peer !== myPeer) return;
      if (!(conn && conn.open)) {
        releaseAll();
        setStatus('disconnected', TXT.disconnected);
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* global guards                                                       */
  /* ------------------------------------------------------------------ */
  const stop = (e) => e.preventDefault();
  document.addEventListener('gesturestart', stop);
  document.addEventListener('gesturechange', stop);
  document.addEventListener('contextmenu', stop);
  document.addEventListener('dblclick', stop);
  document.addEventListener('selectstart', (e) => { if (e.target !== codeInput) e.preventDefault(); });
  // Block scroll / pinch / double-tap zoom / long-press callouts on the pad
  pad.addEventListener('touchstart', stop, { passive: false });
  pad.addEventListener('touchmove', stop, { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || !pad.hidden) e.preventDefault(); }, { passive: false });
  document.addEventListener('touchcancel', () => releaseAll(), { passive: true });
  window.addEventListener('blur', () => releaseAll());
  window.addEventListener('pagehide', () => releaseAll());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock();
    else releaseAll();
  });
  window.addEventListener('orientationchange', updateOrientation);
  window.addEventListener('resize', updateOrientation);

  /* ------------------------------------------------------------------ */
  /* boot                                                                */
  /* ------------------------------------------------------------------ */
  applyLayout();
  applyTheme(load(CFG.storage.theme, CFG.defaultTheme));
  applyText();
  renderHaptics();
  document.querySelectorAll('.face, .shoulder, .sys, .home').forEach(bindButton);
  setupDpad();
  setupStick();
  applyMode(leftMode);

  connectBtn.addEventListener('click', () => connectToHub(codeInput.value));
  codeInput.addEventListener('keydown', (e) => {
    if (e.key === CFG.keys.connect) connectToHub(codeInput.value);
  });
  codeInput.addEventListener('input', () => {
    const v = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (v !== codeInput.value) codeInput.value = v;
  });

  updateOrientation();

  if (DEMO) {
    demoTag.hidden = false;
    showPad();
    setStatus('connected', TXT.demo);
    window.__controller = { releaseAll, setMode: (m) => { leftMode = m; applyMode(m); }, stick, sent };
  } else {
    setStatus('disconnected', TXT.disconnected);
    const fromHash = (function parseCodeFromHash() {
      const h = (location.hash || '').replace(/^#/, '');
      const hp = new URLSearchParams(h.includes('=') ? h : '');
      let c = (hp.get(CFG.code.hashParam) || '').trim().toUpperCase();
      if (!c && CFG.code.bareHashPattern.test(h)) c = h.toUpperCase();
      return c.replace(/[^A-Z0-9]/g, '');
    })();
    if (fromHash) {
      codeInput.value = fromHash;
      connectToHub(fromHash);
    } else {
      showPairScreen('');
    }
  }
})();
