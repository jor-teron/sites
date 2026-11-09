// H143 fingerprint unlock (phone passkey): offline Node checks only — no browser, no phone, no PeerJS server.
// Real ES256 / RS256 keys from node:crypto sign synthetic authenticatorData + clientDataJSON, checked by
// HubLockCore.verifyAssertion / verifyRegistration (WebCrypto). Run: node --test hub/tests/hub_lock_webauthn.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const nodeCrypto = require('node:crypto');
const { webcrypto } = nodeCrypto;

const ROOT = path.join(__dirname, '..', '..');
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const C = require('../core/hub_lock_core.js');
globalThis.HubLockCore = C;
const Client = require('../core/hub_unlock.js');

const ORIGIN = 'https://jor-teron.github.io';
const RPID = 'jor-teron.github.io';
const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sha = (x) => nodeCrypto.createHash('sha256').update(x).digest();
const tick = () => new Promise((r) => setImmediate(r));
const settle = async (n) => { for (let i = 0; i < (n || 10); i++) await tick(); };
async function until(cond, what) { const end = Date.now() + 5000; while (!cond()) { if (Date.now() > end) throw new Error('timed out: ' + what); await new Promise((r) => setTimeout(r, 5)); } }
function memStorage(m) {
  m = m || new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const fast = (st) => C.create({ storage: st, iter: 1000 });

/* ---------- a fake phone authenticator ---------- */
function phoneKey(alg) {
  const kp = alg === -257 ? nodeCrypto.generateKeyPairSync('rsa', { modulusLength: 2048 }) : nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const credId = b64u(nodeCrypto.randomBytes(32));
  const spki = b64u(kp.publicKey.export({ type: 'spki', format: 'der' }));
  return { alg, credId, spki, priv: kp.privateKey };
}
function regMsg(k, o) {
  o = o || {};
  const cdj = Buffer.from(JSON.stringify({ type: o.type || 'webauthn.create', challenge: o.challenge, origin: o.origin || ORIGIN, crossOrigin: false }));
  return { t: 'cred', credId: k.credId, spki: o.spki || k.spki, alg: o.alg || k.alg, clientDataJSON: b64u(cdj), name: o.name || 'Lava phone' };
}
function authData(o) {
  const count = Buffer.alloc(4); count.writeUInt32BE(o.count >>> 0);
  return Buffer.concat([sha(o.rpId || RPID), Buffer.from([o.flags == null ? 0x05 : o.flags]), count]);
}
function assertMsg(k, o) {
  o = o || {};
  const ad = authData(o);
  const cdj = Buffer.from(JSON.stringify({ type: o.type || 'webauthn.get', challenge: o.challenge, origin: o.origin || ORIGIN, crossOrigin: false }));
  let sig = nodeCrypto.sign('sha256', Buffer.concat([ad, sha(cdj)]), k.priv);   // EC → DER (like WebAuthn), RSA → PKCS#1 v1.5
  if (o.badSig) { sig = Buffer.from(sig); sig[sig.length - 3] ^= 0x01; }
  return { t: 'assert', credId: k.credId, authenticatorData: b64u(ad), clientDataJSON: b64u(cdj), signature: b64u(sig) };
}
const recOf = (k, count) => ({ credId: k.credId, alg: k.alg, spki: k.spki, signCount: count || 0, name: 'Lava phone', added: 1 });
const exp = (k, challenge, o) => Object.assign({ challenge, origin: ORIGIN, rpId: RPID, keys: [recOf(k, o && o.was)] }, o || {});

const ES = phoneKey(-7), RS = phoneKey(-257);

test('valid ES256 and RS256 assertions pass (signCount reported)', async () => {
  for (const k of [ES, RS]) {
    const ch = C.b64u(nodeCrypto.randomBytes(32));
    const r = await C.verifyAssertion(assertMsg(k, { challenge: ch, count: 7 }), exp(k, ch));
    assert.deepEqual(r, { ok: true, credId: k.credId, signCount: 7 }, 'alg ' + k.alg);
    const z = await C.verifyAssertion(assertMsg(k, { challenge: ch, count: 0 }), exp(k, ch));
    assert.equal(z.ok, true, 'signCount 0 with a stored 0 (phones that never count)');
  }
});

test('rejects: bad signature, wrong challenge, wrong origin, wrong rpId, wrong type, no UV, no UP, unknown key', async () => {
  for (const k of [ES, RS]) {
    const ch = C.b64u(nodeCrypto.randomBytes(32));
    const other = C.b64u(nodeCrypto.randomBytes(32));
    const err = async (m, e) => (await C.verifyAssertion(m, e || exp(k, ch))).error;
    assert.equal(await err(assertMsg(k, { challenge: ch, count: 1, badSig: true })), 'bad-signature');
    assert.equal(await err(assertMsg(k, { challenge: other, count: 1 })), 'bad-challenge');
    assert.equal(await err(assertMsg(k, { challenge: ch, count: 1, origin: 'https://evil.example' })), 'bad-origin');
    assert.equal(await err(assertMsg(k, { challenge: ch, count: 1, origin: 'http://jor-teron.github.io' })), 'bad-origin');
    assert.equal(await err(assertMsg(k, { challenge: ch, count: 1, rpId: 'evil.example' })), 'bad-rpid');
    assert.equal(await err(assertMsg(k, { challenge: ch, count: 1 }), exp(k, ch, { rpId: '100.64.0.1' })), 'bad-rpid');
    assert.equal(await err(assertMsg(k, { challenge: ch, count: 1, type: 'webauthn.create' })), 'bad-type');
    assert.equal(await err(assertMsg(k, { challenge: ch, count: 1, flags: 0x01 })), 'no-uv');
    assert.equal(await err(assertMsg(k, { challenge: ch, count: 1, flags: 0x04 })), 'no-up');
    assert.equal(await err(Object.assign(assertMsg(k, { challenge: ch, count: 1 }), { credId: b64u(Buffer.alloc(32, 9)) })), 'unknown-key');
    assert.equal(await err(Object.assign(assertMsg(k, { challenge: ch, count: 1 }), { authenticatorData: b64u(Buffer.alloc(20)) })), 'bad-msg');
    // a valid signature from a different key under the same credId
    const k2 = phoneKey(k.alg);
    assert.equal(await err(Object.assign(assertMsg(k2, { challenge: ch, count: 1 }), { credId: k.credId })), 'bad-signature');
  }
});

test('signCount must go up (or stay 0 when it never counted)', async () => {
  const ch = C.b64u(nodeCrypto.randomBytes(32));
  const v = (count, was) => C.verifyAssertion(assertMsg(ES, { challenge: ch, count }), exp(ES, ch, { was })).then((r) => r.ok ? 'ok' : r.error);
  assert.equal(await v(5, 4), 'ok');
  assert.equal(await v(4, 4), 'sign-count');
  assert.equal(await v(3, 4), 'sign-count');
  assert.equal(await v(0, 4), 'sign-count');
  assert.equal(await v(0, 0), 'ok');
  assert.equal(await v(0xffffffff, 1), 'ok');
});

test('the store saves the new signCount, so a replayed answer is refused', async () => {
  const st = memStorage(), s = fast(st);
  await s.setPin('1234');
  assert.deepEqual(await s.addKey(recOf(ES), '1234'), { ok: true });
  assert.deepEqual(await s.setMethod('both', '1234'), { ok: true });
  const ch = C.b64u(nodeCrypto.randomBytes(32));
  const m = assertMsg(ES, { challenge: ch, count: 3 });
  assert.equal((await s.verifyAssert(m, ch, { origin: ORIGIN, rpId: RPID })).ok, true);
  assert.equal(s.keys()[0].signCount, 3);
  assert.equal((await s.verifyAssert(m, ch, { origin: ORIGIN, rpId: RPID })).error, 'sign-count');
  // PIN-only method: fingerprint answers are not taken at all
  assert.deepEqual(await s.setMethod('pin', '1234'), { ok: true });
  const ch2 = C.b64u(nodeCrypto.randomBytes(32));
  assert.equal((await s.verifyAssert(assertMsg(ES, { challenge: ch2, count: 9 }), ch2, { origin: ORIGIN, rpId: RPID })).error, 'method');
});

test('one-time challenges: issued once, taken once', () => {
  const book = C.challenges();
  const a = book.issue(), b = book.issue();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);   // 32 bytes, base64url
  assert.equal(Buffer.from(a, 'base64url').length, 32);
  assert.notEqual(a, b);
  assert.equal(book.take(a), true);
  assert.equal(book.take(a), false, 'reused challenge');
  assert.equal(book.take('never-issued'), false);
  book.drop(b);
  assert.equal(book.take(b), false);
});

