/**
 * Phone gamepad controller — PeerJS client that sends button / stick messages to
 * the sites hub (../hub-controller.js).
 *
 * Protocol (JSON strings over the PeerJS data connection):
 *   { t:'btn',   b:<button>, s:1|0 }   press / release (original protocol, unchanged)
 *   { t:'stick', x:-1..1,  y:-1..1 }   analog stick (y -1 = up), sent at stick.sendHz while held
 * Hub → phone:
 *   { t:'rumble', ms:N } / { t:'rumble', pattern:[...] }   game rumble (e.g. Snake death)
 *   → navigator.vibrate, only when the Vibe toggle is on; silently nothing without vibrate (iOS)
 *   While a rumble runs, tap haptics are skipped (haptics.rumbleWins): any new vibrate call
 *   would cancel it. Diag panel (CFG.diag) shows the vibration state + a direct test button.
 * The stick also emulates the D-pad by sending 'btn' up/down/left/right, so games that
 * only understand arrows work unchanged.
 *
 * Pairing: the last code that connected is remembered (localStorage) and used again on
 * page load; a dropped connection (hub reloaded, network blip) is retried with backoff
 * (LED amber). A built-in QR scanner (camera + local vendor/jsQR.js) reads the hub QR.
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
  const qrBtn = $('qr-btn');
  const scanBtn = $('scan-btn');
  const scanOverlay = $('scan-overlay');
  const scanVideo = $('scan-video');
  const scanCanvas = $('scan-canvas');
  const scanStatus = $('scan-status');
  const scanCancel = $('scan-cancel');
  const scanType = $('scan-type');
  const versionEl = $('version');
  const diagToggle = $('diag-toggle');
  const diagLink = $('diag-link');
  const diagPanel = $('diag-panel');
  const diagLines = $('diag-lines');
  const diagTest = $('diag-test');
  const diagTestResult = $('diag-test-result');
  const diagClose = $('diag-close');

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
    document.querySelectorAll('[data-qr-icon]').forEach((img) => { img.src = CFG.qrScanner.icon; });
    qrBtn.title = TXT.scanIconAlt;
    qrBtn.setAttribute('aria-label', TXT.scanIconAlt);
    scanBtn.setAttribute('aria-label', TXT.scanIconAlt);
    if (versionEl) versionEl.textContent = CFG.version ? 'v' + CFG.version : '';
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

  let rumbleUntil = 0;       // a game rumble is running until this time (ms, performance.now)
  const diag = { rumble: null, call: null, test: null };

  /** navigator.vibrate(arg) → its boolean result, or null when it threw / is missing. */
  function callVibrate(arg) {
    if (!canVibrate) return null;
    try { return !!navigator.vibrate(arg); } catch (_) { return null; }
  }

  /** Tap / UI haptics. Skipped while a game rumble runs (it would cut the rumble off). */
  function vibrate(ms) {
    if (!hapticsOn || !canVibrate || !ms) return;
    if (CFG.haptics.rumbleWins !== false && performance.now() < rumbleUntil) return;
    diag.call = { at: new Date(), arg: ms, src: 'tap', result: callVibrate(ms) };
    renderDiag();
  }

  /** Hub → phone data (rumble from the game in the hub). Unknown messages are ignored. */
  function onHubData(data) {
    let m = data;
    if (typeof data === 'string') { try { m = JSON.parse(data); } catch (_) { return; } }
    if (!m || m.t !== MSG.rumble) return;
    const max = CFG.haptics.rumbleMaxMs || 5000;
    const clamp = (n) => Math.max(0, Math.min(max, Math.round(Number(n) || 0)));
    let arg = 0;
    if (Array.isArray(m.pattern)) {
      const p = m.pattern.slice(0, CFG.haptics.rumbleMaxSteps || 20).map(clamp);
      if (p.some((n) => n > 0)) arg = p;
    } else {
      arg = clamp(m.ms);
    }
    diag.rumble = { at: new Date(), arg: arg, note: '' };
    if (!arg) diag.rumble.note = 'empty';
    else if (!canVibrate) diag.rumble.note = 'no vibrate API';
    else if (!hapticsOn) diag.rumble.note = 'Vibe off';
    else {
      const total = Array.isArray(arg) ? arg.reduce((a, n) => a + n, 0) : arg;
      rumbleUntil = performance.now() + total;
      diag.call = { at: new Date(), arg: arg, src: 'rumble', result: callVibrate(arg) };
      diag.rumble.note = 'vibrate → ' + fmtResult(diag.call.result);
    }
    renderDiag();
  }

  /* ---------- vibration diagnostics panel ---------- */
  function fmtResult(r) { return r === true ? 'true' : r === false ? 'false' : 'threw / n/a'; }
  function fmtArg(a) { return Array.isArray(a) ? '[' + a.join(', ') + ']' : a + ' ms'; }
  function fmtTime(d) { return d ? d.toTimeString().slice(0, 8) : ''; }

  function renderDiag() {
    if (!diagPanel || diagPanel.hidden) return;
    const ua = navigator.userActivation;
    const yn = (b) => (b ? TXT.diagYes : TXT.diagNo);
    const lines = [
      'Controller v' + CFG.version,
      'Vibe toggle: ' + (hapticsOn ? 'on' : 'off'),
      "'vibrate' in navigator: " + yn('vibrate' in navigator),
      'User activation: ' + (ua ? 'hasBeenActive ' + yn(ua.hasBeenActive) + ', isActive ' + yn(ua.isActive) : TXT.diagNA),
      'Hub link: ' + (conn && conn.open ? 'connected' : 'not connected'),
      'Last rumble: ' + (diag.rumble ? fmtTime(diag.rumble.at) + '  ' + (diag.rumble.arg ? fmtArg(diag.rumble.arg) : '0') + '  (' + diag.rumble.note + ')' : TXT.diagNone),
      'Last vibrate(): ' + (diag.call ? fmtTime(diag.call.at) + '  ' + diag.call.src + ' ' + fmtArg(diag.call.arg) + ' → ' + fmtResult(diag.call.result) : TXT.diagNone),
    ];
    diagLines.textContent = lines.join('\n');
    diagTestResult.textContent = diag.test ? fmtTime(diag.test.at) + ' → ' + fmtResult(diag.test.result) : '';
  }

  let diagTimer = 0;
  function setDiagOpen(open) {
    diagPanel.hidden = !open;
    clearInterval(diagTimer);
    if (open) {
      renderDiag();
      diagTimer = setInterval(renderDiag, (CFG.diag && CFG.diag.refreshMs) || 1000);
    }
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
      if (setSource('p' + e.pointerId, [b]).length) vibrate(CFG.haptics.longMs);
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
      if (setSource('p' + e.pointerId, dpadDirs(e.clientX, e.clientY)).length) vibrate(CFG.haptics.longMs);
    });
    dpadEl.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p || p.kind !== 'dpad') return;
      e.preventDefault();
      if (setSource('p' + e.pointerId, dpadDirs(e.clientX, e.clientY)).length) vibrate(CFG.haptics.shortMs);
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
      if (dirs.length) vibrate(CFG.haptics.shortMs);
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
    vibrate(CFG.haptics.longMs);
  });
  bindTap(hapticsToggle, () => {
    if (!canVibrate) return;
    hapticsOn = !hapticsOn;
    save(CFG.storage.haptics, hapticsOn ? '1' : '0');
    renderHaptics();
    vibrate(CFG.haptics.longMs);
  });
  if (CFG.diag && CFG.diag.enabled !== false) {
    const testMs = CFG.diag.testMs || 500;
    diagTest.textContent = TXT.diagTest.replace('{ms}', testMs);
    bindTap(diagToggle, () => setDiagOpen(diagPanel.hidden));
    diagLink.addEventListener('click', () => setDiagOpen(diagPanel.hidden));
    diagClose.addEventListener('click', () => setDiagOpen(false));
    // Direct call inside the tap (a user gesture); ignores the Vibe toggle on purpose.
    diagTest.addEventListener('click', () => {
      diag.test = { at: new Date(), result: callVibrate(testMs) };
      diag.call = { at: diag.test.at, arg: testMs, src: 'test', result: diag.test.result };
      renderDiag();
    });
  } else {
    diagToggle.hidden = true;
    diagLink.hidden = true;
  }

  bindTap(led, () => {
    if (DEMO) { blinkError(); return; }
    // disconnected or waiting for the next automatic retry: try now
    if (connState !== 'connected') connectToHub(code || codeInput.value || lastGood);
  });
  bindTap(qrBtn, () => openScanner());

  /* ------------------------------------------------------------------ */
  /* PeerJS + auto-reconnect                                             */
  /* ------------------------------------------------------------------ */
  const RC = CFG.reconnect;
  let lastGood = load(CFG.storage.lastCode, '');   // last code that connected
  let attemptSeq = 0;      // bumps on every attempt / loss, so stale PeerJS events are ignored
  let retryTimer = 0;
  let attemptTimer = 0;
  let retryIndex = 0;
  let retryStartedAt = 0;

  function normalizeCode(v) {
    return String(v || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function cancelRetry() {
    clearTimeout(retryTimer);
    retryTimer = 0;
    retryIndex = 0;
    retryStartedAt = 0;
  }

  function disconnectPeer() {
    releaseAll();
    clearTimeout(attemptTimer);
    const c = conn, p = peer;
    conn = null;
    peer = null;
    try { if (c) c.close(); } catch (_) {}
    try { if (p) p.destroy(); } catch (_) {}
  }

  /** Only a code that connected before is retried automatically. */
  function canRetry() {
    return !!(RC && RC.enabled && code && code === lastGood);
  }

  /** The connection (or an attempt) was lost: schedule a retry or show "disconnected". */
  function onLost(seq, msg) {
    if (seq !== attemptSeq) return;   // already handled / superseded
    attemptSeq++;
    disconnectPeer();                  // also releases every held button
    if (!canRetry()) {
      setStatus('disconnected', msg || TXT.disconnected);
      return;
    }
    if (!retryStartedAt) retryStartedAt = Date.now();
    if (RC.giveUpMs && Date.now() - retryStartedAt > RC.giveUpMs) {
      cancelRetry();
      setStatus('disconnected', TXT.disconnected);
      blinkError();
      return;
    }
    const delays = RC.delaysMs && RC.delaysMs.length ? RC.delaysMs : [3000];
    const d = delays[Math.min(retryIndex, delays.length - 1)];
    retryIndex++;
    setStatus('connecting', TXT.reconnecting);
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => connectToHub(code, { retry: true }), d);
  }

  /**
   * Connect to the hub peer for a pairing code.
   * opts.retry: part of an automatic retry sequence (keeps the backoff position).
   */
  function connectToHub(pairingCode, opts) {
    opts = opts || {};
    code = normalizeCode(pairingCode);
    if (code.length < CFG.code.minLength) {
      cancelRetry();
      showPairScreen(TXT.invalidCode);
      blinkError();
      return;
    }
    if (!opts.retry) cancelRetry();
    else clearTimeout(retryTimer);
    showPairError('');
    attemptSeq++;
    disconnectPeer();
    showPad();
    setStatus('connecting', opts.retry ? TXT.reconnecting : TXT.connecting);

    if (typeof Peer === 'undefined') {
      setStatus('disconnected', TXT.peerMissing);
      blinkError();
      return;
    }

    const seq = attemptSeq;
    const myPeer = peer = new Peer(Object.assign({}, CFG.peer.options));
    attemptTimer = setTimeout(() => onLost(seq), RC.attemptTimeoutMs || 15000);
    myPeer.on('open', () => {
      if (seq !== attemptSeq) return;
      const c = conn = myPeer.connect(CFG.peer.idPrefix + code, Object.assign({}, CFG.peer.connectOptions));
      c.on('open', () => {
        if (seq !== attemptSeq) return;
        clearTimeout(attemptTimer);
        cancelRetry();
        lastGood = code;
        save(CFG.storage.lastCode, code);
        setStatus('connected', TXT.connected);
        requestWakeLock();
      });
      c.on('data', onHubData);
      c.on('close', () => onLost(seq));
      c.on('error', (err) => {
        console.warn('conn error', err);
        onLost(seq, TXT.error);
      });
    });
    myPeer.on('error', (err) => {
      if (seq !== attemptSeq) return;
      const type = err && err.type;
      if (type === 'peer-unavailable' && !canRetry()) {
        // a new / mistyped code: tell the user instead of retrying
        attemptSeq++;
        disconnectPeer();
        blinkError();
        setStatus('disconnected', TXT.hubNotFound);
        codeInput.value = code;
        showPairScreen(TXT.hubNotFoundHint);
        return;
      }
      if (type !== 'peer-unavailable') console.warn('peer error', err);
      onLost(seq, type || TXT.genericError);
    });
    myPeer.on('disconnected', () => {
      // signalling server lost; an open data connection may survive
      if (seq !== attemptSeq) return;
      if (!(conn && conn.open)) onLost(seq);
    });
  }

  /* ------------------------------------------------------------------ */
  /* QR scanner (camera + local jsQR; BarcodeDetector optional)          */
  /* ------------------------------------------------------------------ */
  const QS = CFG.qrScanner;
  const scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });
  let scanStream = null;
  let scanTimer = 0;
  let scanning = false;
  let detector = null;

  /** Pairing code from a hash string: "code=ABC123" or a bare "ABC123". */
  function codeFromHash(h) {
    h = String(h || '').replace(/^#/, '');
    const hp = new URLSearchParams(h.includes('=') ? h : '');
    let c = (hp.get(CFG.code.hashParam) || '').trim();
    if (!c && CFG.code.bareHashPattern.test(h)) c = h;
    return normalizeCode(c);
  }

  /** Pairing code from scanned QR text: a controller URL (#code= / ?code=) or a bare code. */
  function codeFromText(text) {
    const t = String(text || '').trim();
    let c = '';
    if (CFG.code.bareHashPattern.test(t)) c = t;
    else {
      try {
        const u = new URL(t);
        c = codeFromHash(u.hash) || normalizeCode(u.searchParams.get(CFG.code.hashParam));
      } catch (_) { c = ''; }
    }
    c = normalizeCode(c);
    return c.length >= CFG.code.minLength && c.length <= CFG.code.maxLength ? c : '';
  }

  function setScanStatus(msg, isError) {
    scanStatus.textContent = msg || '';
    scanStatus.classList.toggle('error', !!isError);
  }

  function stopTracks(stream) {
    try { stream.getTracks().forEach((t) => t.stop()); } catch (_) { /* ignore */ }
  }

  async function openScanner() {
    if (scanning) return;
    releaseAll();
    scanning = true;
    scanOverlay.hidden = false;
    setScanStatus(TXT.scanStarting);
    const haveBD = QS.useBarcodeDetector && 'BarcodeDetector' in window;
    if (typeof jsQR !== 'function' && !haveBD) { setScanStatus(TXT.scanUnavailable, true); return; }
    if (!window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setScanStatus(TXT.scanInsecure, true);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: QS.facingMode }, width: { ideal: QS.idealWidth } },
        audio: false,
      });
      if (!scanning) { stopTracks(stream); return; } // cancelled while the prompt was open
      scanStream = stream;
      scanVideo.srcObject = stream;
      try { await scanVideo.play(); } catch (_) { /* autoplay attribute covers it */ }
      setScanStatus(TXT.scanLooking);
      clearTimeout(scanTimer);
      scanTimer = setTimeout(scanFrame, QS.scanEveryMs);
    } catch (err) {
      const name = err && err.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') setScanStatus(TXT.scanDenied, true);
      else if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') setScanStatus(TXT.scanNoCamera, true);
      else { setScanStatus(TXT.scanError, true); console.warn('camera error', err); }
    }
  }

  function closeScanner() {
    scanning = false;
    clearTimeout(scanTimer);
    if (scanStream) stopTracks(scanStream);
    scanStream = null;
    try { scanVideo.pause(); } catch (_) { /* ignore */ }
    scanVideo.srcObject = null;
    scanOverlay.hidden = true;
  }

  async function scanFrame() {
    if (!scanning) return;
    const vw = scanVideo.videoWidth, vh = scanVideo.videoHeight;
    if (scanVideo.readyState >= 2 && vw && vh) {
      const w = Math.min(QS.scanWidth, vw);
      const h = Math.round(vh * w / vw);
      if (scanCanvas.width !== w) scanCanvas.width = w;
      if (scanCanvas.height !== h) scanCanvas.height = h;
      scanCtx.drawImage(scanVideo, 0, 0, w, h);
      let text = null;
      if (QS.useBarcodeDetector && 'BarcodeDetector' in window) {
        try {
          detector = detector || new BarcodeDetector({ formats: ['qr_code'] });
          const found = await detector.detect(scanCanvas);
          if (found && found[0]) text = found[0].rawValue;
        } catch (_) { /* fall back to jsQR */ }
      }
      if (text == null && typeof jsQR === 'function') {
        const img = scanCtx.getImageData(0, 0, w, h);
        const r = jsQR(img.data, w, h, { inversionAttempts: QS.inversionAttempts });
        if (r) text = r.data;
      }
      if (!scanning) return;
      if (text != null) {
        const c = codeFromText(text);
        if (c) {
          setScanStatus(TXT.scanFound.replace('{code}', c));
          closeScanner();
          codeInput.value = c;
          if (!(c === code && conn && conn.open)) connectToHub(c);
          return;
        }
        setScanStatus(TXT.scanNotController, true);
      }
    }
    scanTimer = setTimeout(scanFrame, QS.scanEveryMs);
  }

  scanBtn.addEventListener('click', () => openScanner());
  scanCancel.addEventListener('click', () => closeScanner());
  scanType.addEventListener('click', () => {
    closeScanner();
    if (!(conn && conn.open)) {
      cancelRetry();
      attemptSeq++;
      disconnectPeer();
      setStatus('disconnected', TXT.disconnected);
      codeInput.value = code || lastGood || '';
      showPairScreen('');
    } else {
      codeInput.value = '';
      showPairScreen('');   // connected: the pad keeps the link until a new code connects
    }
  });

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
    if (document.visibilityState === 'visible') {
      requestWakeLock();
      // back from the lock screen / another app: retry at once instead of waiting
      if (!DEMO && retryTimer && canRetry()) connectToHub(code, { retry: true });
    } else {
      releaseAll();
    }
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
    const fromHash = codeFromHash(location.hash);
    if (fromHash) {
      codeInput.value = fromHash;
      connectToHub(fromHash);
    } else if (RC.autoConnectOnLoad && lastGood) {
      codeInput.value = lastGood;      // page reload: reconnect to the last hub
      connectToHub(lastGood, { retry: true });
    } else {
      codeInput.value = lastGood || '';
      showPairScreen('');
    }
  }
})();
