/*
 * Hub phone unlock (hub/core/hub_unlock.js, for unlock.html), H142 + H143. Reads the one-time code from the address,
 * connects to it over PeerJS and answers once. The code is dropped from the address bar once read.
 *
 *   unlock.html#hublock-<16 hex>     unlock (lock screen QR). The Hub sends {t:'hello', nonce} (H143: v:2 with
 *                                    pin / finger) and, with a fingerprint method, {t:'chal', challenge, allowCredentials}.
 *                                    The phone sends {t:'pin', pin, nonce} or (H143) {t:'assert', nonce, credId,
 *                                    authenticatorData, clientDataJSON, signature} after navigator.credentials.get.
 *   unlock.html#r:hublock-<16 hex>   H143 Add phone (Settings › Screen lock). The Hub sends {t:'reg', nonce, challenge,
 *                                    user, exclude}; the phone makes a platform passkey (rp.id = this hostname, ES256 /
 *                                    RS256, userVerification required, attestation none, residentKey discouraged) and
 *                                    sends {t:'cred', nonce, credId, spki, alg, clientDataJSON, name}.
 * The Hub answers {t:'result', ok} once. Nothing is stored on the phone except the passkey itself (in the phone).
 *
 * window.HubUnlockClient(opts) — the DOM-free part (Node tests use it with a fake Peer):
 *   opts { Peer, id, onState(state, info), timeoutMs (45 s), timers }   states: connecting, ready ({pin, finger,
 *   pinHidden}), chal ({challenge, allow}), reg ({challenge, user, exclude}), sending, ok, wrong, used, bad-id,
 *   failed ({why}). H143.1 why codes: timeout-server / timeout-computer / timeout-hello / timeout-answer (how far it
 *   got), a PeerJS error type (peer-unavailable, network, server-error, socket-error, webrtc, ...), closed-<phase>,
 *   link-<type>, disconnected, send, connect, peer-create, no-peerjs. The page shows it as "Error code: ...".
 *   Returns { connect(), retry() (Try again, same code), send(pin) → bool, sendAssert(msg) → bool, sendCred(msg) → bool, close() }.
 *   HubUnlockClient.parseHash(hash) → {mode:'unlock'|'reg', id}; createOptions(reg, host); getOptions(chal, host);
 *   credMsg(cred, name) / assertMsg(cred) → the message fields (base64url).
 */
