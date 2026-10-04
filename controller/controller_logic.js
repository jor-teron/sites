/**
 * Phone gamepad controller — PeerJS client that sends button / stick messages to
 * the sites hub (../hub-controller.js).
 *
 * Protocol (JSON strings over the PeerJS data connection):
 *   { t:'btn',   b:<button>, s:1|0 }   press / release (original protocol, unchanged)
 *   { t:'stick', x:-1..1,  y:-1..1 }   analog stick (y -1 = up), sent at stick.sendHz while held
 *   { t:'key', key, code, s:1|0, shift, ctrl, alt, repeat }   keyboard modes: keydown / keyup
 *     (the hub dispatches KeyboardEvents into the app frame and types into focused text fields)
 *   { t:'ptr'|'tap'|'mb'|'wheel', … }   trackpad (ctrl_trackpad.js → hub/hub_pointer.js)
 * Send Files (ctrl_sendfiles.js) uses a second connection to the same hub peer
 * (metadata {kind:'files'}, serialization 'raw'), so this link is never blocked by file data.
 * Hub → phone:
 *   { t:'rumble', ms:N } / { t:'rumble', pattern:[...] }   game rumble (e.g. Snake death)
 *   → navigator.vibrate, only when the Vib toggle is on; silently nothing without vibrate (iOS)
 *   While a rumble runs, tap haptics are skipped (haptics.rumbleWins): any new vibrate call
 *   would cancel it. Diag panel (CFG.diag) shows the vibration state + a direct test button.
 * The stick also emulates the D-pad by sending 'btn' up/down/left/right, so games that
 * only understand arrows work unchanged.
 *
 * Pairing: the last code that connected is remembered (localStorage) and used again on
 * page load; a dropped connection (hub reloaded, network blip) is retried with backoff
 * (LED amber). A built-in QR scanner (camera + local vendor/jsQR.js) reads the hub QR.
 *
 * Modes (CONTROLLER_CONFIG.modes): the gamepad plus boards (kb_pc.js, kb_phone.js,
 * ctrl_trackpad.js, ctrl_sendfiles.js via kb_common.js). Tabs at the top centre
 * (ctrl_tabs.js: Gamepad / Keyboard & Mouse / Send Files, ⋯ = menu with modes, fullscreen,
 * light / dark) switch them. Without ctrl_tabs.js the round mode button is used instead:
 * tap = next, swipe left / right = previous / next, hold = menu.
 * Every held button / key is released on a mode switch, disconnect, blur or hide.
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
  const stop = (e) => e.preventDefault();
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
  const themeToggle = $('theme-toggle');
  const menuDiag = $('menu-diag');
  const diagLink = $('diag-link');
  const diagPanel = $('diag-panel');
  const diagLines = $('diag-lines');
  const diagTest = $('diag-test');
  const diagTestResult = $('diag-test-result');
  const diagClose = $('diag-close');
  const fsBtn = $('fs-btn');
  const modeBtn = $('mode-btn');
  const modeToast = $('mode-toast');
  const modeMenu = $('mode-menu');
  const menuModes = $('menu-modes');
  const menuFs = $('menu-fs');
  const menuTheme = $('menu-theme');
  const kbView = $('kb-view');
  const kbHost = $('kb-host');
  const kbLed = $('kb-led');
  const kbEcho = $('kb-echo');
  const LEDS = [led, pairLed, kbLed];

  const params = new URLSearchParams(location.search);
  const DEMO = params.get(CFG.demo.param) === '1';

  let peer = null;
  let conn = null;
  let code = '';
  let wakeLock = null;
  let fullscreenOptOut = false;   // the user left fullscreen on purpose: stop auto-trying
  let themeId = '';
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
  // dvh where supported; older browsers get the same value with vh (a custom property with
  // an unknown unit would otherwise break every size that uses it).
  const HAS_DVH = !!(window.CSS && CSS.supports && CSS.supports('height', '1dvh'));
  function applyLayout() {
    for (const [k, v] of Object.entries(CFG.layout || {})) {
      body.style.setProperty(k, HAS_DVH ? v : String(v).replace(/(\d)dvh/g, '$1vh'));
    }
  }

  function applyTheme(id) {
    const themes = CFG.themes || [];
    const theme = themes.find((t) => t.id === id) || themes.find((t) => t.id === CFG.defaultTheme) || themes[0];
    if (!theme) return;
    for (const t of themes) body.classList.remove(CLS.themePrefix + t.id);
    body.classList.add(CLS.themePrefix + theme.id);
    for (const [k, v] of Object.entries(theme.vars || {})) body.style.setProperty(k, v);
    themeId = theme.id;
    renderThemeChip();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta && theme.vars && theme.vars['--bg-2']) meta.setAttribute('content', theme.vars['--bg-2']);
  }

  function isDarkTheme() { return themeId === CFG.darkTheme; }
  /** Pad chip: ☾ while light (tap → dark), ☀ while dark (tap → light). */
  function renderThemeChip() {
    themeToggle.textContent = isDarkTheme() ? TXT.themeChipToLight : TXT.themeChipToDark;
    themeToggle.title = TXT.themeChipTitle;
    themeToggle.setAttribute('aria-label', TXT.themeChipTitle);
  }
  function toggleTheme() {
    const next = isDarkTheme() ? (CFG.lightTheme || CFG.defaultTheme) : CFG.darkTheme;
    applyTheme(next);
    save(CFG.storage.theme, themeId);
    renderMenu();
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
    for (const el of LEDS) {
      el.classList.remove('connecting', 'connected', 'disconnected');
      el.classList.add(state);
    }
    for (const el of [led, kbLed]) {
      el.title = msg || state;
      el.setAttribute('aria-label', msg || state);
    }
  }

  let blinkTimer = 0;
  function blinkError() {
    for (const el of LEDS) {
      el.classList.remove('error-blink');
      void el.offsetWidth; // restart animation
      el.classList.add('error-blink');
    }
    clearTimeout(blinkTimer);
    blinkTimer = setTimeout(() => {
      for (const el of LEDS) el.classList.remove('error-blink');
    }, CFG.led.errorBlinkMs);
  }

  function showPairError(msg) {
    pairError.hidden = !msg;
    pairError.textContent = msg || '';
  }

  function showPairScreen(msg) {
    releaseAll();
    pad.hidden = true;
    kbView.hidden = true;
    modeBtn.hidden = true;
    closeMenu();
    pairScreen.hidden = false;
    if (window.CTRL_TABS) CTRL_TABS.render(modeId, false);
    showPairError(msg || '');
    updateOrientation();
  }

  /** Show the controller for the current mode (gamepad or a keyboard). */
  function showPad() {
    pairScreen.hidden = true;
    modeBtn.hidden = false;
    renderView();
  }

  /* ------------------------------------------------------------------ */
  /* browser features                                                    */
  /* ------------------------------------------------------------------ */
  function updateOrientation() {
    const portrait = window.matchMedia(CFG.browser.portraitQuery).matches;
    // the pairing screen and portrait-friendly modes (phone keyboard) need no rotation
    const needsLandscape = pairScreen.hidden && currentMode().landscape !== false;
    const show = portrait && needsLandscape;
    rotateOverlay.hidden = !show;
    if (show) releaseAll();
  }

  /* ---------- fullscreen (⛶ button, menu, auto-try on touch) ---------- */
  const docEl = document.documentElement;
  const FS_OK = !!((docEl.requestFullscreen || docEl.webkitRequestFullscreen) &&
    (document.fullscreenEnabled || document.webkitFullscreenEnabled));   // false on iPhone Safari
  function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }

  async function enterFullscreen() {
    if (!FS_OK || isFullscreen()) return isFullscreen();
    try {
      if (docEl.requestFullscreen) await docEl.requestFullscreen({ navigationUI: 'hide' });
      else docEl.webkitRequestFullscreen();
    } catch (_) { return false; }
    lockOrientation();
    return true;
  }
  async function exitFullscreen() {
    try {
      if (document.exitFullscreen) await document.exitFullscreen();
      else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    } catch (_) { /* ignore */ }
  }
  function toggleFullscreen() {
    if (isFullscreen()) { fullscreenOptOut = true; exitFullscreen(); }
    else { fullscreenOptOut = false; enterFullscreen(); }
  }
  async function lockOrientation() {
    const so = screen.orientation;
    if (!so) return;
    try {
      if (currentMode().landscape !== false) { if (so.lock) await so.lock(CFG.browser.orientationLock); }
      else if (so.unlock) so.unlock();
    } catch (_) { /* ignore — many browsers disallow */ }
  }
  function renderFullscreen() {
    const on = isFullscreen();
    fsBtn.hidden = !FS_OK;
    fsBtn.textContent = on ? CFG.browser.fullscreenExitIcon : CFG.browser.fullscreenIcon;
    fsBtn.classList.toggle('on', on);
    const t = on ? TXT.menuExitFullscreen : TXT.fullscreenTitle;
    fsBtn.title = t;
    fsBtn.setAttribute('aria-label', t);
    renderMenu();
  }
  document.addEventListener('fullscreenchange', renderFullscreen);
  document.addEventListener('webkitfullscreenchange', renderFullscreen);

  /** Auto-try on touch (CFG.browser.autoFullscreen): retried on later touches until it works. */
  function tryFullscreenAndLock() {
    if (DEMO || !CFG.browser.autoFullscreen || fullscreenOptOut || !FS_OK || isFullscreen()) return;
    enterFullscreen();
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
    else if (!hapticsOn) diag.rumble.note = 'Vib off';
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
      'Vib toggle: ' + (hapticsOn ? 'on' : 'off'),
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
    releaseKeys();
  }

  /* ------------------------------------------------------------------ */
  /* keyboard modes: key messages over the same connection               */
  /* ------------------------------------------------------------------ */
  const heldKeys = new Map();   // id -> { key, code, flags } (keydown sent, keyup pending)

  function keyMsg(down, k, repeat) {
    return {
      t: MSG.key, key: k.key, code: k.code, s: down ? 1 : 0,
      shift: k.flags.shift ? 1 : 0, ctrl: k.flags.ctrl ? 1 : 0, alt: k.flags.alt ? 1 : 0,
      repeat: repeat ? 1 : 0,
    };
  }
  function keyDown(id, key, code, flags, repeat) {
    const k = { key: key, code: code || '', flags: flags || {} };
    if (repeat && !heldKeys.has(id)) return;
    if (!repeat && heldKeys.has(id)) keyUp(id);
    heldKeys.set(id, k);
    send(keyMsg(true, k, repeat));
    if (!repeat) kbEcho.textContent = key === ' ' ? 'Space' : key;
  }
  function keyUp(id) {
    const k = heldKeys.get(id);
    if (!k) return;
    heldKeys.delete(id);
    send(keyMsg(false, k, false));
  }
  /** keyup for every held key (also resets the boards' pressed / modifier state). */
  function releaseKeys() {
    for (const id of Array.from(heldKeys.keys())) keyUp(id);
    for (const b of Object.values(builtBoards)) { try { b.release(); } catch (_) { /* ignore */ } }
  }
  const builtBoards = Object.create(null);   // board id -> { el, release }

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
    menuDiag.addEventListener('click', () => { closeMenu(); setDiagOpen(true); });
    diagLink.addEventListener('click', () => setDiagOpen(diagPanel.hidden));
    diagClose.addEventListener('click', () => setDiagOpen(false));
    // Direct call inside the tap (a user gesture); ignores the Vib toggle on purpose.
    diagTest.addEventListener('click', () => {
      diag.test = { at: new Date(), result: callVibrate(testMs) };
      diag.call = { at: diag.test.at, arg: testMs, src: 'test', result: diag.test.result };
      renderDiag();
    });
  } else {
    menuDiag.hidden = true;
    diagLink.hidden = true;
  }

  bindTap(themeToggle, () => { toggleTheme(); vibrate(CFG.haptics.shortMs); });

  bindTap(led, () => {
    if (DEMO) { blinkError(); return; }
    // disconnected or waiting for the next automatic retry: try now
    if (connState !== 'connected') connectToHub(code || codeInput.value || lastGood);
  });
  bindTap(qrBtn, () => openScanner());
  bindTap(kbLed, () => {
    if (DEMO) { blinkError(); return; }
    if (connState !== 'connected') connectToHub(code || codeInput.value || lastGood);
  });
  bindTap(fsBtn, () => { toggleFullscreen(); vibrate(CFG.haptics.shortMs); });

  /* ------------------------------------------------------------------ */
  /* controller modes (gamepad / keyboards) + the mode button            */
  /* ------------------------------------------------------------------ */
  const MODES = (CFG.modes && CFG.modes.length) ? CFG.modes : [{ id: 'pad', label: 'Gamepad', icon: '🎮', landscape: true }];
  const MB = CFG.modeButton || {};
  let modeId = load(CFG.storage.mode, CFG.defaultMode);
  if (!MODES.some((m) => m.id === modeId)) modeId = (MODES.find((m) => m.id === CFG.defaultMode) || MODES[0]).id;

  function currentMode() { return MODES.find((m) => m.id === modeId) || MODES[0]; }

  // Keyboard boards send through these (kb_common.js kit.api).
  if (window.CTRL_KB) {
    Object.assign(CTRL_KB.kit.api, {
      keyDown: keyDown,
      keyUp: keyUp,
      vibrate: (ms) => vibrate(ms),
      firstTouch: () => onFirstTouch(),
      // trackpad / Send Files
      send: (obj) => send(obj),
      isOpen: () => !!(conn && conn.open),
      peer: () => peer,
      hubId: () => CFG.peer.idPrefix + code,
    });
  }

  /** Board element for a mode (built once, on first use). */
  function boardFor(mode) {
    if (!mode.board) return null;
    if (builtBoards[mode.board]) return builtBoards[mode.board];
    const build = window.CTRL_KB && CTRL_KB.boards[mode.board];
    if (!build) return null;
    const b = build(kbHost, CTRL_KB.kit);
    builtBoards[mode.board] = b;
    return b;
  }

  /** Show the view of the current mode (pairing screen excluded). */
  function renderView() {
    const m = currentMode();
    for (const x of MODES) body.classList.remove(CLS.viewPrefix + x.id);
    body.classList.add(CLS.viewPrefix + m.id);
    modeBtn.textContent = m.icon || '?';
    modeBtn.title = m.label + ' — ' + TXT.modeBtnTitle;
    modeBtn.setAttribute('aria-label', m.label);
    if (window.CTRL_TABS) CTRL_TABS.render(m.id, pairScreen.hidden);
    if (!pairScreen.hidden) return;
    const board = boardFor(m);
    pad.hidden = !!m.board;
    kbView.hidden = !m.board;
    for (const b of Object.values(builtBoards)) b.el.hidden = b !== board;
    updateOrientation();
    renderMenu();
  }

  let toastTimer = 0;
  function showToast(text) {
    modeToast.textContent = text;
    modeToast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { modeToast.hidden = true; }, MB.toastMs || 1000);
  }

  /** Switch mode: release everything held, remember, redraw, toast. */
  function setControllerMode(id, quiet) {
    if (!MODES.some((m) => m.id === id)) return;
    releaseAll();
    modeId = id;
    save(CFG.storage.mode, id);
    renderView();
    if (isFullscreen()) lockOrientation();
    if (!quiet) { showToast(currentMode().label); vibrate(CFG.haptics.longMs); }
  }
  function stepMode(dir) {
    const i = MODES.findIndex((m) => m.id === modeId);
    setControllerMode(MODES[(i + dir + MODES.length) % MODES.length].id);
  }

  /* ---------- long-press menu ---------- */
  function renderMenu() {
    if (modeMenu.hidden) return;
    menuModes.replaceChildren();
    for (const m of MODES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'menu-item' + (m.id === modeId ? ' on' : '');
      b.setAttribute('role', 'menuitem');
      b.dataset.mode = m.id;
      b.textContent = (m.icon ? m.icon + '  ' : '') + m.label;
      menuModes.appendChild(b);
    }
    menuFs.hidden = !FS_OK;
    menuFs.textContent = '⛶  ' + (isFullscreen() ? TXT.menuExitFullscreen : TXT.menuFullscreen);
    menuTheme.textContent = isDarkTheme() ? '☀  ' + TXT.menuLight : '☾  ' + TXT.menuDark;
  }
  function openMenu() {
    releaseAll();
    modeToast.hidden = true;
    modeMenu.hidden = false;
    renderMenu();
    vibrate(CFG.haptics.longMs);
  }
  function closeMenu() { modeMenu.hidden = true; }

  menuModes.addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    closeMenu();
    if (b.dataset.mode !== modeId) setControllerMode(b.dataset.mode);
  });
  menuFs.addEventListener('click', () => { toggleFullscreen(); closeMenu(); });
  menuTheme.addEventListener('click', () => { toggleTheme(); });
  // a touch outside the menu (and outside the mode button) closes it
  document.addEventListener('pointerdown', (e) => {
    if (!modeMenu.hidden && !modeMenu.contains(e.target) && e.target !== modeBtn &&
        !(e.target.closest && e.target.closest('#ctrl-more'))) closeMenu();
  }, true);

  /* ---------- mode button gestures: tap / swipe / long-press ---------- */
  (function bindModeButton() {
    let g = null;   // { id, x, y, timer, long, swiped }
    modeBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (g) return;
      try { modeBtn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      modeBtn.classList.add(CLS.active);
      const menuWasOpen = !modeMenu.hidden;
      g = { id: e.pointerId, x: e.clientX, y: e.clientY, long: false, menuWasOpen: menuWasOpen, timer: 0 };
      g.timer = setTimeout(() => { if (g) { g.long = true; openMenu(); } }, MB.longPressMs || 500);
    });
    modeBtn.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id || g.long) return;
      if (Math.abs(e.clientX - g.x) > (MB.swipePx || 24)) clearTimeout(g.timer);  // a swipe, not a hold
    });
    const end = (e, cancelled) => {
      if (!g || e.pointerId !== g.id) return;
      const st = g;
      g = null;
      clearTimeout(st.timer);
      modeBtn.classList.remove(CLS.active);
      if (cancelled || st.long) return;
      onFirstTouch();
      const dx = e.clientX - st.x;
      if (Math.abs(dx) > (MB.swipePx || 24) && Math.abs(dx) > Math.abs(e.clientY - st.y)) {
        closeMenu();
        stepMode(dx > 0 ? 1 : -1);
      } else if (st.menuWasOpen) {
        closeMenu();     // tap while the menu is open: just close it
      } else {
        stepMode(1);
      }
    };
    modeBtn.addEventListener('pointerup', (e) => end(e, false));
    modeBtn.addEventListener('pointercancel', (e) => end(e, true));
    modeBtn.addEventListener('touchstart', stop, { passive: false });
  })();

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
  document.addEventListener('gesturestart', stop);
  document.addEventListener('gesturechange', stop);
  document.addEventListener('contextmenu', stop);
  document.addEventListener('dblclick', stop);
  document.addEventListener('selectstart', (e) => { if (e.target !== codeInput) e.preventDefault(); });
  // Block scroll / pinch / double-tap zoom / long-press callouts on the pad
  pad.addEventListener('touchstart', stop, { passive: false });
  pad.addEventListener('touchmove', stop, { passive: false });
  kbView.addEventListener('touchstart', stop, { passive: false });
  kbView.addEventListener('touchmove', stop, { passive: false });
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 || !pad.hidden || !kbView.hidden) e.preventDefault(); }, { passive: false });
  // Fullscreen needs a user activation; touch activation counts on pointerup / touchend,
  // so the auto-try runs there too (and keeps retrying until it works).
  document.addEventListener('pointerup', () => { if (pairScreen.hidden) tryFullscreenAndLock(); }, true);
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
  renderFullscreen();
  if (window.CTRL_TABS) {
    CTRL_TABS.init({
      setMode: (id) => setControllerMode(id),
      getMode: () => modeId,
      openMenu: () => { if (modeMenu.hidden) openMenu(); else closeMenu(); },
    });
  }
  renderView();
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
    window.__controller = {
      releaseAll, setMode: (m) => { leftMode = m; applyMode(m); }, stick, sent,
      setControllerMode, stepMode, getMode: () => modeId, toggleTheme, getTheme: () => themeId,
      heldKeys, openMenu, closeMenu,
    };
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
