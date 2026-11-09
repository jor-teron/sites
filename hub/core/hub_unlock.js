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
 *   opts { Peer, id, onState(state, info), timeoutMs, timers }   states: connecting, ready ({pin, finger}),
 *   chal ({challenge, allow}), reg ({challenge, user, exclude}), sending, ok, wrong, used, failed, bad-id.
 *   Returns { connect(), send(pin) → bool, sendAssert(msg) → bool, sendCred(msg) → bool, close() }.
 *   HubUnlockClient.parseHash(hash) → {mode:'unlock'|'reg', id}; createOptions(reg, host); getOptions(chal, host);
 *   credMsg(cred, name) / assertMsg(cred) → the message fields (base64url).
 */
(function (root) {
  'use strict';
  const C = root.HubLockCore;
  function HubUnlockClient(opts) {
    const o = opts || {};
    const T = o.timers || { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t) };
    const timeoutMs = o.timeoutMs > 0 ? o.timeoutMs : 20000;
    const onState = o.onState || function () {};
    let peer = null, conn = null, nonce = '', sent = false, done = false, timer = 0;
    function finish(state, info) {
      if (done) return;
      done = true;
      if (timer) { T.clearTimeout(timer); timer = 0; }
      onState(state, info || {});
      T.setTimeout(close, 1500);
    }
    function connect() {
      if (!C.validPeerId(o.id)) { done = true; onState('bad-id', {}); return; }
      onState('connecting', {});
      timer = T.setTimeout(() => { timer = 0; finish('failed', { why: 'timeout' }); }, timeoutMs);
      try { peer = new o.Peer({ debug: 0 }); } catch (_) { finish('failed', { why: 'peer' }); return; }
      peer.on('error', (e) => finish('failed', { why: (e && e.type) || 'error' }));
      peer.on('open', () => {
        if (done) return;
        conn = peer.connect(o.id, { reliable: true });
        conn.on('data', (d) => {
          if (done || !d || typeof d !== 'object') return;
          const fresh = typeof d.nonce === 'string' && !nonce;
          if (d.t === 'hello' && fresh) {
            nonce = d.nonce;
            if (timer) { T.clearTimeout(timer); timer = 0; }
            onState('ready', { pin: d.pin !== false, finger: d.finger === true });
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
        conn.on('close', () => { if (!done) finish('failed', { why: 'closed' }); });
        conn.on('error', () => finish('failed', { why: 'conn' }));
      });
    }
    function out(msg) {
      if (done || sent || !nonce || !conn) return false;
      sent = true;
      onState('sending', {});
      msg.nonce = nonce;
      try { conn.send(msg); } catch (_) { finish('failed', { why: 'send' }); return false; }
      timer = T.setTimeout(() => { timer = 0; finish('failed', { why: 'timeout' }); }, timeoutMs);
      return true;
    }
    function send(pin) { return C.validPin(pin) ? out({ t: 'pin', pin }) : false; }
    function sendAssert(m) { return m && typeof m === 'object' ? out({ t: 'assert', credId: m.credId, authenticatorData: m.authenticatorData, clientDataJSON: m.clientDataJSON, signature: m.signature }) : false; }
    function sendCred(m) { return m && typeof m === 'object' ? out({ t: 'cred', credId: m.credId, spki: m.spki, alg: m.alg, clientDataJSON: m.clientDataJSON, name: m.name }) : false; }
    function close() { try { if (conn) conn.close(); } catch (_) { /* gone */ } try { if (peer) peer.destroy(); } catch (_) { /* gone */ } conn = peer = null; }
    return { connect, send, sendAssert, sendCred, close };
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
  const where = HubUnlockClient.parseHash(root.location.hash);
  const id = where.id, isReg = where.mode === 'reg';
  try { root.history.replaceState(null, '', root.location.pathname); } catch (_) { /* keep */ }   // the code is one-time: not in history
  const canWebAuthn = !!(root.PublicKeyCredential && root.navigator && root.navigator.credentials && root.isSecureContext !== false);
  const TEXT = {
    connecting: ['Connecting to the computer\u2026', ''],
    ready: ['Connected. Type your PIN and tap Unlock.', ''],
    readyFinger: ['Connected. Tap "Unlock with fingerprint".', ''],
    readyBoth: ['Connected. Use your fingerprint, or type your PIN and tap Unlock.', ''],
    reg: ['Connected. Tap "Register this phone", then touch the fingerprint sensor.', ''],
    asking: ['Touch the fingerprint sensor\u2026', ''],
    sending: ['Checking\u2026', ''],
    ok: [isReg ? 'Phone added. You can close this page.' : 'Unlocked. You can close this page.', 'ok'],
    wrong: [isReg ? 'The computer did not accept this phone. Try Add phone again.' : 'That did not unlock. Scan the new QR code on the computer to try again.', 'bad'],
    used: ['This code was already used. Scan the new QR code on the computer.', 'bad'],
    failed: ['Could not reach the computer. Scan the QR code again, or use the keypad on the computer.', 'bad'],
    cancelled: ['Fingerprint cancelled or not available on this phone.', 'bad'],
    'no-webauthn': ['This browser cannot use the fingerprint here. Update Chrome, and open the Hub from its github.io address.', 'bad'],
    'bad-id': ['This page needs the QR code from the Hub. Scan it with your camera.', 'bad']
  };
  const show = (s) => { const t = TEXT[s] || ['', '']; msg.textContent = t[0]; msg.className = t[1]; };
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
      form.hidden = !pinOn;
      if (!pinOn) lead.textContent = 'Use your fingerprint to unlock the Hub.';
      else if (info.finger) lead.textContent = 'Use your fingerprint, or type your 4-digit Hub PIN.';
      show(info.finger ? (pinOn ? 'readyBoth' : 'readyFinger') : 'ready');
      pinEl.disabled = !pinOn;
      go.disabled = !ready();
      if (pinOn && !info.finger) { try { pinEl.focus(); } catch (_) { /* ignore */ } }
      return;
    }
    if (s === 'chal') { chal = info; fp.hidden = false; fp.disabled = false; if (!canWebAuthn) { fp.disabled = true; show('no-webauthn'); } return; }
    if (s === 'reg') { reg = info; fp.hidden = false; fp.disabled = !canWebAuthn; show(canWebAuthn ? 'reg' : 'no-webauthn'); return; }
    show(s);
    pinEl.disabled = true; go.disabled = true; fp.disabled = true;
  } });
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
      if (isReg) client.sendCred(HubUnlockClient.credMsg(cred, phoneName));
      else client.sendAssert(HubUnlockClient.assertMsg(cred));
    }).catch(() => { show('cancelled'); fp.disabled = false; });   // the try is not used: tap again
  });
  if (!root.Peer) show('failed'); else client.connect();
})(typeof window !== 'undefined' ? window : globalThis);