(function (root) {
  'use strict';
  const C = root.HubLockCore;
  function HubUnlockClient(opts) {
    const o = opts || {};
    const T = o.timers || { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t) };
    const timeoutMs = o.timeoutMs > 0 ? o.timeoutMs : 45000;   // H143.1: 20 s was too short on mobile data
    const onState = o.onState || function () {};
    // H143.1: phase = how far it got (for the error code): server (PeerJS server) → computer (link to the computer)
    // → hello (linked, no greeting yet) → answer (sent, waiting for the result)
    let peer = null, conn = null, nonce = '', sent = false, done = false, timer = 0, phase = 'server', gen = 0;
    function closeThese(p, c) { try { if (c) c.close(); } catch (_) { /* gone */ } try { if (p) p.destroy(); } catch (_) { /* gone */ } }
    function finish(state, info) {
      if (done) return;
      done = true;
      if (timer) { T.clearTimeout(timer); timer = 0; }
      onState(state, info || {});
      const p = peer, c = conn;   // H143.1: only this try's peer, so a Try again is not cut off
      T.setTimeout(() => { closeThese(p, c); if (peer === p) peer = null; if (conn === c) conn = null; }, 1500);
    }
    const fail = (why) => finish('failed', { why: why });
    function arm() { timer = T.setTimeout(() => { timer = 0; fail('timeout-' + phase); }, timeoutMs); }
    function connect() {
      if (!C.validPeerId(o.id)) { done = true; onState('bad-id', {}); return; }
      const my = ++gen;
      done = false; sent = false; nonce = ''; phase = 'server'; conn = null;
      onState('connecting', {});
      arm();
      let p;
      try { p = new o.Peer({ debug: 0 }); } catch (_) { fail('peer-create'); return; }
      peer = p;
      p.on('error', (e) => { if (my === gen) fail((e && e.type) || 'peer-error'); });
      // H143.1: lost the PeerJS server before the link was made: try it once more (the data link does not need it)
      p.on('disconnected', () => {
        if (my !== gen || done || conn) return;
        try { if (typeof p.reconnect === 'function' && !p.destroyed) p.reconnect(); else fail('disconnected'); } catch (_) { fail('disconnected'); }
      });
      p.on('open', () => {
        if (my !== gen || done || conn) return;
        phase = 'computer';
        let c;
        try { c = p.connect(o.id, { reliable: true }); } catch (_) { fail('connect'); return; }
        if (!c) { fail('connect'); return; }
        conn = c;
        c.on('open', () => { if (my === gen && phase === 'computer') phase = 'hello'; });
        c.on('data', (d) => {
          if (my !== gen || done || !d || typeof d !== 'object') return;
          const fresh = typeof d.nonce === 'string' && !nonce;
          if (d.t === 'hello' && fresh) {
            nonce = d.nonce;
            if (timer) { T.clearTimeout(timer); timer = 0; }
            // H143.1: pinHidden = fingerprint only (the PIN is the hidden recovery, behind 'Use PIN instead')
            onState('ready', { pin: d.pin !== false, finger: d.finger === true, pinHidden: d.pinHidden === true });
          } else if (d.t === 'chal' && nonce && d.nonce === nonce && typeof d.challenge === 'string') {
            onState('chal', { challenge: d.challenge, allow: Array.isArray(d.allowCredentials) ? d.allowCredentials.filter((x) => typeof x === 'string') : [] });
          } else if (d.t === 'reg' && fresh && typeof d.challenge === 'string' && typeof d.user === 'string') {
            nonce = d.nonce;
            if (timer) { T.clearTimeout(timer); timer = 0; }
            onState('reg', { challenge: d.challenge, user: d.user, exclude: Array.isArray(d.exclude) ? d.exclude.filter((x) => typeof x === 'string') : [] });
          } else if (d.t === 'result') {
            if (d.ok === true) finish('ok');
            else finish(d.reason === 'used' ? 'used' : 'wrong', { reason: d.reason || '' });
          }
        });
        c.on('close', () => { if (my === gen && !done) fail('closed-' + phase); });
        c.on('error', (e) => { if (my === gen) fail('link-' + ((e && e.type) || 'error')); });
      });
    }
    /** H143.1: Try again after 'failed': a fresh phone peer to the same code (the computer's code may still be good) */
    function retry() {
      if (!done) return false;
      const p = peer, c = conn;
      peer = conn = null;
      closeThese(p, c);
      connect();
      return true;
    }
    function out(msg) {
      if (done || sent || !nonce || !conn) return false;
      sent = true;
      phase = 'answer';
      onState('sending', {});
      msg.nonce = nonce;
      try { conn.send(msg); } catch (_) { fail('send'); return false; }
      arm();
      return true;
    }
    function send(pin) { return C.validPin(pin) ? out({ t: 'pin', pin }) : false; }
    function sendAssert(m) { return m && typeof m === 'object' ? out({ t: 'assert', credId: m.credId, authenticatorData: m.authenticatorData, clientDataJSON: m.clientDataJSON, signature: m.signature }) : false; }
    function sendCred(m) { return m && typeof m === 'object' ? out({ t: 'cred', credId: m.credId, spki: m.spki, alg: m.alg, clientDataJSON: m.clientDataJSON, name: m.name }) : false; }
    function close() { gen++; closeThese(peer, conn); conn = peer = null; }
    return { connect, retry, send, sendAssert, sendCred, close };
  }

  /* ---------- H143: WebAuthn option builders + answers (pure; the Node tests check them) ---------- */
  const bytes = (b) => new Uint8Array(b instanceof ArrayBuffer ? b : (b && b.buffer ? b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) : b));
  HubUnlockClient.parseHash = function (hash) {
    const h = String(hash || '').replace(/^#/, '');
    if (h.indexOf('r:') === 0) return { mode: 'reg', id: h.slice(2) };
    return { mode: 'unlock', id: h };
  };
  HubUnlockClient.createOptions = function (reg, host) {
    return { publicKey: {
      rp: { id: host, name: 'Hub' },
      user: { id: C.unb64u(reg.user), name: 'hub-lock', displayName: 'Hub lock' },
      challenge: C.unb64u(reg.challenge),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged', requireResidentKey: false },
      attestation: 'none',
      excludeCredentials: (reg.exclude || []).map((id) => ({ type: 'public-key', id: C.unb64u(id) })),
      timeout: 60000
    } };
  };
  HubUnlockClient.getOptions = function (chal, host) {
    return { publicKey: {
      challenge: C.unb64u(chal.challenge),
      rpId: host,
      allowCredentials: (chal.allow || []).map((id) => ({ type: 'public-key', id: C.unb64u(id), transports: ['internal'] })),
      userVerification: 'required',
      timeout: 60000
    } };
  };
  HubUnlockClient.credMsg = function (cred, name) {
    const r = cred.response;
    const spki = r.getPublicKey ? r.getPublicKey() : null;
    if (!spki) throw new Error('no-public-key');
    return { credId: C.b64u(bytes(cred.rawId)), spki: C.b64u(bytes(spki)), alg: r.getPublicKeyAlgorithm(), clientDataJSON: C.b64u(bytes(r.clientDataJSON)), name: name || 'Phone' };
  };
  HubUnlockClient.assertMsg = function (cred) {
    const r = cred.response;
    return { credId: C.b64u(bytes(cred.rawId)), authenticatorData: C.b64u(bytes(r.authenticatorData)), clientDataJSON: C.b64u(bytes(r.clientDataJSON)), signature: C.b64u(bytes(r.signature)) };
  };
  root.HubUnlockClient = HubUnlockClient;
  if (typeof module === 'object' && module.exports) module.exports = HubUnlockClient;

  /* ---------- unlock.html ---------- */
  const doc = root.document;
  const form = doc && doc.getElementById && doc.getElementById('form');
  if (!form || !C) return;
  const pinEl = doc.getElementById('pin'), go = doc.getElementById('go'), msg = doc.getElementById('msg');
  const fp = doc.getElementById('fp'), title = doc.getElementById('title'), lead = doc.getElementById('lead');
  const codeEl = doc.getElementById('code'), again = doc.getElementById('again'), usePin = doc.getElementById('usepin');   // H143.1
  const where = HubUnlockClient.parseHash(root.location.hash);
  const id = where.id, isReg = where.mode === 'reg';
  try { root.history.replaceState(null, '', root.location.pathname); } catch (_) { /* keep */ }   // the code is one-time: not in history
  const canWebAuthn = !!(root.PublicKeyCredential && root.navigator && root.navigator.credentials && root.isSecureContext !== false);
  const TEXT = {
    connecting: ['Connecting to the computer\u2026', ''],
    ready: ['Connected. Type your PIN and tap Unlock.', ''],
    readyFinger: ['Connected. Tap "Unlock with fingerprint".', ''],
    readyBoth: ['Connected. Use your fingerprint, or tap "Use PIN instead".', ''],
    reg: ['Connected. Tap "Register this phone", then touch the fingerprint sensor.', ''],
    asking: ['Touch the fingerprint sensor\u2026', ''],
    sending: ['Checking\u2026', ''],
    ok: [isReg ? 'Phone added. You can close this page.' : 'Unlocked. You can close this page.', 'ok'],
    wrong: [isReg ? 'The computer did not accept this phone. Try Add phone again.' : 'That did not unlock. Scan the new QR code on the computer to try again.', 'bad'],
    used: ['This code was already used. Scan the new QR code on the computer.', 'bad'],
    failed: ['Could not reach the computer. Tap Try again, scan the QR code again, or use the keypad on the computer.', 'bad'],
    cancelled: ['Fingerprint cancelled or not available on this phone.', 'bad'],
    'no-webauthn': ['This browser cannot use the fingerprint here. Update Chrome, and open the Hub from its github.io address.', 'bad'],
    'bad-id': ['This page needs the QR code from the Hub. Scan it with your camera.', 'bad']
  };
  // H143.1: the error code under the message (Try again only after 'failed': the computer's code may still be good)
  const setCode = (why) => { if (!codeEl) return; codeEl.textContent = why ? 'Error code: ' + why : ''; codeEl.hidden = !why; };
  const show = (s, why) => { const t = TEXT[s] || ['', '']; msg.textContent = t[0]; msg.className = t[1]; setCode(s === 'failed' ? why || 'unknown' : (s === 'wrong' && why ? why : '')); if (again) again.hidden = s !== 'failed' || !root.Peer; };
  const ready = () => !pinEl.disabled && C.validPin(pinEl.value);
  let chal = null, reg = null, phoneName = 'Phone';
  // a friendly name for Settings (best effort; Chrome's reduced UA hides the model, so ask UA-CH)
  try {
    const ua = root.navigator.userAgent || '';
    phoneName = /Android/i.test(ua) ? 'Android phone' : (/iPhone|iPad/i.test(ua) ? 'iPhone' : 'Phone');
    const uad = root.navigator.userAgentData;
    if (uad && uad.getHighEntropyValues) uad.getHighEntropyValues(['model']).then((v) => { if (v && v.model) phoneName = v.model; }, () => {});
  } catch (_) { /* keep */ }
  if (isReg) {
    title.textContent = 'Add this phone to Hub';
    lead.textContent = 'Register this phone so it can unlock the Hub with your fingerprint.';
    form.hidden = true;
    fp.textContent = 'Register this phone';
  }
  const client = HubUnlockClient({ Peer: root.Peer, id, onState: (s, info) => {
    if (s === 'ready') {
      const pinOn = info.pin !== false;
      // H143.1: with a fingerprint method the PIN box waits behind "Use PIN instead" (fingerprint only: the recovery PIN)
      const behind = pinOn && info.finger;
      form.hidden = !pinOn || behind;
      if (usePin) usePin.hidden = !behind;
      if (!pinOn) lead.textContent = 'Use your fingerprint to unlock the Hub.';
      else if (info.finger) lead.textContent = info.pinHidden ? 'Use your fingerprint to unlock the Hub, or your 4-digit Hub PIN as a recovery.' : 'Use your fingerprint, or your 4-digit Hub PIN.';
      show(info.finger ? (pinOn ? 'readyBoth' : 'readyFinger') : 'ready');
      pinEl.disabled = !pinOn;
      go.disabled = !ready();
      if (pinOn && !info.finger) { try { pinEl.focus(); } catch (_) { /* ignore */ } }
      return;
    }
    if (s === 'chal') { chal = info; fp.hidden = false; fp.disabled = false; if (!canWebAuthn) { fp.disabled = true; show('no-webauthn'); } return; }
    if (s === 'reg') { reg = info; fp.hidden = false; fp.disabled = !canWebAuthn; show(canWebAuthn ? 'reg' : 'no-webauthn'); return; }
    show(s, s === 'failed' ? info.why : info.reason);
    pinEl.disabled = true; go.disabled = true; fp.disabled = true;
    if (usePin) usePin.hidden = true;
  } });
  if (usePin) usePin.addEventListener('click', () => {
    usePin.hidden = true; form.hidden = false;
    lead.textContent = 'Type your 4-digit Hub PIN.';
    try { pinEl.focus(); } catch (_) { /* ignore */ }
  });
  if (again) again.addEventListener('click', () => {
    again.hidden = true;
    chal = null; reg = null;
    fp.hidden = true; fp.disabled = true; pinEl.value = ''; pinEl.disabled = true; go.disabled = true;
    if (!isReg) form.hidden = false;
    client.retry();
  });
  pinEl.addEventListener('input', () => { pinEl.value = pinEl.value.replace(/\D/g, '').slice(0, 4); go.disabled = !ready(); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!ready()) return;
    const pin = pinEl.value;
    pinEl.value = '';
    pinEl.disabled = true; go.disabled = true; fp.disabled = true;
    client.send(pin);
  });
  fp.addEventListener('click', () => {
    if (fp.disabled || !canWebAuthn) return;
    fp.disabled = true;
    const host = root.location.hostname;
    show('asking');
    let p;
    try {
      p = isReg ? root.navigator.credentials.create(HubUnlockClient.createOptions(reg, host))
        : root.navigator.credentials.get(HubUnlockClient.getOptions(chal, host));
    } catch (_) { p = Promise.reject(new Error('webauthn')); }
    Promise.resolve(p).then((cred) => {
      if (!cred) throw new Error('none');
      pinEl.disabled = true; go.disabled = true;
      if (usePin) usePin.hidden = true;
      if (isReg) client.sendCred(HubUnlockClient.credMsg(cred, phoneName));
      else client.sendAssert(HubUnlockClient.assertMsg(cred));
    }).catch((err) => { show('cancelled'); setCode(err && err.name ? err.name : ''); fp.disabled = false; });   // the try is not used: tap again
  });
  if (!root.Peer) show('failed', 'no-peerjs'); else client.connect();
})(typeof window !== 'undefined' ? window : globalThis);