test('DER → raw r||s: leading zeros, short r / s, and malformed input', async () => {
  const hex = (h) => Uint8Array.from(Buffer.from(h, 'hex'));
  const r32 = 'ab'.repeat(32), s32 = 'cd'.repeat(32);
  // r with a sign byte (33 bytes: 00 + high bit)
  const der1 = hex('3045' + '0221' + '00' + 'ab'.repeat(32) + '0220' + s32);
  assert.equal(Buffer.from(C.derToRaw(der1, 32)).toString('hex'), r32 + s32);
  // short r (31 bytes) and short s (1 byte): zero-padded on the left
  const der2 = hex('3024' + '021f' + '11'.repeat(31) + '0201' + '05');
  assert.equal(Buffer.from(C.derToRaw(der2, 32)).toString('hex'), '00' + '11'.repeat(31) + '00'.repeat(31) + '05');
  // extra leading zeros (non-minimal but harmless)
  const der3 = hex('3046' + '0222' + '0000' + 'ab'.repeat(32) + '0220' + s32);
  assert.equal(Buffer.from(C.derToRaw(der3, 32)).toString('hex'), r32 + s32);
  // malformed
  [hex('3145' + '0221' + '00' + 'ab'.repeat(32) + '0220' + s32), hex('3044' + '0221' + '00' + 'ab'.repeat(32)), hex('3023' + '0221' + 'ab'.repeat(33)),
    hex('3006' + '0201' + '01' + '0201' + '01' + '00'), hex(''), hex('3045' + '0221' + '01' + 'ab'.repeat(32) + '0220' + s32)].forEach((d, i) =>
    assert.throws(() => C.derToRaw(d, 32), /bad-der/, 'case ' + i));
  // real node signatures, until one has a short r or s (about 1 in 128): raw must equal node's P1363 form, and verify
  let shortSeen = 0;
  for (let i = 0; i < 3000 && shortSeen < 2; i++) {
    const data = nodeCrypto.randomBytes(40);
    const der = nodeCrypto.sign('sha256', data, ES.priv);
    const len = der[3];   // length of r
    const sLen = der[5 + len];
    if (len === 33 && sLen === 33) continue;
    const raw = C.derToRaw(Uint8Array.from(der), 32);
    assert.equal(nodeCrypto.verify('sha256', data, { key: ES.priv, dsaEncoding: 'ieee-p1363' }, Buffer.from(raw)), true);
    if (len < 32 || sLen < 32) shortSeen++;
  }
  assert.ok(shortSeen >= 1, 'saw a short r / s signature');
});

