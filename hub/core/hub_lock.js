/*
 * Hub PIN lock screen (hub/core/hub_lock.js + hub_lock.css), H142. Desktop mode only: desktop/desktop.html loads
 * it right after hub_break.js, so a locked Hub shows nothing else first. Logic + keys: hub/core/hub_lock_core.js.
 *
 * OFF by default. It locks only while Settings › Screen lock › Activate is on ('hub-lock.on' = '1') AND a PIN
 * exists: on every load of this page, and on Lock now (Settings). No idle auto-lock. Device-only keys
 * (hub-lock.*): another device (a phone that joined with ?join=, a synced profile) never gets this lock.
 * When off, nothing is drawn and PeerJS is never loaded.
 *
 * While locked: #hub-lock is a child of <html> placed after <body>; <body> itself gets 'inert' and is hidden
 * (html.hub-locked), so every window, app frame, the Hub bar, menus and pop-ups (even the Computer break screen)
 * are covered and take no focus / clicks. Keys are caught at window level (capture): digits / Backspace / Enter /
 * Esc work the PIN pad, Tab / Enter / Space only on the pad's own buttons, everything else is stopped.
 * Focus is pulled back to the pad whenever it moves away.
 *
 * Two ways to unlock: (a) the 4-digit pad on this screen (works offline); (b) the big QR =
 * <site>/unlock.html#hublock-<16 hex>: the phone page sends the PIN over a PeerJS data connection (PeerJS is
 * lazy-loaded from shared/vendor/peerjs.min.js only now). Each QR ID takes one PIN try, then a new one is made
 * (and every ~2 minutes). No PeerJS / offline / file:// = pad only. No attempt limit in H142.
 * This is a casual lock: a webpage can only lock itself, and anyone with the browser's tools can get past it.
 *
 * H143 fingerprint: Settings › Screen lock › Unlock with = PIN only / Fingerprint only / Both ('hub-lock.method').
 * With a fingerprint method the QR session also sends {t:'chal'} and the phone answers with its passkey
 * (HubLockCore.verifyAssertion, origin = this page's origin, rpId = its hostname). Fingerprint only: the PIN pad is
 * hidden behind a small 'Use PIN' recovery link (the PIN always exists); H143.1: the phone page has the same recovery
 * behind 'Use PIN instead' (the PIN sent from the phone is checked like the pad's). H143.1: a phone-link error shows
 * its code (PeerJS error type / 'disconnected' / 'peerjs-load') under the QR while it retries.
 *
 * The optional head line in desktop.html adds html.hub-locked before the first paint when the lock will show.
 *
 * API window.HubLock { isOn(), hasPin(), locked(), lockNow() → bool (false while off), apply() (unlocks if now off),
 *   verify(pin), setPin(pin, cur),
 *   removePin(cur), setOn(v, cur), state() }   (setPin / removePin / setOn resolve { ok, error })
 */
