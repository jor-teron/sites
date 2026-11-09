/*
 * Hub PIN lock, core (hub/core/hub_lock_core.js), H142. No DOM: the PIN record, the hash, the switch and
 * the one-time phone session. hub/core/hub_lock.js draws the lock screen; Settings › Screen lock
 * (apps/system/settings/sec_lock.js) and the phone page (unlock.html + hub/core/hub_unlock.js) use it too.
 *
 * Desktop mode only (desktop/desktop.html). OFF by default: setting a PIN never turns the lock on; only the
 * separate Activate switch does, and it can only go on while a PIN exists. Removing the PIN turns it off.
 *
 * localStorage keys (this device only: outside 'sites-hub.', so never in a profile, a sync or a HubPrefs wake-up):
 *   hub-lock.pin  JSON {v:1, salt, iter, hash}: PBKDF2-SHA-256 (WebCrypto) of the 4-digit PIN with a random
 *                 16-byte salt, 'iter' rounds, 32-byte hash; salt / hash base64. The PIN itself is never stored.
 *   hub-lock.on   '1' = Activate on; '' / missing = off (default). Ignored while there is no PIN.
 *   hub-lock.method  H143: '' / missing = 'pin' (default), 'finger' (fingerprint only, the PIN stays as a hidden
 *                 recovery on the lock screen) or 'both' (either unlocks). 'finger' / 'both' need >= 1 phone; with no
 *                 phone left the method reads as 'pin' (removing the last phone also writes it back to '').
 *   hub-lock.keys    H143: JSON [{credId, alg, spki, signCount, name, added}]: phone passkeys (public keys only).
 * No attempt limit / lockout in H142 / H143 (a later release).
 *
 * H143 fingerprint (WebAuthn via the phone): the phone page (same origin, rp.id = location.hostname) makes a
 * platform passkey (ES256 -7 or RS256 -257, userVerification required, attestation none) and sends its public key
 * (SPKI) + clientDataJSON; verifyRegistration checks type / challenge / origin and imports the key. To unlock the
 * Hub sends {t:'chal', challenge, allowCredentials}; the phone answers {t:'assert', ...}; verifyAssertion checks
 * type, the one-time challenge, origin, rpIdHash = SHA-256(hostname), UP + UV flags, signCount, and the signature
 * over authData || SHA-256(clientDataJSON) (WebCrypto ECDSA P-256 / RSASSA-PKCS1-v1_5, SHA-256). Verify only.
 *
 * Phone session (createSession): the lock screen opens a PeerJS peer 'hublock-' + 16 random hex and shows a QR of
 * <site>/unlock.html#<id>. The phone connects, gets {t:'hello', v:1, nonce}, sends {t:'pin', pin, nonce}; the
 * Hub answers {t:'result', ok} once. Every ID takes ONE PIN attempt: later messages / connections get
 * {t:'result', ok:false, reason:'used'}; then the peer is destroyed and a fresh ID made (and every ~2 minutes).
 * Chrome 109 (Windows 8) safe: no very new JS.
 *
 * API window.HubLockCore (also module.exports for the Node tests):
 *   KEYS, ITER, validPin(p), hashPin(pin, opts) → Promise<rec>, verifyRec(pin, rec) → Promise<bool>,
 *   create({ storage, crypto }) → store { hasPin(), isOn(), record(), verify(pin), setPin(newPin, curPin),
 *     removePin(curPin), setOn(v, curPin) }   (async ones resolve { ok, error })
 *   newPeerId(crypto), randomHex(n, crypto), validPeerId(id), unlockUrl(base, id),
 *   createSession({ Peer, verify, onUnlock, onState, refreshMs, settleMs, timers, crypto,
 *     pinOk(), finger() → {allow:[credId]} | null, verifyAssert(msg, challenge) })        (H143: fingerprint)
 *   createRegSession({ Peer, onCred(msg, challenge) → Promise<{ok, error}>, exclude(), onDone, onState, ... })   (H143)
 *   H143: METHODS, b64u(bytes), unb64u(str), derToRaw(der, n), parseAuthData(bytes), challenges(),
 *     verifyRegistration(msg, {challenge, origin, crypto, now}) → Promise<{ok, rec | error}>,
 *     verifyAssertion(msg, {challenge, origin, rpId, keys, crypto}) → Promise<{ok, credId, signCount | error}>
 *   store (H143) + keys(), method(), methodReady(m), setMethod(m, cur), addKey(rec, cur), removeKey(credId, cur),
 *     verifyAssert(msg, challenge, {origin, rpId}) (saves the new signCount)
 */