test('registration: good ES256 / RS256 pass; wrong type / challenge / origin / alg / key fail', async () => {
  const ch = C.b64u(nodeCrypto.randomBytes(32));
  for (const k of [ES, RS]) {
    const r = await C.verifyRegistration(regMsg(k, { challenge: ch }), { challenge: ch, origin: ORIGIN, now: 42 });
    assert.equal(r.ok, true);
    assert.deepEqual(r.rec, { credId: k.credId, alg: k.alg, spki: k.spki, signCount: 0, name: 'Lava phone', added: 42 });
  }
  const bad = async (m, e) => (await C.verifyRegistration(m, Object.assign({ challenge: ch, origin: ORIGIN }, e || {}))).error;
  assert.equal(await bad(regMsg(ES, { challenge: ch, type: 'webauthn.get' })), 'bad-type');
  assert.equal(await bad(regMsg(ES, { challenge: C.b64u(Buffer.alloc(32, 1)) })), 'bad-challenge');
  assert.equal(await bad(regMsg(ES, { challenge: ch, origin: 'https://jor-teron.github.io.evil.example' })), 'bad-origin');
  assert.equal(await bad(regMsg(ES, { challenge: ch }), { origin: 'https://100.64.0.1' }), 'bad-origin');
  assert.equal(await bad(regMsg(ES, { challenge: ch, alg: -8 })), 'bad-alg');
  assert.equal(await bad(regMsg(ES, { challenge: ch, alg: -257 })), 'bad-key', 'an EC key claimed as RS256');
  assert.equal(await bad(regMsg(ES, { challenge: ch, spki: b64u(Buffer.alloc(91, 7)) })), 'bad-key');
  assert.equal(await bad(Object.assign(regMsg(ES, { challenge: ch }), { clientDataJSON: '***' })), 'bad-msg');
  // the phone name is cleaned (no markup, max 40)
  const named = await C.verifyRegistration(regMsg(ES, { challenge: ch, name: '<b>Lava</b>\n' + 'x'.repeat(80) }), { challenge: ch, origin: ORIGIN });
  assert.equal(named.rec.name.length, 40);
  assert.equal(/[<>\n]/.test(named.rec.name), false);
});