(function () {
  'use strict';
  const C = window.HubLockCore;
  const root = document.documentElement;
  if (!C) { root.classList.remove('hub-locked'); return; }
  const store = C.create();

  /* ---------- overlay ---------- */
  let el = null, dotsEl = null, msgEl = null, padEl = null, qrBox = null, qrNote = null, subEl = null, phoneH = null, recoverEl = null;
  let pinShown = true;   // H143: false while fingerprint only and the 'Use PIN' link was not used
  const here = (function () { try { return new URL(location.href); } catch (_) { return null; } })();
  let isLocked = false, priorFocus = null, bodyWasInert = false, entry = '', busy = false, session = null;
  function mk(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function build() {
    if (el) return el;
    el = mk('div');
    el.id = 'hub-lock';
    el.tabIndex = -1;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'hub-lock-title');
    el.hidden = true;
    const wrap = mk('div', 'hub-lock-wrap');
    // left: the PIN pad
    const left = mk('div', 'hub-lock-side hub-lock-pin');
    left.appendChild(mk('div', 'hub-lock-ico', '\uD83D\uDD12')).setAttribute('aria-hidden', 'true');
    const h = mk('h2', '', 'Hub is locked');
    h.id = 'hub-lock-title';
    left.appendChild(h);
    subEl = left.appendChild(mk('p', 'hub-lock-sub', 'Enter your 4-digit PIN'));
    dotsEl = mk('div', 'hub-lock-dots');
    dotsEl.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 4; i++) dotsEl.appendChild(mk('i'));
    left.appendChild(dotsEl);
    msgEl = mk('p', 'hub-lock-msg');
    msgEl.setAttribute('role', 'status');
    msgEl.setAttribute('aria-live', 'polite');
    left.appendChild(msgEl);
    padEl = mk('div', 'hub-lock-pad');
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'].forEach((k) => {
      const b = mk('button', 'hub-lock-key');
      b.type = 'button';
      b.dataset.k = k;
      if (k === 'back') { b.textContent = '\u232B'; b.setAttribute('aria-label', 'Delete'); b.classList.add('hub-lock-fn'); }
      else if (k === 'ok') { b.textContent = '\u2713'; b.setAttribute('aria-label', 'Unlock'); b.classList.add('hub-lock-fn'); }
      else b.textContent = k;
      b.addEventListener('click', () => key(k));
      padEl.appendChild(b);
    });
    left.appendChild(padEl);
    // H143: fingerprint only: the PIN is a hidden recovery behind this link
    recoverEl = mk('button', 'hub-lock-recover', 'Use PIN');
    recoverEl.type = 'button';
    recoverEl.hidden = true;
    recoverEl.addEventListener('click', () => { showPin(true); grab(); });
    left.appendChild(recoverEl);
    // right: the phone QR
    const right = mk('div', 'hub-lock-side hub-lock-phone');
    phoneH = right.appendChild(mk('h3', '', 'Or unlock with your phone'));
    qrBox = mk('div', 'hub-lock-qr');
    qrBox.setAttribute('role', 'img');
    qrBox.setAttribute('aria-label', 'QR code for the phone unlock page');
    right.appendChild(qrBox);
    qrNote = mk('p', 'hub-lock-qrnote');
    qrNote.setAttribute('aria-live', 'polite');
    right.appendChild(qrNote);
    wrap.append(left, right);
    el.appendChild(wrap);
    // pointer / menu events on the lock never reach the Hub's own handlers
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu',
      'touchstart', 'touchend', 'wheel', 'dragstart'].forEach((t) =>
      el.addEventListener(t, (e) => { if (t === 'contextmenu' || t === 'dragstart' || t === 'wheel') { if (e.cancelable) e.preventDefault(); } e.stopPropagation(); }, { passive: false }));
    return el;
  }
  function paintDots() {
    const d = dotsEl.children;
    for (let i = 0; i < d.length; i++) d[i].classList.toggle('on', i < entry.length);
  }
  function say(text, bad) { msgEl.textContent = text || ''; msgEl.classList.toggle('bad', !!bad); }
  /* H143: PIN pad shown / hidden (fingerprint only shows it after 'Use PIN') */
  function showPin(v) {
    pinShown = !!v;
    el.classList.toggle('hub-lock-pinhid', !pinShown);
    padEl.hidden = !pinShown; dotsEl.hidden = !pinShown;
    recoverEl.hidden = pinShown;
    const m = store.method();
    subEl.textContent = !pinShown ? 'Scan the QR code with your phone and use your fingerprint'
      : (m === 'finger' ? 'Enter your 4-digit PIN (recovery)' : 'Enter your 4-digit PIN');
    phoneH.textContent = m === 'finger' ? 'Unlock with your phone' : 'Or unlock with your phone';
  }
  function key(k) {
    if (!isLocked || busy || !pinShown) return;
    if (k === 'back') entry = entry.slice(0, -1);
    else if (k === 'clear') entry = '';
    else if (k === 'ok') { if (entry.length === 4) submit(); else say('Enter 4 digits', true); return; }
    else if (/^\d$/.test(k) && entry.length < 4) entry += k;
    paintDots();
    if (entry.length) say('');
    if (entry.length === 4) submit();
  }
  function submit() {
    const pin = entry;
    busy = true;
    el.classList.add('busy');
    say('Checking\u2026');
    store.verify(pin).then((ok) => ok, () => false).then((ok) => {
      busy = false;
      el.classList.remove('busy');
      entry = '';
      if (ok) { unlock(); return; }
      paintDots();
      say('Wrong PIN. Try again.', true);
      el.classList.remove('shake');
      void el.offsetWidth;   // restart the shake
      el.classList.add('shake');
    });
  }

  /* ---------- phone QR (PeerJS, lazy) ---------- */
  let peerLoading = null;
  function loadPeer() {
    if (window.Peer) return Promise.resolve(window.Peer);
    if (peerLoading) return peerLoading;
    peerLoading = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('shared/vendor/peerjs.min.js', document.baseURI).href;
      s.async = true;
      s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('PeerJS missing')));
      s.onerror = () => { peerLoading = null; reject(new Error('PeerJS load failed')); };
      (document.head || root).appendChild(s);
    });
    return peerLoading;
  }
  function drawQr(url) {
    qrBox.textContent = '';
    qrBox.classList.toggle('empty', !url);
    if (!url) return;
    try {
      if (typeof window.qrcode !== 'function') throw new Error('qrcode.js missing');
      const q = window.qrcode(0, 'M');
      q.addData(url);
      q.make();
      qrBox.innerHTML = q.createSvgTag(8, 32);
      qrBox.dataset.link = url;
    } catch (_) { qrBox.classList.add('empty'); qrNote.textContent = 'QR code unavailable. Use the keypad.'; }
  }
  const NOTES = {
    starting: 'Getting the phone code ready\u2026',
    ready: 'Scan with your phone camera, then type your PIN on the phone.',
    readyFinger: 'Scan with your phone camera, then touch the fingerprint sensor on the phone.',
    readyBoth: 'Scan with your phone camera, then use your fingerprint or type your PIN on the phone.',
    checking: 'Checking the answer from your phone\u2026',
    wrong: 'That did not unlock. Scan the new code to try again.',
    unlocked: 'Unlocked from your phone.',
    error: 'Phone unlock is not available right now. Retrying\u2026 Use the keypad meanwhile.',
    offline: 'No internet, so phone unlock is off. Use the keypad.',
    file: 'Phone unlock works when the Hub is opened from its web address. Use the keypad.'
  };
  function onState(s, info) {
    if (!isLocked || !qrNote) return;
    const m = store.method();
    qrNote.textContent = ((s === 'ready' && m !== 'pin' ? NOTES[m === 'finger' ? 'readyFinger' : 'readyBoth'] : NOTES[s]) || '') +
      (s === 'error' ? ' (Error code: ' + ((info && info.type) || 'unknown') + ')' : '');   // H143.1
    if (s === 'ready' && info && info.id) drawQr(C.unlockUrl(document.baseURI, info.id));
    else if (s !== 'checking' && s !== 'unlocked') drawQr('');
    if (s === 'wrong' && pinShown) say(m === 'pin' ? 'Wrong PIN from the phone.' : 'The phone did not unlock it.', true);
  }
  function startPhone() {
    if (!isLocked || session) return;
    if (!/^https?:$/.test(location.protocol)) { onState('file'); return; }
    if (navigator.onLine === false) { onState('offline'); return; }
    onState('starting');
    loadPeer().then((Peer) => {
      if (!isLocked || session) return;
      session = C.createSession({ Peer, verify: (pin) => store.verify(pin), onUnlock: unlock, onState,
        pinOk: () => store.method() !== 'finger',   // H143: fingerprint only = no PIN from the phone
        finger: () => (store.method() !== 'pin' ? { allow: store.keys().map((k) => k.credId) } : null),
        verifyAssert: (d, ch) => store.verifyAssert(d, ch, { origin: here ? here.origin : '', rpId: here ? here.hostname : '' }) });
      session.start();
    }, () => { onState('error', { type: 'peerjs-load' }); setTimeout(() => { if (isLocked && !session) startPhone(); }, 30000); });
  }
  function stopPhone() { if (session) { session.stop(true); session = null; } }
  window.addEventListener('online', () => { if (isLocked && !session) startPhone(); });
  window.addEventListener('offline', () => { if (isLocked) { stopPhone(); onState('offline'); } });

  /* ---------- lock / unlock ---------- */
  function lock() {
    if (!store.isOn()) { root.classList.remove('hub-locked'); return false; }
    build();
    if (!isLocked) {
      isLocked = true;
      priorFocus = document.activeElement;
      entry = ''; busy = false;
      showPin(store.method() !== 'finger');   // H143
      paintDots(); say('');
      if (el.parentNode !== root || root.lastElementChild !== el) root.appendChild(el);   // after <body>
      el.hidden = false;
      const b = document.body;
      if (b) { bodyWasInert = b.hasAttribute('inert'); b.setAttribute('inert', ''); }
      root.classList.add('hub-locked');
      grab();
      startPhone();
      try { window.dispatchEvent(new CustomEvent('hub-lock', { detail: { locked: true } })); } catch (_) { /* old browser */ }
    }
    return true;
  }
  function unlock() {
    if (!isLocked) { root.classList.remove('hub-locked'); return; }
    isLocked = false;
    stopPhone();
    entry = '';
    if (el) { el.hidden = true; if (document.activeElement === el || el.contains(document.activeElement)) document.activeElement.blur(); }
    const b = document.body;
    if (b && !bodyWasInert) b.removeAttribute('inert');
    root.classList.remove('hub-locked');
    if (priorFocus && priorFocus.isConnected && priorFocus.focus) { try { priorFocus.focus({ preventScroll: true }); } catch (_) { /* gone */ } }
    priorFocus = null;
    try { window.dispatchEvent(new CustomEvent('hub-lock', { detail: { locked: false } })); } catch (_) { /* old browser */ }
  }
  function grab() {
    if (!isLocked || !el) return;
    const a = document.activeElement;
    if (a && el.contains(a) && a !== el) return;
    const first = pinShown ? padEl && padEl.querySelector('button') : recoverEl;   // H143
    try { (first || el).focus({ preventScroll: true }); } catch (_) { el.focus(); }
  }
  const onPadButton = (t) => !!(t && t.tagName === 'BUTTON' && el && el.contains(t));
  function stopKey(e) {
    if (!isLocked) return;
    const k = e.key;
    const own = onPadButton(e.target);
    if (own && (k === 'Tab' || k === 'Enter' || k === ' ')) { e.stopImmediatePropagation(); return; }   // the pad's own buttons
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type !== 'keydown' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^\d$/.test(k)) key(k);
    else if (k === 'Backspace') key('back');
    else if (k === 'Escape' || k === 'Delete') key('clear');
    else if (k === 'Enter' && !pinShown) { showPin(true); grab(); }   // H143: Enter on the lock = Use PIN
    else if (k === 'Enter') key('ok');
  }
  ['keydown', 'keyup', 'keypress'].forEach((t) => window.addEventListener(t, stopKey, true));
  document.addEventListener('focusin', (e) => { if (isLocked && el && !el.contains(e.target)) grab(); }, true);
  window.addEventListener('blur', () => { if (isLocked) setTimeout(grab, 0); });

  /* a switch change never locks by itself (turning Activate on waits for the next load / Lock now); off opens up */
  function apply() { if (!store.isOn()) unlock(); }
  window.HubLock = {
    isOn: store.isOn, hasPin: store.hasPin, locked: () => isLocked,
    lockNow: () => lock(), apply, verify: store.verify,
    setPin: store.setPin, removePin: (cur) => store.removePin(cur).then((r) => { apply(); return r; }),
    // H143: phones + method (Settings › Screen lock); none of these turns the lock on
    keys: store.keys, method: store.method, methodReady: store.methodReady, setMethod: store.setMethod,
    addKey: store.addKey, removeKey: store.removeKey,
    setOn: (v, cur) => store.setOn(v, cur).then((r) => { apply(); return r; }),
    state: () => ({ on: store.isOn(), hasPin: store.hasPin(), locked: isLocked, phone: !!session, method: store.method(), phones: store.keys().length, pinShown })
  };
  // every load of the Hub page while Activate is on (no idle auto-lock)
  if (store.isOn()) lock(); else root.classList.remove('hub-locked');
  // the PIN removed / Activate turned off in another tab (both need the PIN there): open up here too
  window.addEventListener('storage', (e) => { if ((!e.key || e.key.indexOf('hub-lock.') === 0) && isLocked && !store.isOn()) unlock(); });
})();
