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
 * No attempt limit / lockout in H142 (a later release).
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
 *   createSession({ Peer, verify, onUnlock, onState, refreshMs, settleMs, timers, crypto })
 */
(function (root) {
  'use strict';
  const KEYS = { pin: 'hub-lock.pin', on: 'hub-lock.on' };
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
    /** remove the PIN (needs it); the lock goes off with it */
    async function removePin(cur) {
      if (!hasPin()) { put(KEYS.on, ''); return { ok: true }; }
      const e = await needCurrent(cur);
      if (e) return { ok: false, error: e };
      put(KEYS.on, ''); put(KEYS.pin, '');
      return { ok: true };
    }
    /** Activate: on needs a PIN to exist; off needs the current PIN */
    async function setOn(v, cur) {
      if (v) {
        if (!hasPin()) return { ok: false, error: 'no-pin' };
        put(KEYS.on, '1');
        return get(KEYS.on) === '1' ? { ok: true } : { ok: false, error: 'storage' };
      }
      if (get(KEYS.on) !== '1') return { ok: true };
      const e = await needCurrent(cur);
      if (e) return { ok: false, error: e };
      put(KEYS.on, '');
      return { ok: true };
    }
    return { hasPin, isOn, record, verify, setPin, removePin, setOn };
  }

  /* ---------- one-time phone session over PeerJS ---------- */
  function createSession(opts) {
    const o = opts || {};
    const T = o.timers || { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t) };
    const refreshMs = o.refreshMs > 0 ? o.refreshMs : 120000;
    const settleMs = o.settleMs >= 0 ? o.settleMs : 600;   // let the reply reach the phone before the peer goes
    const retryMs = o.retryMs > 0 ? o.retryMs : 15000;
    const onState = o.onState || function () {};
    let peer = null, id = '', nonce = '', used = false, stopped = true, refreshT = 0, retryT = 0, gen = 0;
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
      try { id = newPeerId(o.crypto); nonce = randomHex(16, o.crypto); } catch (_) { onState('error', { type: 'no-random' }); return; }
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
        send(conn, { t: 'hello', v: 1, nonce });
      });
      conn.on('data', (d) => {
        if (!d || typeof d !== 'object' || d.t !== 'pin') return;
        if (my !== gen || used || stopped) { reject(); return; }
        if (d.nonce !== nonce) { send(conn, { t: 'result', ok: false, reason: 'nonce' }); return; }   // not this session's hello: no attempt used
        used = true;   // this ID has had its one try
        clearTimers();
        onState('checking', { id });
        const pin = typeof d.pin === 'string' ? d.pin : '';
        Promise.resolve(validPin(pin) ? o.verify(pin) : false).then((ok) => !!ok, () => false).then((ok) => {
          send(conn, { t: 'result', ok });
          onState(ok ? 'unlocked' : 'wrong', { id });
          if (ok && o.onUnlock) o.onUnlock();
          T.setTimeout(() => {
            if (my !== gen) return;
            if (ok || stopped) { drop(); stopped = true; } else start();   // wrong PIN: a fresh one-time ID
          }, settleMs);
        });
      });
    }
    /** stop; later = true keeps the peer settleMs more, so a just-sent reply still reaches the phone */
    function stop(later) {
      stopped = true; gen++;
      if (!later) { drop(); return; }
      clearTimers();
      const p = peer; peer = null;
      if (p) T.setTimeout(() => { try { p.destroy(); } catch (_) { /* gone */ } }, settleMs);
    }
    return { start, stop, id: () => id, used: () => used, running: () => !stopped, ids: () => ids.slice() };
  }

  const api = { KEYS, ITER, validPin, validPeerId, hashPin, verifyRec, create, newPeerId, randomHex, unlockUrl, createSession };
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HubLockCore = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