test('method choice: PIN / Fingerprint / Both rules; Activate stays off after adding a phone; finger-only needs the PIN', async () => {
  const st = memStorage(), s = fast(st);
  assert.equal(s.method(), 'pin', 'empty = pin');
  assert.deepEqual(await s.setMethod('finger', ''), { ok: false, error: 'no-pin' });
  assert.deepEqual(await s.addKey(recOf(ES), ''), { ok: false, error: 'no-pin' }, 'a phone hangs on the PIN');
  await s.setPin('2468');
  assert.deepEqual(await s.setMethod('finger', '2468'), { ok: false, error: 'no-phone' });
  assert.deepEqual(await s.setMethod('both', '2468'), { ok: false, error: 'no-phone' });
  assert.deepEqual(await s.setMethod('face', '2468'), { ok: false, error: 'bad-method' });
  assert.deepEqual(await s.addKey(recOf(ES), ''), { ok: false, error: 'need-current' });
  assert.deepEqual(await s.addKey(recOf(ES), '0000'), { ok: false, error: 'wrong-current' });
  assert.deepEqual(await s.addKey(recOf(ES), '2468'), { ok: true });
  assert.deepEqual(await s.addKey(recOf(ES), '2468'), { ok: false, error: 'dup-key' });
  assert.equal(s.isOn(), false, 'adding a phone never turns Activate on');
  assert.equal(st.m.has('hub-lock.on'), false);
  assert.equal(s.method(), 'pin', 'adding a phone does not change the method');
  assert.deepEqual(await s.setMethod('finger', ''), { ok: false, error: 'need-current' });
  assert.deepEqual(await s.setMethod('finger', '2468'), { ok: true });
  assert.equal(st.m.get('hub-lock.method'), 'finger');
  assert.equal(s.isOn(), false, 'picking a method never turns Activate on');
  assert.deepEqual(await s.setOn(true), { ok: true });
  assert.equal(s.isOn(), true);
  // finger-only: the PIN still exists (hidden recovery) and still unlocks
  assert.equal(s.hasPin(), true);
  assert.equal(await s.verify('2468'), true);
  // removing the last phone while finger → back to pin (Activate unchanged)
  assert.deepEqual(await s.removeKey(ES.credId, '1111'), { ok: false, error: 'wrong-current' });
  assert.deepEqual(await s.removeKey(ES.credId, '2468'), { ok: true, fellBack: true });
  assert.equal(s.method(), 'pin');
  assert.equal(st.m.has('hub-lock.method'), false);
  assert.equal(s.isOn(), true);
  // two phones, method both: removing one keeps both
  await s.addKey(recOf(ES), '2468'); await s.addKey(recOf(RS), '2468');
  assert.deepEqual(await s.setMethod('both', '2468'), { ok: true });
  assert.deepEqual(await s.removeKey(RS.credId, '2468'), { ok: true, fellBack: false });
  assert.equal(s.method(), 'both');
  // a stored fingerprint method with no phone reads as pin (tampered / stale storage)
  st.m.set('hub-lock.keys', '[]');
  assert.equal(s.method(), 'pin');
  assert.equal(s.methodReady('finger'), false);
  assert.equal(s.methodReady('pin'), true);
  // removing the PIN removes the phones and the method too; the lock goes off
  await s.addKey(recOf(ES), '2468'); await s.setMethod('finger', '2468');
  assert.deepEqual(await s.removePin('2468'), { ok: true });
  assert.equal(s.isOn(), false);
  assert.deepEqual(s.keys(), []);
  assert.equal(s.method(), 'pin');
  for (const k of st.m.keys()) assert.match(k, /^hub-lock\./, 'device-only keys');
  // keys are only public material
  await s.setPin('2468'); await s.addKey(recOf(ES), '2468');
  assert.deepEqual(Object.keys(JSON.parse(st.m.get('hub-lock.keys'))[0]).sort(), ['added', 'alg', 'credId', 'name', 'signCount', 'spki']);
});

/* ---------- fake PeerJS ---------- */
function emitter(o) {
  const ev = {};
  o.on = (k, f) => { (ev[k] = ev[k] || []).push(f); return o; };
  o.emit = (k, ...a) => (ev[k] || []).forEach((f) => f(...a));
  return o;
}
function fakeWorld() {
  const peers = [];
  class Peer { constructor(id) { emitter(this); this.id = id; this.destroyed = false; peers.push(this); } destroy() { this.destroyed = true; } }
  const connect = (peer) => { const c = emitter({ sent: [], send(m) { this.sent.push(m); }, close() {} }); peer.emit('connection', c); c.emit('open'); return c; };
  let q = [];
  const timers = { setTimeout: (f, ms) => { const t = { f, ms }; q.push(t); return t; }, clearTimeout: (t) => { q = q.filter((x) => x !== t); } };
  const runTimers = (ms) => { const now = q.filter((t) => ms == null || t.ms <= ms); q = q.filter((t) => !now.includes(t)); now.forEach((t) => t.f()); };
  return { Peer, peers, connect, timers, runTimers };
}

