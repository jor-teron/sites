// H142 PIN lock core: offline Node checks only (no browser, no network). Run: node --test hub/tests/hub_lock_core.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

const ROOT = path.join(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const C = require('../core/hub_lock_core.js');

function memStorage() {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
const fast = (st) => C.create({ storage: st, iter: 1000 });

test('4-digit validation', () => {
  ['0000', '1234', '9876'].forEach((p) => assert.equal(C.validPin(p), true, p));
  ['', '123', '12345', '12a4', ' 1234', '1234 ', '１２３４', 1234, null, undefined].forEach((p) => assert.equal(C.validPin(p), false, String(p)));
});

test('hash round trip with the default PBKDF2-SHA-256 rounds: right and wrong PIN', async () => {
  assert.ok(C.ITER >= 150000 && C.ITER <= 200000);
  const rec = await C.hashPin('4821');
  assert.deepEqual(Object.keys(rec).sort(), ['hash', 'iter', 'salt', 'v']);
  assert.equal(rec.v, 1);
  assert.equal(rec.iter, C.ITER);
  assert.equal(Buffer.from(rec.salt, 'base64').length, 16);
  assert.equal(Buffer.from(rec.hash, 'base64').length, 32);
  assert.equal(JSON.stringify(rec).includes('4821'), false);
  assert.equal(await C.verifyRec('4821', rec), true);
  assert.equal(await C.verifyRec('4822', rec), false);
  assert.equal(await C.verifyRec('482', rec), false);
  const again = await C.hashPin('4821');
  assert.notEqual(again.salt, rec.salt);   // random salt each time
  assert.notEqual(again.hash, rec.hash);
  // same as an independent PBKDF2 of the same inputs
  const ref = require('node:crypto').pbkdf2Sync('4821', Buffer.from(rec.salt, 'base64'), rec.iter, 32, 'sha256').toString('base64');
  assert.equal(ref, rec.hash);
  await assert.rejects(C.hashPin('12345'));
});

test('off by default; Activate refused without a PIN; setting a PIN never turns it on', async () => {
  const st = memStorage(), s = fast(st);
  assert.equal(s.hasPin(), false);
  assert.equal(s.isOn(), false);
  assert.deepEqual(await s.setOn(true), { ok: false, error: 'no-pin' });
  assert.equal(st.m.has('hub-lock.on'), false);
  assert.deepEqual(await s.setPin('12a4'), { ok: false, error: 'bad-pin' });
  assert.deepEqual(await s.setPin('2468'), { ok: true });
  assert.equal(s.hasPin(), true);
  assert.equal(s.isOn(), false);
  assert.deepEqual(await s.setOn(true), { ok: true });
  assert.equal(s.isOn(), true);
  // only device-only hub-lock.* keys, never sites-hub.* (profile / sync collect only 'sites-hub.')
  for (const k of st.m.keys()) assert.match(k, /^hub-lock\./);
  assert.deepEqual(Object.keys(JSON.parse(st.m.get('hub-lock.pin'))).sort(), ['hash', 'iter', 'salt', 'v']);
  // an "on" flag without a valid PIN record is ignored
  const st2 = memStorage(); st2.setItem('hub-lock.on', '1'); st2.setItem('hub-lock.pin', '{"v":1}');
  assert.equal(fast(st2).isOn(), false);
});

test('change, turn off and remove need the current PIN; removing turns the lock off', async () => {
  const st = memStorage(), s = fast(st);
  await s.setPin('1111'); await s.setOn(true);
  assert.deepEqual(await s.setPin('2222'), { ok: false, error: 'need-current' });
  assert.deepEqual(await s.setPin('2222', '9999'), { ok: false, error: 'wrong-current' });
  assert.deepEqual(await s.setPin('2222', '1111'), { ok: true });
  assert.equal(await s.verify('2222'), true);
  assert.equal(await s.verify('1111'), false);
  assert.equal(s.isOn(), true, 'changing the PIN keeps Activate as it was');
  assert.deepEqual(await s.setOn(false), { ok: false, error: 'need-current' });
  assert.deepEqual(await s.setOn(false, '1111'), { ok: false, error: 'wrong-current' });
  assert.equal(s.isOn(), true);
  assert.deepEqual(await s.removePin('1111'), { ok: false, error: 'wrong-current' });
  assert.deepEqual(await s.removePin('2222'), { ok: true });
  assert.equal(s.hasPin(), false);
  assert.equal(s.isOn(), false);
  assert.equal(st.m.size, 0);
  // turn off with the right PIN
  await s.setPin('3333'); await s.setOn(true);
  assert.deepEqual(await s.setOn(false, '3333'), { ok: true });
  assert.equal(s.isOn(), false);
  assert.equal(s.hasPin(), true);
});

test('peer IDs and the unlock URL', () => {
  const a = C.newPeerId(), b = C.newPeerId();
  assert.match(a, /^hublock-[0-9a-f]{16}$/);
  assert.notEqual(a, b);
  assert.equal(C.validPeerId(a), true);
  assert.equal(C.validPeerId('hublock-xyz'), false);
  assert.equal(C.unlockUrl('https://jor-teron.github.io/sites/', a), 'https://jor-teron.github.io/sites/unlock.html#' + a);
  assert.equal(C.unlockUrl('https://h.example/desktop/../?x=1', a), 'https://h.example/unlock.html#' + a);
  // PeerJS 1.5.4 accepts it (its validateId rule)
  assert.match(a, /^[A-Za-z0-9]+(?:[ _-][A-Za-z0-9]+)*$/);
});

/* ---------- fake PeerJS + timers ---------- */
function emitter(o) {
  const ev = {};
  o.on = (k, f) => { (ev[k] = ev[k] || []).push(f); return o; };
  o.emit = (k, ...a) => (ev[k] || []).forEach((f) => f(...a));
  return o;
}
function fakeWorld() {
  const peers = [];
  class Peer {
    constructor(id) { emitter(this); this.id = id; this.destroyed = false; peers.push(this); }
    destroy() { this.destroyed = true; }
  }
  const conns = [];
  function connect(peer) {   // a phone connecting to a hub peer
    const conn = emitter({ sent: [], closed: false, send(m) { this.sent.push(m); }, close() { this.closed = true; } });
    conns.push(conn);
    peer.emit('connection', conn);
    conn.emit('open');
    return conn;
  }
  let q = [];
  const timers = { setTimeout: (f, ms) => { const t = { f, ms }; q.push(t); return t; }, clearTimeout: (t) => { q = q.filter((x) => x !== t); } };
  const runTimers = (ms) => { const now = q.filter((t) => ms == null || t.ms <= ms); q = q.filter((t) => !now.includes(t)); now.forEach((t) => t.f()); };
  return { Peer, peers, connect, timers, runTimers, pending: () => q.slice() };
}
const tick = () => new Promise((r) => setImmediate(r));

test('fake Peer: right PIN unlocks once, then the session ends', async () => {
  const w = fakeWorld(), states = [];
  let unlocked = 0;
  const s = C.createSession({ Peer: w.Peer, timers: w.timers, settleMs: 10, verify: async (p) => p === '1357', onUnlock: () => unlocked++, onState: (st) => states.push(st) });
  s.start();
  assert.equal(w.peers.length, 1);
  assert.equal(w.peers[0].id, s.id());
  assert.match(s.id(), /^hublock-[0-9a-f]{16}$/);
  w.peers[0].emit('open', s.id());
  const conn = w.connect(w.peers[0]);
  const hello = conn.sent[0];
  assert.equal(hello.t, 'hello');
  assert.match(hello.nonce, /^[0-9a-f]{32}$/);
  conn.emit('data', { t: 'pin', pin: '1357', nonce: hello.nonce });
  await tick();
  assert.deepEqual(conn.sent[1], { t: 'result', ok: true });
  assert.equal(unlocked, 1);
  assert.ok(states.includes('ready') && states.includes('checking') && states.includes('unlocked'));
  assert.equal(w.peers[0].destroyed, false, 'kept a moment so the reply reaches the phone');
  w.runTimers(10);
  assert.equal(w.peers[0].destroyed, true);
  assert.equal(s.running(), false);
  assert.equal(w.peers.length, 1, 'no new ID after an unlock');
});

test('fake Peer: wrong PIN fails, the ID is one-time (reuse rejected) and a new ID follows', async () => {
  const w = fakeWorld();
  let unlocked = 0;
  const s = C.createSession({ Peer: w.Peer, timers: w.timers, settleMs: 10, verify: async (p) => p === '1357', onUnlock: () => unlocked++ });
  s.start();
  const first = s.id();
  const conn = w.connect(w.peers[0]);
  const nonce = conn.sent[0].nonce;
  conn.emit('data', { t: 'pin', pin: '0000', nonce });
  await tick();
  assert.deepEqual(conn.sent[1], { t: 'result', ok: false });
  assert.equal(unlocked, 0);
  assert.equal(s.used(), true);
  // reuse of the same session: the right PIN on the same connection is refused
  conn.emit('data', { t: 'pin', pin: '1357', nonce });
  await tick();
  assert.deepEqual(conn.sent[2], { t: 'result', ok: false, reason: 'used' });
  // and a second phone connecting to the used ID is refused at once
  const late = w.connect(w.peers[0]);
  assert.deepEqual(late.sent[0], { t: 'result', ok: false, reason: 'used' });
  assert.equal(unlocked, 0);
  // after the settle delay: old peer destroyed, a fresh one-time ID
  w.runTimers(10);
  assert.equal(w.peers[0].destroyed, true);
  assert.equal(w.peers.length, 2);
  assert.notEqual(s.id(), first);
  assert.equal(s.used(), false);
  // the new session takes the right PIN; its nonce is new too
  const c2 = w.connect(w.peers[1]);
  assert.notEqual(c2.sent[0].nonce, nonce);
  c2.emit('data', { t: 'pin', pin: '1357', nonce: nonce });   // old nonce: not this session
  await tick();
  assert.deepEqual(c2.sent[1], { t: 'result', ok: false, reason: 'nonce' });
  assert.equal(s.used(), false, 'a wrong nonce does not use up the try');
  c2.emit('data', { t: 'pin', pin: '1357', nonce: c2.sent[0].nonce });
  await tick();
  assert.deepEqual(c2.sent[2], { t: 'result', ok: true });
  assert.equal(unlocked, 1);
  assert.deepEqual(s.ids(), [first, w.peers[1].id]);
});

test('fake Peer: a malformed PIN also uses the try; new ID after each attempt; refresh after ~2 minutes', async () => {
  const w = fakeWorld();
  let verifies = 0;
  const s = C.createSession({ Peer: w.Peer, timers: w.timers, settleMs: 10, refreshMs: 120000, verify: async () => { verifies++; return true; } });
  s.start();
  const c = w.connect(w.peers[0]);
  c.emit('data', { t: 'pin', pin: '12345', nonce: c.sent[0].nonce });
  await tick();
  assert.deepEqual(c.sent[1], { t: 'result', ok: false });
  assert.equal(verifies, 0);
  w.runTimers(10);
  assert.equal(w.peers.length, 2);
  // unrelated messages are ignored
  const c2 = w.connect(w.peers[1]);
  c2.emit('data', 'hi'); c2.emit('data', { t: 'other' });
  await tick();
  assert.equal(c2.sent.length, 1);
  // refresh: an unused ID is replaced after refreshMs
  const before = s.id();
  assert.ok(w.pending().some((t) => t.ms === 120000));
  w.runTimers(120000);
  assert.equal(w.peers.length, 3);
  assert.notEqual(s.id(), before);
  assert.equal(w.peers[1].destroyed, true);
  // taken ID → a new one at once; network errors retry later; stop() ends it all
  w.peers[2].emit('error', { type: 'unavailable-id' });
  assert.equal(w.peers.length, 4);
  w.peers[3].emit('error', { type: 'network' });
  assert.equal(w.peers.length, 4);
  w.runTimers(15000);
  assert.equal(w.peers.length, 5);
  s.stop();
  assert.equal(w.peers[4].destroyed, true);
  w.runTimers();
  assert.equal(w.peers.length, 5);
});

test('phone client (hub_unlock.js) with a fake Peer talks to the Hub session', async () => {
  globalThis.HubLockCore = C;
  const Client = require('../core/hub_unlock.js');
  const w = fakeWorld();
  let unlocked = 0;
  const hub = C.createSession({ Peer: w.Peer, timers: w.timers, settleMs: 10, verify: async (p) => p === '2580', onUnlock: () => unlocked++ });
  hub.start();
  const hubPeer = w.peers[0];
  // wire a phone peer straight to the hub peer
  class PhonePeer {
    constructor() { emitter(this); this.destroyed = false; setImmediate(() => this.emit('open', 'phone')); }
    connect(id) {
      assert.equal(id, hub.id());
      const toHub = emitter({ send: (m) => setImmediate(() => toPhone.emit('data', m)), close() {} });
      const toPhone = emitter({ send: (m) => setImmediate(() => toHub.emit('data', m)), close() {} });
      setImmediate(() => { hubPeer.emit('connection', toHub); toHub.emit('open'); });
      return toPhone;
    }
    destroy() { this.destroyed = true; }
  }
  const states = [];
  const bad = Client({ Peer: PhonePeer, id: 'nope', timers: w.timers, onState: (s) => states.push(s) });
  bad.connect();
  assert.deepEqual(states, ['bad-id']);
  states.length = 0;
  const cl = Client({ Peer: PhonePeer, id: hub.id(), timers: w.timers, onState: (s) => states.push(s) });
  assert.equal(cl.send('2580'), false, 'nothing sent before the hello');
  cl.connect();
  for (let i = 0; i < 6; i++) await tick();
  assert.deepEqual(states, ['connecting', 'ready']);
  assert.equal(cl.send('25'), false);
  assert.equal(cl.send('2580'), true);
  assert.equal(cl.send('2580'), false, 'one send per page');
  for (let i = 0; i < 6; i++) await tick();
  assert.deepEqual(states, ['connecting', 'ready', 'sending', 'ok']);
  assert.equal(unlocked, 1);
});

test('keys stay out of profile / sync, and the SW shell lists the new files with a consistent bump', () => {
  assert.equal(C.KEYS.pin, 'hub-lock.pin');
  assert.equal(C.KEYS.on, 'hub-lock.on');
  const prof = read('hub/core/hub_profile.js');
  assert.match(prof, /const P = 'sites-hub\.';/);
  assert.match(prof, /if \(k && k\.indexOf\(P\) === 0\) names\.push/);   // collect() takes only 'sites-hub.' keys
  assert.equal(/hub-lock/.test(prof), false);
  const sw = read('hub/update/hub_sw.js');
  const V = sw.match(/^const V = '(\d{8}[a-z]?)';/m)[1];
  const cache = +sw.match(/^const CACHE = 'hub-shell-v(\d+)';/m)[1];
  assert.equal(cache, 162);   // H143.1
  assert.match(read('sw.js'), new RegExp("importScripts\\('hub/update/hub_sw\\.js\\?v=" + V + "'\\);"));
  const shell = sw.slice(sw.indexOf('const SHELL = ['), sw.indexOf('];', sw.indexOf('const SHELL = [')));
  const listed = Array.from(shell.replace(/\/\/.*$/gm, '').matchAll(/'([^']+)'/g), (m) => m[1]);
  ['hub/core/hub_lock_core.js', 'hub/core/hub_lock.js', 'hub/core/hub_lock.css', 'shared/vendor/peerjs.min.js', 'unlock.html', 'hub/core/hub_unlock.js'].forEach((f) => {
    assert.ok(listed.includes(f), f + ' in SHELL');
    assert.ok(fs.existsSync(path.join(ROOT, f)), f + ' exists');
  });
  assert.equal(new Set(listed).size, listed.length, 'no duplicate SHELL entries');
  // the vendored PeerJS is the same 1.5.4 build link_core.js pins (it skips its own load when window.Peer exists)
  const pj = read('shared/vendor/peerjs.min.js');
  assert.ok(pj.includes('"version":"1.5.4"'));
  assert.equal(pj, read('apps/office/print/vendor/peerjs.min.js'));
  assert.match(read('shared/link/link_core.js'), /peerjs@1\.5\.4/);
  assert.match(read('shared/link/link_core.js'), /if \(window\.Peer\) return Promise\.resolve\(window\.Peer\);/);
  // desktop only: lock files in desktop.html, right after hub_break.js; not in phone.html
  const desk = read('desktop/desktop.html');
  const iBreak = desk.indexOf('<script src="hub/core/hub_break.js">');
  const iCore = desk.indexOf('<script src="hub/core/hub_lock_core.js">');
  const iLock = desk.indexOf('<script src="hub/core/hub_lock.js">');
  assert.ok(iBreak > 0 && iCore > iBreak && iLock > iCore);
  assert.ok(desk.indexOf('<script src="shared/vendor/qrcode.js">') < iLock);
  assert.equal(/<script[^>]+peerjs/.test(desk), false, 'PeerJS is not a page script (lazy only)');
  assert.equal(/hub_lock/.test(read('phone.html')), false);
});
