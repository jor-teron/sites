/**
 * Hub phone controller — PeerJS host + QR pairing popover.
 * Forwards D-pad messages into the app iframe as KeyboardEvents + postMessage.
 * Keyboard modes of the controller send {t:'key', key, code, s:1|0, shift, ctrl, alt, repeat}:
 * dispatched as keydown / keypress / keyup into the (same-origin) app frame's focused element,
 * and typed into a focused input / textarea / contenteditable (synthetic events do not type),
 * incl. Backspace / Delete / Enter / ←→. Also posted as {type:'hub-key', ...}.
 * Rumble: an app in the iframe may post {type:'hub-rumble', ms:N} or
 * {type:'hub-rumble', pattern:[on, off, on, ...]}; it is relayed to the paired phone as
 * {t:'rumble', ms} / {t:'rumble', pattern} (the phone calls navigator.vibrate).
 *
 * Extensions (window.HubCtrlExt, filled by hub_pointer.js / hub_receive.js): other message types
 * go to ext.handlers (trackpad pointer), a connection with metadata {kind:'files'} goes to
 * ext.files (phone → hub files) instead of replacing the controller link, and ext.onClose runs
 * when the controller link closes. Key / button forwarding above is unchanged.
 *
 * Connection layer: shared/link (window.SharedLink) owns the PeerJS host peer, retry/backoff
 * and the device list; old-style Gamepad / files connections come back here via onLegacy.
 * SharedLink devices (metadata kind 'link') are handled by SharedLink + hub_link.js; a Gamepad
 * that joins as a SharedLink device (metadata.pad, release 3) sends its keys as SharedLink 'raw'.
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
  const CODE_KEY = 'jtsites-hub-ctrl-code';              // localStorage: current pairing code
  const CODE_RE = /^\d{4}$/;                            // 4 digits only; older letter codes are replaced
  // Retry / backoff lives in shared/link/link_core.js now.

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

  let conn = null;
  let code = '';
  let pairing = false;
  const held = Object.create(null);
  const heldKeys = new Map();   // code|key -> last keydown message (keyup sent on release)

  function loadCode() {
    try { const c = (localStorage.getItem(CODE_KEY) || '').toUpperCase(); return CODE_RE.test(c) ? c : ''; } catch (_) { return ''; }
  }
  function saveCode(c) {
    try { localStorage.setItem(CODE_KEY, c); } catch (_) { /* ignore */ }
  }

  /** New codes are 4 digits (SharedLink); older saved 6-letter codes keep working. */
  function randomCode() {
    return window.SharedLink ? SharedLink.randomCode(code) : String(Math.floor(Math.random() * 10000)).padStart(4, '0');
  }

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function setConnectedIndicator(on) {
    if (ctrlBtn) ctrlBtn.classList.toggle('connected', !!on);
  }

  function controllerUrl(c) {
    const u = new URL('hub/controller/controller.html', location.href);
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
    announceLink();
  }

  /** Tell the home tiles (hub.js) the current controller link, so the Gamepad QR tile
   *  shows the exact same QR / code as the popover. */
  function announceLink() {
    const url = code ? controllerUrl(code) : '';
    try { window.dispatchEvent(new CustomEvent('hub-ctrl-link', { detail: { url: url, code: code } })); } catch (_) { /* old browser */ }
  }

  function openPopover() {
    if (!popover) return;
    popover.hidden = false;
    popoverBackdrop.hidden = false;
    if (!code) newCode();                 // first time: make and remember a code
    else if (!SharedLink.live) startPairing(); // stopped / gave up: listen again
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

  /** Close the gamepad link and the host peer quietly (no bye: devices reconnect). */
  function destroyPeer() {
    const c = conn;
    conn = null;
    pairing = false;
    try { if (c) c.close(); } catch (_) {}
    if (window.SharedLink) SharedLink.pause();
  }

  function releaseHeld() {
    for (const b of Object.keys(held)) {
      if (held[b]) forwardBtn(b, 0);
    }
    for (const m of Array.from(heldKeys.values())) forwardKey(Object.assign({}, m, { s: 0, repeat: 0 }));
  }

  /* ---------- keyboard keys from the controller's keyboard modes ---------- */
  const KEYCODES = {
    Backspace: 8, Tab: 9, Enter: 13, Shift: 16, Control: 17, Alt: 18, CapsLock: 20, Escape: 27, ' ': 32,
    PageUp: 33, PageDown: 34, End: 35, Home: 36, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Delete: 46,
  };
  const CODE_KEYCODES = {
    Semicolon: 186, Equal: 187, Comma: 188, Minus: 189, Period: 190, Slash: 191, Backquote: 192,
    BracketLeft: 219, Backslash: 220, BracketRight: 221, Quote: 222,
  };
  function keyCodeOf(key, code) {
    if (KEYCODES[key] != null) return KEYCODES[key];
    if (/^Key[A-Z]$/.test(code)) return code.charCodeAt(3);
    if (/^Digit\d$/.test(code)) return code.charCodeAt(5);
    if (CODE_KEYCODES[code]) return CODE_KEYCODES[code];
    if (key && key.length === 1) return key.toUpperCase().charCodeAt(0);
    return 0;
  }

  /** Focused element of the app frame, following nested same-origin iframes. */
  function deepActive(doc) {
    let el = doc.activeElement || doc.body;
    for (let i = 0; i < 4 && el && el.tagName === 'IFRAME'; i++) {
      let inner = null;
      try { inner = el.contentDocument; } catch (_) { inner = null; }
      if (!inner) break;
      el = inner.activeElement || inner.body;
    }
    return el;
  }

  const TEXT_TYPES = /^(text|search|url|tel|password|email|number|)$/i;
  function editableOf(el) {
    if (!el) return null;
    if (el.tagName === 'TEXTAREA' && !el.readOnly && !el.disabled) return el;
    if (el.tagName === 'INPUT' && TEXT_TYPES.test(el.type || '') && !el.readOnly && !el.disabled) return el;
    if (el.isContentEditable) return el;
    return null;
  }

  /** Type into a text field (what a real key would do). Returns true when handled. */
  function typeInto(el, msg) {
    const key = msg.key;
    const doc = el.ownerDocument;
    const win = doc.defaultView;
    const fire = (inputType, data) => {
      try { el.dispatchEvent(new win.InputEvent('input', { bubbles: true, inputType: inputType, data: data == null ? null : data })); }
      catch (_) { el.dispatchEvent(new win.Event('input', { bubbles: true })); }
    };
    if (el.isContentEditable) {
      // execCommand keeps undo + fires input itself
      if (key.length === 1) return doc.execCommand('insertText', false, key);
      if (key === 'Enter') return doc.execCommand('insertParagraph', false) || doc.execCommand('insertText', false, '\n');
      if (key === 'Backspace') return doc.execCommand('delete', false);
      if (key === 'Delete') return doc.execCommand('forwardDelete', false);
      return false;
    }
    let start = null, end = null;
    try { start = el.selectionStart; end = el.selectionEnd; } catch (_) { /* email / number: no selection API */ }
    const hasSel = typeof start === 'number' && typeof end === 'number';
    const v = el.value;
    if (key === 'Enter' && el.tagName !== 'TEXTAREA') {
      const form = el.form;
      if (form) { try { form.requestSubmit ? form.requestSubmit() : form.submit(); } catch (_) { /* ignore */ } }
      return true;
    }
    const text = key === 'Enter' ? '\n' : (key.length === 1 ? key : null);
    if (text != null) {
      if (el.maxLength > 0 && v.length - (hasSel ? end - start : 0) + text.length > el.maxLength) return true;
      if (hasSel) el.setRangeText(text, start, end, 'end');
      else el.value = v + text;
      fire(key === 'Enter' ? 'insertLineBreak' : 'insertText', text);
      return true;
    }
    if (key === 'Backspace' || key === 'Delete') {
      if (!hasSel) { el.value = key === 'Backspace' ? Array.from(v).slice(0, -1).join('') : v; fire('deleteContentBackward'); return true; }
      if (start !== end) el.setRangeText('', start, end, 'end');
      else if (key === 'Backspace' && start > 0) {
        const n = start > 1 && /[\uDC00-\uDFFF]/.test(v[start - 1]) ? 2 : 1;   // surrogate pair (emoji)
        el.setRangeText('', start - n, start, 'end');
      } else if (key === 'Delete' && start < v.length) {
        const n = /[\uD800-\uDBFF]/.test(v[start]) ? 2 : 1;
        el.setRangeText('', start, start + n, 'end');
      } else return true;
      fire(key === 'Backspace' ? 'deleteContentBackward' : 'deleteContentForward');
      return true;
    }
    if ((key === 'ArrowLeft' || key === 'ArrowRight') && hasSel) {
      const p = key === 'ArrowLeft' ? (start !== end ? start : Math.max(0, start - 1)) : (start !== end ? end : Math.min(v.length, end + 1));
      el.setSelectionRange(p, p);
      return true;
    }
    if ((key === 'Home' || key === 'End') && hasSel) {
      const p = key === 'Home' ? 0 : v.length;
      el.setSelectionRange(p, p);
      return true;
    }
    return false;
  }

  function forwardKey(msg) {
    const key = typeof msg.key === 'string' ? msg.key.slice(0, 32) : '';
    if (!key) return;
    const code = typeof msg.code === 'string' ? msg.code.slice(0, 32) : '';
    const down = !!msg.s;
    const id = code || key;
    const m = { t: 'key', key: key, code: code, s: down ? 1 : 0, shift: msg.shift ? 1 : 0, ctrl: msg.ctrl ? 1 : 0, alt: msg.alt ? 1 : 0, repeat: msg.repeat ? 1 : 0 };
    if (down) heldKeys.set(id, m); else heldKeys.delete(id);
    try {
      const w = frame && frame.contentWindow;
      const doc = w && w.document;   // throws for a cross-origin app: postMessage only
      if (doc) {
        const target = deepActive(doc) || doc;
        const tw = (target.ownerDocument && target.ownerDocument.defaultView) || w;
        const keyCode = keyCodeOf(key, code);
        const init = (type, kc) => new tw.KeyboardEvent(type, {
          key: key, code: code, keyCode: kc, which: kc, charCode: type === 'keypress' ? kc : 0,
          shiftKey: !!m.shift, ctrlKey: !!m.ctrl, altKey: !!m.alt, repeat: !!m.repeat,
          bubbles: true, cancelable: true, composed: true,
        });
        const ok = target.dispatchEvent(init(down ? 'keydown' : 'keyup', keyCode));
        if (down && ok) {
          const printable = key.length === 1 || key === 'Enter';
          let pressOk = true;
          if (printable && !m.ctrl && !m.alt) pressOk = target.dispatchEvent(init('keypress', key === 'Enter' ? 13 : key.charCodeAt(0)));
          const ed = editableOf(target);
          if (ed && pressOk && !m.ctrl && !m.alt) typeInto(ed, m);
        }
      }
    } catch (err) {
      if (!(err && err.name === 'SecurityError')) console.warn('forward key', err);
    }
    try {
      if (frame && frame.contentWindow) frame.contentWindow.postMessage(Object.assign({ type: 'hub-key' }, m), '*');
    } catch (_) { /* ignore */ }
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
    } else if (msg.t === 'key') {
      forwardKey(msg);
    } else {
      // Extensions (trackpad pointer: hub_pointer.js); unknown types are ignored.
      const ext = window.HubCtrlExt;
      if (ext && ext.handlers) {
        for (const fn of ext.handlers) {
          try { if (fn(msg)) break; } catch (err) { console.warn('hub ext', err); }
        }
      }
    }
  }

  function extClosed() {
    const ext = window.HubCtrlExt;
    if (ext && ext.onClose) for (const fn of ext.onClose) { try { fn(); } catch (_) { /* ignore */ } }
  }

  function attachConn(c, viaLink) {
    if (conn === c) return;
    if (conn && conn !== c) {
      try { conn.close(); } catch (_) {}
      releaseHeld();
      extClosed();
    }
    conn = c;
    setStatus('Controller connected');
    setConnectedIndicator(true);
    if (!viaLink) c.on('data', onConnData);   // SharedLink pads: data arrives as SharedLink 'raw'
    c.on('close', () => {
      if (conn === c) {
        conn = null;
        releaseHeld();
        extClosed();
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

  /** Old-style connections (Gamepad without kind 'link', phone → hub files). */
  function onLegacy(c) {
    const ext = window.HubCtrlExt;
    if (c.metadata && c.metadata.kind === 'files') {
      if (ext && typeof ext.files === 'function') ext.files(c);
      else c.on('open', () => { try { c.close(); } catch (_) {} });
      return;
    }
    attachConn(c);   // one controller at a time
  }

  /** Register PEER_PREFIX + code through SharedLink and wait for the phone. */
  function startPairing() {
    if (!code || !window.SharedLink) { setStatus('SharedLink missing'); return; }
    releaseHeld();
    setConnectedIndicator(!!(conn && conn.open));
    renderPairing();
    pairing = true;
    SharedLink.host({ prefix: PEER_PREFIX, code: code, onLegacy: onLegacy }).catch(() => setStatus('PeerJS could not load (offline?)'));
  }

  if (window.SharedLink) {
    // Release 3: the Gamepad joins as a SharedLink device (metadata.pad) and sends its keys
    // over that link; they arrive here as 'raw'. The newest pad that speaks becomes the
    // controller (rumble goes back to it).
    SharedLink.on('raw', (msg, from, c) => {
      if (!c || !(c.metadata && c.metadata.pad)) return;
      attachConn(c, true);
      onConnData(msg);
    });
    SharedLink.on('open', (id) => {
      // A pad that just (re)joined is the controller even before its first key.
      SharedLink._targets(id).forEach((c) => { if (c.metadata && c.metadata.pad && c.peer === id) attachConn(c, true); });
    });
    SharedLink.on('status', (text, state) => {
      if (state === 'listening' && conn && conn.open) text = 'Controller connected';
      setStatus(text);
    });
  }

  /** Make and remember a fresh pairing code, then listen on it. */
  function newCode() {
    releaseHeld();
    destroyPeer();
    code = randomCode();
    saveCode(code);
    startPairing();
  }

  /** Close the phone link and stop listening (the code is kept; opening the popover or
   *  reloading the hub listens again). */
  function disconnect() {
    releaseHeld();
    destroyPeer();
    if (window.SharedLink) SharedLink.stop(true);
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
  // The Gamepad QR tile needs a live code too, so a first visit makes one here.
  code = loadCode();
  if (code) startPairing();
  else newCode();

  /** Shared link for the home tiles: same code as the popover QR; listens again if stopped. */
  window.HubCtrlLink = {
    get url() { return code ? controllerUrl(code) : ''; },
    ensure() {
      if (!code) newCode();
      else if (!SharedLink.live) startPairing();
      return code ? controllerUrl(code) : '';
    },
  };
  announceLink();

  // Expose tiny API for debugging / tests
  window.__hubController = {
    openPopover, closePopover, disconnect, startPairing, newCode,
    get code() { return code; },
    get status() { return statusEl ? statusEl.textContent : ''; },
    get connected() { return !!(conn && conn.open); },
  };
})();