test('unlock session: fingerprint challenge, one answer per challenge, replay refused (H143.1: fingerprint only offers the PIN as hidden recovery)', async () => {
  const st = memStorage(), s = fast(st);
  await s.setPin('1357'); await s.addKey(recOf(ES), '1357'); await s.setMethod('finger', '1357'); await s.setOn(true);
  const w = fakeWorld();
  let unlocked = 0;
  const hub = C.createSession({ Peer: w.Peer, timers: w.timers, settleMs: 10, verify: (p) => s.verify(p), onUnlock: () => unlocked++,
    pinOk: () => s.method() !== 'finger', finger: () => (s.method() !== 'pin' ? { allow: s.keys().map((k) => k.credId) } : null),
    verifyAssert: (d, ch) => s.verifyAssert(d, ch, { origin: ORIGIN, rpId: RPID }) });
  hub.start();
  const c1 = w.connect(w.peers[0]);
  assert.equal(c1.sent[0].t, 'hello'); assert.equal(c1.sent[0].v, 2); assert.equal(c1.sent[0].pin, true); assert.equal(c1.sent[0].pinHidden, true); assert.equal(c1.sent[0].finger, true);
  const chal = c1.sent[1];
  assert.equal(chal.t, 'chal'); assert.equal(chal.nonce, c1.sent[0].nonce);
  assert.deepEqual(chal.allowCredentials, [ES.credId]);
  assert.equal(Buffer.from(chal.challenge, 'base64url').length, 32);
  // a wrong-challenge answer uses the try and fails
  c1.emit('data', Object.assign(assertMsg(ES, { challenge: C.b64u(Buffer.alloc(32, 3)), count: 1 }), { nonce: chal.nonce }));
  await until(() => c1.sent.length > 2, 'result 1');
  assert.deepEqual(c1.sent[2], { t: 'result', ok: false });
  assert.equal(unlocked, 0);
  // second answer on the same ID: used
  const good1 = Object.assign(assertMsg(ES, { challenge: chal.challenge, count: 1 }), { nonce: chal.nonce });
  c1.emit('data', good1);
  assert.equal(c1.sent[3].reason, 'used');
  w.runTimers(10);   // fresh ID
  assert.equal(w.peers.length, 2);
  const c2 = w.connect(w.peers[1]);
  const chal2 = c2.sent[1];
  assert.notEqual(chal2.challenge, chal.challenge);
  assert.equal(hub.take(chal.challenge), false, 'the old challenge is gone');
  // replay the answer for the old challenge on the new ID: refused
  c2.emit('data', Object.assign({}, good1, { nonce: chal2.nonce }));
  await until(() => c2.sent.length > 2, 'result 2');
  assert.deepEqual(c2.sent[2], { t: 'result', ok: false });
  w.runTimers(10);
  const c3 = w.connect(w.peers[2]);
  const chal3 = c3.sent[1];
  c3.emit('data', Object.assign(assertMsg(ES, { challenge: chal3.challenge, count: 1 }), { nonce: chal3.nonce }));
  await until(() => c3.sent.length > 2, 'result 3');
  assert.deepEqual(c3.sent[2], { t: 'result', ok: true });
  assert.equal(unlocked, 1);
  assert.equal(s.keys()[0].signCount, 1);
  // PIN-only method: H142 hello (v1), no chal; a fingerprint answer is refused
  await s.setMethod('pin', '1357');
  const w2 = fakeWorld();
  const hub2 = C.createSession({ Peer: w2.Peer, timers: w2.timers, settleMs: 10, verify: (p) => s.verify(p),
    pinOk: () => s.method() !== 'finger', finger: () => (s.method() !== 'pin' ? { allow: s.keys().map((k) => k.credId) } : null), verifyAssert: () => true });
  hub2.start();
  const d1 = w2.connect(w2.peers[0]);
  assert.deepEqual(Object.keys(d1.sent[0]).sort(), ['nonce', 't', 'v']);
  assert.equal(d1.sent.length, 1);
  d1.emit('data', { t: 'assert', nonce: d1.sent[0].nonce });
  assert.deepEqual(d1.sent[1], { t: 'result', ok: false, reason: 'method' });
});