(function (root) {
  'use strict';
  const KEYS = { pin: 'hub-lock.pin', on: 'hub-lock.on', method: 'hub-lock.method', keys: 'hub-lock.keys' };
  const METHODS = ['pin', 'finger', 'both'];
  const MAX_KEYS = 10;
  const ITER = 150000;
  const SALT_BYTES = 16;
  const HASH_BITS = 256;
  const PEER_RE = /^hublock-[0-9a-f]{16}$/;

  const cryptoOf = (c) => c || (root && root.crypto) || null;
  const validPin = (p) => typeof p === 'string' && /^\d{4}$/.test(p);
  const validPeerId = (id) => typeof id === 'string' && PEER_RE.test(id);

  function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
  }
  function unb64(str) {
    const s = typeof atob === 'function' ? atob(str) : Buffer.from(str, 'base64').toString('binary');
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  }
  function randomBytes(n, c) {
    const cr = cryptoOf(c);
    if (!cr || !cr.getRandomValues) throw new Error('no-random');
    const a = new Uint8Array(n);
    cr.getRandomValues(a);
    return a;
  }
  function randomHex(n, c) {
    const a = randomBytes(n, c);
    let s = '';
    for (let i = 0; i < a.length; i++) s += (a[i] < 16 ? '0' : '') + a[i].toString(16);
    return s;
  }
  const newPeerId = (c) => 'hublock-' + randomHex(8, c);
  function unlockUrl(base, id) { return new URL('unlock.html', base).href.replace(/[?#].*$/, '') + '#' + id; }
  function regUrl(base, id) { return new URL('unlock.html', base).href.replace(/[?#].*$/, '') + '#r:' + id; }   // H143: Add phone

  async function derive(pin, salt, iter, c) {
    const cr = cryptoOf(c);
    if (!cr || !cr.subtle) throw new Error('no-webcrypto');
    const key = await cr.subtle.importKey('raw', new TextEncoder().encode(pin), { name: 'PBKDF2' }, false, ['deriveBits']);
    const bits = await cr.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, HASH_BITS);
    return new Uint8Array(bits);
  }
  /** a new record for this PIN: { v:1, salt, iter, hash } */
  async function hashPin(pin, opts) {
    const o = opts || {};
    if (!validPin(pin)) throw new Error('bad-pin');
    const iter = o.iter > 0 ? o.iter : ITER;
    const salt = randomBytes(SALT_BYTES, o.crypto);
    const hash = await derive(pin, salt, iter, o.crypto);
    return { v: 1, salt: b64(salt), iter, hash: b64(hash) };
  }
  function goodRec(r) {
    return !!r && typeof r === 'object' && r.v === 1 && typeof r.salt === 'string' && typeof r.hash === 'string' &&
      Number.isFinite(r.iter) && r.iter >= 1000 && r.iter <= 10000000;
  }
  async function verifyRec(pin, rec, c) {
    if (!validPin(pin) || !goodRec(rec)) return false;
    let want, got;
    try { want = unb64(rec.hash); got = await derive(pin, unb64(rec.salt), rec.iter, c); } catch (_) { return false; }
    if (want.length !== got.length) return false;
    let diff = 0;
    for (let i = 0; i < want.length; i++) diff |= want[i] ^ got[i];   // same time for every wrong PIN
    return diff === 0;
  }

  /* ---------- the stored PIN + switch ---------- */
  function create(opts) {
    const o = opts || {};
    const st = o.storage || (function () { try { return root.localStorage; } catch (_) { return null; } })();
    const c = o.crypto;
    const iter = o.iter;
    const get = (k) => { try { return (st && st.getItem(k)) || ''; } catch (_) { return ''; } };
    const put = (k, v) => { try { if (v) st.setItem(k, v); else st.removeItem(k); } catch (_) { /* blocked */ } };
    function record() { try { const r = JSON.parse(get(KEYS.pin) || 'null'); return goodRec(r) ? r : null; } catch (_) { return null; } }
    const hasPin = () => !!record();
    const isOn = () => get(KEYS.on) === '1' && hasPin();
    const verify = (pin) => { const r = record(); return r ? verifyRec(pin, r, c) : Promise.resolve(false); };
    async function needCurrent(cur) {
      if (!hasPin()) return null;
      if (!validPin(cur)) return 'need-current';
      return (await verify(cur)) ? null : 'wrong-current';
    }
    /** set (no PIN yet) or change (needs the current PIN). Never turns the lock on. */
    async function setPin(pin, cur) {
      if (!validPin(pin)) return { ok: false, error: 'bad-pin' };
      const e = await needCurrent(cur);
      if (e) return { ok: false, error: e };
      let rec;
      try { rec = await hashPin(pin, { crypto: c, iter }); } catch (err) { return { ok: false, error: err && err.message === 'no-webcrypto' ? 'no-webcrypto' : 'hash-failed' }; }
      put(KEYS.pin, JSON.stringify(rec));
      if (!hasPin()) return { ok: false, error: 'storage' };
      return { ok: true };
    }
    /** remove the PIN (needs it); the lock goes off with it. H143: the phones and the method go too (they hang on the PIN) */
    async function removePin(cur) {
      if (!hasPin()) { put(KEYS.on, ''); return { ok: true }; }
      const e = await needCurrent(cur);
      if (e) return { ok: false, error: e };
      put(KEYS.on, ''); put(KEYS.pin, ''); put(KEYS.method, ''); put(KEYS.keys, '');
      return { ok: true };
    }
    /* ---- H143: phones (passkeys) + method ---- */
    function keys() {
      try { const a = JSON.parse(get(KEYS.keys) || '[]'); return Array.isArray(a) ? a.filter(goodKey) : []; } catch (_) { return []; }
    }
    const putKeys = (a) => put(KEYS.keys, a.length ? JSON.stringify(a) : '');
    /** the method in force: a stored 'finger' / 'both' with no phone (or no PIN) reads as 'pin' */
    function method() {
      const m = get(KEYS.method);
      return (m === 'finger' || m === 'both') && hasPin() && keys().length ? m : 'pin';
    }
    function methodReady(m) {
      if (m === 'pin') return hasPin();
      if (m === 'finger' || m === 'both') return hasPin() && keys().length > 0;   // fingerprint only still needs the PIN (recovery)
      return false;
    }
    /** PIN only / fingerprint only / both. Needs the current PIN; never touches Activate */
    async function setMethod(m, cur) {
      if (METHODS.indexOf(m) < 0) return { ok: false, error: 'bad-method' };
      if (!hasPin()) return { ok: false, error: 'no-pin' };
      if (!methodReady(m)) return { ok: false, error: 'no-phone' };
      const e = await needCurrent(cur);
      if (e) return { ok: false, error: e };
      put(KEYS.method, m === 'pin' ? '' : m);
      return method() === m ? { ok: true } : { ok: false, error: 'storage' };
    }
    /** save a verified phone key (from verifyRegistration). Needs the current PIN; never turns the lock on */
    async function addKey(rec, cur) {
      if (!hasPin()) return { ok: false, error: 'no-pin' };
      if (!goodKey(rec)) return { ok: false, error: 'bad-key' };
      const e = await needCurrent(cur);
      if (e) return { ok: false, error: e };
      const list = keys();
      if (list.some((k) => k.credId === rec.credId)) return { ok: false, error: 'dup-key' };
      if (list.length >= MAX_KEYS) return { ok: false, error: 'too-many' };
      list.push({ credId: rec.credId, alg: rec.alg, spki: rec.spki, signCount: rec.signCount >>> 0, name: cleanName(rec.name), added: +rec.added || 0 });
      putKeys(list);
      return keys().length === list.length ? { ok: true } : { ok: false, error: 'storage' };
    }
    /** remove a phone (needs the PIN). The last phone gone while the method is fingerprint / both → back to PIN */
    async function removeKey(credId, cur) {
      const list = keys();
      if (!list.some((k) => k.credId === credId)) return { ok: false, error: 'no-key' };
      const e = await needCurrent(cur);
      if (e) return { ok: false, error: e };
      const left = list.filter((k) => k.credId !== credId);
      putKeys(left);
      let fellBack = false;
      if (!left.length && get(KEYS.method)) { put(KEYS.method, ''); fellBack = true; }
      return { ok: true, fellBack };
    }
    /** check a phone's fingerprint answer against the saved keys; a good one saves the new signCount */
    async function verifyAssert(msg, challenge, where) {
      const w = where || {};
      if (method() === 'pin') return { ok: false, error: 'method' };
      const r = await verifyAssertion(msg, { challenge, origin: w.origin, rpId: w.rpId, keys: keys(), crypto: c });
      if (r.ok) {
        const list = keys();
        list.forEach((k) => { if (k.credId === r.credId) k.signCount = r.signCount; });
        putKeys(list);
      }
      return r;
    }
    /** Activate: on needs a PIN to exist (H143: and the chosen method set up); off needs the current PIN */
    async function setOn(v, cur) {
      if (v) {
        if (!hasPin()) return { ok: false, error: 'no-pin' };
        if (!methodReady(method())) return { ok: false, error: 'not-ready' };
        put(KEYS.on, '1');
        return get(KEYS.on) === '1' ? { ok: true } : { ok: false, error: 'storage' };
      }
      if (get(KEYS.on) !== '1') return { ok: true };
      const e = await needCurrent(cur);
      if (e) return { ok: false, error: e };
      put(KEYS.on, '');
      return { ok: true };
    }
    return { hasPin, isOn, record, verify, setPin, removePin, setOn,
      keys, method, methodReady, setMethod, addKey, removeKey, verifyAssert };
  }


  /* ---------- H143: WebAuthn (verify only; Chrome 109 safe) ---------- */
  function b64u(bytes) { return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(str) {
    if (typeof str !== 'string' || !/^[A-Za-z0-9_-]*$/.test(str) || str.length % 4 === 1) throw new Error('bad-b64');
    let t = str.replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    return unb64(t);
  }
  function utf8(bytes) {
    if (typeof TextDecoder === 'function') return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return Buffer.from(bytes).toString('utf8');
  }
  function sameBytes(a, b) {
    if (a.length !== b.length) return false;
    let d = 0;
    for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
    return d === 0;
  }
  function cleanName(n) {
    const t = typeof n === 'string' ? n.replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    return t || 'Phone';
  }
  function goodKey(k) {
    return !!k && typeof k === 'object' && typeof k.credId === 'string' && /^[A-Za-z0-9_-]{16,1400}$/.test(k.credId) &&
      (k.alg === -7 || k.alg === -257) && typeof k.spki === 'string' && /^[A-Za-z0-9_-]{40,2000}$/.test(k.spki) &&
      Number.isFinite(k.signCount) && k.signCount >= 0;
  }
  /** ASN.1 DER ECDSA signature → raw r || s (n bytes each), as WebCrypto wants */
  function derToRaw(der, n) {
    const size = n || 32;
    let i = 0;
    const len = () => {
      if (i >= der.length) throw new Error('bad-der');
      let l = der[i++];
      if (l & 0x80) {
        const nb = l & 0x7f;
        if (nb < 1 || nb > 2) throw new Error('bad-der');
        l = 0;
        for (let k = 0; k < nb; k++) { if (i >= der.length) throw new Error('bad-der'); l = (l << 8) | der[i++]; }
      }
      return l;
    };
    if (der[i++] !== 0x30) throw new Error('bad-der');
    const total = len();
    if (i + total !== der.length) throw new Error('bad-der');
    const out = new Uint8Array(size * 2);
    for (let part = 0; part < 2; part++) {
      if (der[i++] !== 0x02) throw new Error('bad-der');
      const l = len();
      if (l < 1 || i + l > der.length) throw new Error('bad-der');
      let v = der.subarray(i, i + l);
      i += l;
      let z = 0;
      while (z < v.length - 1 && v[z] === 0) z++;   // the sign byte / leading zeros
      v = v.subarray(z);
      if (v.length > size) throw new Error('bad-der');
      out.set(v, part * size + (size - v.length));   // short r / s: zero-pad on the left
    }
    if (i !== der.length) throw new Error('bad-der');
    return out;
  }
  /** authenticatorData: rpIdHash(32) | flags(1) | signCount(4, big-endian) | ... */
  function parseAuthData(a) {
    if (!a || a.length < 37) throw new Error('bad-authdata');
    return { rpIdHash: a.subarray(0, 32), flags: a[32], up: !!(a[32] & 0x01), uv: !!(a[32] & 0x04),
      signCount: ((a[33] << 24) | (a[34] << 16) | (a[35] << 8) | a[36]) >>> 0 };
  }
  /** one-time challenges: issue() a fresh one, take(ch) is true once for an issued one */
  function challenges(c) {
    const open = Object.create(null);
    return {
      issue() { const ch = b64u(randomBytes(32, c)); open[ch] = 1; return ch; },
      take(ch) { if (typeof ch !== 'string' || !open[ch]) return false; delete open[ch]; return true; },
      drop(ch) { if (typeof ch === 'string') delete open[ch]; }
    };
  }
  function checkClient(cdj, type, challenge, origin) {
    let cd;
    try { cd = JSON.parse(utf8(cdj)); } catch (_) { return 'bad-client-data'; }
    if (!cd || typeof cd !== 'object') return 'bad-client-data';
    if (cd.type !== type) return 'bad-type';
    if (typeof challenge !== 'string' || !challenge || cd.challenge !== challenge) return 'bad-challenge';
    if (!origin || cd.origin !== origin) return 'bad-origin';
    if (cd.crossOrigin === true) return 'bad-origin';
    return '';
  }
  const ALGS = { '-7': { name: 'ECDSA', namedCurve: 'P-256' }, '-257': { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' } };
  function importKey(rec, cr) { return cr.subtle.importKey('spki', unb64u(rec.spki), ALGS[String(rec.alg)], false, ['verify']); }
  /** registration: msg {credId, spki, alg, clientDataJSON, name} from the phone */
  async function verifyRegistration(msg, exp) {
    const e = exp || {};
    const cr = cryptoOf(e.crypto);
    if (!cr || !cr.subtle) return { ok: false, error: 'no-webcrypto' };
    if (!msg || typeof msg !== 'object') return { ok: false, error: 'bad-msg' };
    if (msg.alg !== -7 && msg.alg !== -257) return { ok: false, error: 'bad-alg' };
    let cdj;
    try { cdj = unb64u(msg.clientDataJSON); unb64u(msg.credId); unb64u(msg.spki); } catch (_) { return { ok: false, error: 'bad-msg' }; }
    const why = checkClient(cdj, 'webauthn.create', e.challenge, e.origin);
    if (why) return { ok: false, error: why };
    const rec = { credId: msg.credId, alg: msg.alg, spki: msg.spki, signCount: 0, name: cleanName(msg.name), added: e.now || Date.now() };
    if (!goodKey(rec)) return { ok: false, error: 'bad-key' };
    try { await importKey(rec, cr); } catch (_) { return { ok: false, error: 'bad-key' }; }
    return { ok: true, rec };
  }
  /** unlock: msg {credId, authenticatorData, clientDataJSON, signature} (base64url) against the saved keys */
  async function verifyAssertion(msg, exp) {
    const e = exp || {};
    const cr = cryptoOf(e.crypto);
    if (!cr || !cr.subtle) return { ok: false, error: 'no-webcrypto' };
    if (!msg || typeof msg !== 'object') return { ok: false, error: 'bad-msg' };
    const rec = (e.keys || []).filter((k) => goodKey(k) && k.credId === msg.credId)[0];
    if (!rec) return { ok: false, error: 'unknown-key' };
    let ad, cdj, sig, info;
    try { ad = unb64u(msg.authenticatorData); cdj = unb64u(msg.clientDataJSON); sig = unb64u(msg.signature); info = parseAuthData(ad); } catch (_) { return { ok: false, error: 'bad-msg' }; }
    const why = checkClient(cdj, 'webauthn.get', e.challenge, e.origin);
    if (why) return { ok: false, error: why };
    if (!e.rpId) return { ok: false, error: 'bad-rpid' };
    const rpHash = new Uint8Array(await cr.subtle.digest('SHA-256', new TextEncoder().encode(e.rpId)));
    if (!sameBytes(rpHash, info.rpIdHash)) return { ok: false, error: 'bad-rpid' };
    if (!info.up) return { ok: false, error: 'no-up' };
    if (!info.uv) return { ok: false, error: 'no-uv' };
    const was = rec.signCount >>> 0;
    if (!(info.signCount > was || (info.signCount === 0 && was === 0))) return { ok: false, error: 'sign-count' };
    const cdHash = new Uint8Array(await cr.subtle.digest('SHA-256', cdj));
    const data = new Uint8Array(ad.length + cdHash.length);
    data.set(ad, 0); data.set(cdHash, ad.length);
    let ok = false;
    try {
      const key = await importKey(rec, cr);
      if (rec.alg === -7) ok = await cr.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(sig, 32), data);
      else ok = await cr.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, sig, data);
    } catch (_) { ok = false; }
    return ok ? { ok: true, credId: rec.credId, signCount: info.signCount } : { ok: false, error: 'bad-signature' };
  }

  /* ---------- one-time phone session over PeerJS ---------- */
  // oneTimeHost: one PeerJS ID that takes ONE attempt (any kind), then a fresh ID (or the end after a success).
  // proto.greet(cur) → messages sent to each new connection; proto.handle(d, cur) → null (not ours: ignored) |
  // { reply } (answered, no attempt used) | { check: () → Promise<bool | {ok, reason}> }. cur = { id, nonce, challenge }.
  function oneTimeHost(o, proto) {
    const T = o.timers || { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t) };
    const refreshMs = o.refreshMs > 0 ? o.refreshMs : 120000;
    const settleMs = o.settleMs >= 0 ? o.settleMs : 600;   // let the reply reach the phone before the peer goes
    const retryMs = o.retryMs > 0 ? o.retryMs : 15000;
    const onState = o.onState || function () {};
    const book = challenges(o.crypto);
    let peer = null, id = '', nonce = '', challenge = '', used = false, stopped = true, refreshT = 0, retryT = 0, gen = 0;
    const ids = [];   // every ID this session used (tests)
    function clearTimers() { if (refreshT) T.clearTimeout(refreshT); if (retryT) T.clearTimeout(retryT); refreshT = retryT = 0; }
    function drop() {
      clearTimers();
      const p = peer; peer = null;
      if (p) { try { p.destroy(); } catch (_) { /* gone */ } }
    }
    function send(conn, msg) { try { conn.send(msg); } catch (_) { /* closed */ } }
    function start() {
      stopped = false;
      drop();
      const my = ++gen;
      used = false;
      book.drop(challenge);
      try { id = newPeerId(o.crypto); nonce = randomHex(16, o.crypto); challenge = book.issue(); } catch (_) { onState('error', { type: 'no-random' }); return; }
      ids.push(id);
      let p;
      try { p = new o.Peer(id, { debug: 0 }); } catch (err) { onState('error', { type: 'peer' }); retry(my); return; }
      peer = p;
      onState('starting', { id });
      p.on('open', () => { if (my === gen) onState('ready', { id }); });
      p.on('error', (err) => {
        if (my !== gen) return;
        const type = (err && err.type) || 'error';
        if (type === 'peer-unavailable') return;   // a phone that went away; not ours
        onState('error', { type });
        if (type === 'unavailable-id') { start(); return; }
        retry(my);
      });
      p.on('disconnected', () => { if (my === gen && !used) { onState('error', { type: 'disconnected' }); retry(my); } });
      p.on('connection', (conn) => accept(conn, my));
      refreshT = T.setTimeout(() => { refreshT = 0; if (my === gen && !used && !stopped) start(); }, refreshMs);
    }
    function retry(my) {
      if (stopped || retryT) return;
      retryT = T.setTimeout(() => { retryT = 0; if (my === gen && !stopped) start(); }, retryMs);
    }
    function accept(conn, my) {
      const reject = () => { send(conn, { t: 'result', ok: false, reason: 'used' }); T.setTimeout(() => { try { conn.close(); } catch (_) { /* gone */ } }, settleMs); };
      conn.on('open', () => {
        if (my !== gen || used || stopped) { reject(); return; }
        proto.greet({ id, nonce, challenge }).forEach((m) => send(conn, m));
      });
      conn.on('data', (d) => {
        if (!d || typeof d !== 'object') return;
        const cur = { id, nonce, challenge };
        const h = proto.handle(d, cur);
        if (!h) return;
        if (my !== gen || used || stopped) { reject(); return; }
        if (d.nonce !== nonce) { send(conn, { t: 'result', ok: false, reason: 'nonce' }); return; }   // not this session's hello: no attempt used
        if (h.reply) { send(conn, h.reply); return; }
        used = true;   // this ID has had its one try
        clearTimers();
        onState('checking', { id });
        Promise.resolve().then(h.check).then((r) => (r === true ? { ok: true } : (r && r.ok === true ? r : { ok: false, reason: (r && r.reason) || '' })),
          () => ({ ok: false, reason: '' })).then((r) => {
          const ok = r.ok === true;
          const out = { t: 'result', ok };
          if (!ok && r.reason && proto.reasons) out.reason = r.reason;
          send(conn, out);
          onState(ok ? (proto.okState || 'unlocked') : 'wrong', { id, reason: r.reason || '' });
          if (ok && o.onUnlock) o.onUnlock();
          if (ok && o.onDone) o.onDone(r);
          T.setTimeout(() => {
            if (my !== gen) return;
            if (ok || stopped) { drop(); stopped = true; } else start();   // a failed try: a fresh one-time ID
          }, settleMs);
        });
      });
    }
    /** stop; later = true keeps the peer settleMs more, so a just-sent reply still reaches the phone */
    function stop(later) {
      stopped = true; gen++;
      book.drop(challenge);
      if (!later) { drop(); return; }
      clearTimers();
      const p = peer; peer = null;
      if (p) T.setTimeout(() => { try { p.destroy(); } catch (_) { /* gone */ } }, settleMs);
    }
    return { start, stop, id: () => id, used: () => used, running: () => !stopped, ids: () => ids.slice(),
      challenge: () => challenge, take: (ch) => book.take(ch) };
  }

  /** the lock screen's unlock session: a PIN ({t:'pin'}) and / or (H143) a fingerprint ({t:'assert'}) */
  function createSession(opts) {
    const o = opts || {};
    const pinOk = () => (typeof o.pinOk === 'function' ? !!o.pinOk() : true);
    const finger = () => { try { const f = typeof o.finger === 'function' ? o.finger() : null; return f && f.allow && f.allow.length ? f : null; } catch (_) { return null; } };
    let host = null;
    host = oneTimeHost(o, {
      greet(cur) {
        const f = finger();
        if (!f) return [{ t: 'hello', v: 1, nonce: cur.nonce }];   // H142 phones: unchanged
        return [{ t: 'hello', v: 2, nonce: cur.nonce, pin: pinOk(), finger: true },
          { t: 'chal', nonce: cur.nonce, challenge: cur.challenge, allowCredentials: f.allow.slice() }];
      },
      handle(d, cur) {
        if (d.t === 'pin') {
          if (!pinOk()) return { reply: { t: 'result', ok: false, reason: 'method' } };   // fingerprint only: PIN only on the lock screen
          const pin = typeof d.pin === 'string' ? d.pin : '';
          return { check: () => (validPin(pin) ? o.verify(pin) : false) };
        }
        if (d.t === 'assert') {
          if (!finger() || typeof o.verifyAssert !== 'function') return { reply: { t: 'result', ok: false, reason: 'method' } };
          return { check: () => {
            if (!host.take(cur.challenge)) return false;   // each challenge is good for one answer
            return Promise.resolve(o.verifyAssert(d, cur.challenge)).then((r) => r === true || !!(r && r.ok));
          } };
        }
        return null;
      }
    });
    return host;
  }

  /** H143: Settings › Add phone. The phone gets {t:'reg', nonce, challenge, user, exclude}, sends {t:'cred', ...} once */
  function createRegSession(opts) {
    const o = opts || {};
    let host = null;
    host = oneTimeHost(o, {
      reasons: true,
      okState: 'added',
      greet(cur) {
        let ex = [];
        try { ex = (typeof o.exclude === 'function' ? o.exclude() : []) || []; } catch (_) { ex = []; }
        return [{ t: 'reg', v: 1, nonce: cur.nonce, challenge: cur.challenge, user: b64u(randomBytes(16, o.crypto)), exclude: ex.slice() }];
      },
      handle(d, cur) {
        if (d.t !== 'cred') return null;
        return { check: () => {
          if (!host.take(cur.challenge)) return { ok: false, reason: 'used' };
          return Promise.resolve(o.onCred(d, cur.challenge)).then((r) => (r && r.ok ? r : { ok: false, reason: (r && r.error) || 'failed' }));
        } };
      }
    });
    return host;
  }

  const api = { KEYS, ITER, METHODS, validPin, validPeerId, hashPin, verifyRec, create, newPeerId, randomHex, unlockUrl, createSession,
    createRegSession, regUrl, b64u, unb64u, derToRaw, parseAuthData, challenges, verifyRegistration, verifyAssertion, cleanName };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HubLockCore = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