test('Add phone: phone client + registration session store a verified key; Activate stays off', async () => {
  const st = memStorage(), s = fast(st);
  await s.setPin('8642');
  const w = fakeWorld();
  let done = 0;
  const hub = C.createRegSession({ Peer: w.Peer, timers: w.timers, settleMs: 10, exclude: () => s.keys().map((k) => k.credId),
    onCred: async (msg, challenge) => { const v = await C.verifyRegistration(msg, { challenge, origin: ORIGIN }); return v.ok ? s.addKey(v.rec, '8642') : v; },
    onDone: () => done++ });
  hub.start();
  const hubPeer = w.peers[0];
  class PhonePeer {
    constructor() { emitter(this); setImmediate(() => this.emit('open', 'phone')); }
    connect(id) {
      assert.equal(id, hub.id());
      const toHub = emitter({ send: (m) => setImmediate(() => toPhone.emit('data', m)), close() {} });
      const toPhone = emitter({ send: (m) => setImmediate(() => toHub.emit('data', m)), close() {} });
      setImmediate(() => { hubPeer.emit('connection', toHub); toHub.emit('open'); });
      return toPhone;
    }
    destroy() {}
  }
  assert.deepEqual(Client.parseHash('#r:' + hub.id()), { mode: 'reg', id: hub.id() });
  assert.deepEqual(Client.parseHash('#' + hub.id()), { mode: 'unlock', id: hub.id() });
  assert.equal(C.regUrl('https://jor-teron.github.io/sites/', hub.id()), 'https://jor-teron.github.io/sites/unlock.html#r:' + hub.id());
  const states = [];
  let regInfo = null;
  const cl = Client({ Peer: PhonePeer, id: hub.id(), timers: w.timers, onState: (st2, info) => { states.push(st2); if (st2 === 'reg') regInfo = info; } });
  cl.connect();
  await settle();
  assert.deepEqual(states, ['connecting', 'reg']);
  assert.deepEqual(regInfo.exclude, []);
  // the phone's create() options
  const opt = Client.createOptions(regInfo, RPID).publicKey;
  assert.deepEqual(opt.rp, { id: RPID, name: 'Hub' });
  assert.deepEqual(opt.pubKeyCredParams.map((p) => p.alg), [-7, -257]);
  assert.deepEqual(opt.authenticatorSelection, { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged', requireResidentKey: false });
  assert.equal(opt.attestation, 'none');
  assert.equal(Buffer.from(opt.challenge).toString('base64url'), regInfo.challenge);
  assert.equal(opt.user.id.length, 16);
  // a fake PublicKeyCredential from create()
  const cdj = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: regInfo.challenge, origin: ORIGIN }));
  const fakeCred = { rawId: Buffer.from(ES.credId, 'base64url'), response: { clientDataJSON: cdj, getPublicKey: () => Buffer.from(ES.spki, 'base64url'), getPublicKeyAlgorithm: () => -7 } };
  const msg = Client.credMsg(fakeCred, 'Lava phone');
  assert.deepEqual(msg, { credId: ES.credId, spki: ES.spki, alg: -7, clientDataJSON: b64u(cdj), name: 'Lava phone' });
  assert.equal(cl.sendCred(msg), true);
  assert.equal(cl.sendCred(msg), false, 'one answer per page');
  await until(() => states.includes('ok'), 'phone ok');
  assert.equal(done, 1);
  assert.equal(s.keys().length, 1);
  assert.equal(s.keys()[0].name, 'Lava phone');
  assert.equal(s.isOn(), false, 'registering never turns Activate on');
  assert.equal(s.method(), 'pin', 'registering never changes the method');
  // the unlock get() options
  const g = Client.getOptions({ challenge: C.b64u(Buffer.alloc(32, 5)), allow: [ES.credId] }, RPID).publicKey;
  assert.equal(g.userVerification, 'required');
  assert.equal(g.rpId, RPID);
  assert.equal(Buffer.from(g.allowCredentials[0].id).toString('base64url'), ES.credId);
  // a bad registration (wrong origin) is answered with a reason and stores nothing
  const w2 = fakeWorld();
  const hub2 = C.createRegSession({ Peer: w2.Peer, timers: w2.timers, settleMs: 10, onCred: (m, ch) => C.verifyRegistration(m, { challenge: ch, origin: ORIGIN }) });
  hub2.start();
  const c = w2.connect(w2.peers[0]);
  assert.equal(c.sent[0].t, 'reg');
  c.emit('data', Object.assign(regMsg(RS, { challenge: c.sent[0].challenge, origin: 'https://evil.example' }), { nonce: c.sent[0].nonce }));
  await until(() => c.sent.length > 1, 'reg result');
  assert.deepEqual(c.sent[1], { t: 'result', ok: false, reason: 'bad-origin' });
});

/* ---------- the lock screen (hub_lock.js) in a tiny fake DOM: the 'Use PIN' recovery link + a fingerprint unlock ---------- */
const CORE = fs.readFileSync(path.join(ROOT, 'hub/core/hub_lock_core.js'), 'utf8');
const LOCK = fs.readFileSync(path.join(ROOT, 'hub/core/hub_lock.js'), 'utf8');
function page(store) {
  let doc;
  class ClassList {
    constructor() { this.s = new Set(); }
    add(c) { this.s.add(c); } remove(c) { this.s.delete(c); } contains(c) { return this.s.has(c); }
    toggle(c, v) { if (v === undefined) v = !this.s.has(c); if (v) this.s.add(c); else this.s.delete(c); return v; }
  }
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = new Map(); this.hidden = false; this.classList = new ClassList(); this.events = {}; this.dataset = {}; this.style = {}; this._text = ''; this.parentNode = null; }
    set className(v) { this.classList = new ClassList(); String(v).split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c)); }
    get className() { return Array.from(this.classList.s).join(' '); }
    set textContent(v) { this._text = String(v); this.children = []; }
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
    set innerHTML(v) { this._html = String(v); this.children = []; }
    get innerHTML() { return this._html || ''; }
    get isConnected() { let e = this; while (e.parentNode) e = e.parentNode; return e === doc.documentElement; }
    get lastElementChild() { return this.children[this.children.length - 1] || null; }
    get offsetWidth() { return 10; }
    append(...c) { c.forEach((x) => this.appendChild(x)); }
    appendChild(c) { if (c.parentNode) c.parentNode.children = c.parentNode.children.filter((x) => x !== c); this.children.push(c); c.parentNode = this; return c; }
    contains(x) { while (x) { if (x === this) return true; x = x.parentNode; } return false; }
    setAttribute(k, v) { this.attrs.set(k, String(v)); } getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
    hasAttribute(k) { return this.attrs.has(k); } removeAttribute(k) { this.attrs.delete(k); }
    addEventListener(k, f) { (this.events[k] = this.events[k] || []).push(f); }
    querySelector(sel) { const tag = sel.toUpperCase(); const walk = (e) => { for (const c of e.children) { if (c.tagName === tag) return c; const r = walk(c); if (r) return r; } return null; }; return walk(this); }
    focus() { doc.activeElement = this; } blur() { doc.activeElement = doc.body; }
    click() { (this.events.click || []).forEach((f) => f({ target: this, stopPropagation() {}, preventDefault() {} })); }
  }
  doc = { createElement: (t) => new Element(t), addEventListener() {}, baseURI: 'https://jor-teron.github.io/sites/' };
  doc.documentElement = new Element('html'); doc.head = new Element('head'); doc.body = new Element('body');
  doc.documentElement.append(doc.head, doc.body);
  const wev = {}, peers = [];
  class Peer { constructor(id) { emitter(this); this.id = id; peers.push(this); } destroy() { this.destroyed = true; } }
  const win = {
    addEventListener(k, f) { (wev[k] = wev[k] || []).push(f); }, dispatchEvent(e) { (wev[e.type] || []).forEach((f) => f(e)); },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    crypto: webcrypto, Peer,
    qrcode: () => ({ addData(u) { this.u = u; }, make() {}, createSvgTag() { return '<svg></svg>'; } })
  };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  const ctx = { window: win, document: doc, localStorage: win.localStorage, location: { protocol: 'https:', href: doc.baseURI + 'desktop/desktop.html' },
    navigator: { onLine: true }, CustomEvent, URL, TextEncoder, TextDecoder, btoa, atob, console, Uint8Array, Promise,
    setTimeout: (f, ms) => { const t = setTimeout(f, (ms || 0) <= 1000 ? Math.min(ms || 0, 5) : 2147483647); t.unref(); return t; }, clearTimeout };
  win.window = win;
  vm.createContext(ctx);
  vm.runInContext(CORE, ctx);
  vm.runInContext(LOCK, ctx);
  const lockEl = () => doc.documentElement.children.find((c) => c.id === 'hub-lock') || null;
  const all = (e, out) => { out = out || []; out.push(e); e.children.forEach((c) => all(c, out)); return out; };
  const find = (cls) => all(lockEl()).find((e) => e.classList && e.classList.contains(cls));
  const key = (k) => all(lockEl()).find((e) => e.dataset && e.dataset.k === k);
  const keydown = (k) => (wev.keydown || []).forEach((f) => f({ type: 'keydown', key: k, target: doc.body, preventDefault() {}, stopImmediatePropagation() {} }));
  return { api: win.HubLock, lockEl, find, key, keydown, peers, doc };
}
async function lockedStore(method) {
  const m = new Map(), s = fast(memStorage(m));
  await s.setPin('4321');
  if (method !== 'pin') { await s.addKey(recOf(ES), '4321'); await s.setMethod(method, '4321'); }
  await s.setOn(true);
  return m;
}

test('lock screen: fingerprint only hides the PIN pad behind a "Use PIN" recovery link that unlocks with the PIN', async () => {
  const p = page(await lockedStore('finger'));
  assert.equal(p.api.locked(), true);
  const rec = p.find('hub-lock-recover');
  assert.ok(rec, 'recovery link exists');
  assert.equal(rec.hidden, false, 'recovery link appears');
  assert.equal(rec.textContent, 'Use PIN');
  assert.equal(p.find('hub-lock-pad').hidden, true, 'pad hidden');
  assert.equal(p.find('hub-lock-dots').hidden, true);
  assert.equal(p.lockEl().classList.contains('hub-lock-pinhid'), true);
  assert.equal(p.doc.activeElement, rec, 'focus on the link');
  assert.match(p.find('hub-lock-sub').textContent, /fingerprint/);
  assert.equal(p.api.state().pinShown, false);
  p.keydown('4'); p.keydown('3'); p.keydown('2'); p.keydown('1');
  await settle();
  assert.equal(p.api.locked(), true, 'typed digits do nothing while the pad is hidden');
  rec.click();
  assert.equal(rec.hidden, true);
  assert.equal(p.find('hub-lock-pad').hidden, false, 'pad shown after Use PIN');
  ['4', '3', '2', '1'].forEach((d) => p.key(d).click());
  await until(() => !p.api.locked(), 'PIN recovery unlocks');
});

test('lock screen: PIN and Both methods show the pad, no recovery link', async () => {
  for (const m of ['pin', 'both']) {
    const p = page(await lockedStore(m));
    assert.equal(p.api.locked(), true);
    assert.equal(p.find('hub-lock-recover').hidden, true, m);
    assert.equal(p.find('hub-lock-pad').hidden, false, m);
  }
});

test('lock screen: a fingerprint answer over the QR session unlocks (origin / rpId from the page address)', async () => {
  const p = page(await lockedStore('finger'));
  await settle();
  assert.equal(p.peers.length, 1);
  const c = emitter({ sent: [], send(m) { this.sent.push(JSON.parse(JSON.stringify(m))); }, close() {} });
  p.peers[0].emit('connection', c); c.emit('open');
  assert.equal(c.sent[0].pin, true); assert.equal(c.sent[0].pinHidden, true);   // H143.1: the recovery PIN, behind 'Use PIN instead'
  const chal = c.sent[1];
  assert.equal(chal.t, 'chal');
  // wrong rpId (e.g. registered on a Tailscale address) fails, gets a new code
  c.emit('data', Object.assign(assertMsg(ES, { challenge: chal.challenge, count: 1, rpId: '100.64.0.1' }), { nonce: chal.nonce }));
  await until(() => c.sent.length > 2, 'result');
  assert.deepEqual(c.sent[2], { t: 'result', ok: false });
  assert.equal(p.api.locked(), true);
  await until(() => p.peers.length === 2, 'fresh ID');
  const c2 = emitter({ sent: [], send(m) { this.sent.push(JSON.parse(JSON.stringify(m))); }, close() {} });
  p.peers[1].emit('connection', c2); c2.emit('open');
  c2.emit('data', Object.assign(assertMsg(ES, { challenge: c2.sent[1].challenge, count: 1 }), { nonce: c2.sent[1].nonce }));
  await until(() => !p.api.locked(), 'fingerprint unlocks');
  assert.deepEqual(c2.sent[2], { t: 'result', ok: true });
});

/* ---------- H143.1: fingerprint only takes the recovery PIN from the phone (checked against the PBKDF2 record) ---------- */
test('H143.1 unlock session: fingerprint only accepts the recovery PIN over the phone; a wrong one uses the try', async () => {
  const st = memStorage(), s = fast(st);
  await s.setPin('1357'); await s.addKey(recOf(ES), '1357'); await s.setMethod('finger', '1357'); await s.setOn(true);
  const w = fakeWorld();
  let unlocked = 0, checked = [];
  const hub = C.createSession({ Peer: w.Peer, timers: w.timers, settleMs: 10, verify: (p) => { checked.push(p); return s.verify(p); }, onUnlock: () => unlocked++,
    pinOk: () => s.method() !== 'finger', finger: () => (s.method() !== 'pin' ? { allow: s.keys().map((k) => k.credId) } : null),
    verifyAssert: (d, ch) => s.verifyAssert(d, ch, { origin: ORIGIN, rpId: RPID }) });
  hub.start();
  const c1 = w.connect(w.peers[0]);
  assert.deepEqual([c1.sent[0].pin, c1.sent[0].pinHidden, c1.sent[0].finger], [true, true, true]);
  c1.emit('data', { t: 'pin', pin: '0000', nonce: c1.sent[0].nonce });
  await until(() => c1.sent.length > 2, 'wrong PIN result');
  assert.deepEqual(c1.sent[2], { t: 'result', ok: false });
  assert.equal(hub.used(), true, 'a wrong PIN uses the one try');
  assert.equal(unlocked, 0);
  w.runTimers(10);
  const c2 = w.connect(w.peers[1]);
  c2.emit('data', { t: 'pin', pin: '1357', nonce: c2.sent[0].nonce });
  await until(() => c2.sent.length > 2, 'right PIN result');
  assert.deepEqual(c2.sent[2], { t: 'result', ok: true });
  assert.equal(unlocked, 1);
  assert.deepEqual(checked, ['0000', '1357'], 'both went through verify (the stored PBKDF2 hash)');
  // Both: pinHidden false
  await s.setMethod('both', '1357');
  const w2 = fakeWorld();
  C.createSession({ Peer: w2.Peer, timers: w2.timers, verify: () => false, pinOk: () => s.method() !== 'finger',
    finger: () => ({ allow: s.keys().map((k) => k.credId) }), verifyAssert: () => false }).start();
  const d1 = w2.connect(w2.peers[0]);
  assert.deepEqual([d1.sent[0].pin, d1.sent[0].pinHidden, d1.sent[0].finger], [true, false, true]);
});

test('H143.1 lock screen: a phone-link error shows its code under the QR while it retries', async () => {
  const p = page(await lockedStore('pin'));
  await settle();
  assert.equal(p.peers.length, 1);
  p.peers[0].emit('error', { type: 'server-error' });
  assert.equal(p.find('hub-lock-qrnote').textContent, 'Phone unlock is not available right now. Retrying\u2026 Use the keypad meanwhile. (Error code: server-error)');
  p.peers[0].emit('disconnected');
  assert.match(p.find('hub-lock-qrnote').textContent, /\(Error code: disconnected\)$/);
});
