/*
 * H143.1: the phone unlock page (hub/core/hub_unlock.js + unlock.html) with a fake PeerJS: error codes by phase,
 * Try again (same code), "Use PIN instead", and the Hub side's error codes + reconnect. No browser.
 *   node hub/tests/hub_unlock_client.test.cjs
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const C = require('../core/hub_lock_core.js');
globalThis.HubLockCore = C;
const Client = require('../core/hub_unlock.js');
const ID = 'hublock-0123456789abcdef';

function emitter(o) {
  const ev = {};
  o.on = (k, f) => { (ev[k] = ev[k] || []).push(f); return o; };
  o.emit = (k, ...a) => (ev[k] || []).forEach((f) => f(...a));
  return o;
}
function world() {
  const peers = [];
  class Peer {
    constructor() { emitter(this); this.destroyed = false; this.conns = []; this.reconnects = 0; peers.push(this); }
    connect(id, opt) { const c = emitter({ id, opt, sent: [], closed: false, send(m) { this.sent.push(m); }, close() { this.closed = true; } }); this.conns.push(c); return c; }
    reconnect() { this.reconnects++; }
    destroy() { this.destroyed = true; }
  }
  let q = [];
  const timers = { setTimeout: (f, ms) => { const t = { f, ms }; q.push(t); return t; }, clearTimeout: (t) => { q = q.filter((x) => x !== t); } };
  const run = (ms) => { const now = q.filter((t) => ms == null || t.ms === ms); q = q.filter((t) => !now.includes(t)); now.forEach((t) => t.f()); };
  return { Peer, peers, timers, run, pending: () => q.map((t) => t.ms) };
}
function client(w) {
  const states = [];
  const cl = Client({ Peer: w.Peer, id: ID, timers: w.timers, onState: (s, info) => states.push([s, info]) });
  return { cl, states, last: () => states[states.length - 1] };
}

test('timeout is 45 s and the code says how far it got (server / computer / hello / answer)', () => {
  let w = world(), c = client(w);
  c.cl.connect();
  assert.ok(w.pending().includes(45000));
  w.run(45000);
  assert.deepEqual(c.last(), ['failed', { why: 'timeout-server' }]);
  w = world(); c = client(w); c.cl.connect();
  w.peers[0].emit('open', 'me');
  assert.equal(w.peers[0].conns[0].id, ID);
  w.run(45000);
  assert.deepEqual(c.last(), ['failed', { why: 'timeout-computer' }]);
  w = world(); c = client(w); c.cl.connect();
  w.peers[0].emit('open', 'me'); w.peers[0].conns[0].emit('open');
  w.run(45000);
  assert.deepEqual(c.last(), ['failed', { why: 'timeout-hello' }]);
  w = world(); c = client(w); c.cl.connect();
  w.peers[0].emit('open', 'me');
  const conn = w.peers[0].conns[0];
  conn.emit('open'); conn.emit('data', { t: 'hello', v: 1, nonce: 'n1' });
  assert.deepEqual(c.last(), ['ready', { pin: true, finger: false, pinHidden: false }]);
  assert.equal(c.cl.send('1234'), true);
  assert.deepEqual(conn.sent[0], { t: 'pin', pin: '1234', nonce: 'n1' });
  w.run(45000);
  assert.deepEqual(c.last(), ['failed', { why: 'timeout-answer' }]);
});

test('PeerJS error types, link errors and closes pass through as codes', () => {
  let w = world(), c = client(w); c.cl.connect();
  w.peers[0].emit('error', { type: 'peer-unavailable' });
  assert.deepEqual(c.last(), ['failed', { why: 'peer-unavailable' }]);
  w = world(); c = client(w); c.cl.connect();
  w.peers[0].emit('error', {});
  assert.deepEqual(c.last(), ['failed', { why: 'peer-error' }]);
  w = world(); c = client(w); c.cl.connect();
  w.peers[0].emit('open'); w.peers[0].conns[0].emit('close');
  assert.deepEqual(c.last(), ['failed', { why: 'closed-computer' }]);
  w = world(); c = client(w); c.cl.connect();
  w.peers[0].emit('open'); w.peers[0].conns[0].emit('error', { type: 'negotiation-failed' });
  assert.deepEqual(c.last(), ['failed', { why: 'link-negotiation-failed' }]);
  // lost the server before linking: reconnect once (no second link when it opens again)
  w = world(); c = client(w); c.cl.connect();
  w.peers[0].emit('disconnected');
  assert.equal(w.peers[0].reconnects, 1);
  w.peers[0].emit('open'); w.peers[0].emit('open');
  assert.equal(w.peers[0].conns.length, 1);
  assert.equal(c.last()[0], 'connecting');
});

test('Try again: a fresh phone peer to the same code; the old cleanup does not cut it off', () => {
  const w = world(), c = client(w);
  assert.equal(c.cl.retry(), false, 'nothing to retry before a try');
  c.cl.connect();
  w.peers[0].emit('error', { type: 'network' });
  assert.equal(c.last()[0], 'failed');
  assert.equal(c.cl.retry(), true);
  assert.equal(w.peers.length, 2);
  assert.equal(w.peers[0].destroyed, true);
  assert.equal(c.last()[0], 'connecting');
  w.run(1500);   // the first try's delayed close
  assert.equal(w.peers[1].destroyed, false);
  w.peers[0].emit('error', { type: 'network' });   // late events from the old peer are ignored
  assert.equal(c.last()[0], 'connecting');
  w.peers[1].emit('open');
  const conn = w.peers[1].conns[0];
  assert.equal(conn.id, ID);
  conn.emit('data', { t: 'reg', v: 1, nonce: 'n2', challenge: 'abc', user: 'u', exclude: [] });
  assert.equal(c.last()[0], 'reg');
  assert.equal(c.cl.sendCred({ credId: 'x' }), true);
  conn.emit('data', { t: 'result', ok: true });
  assert.equal(c.last()[0], 'ok');
});

test('phone + Hub session end to end: fingerprint only, "hello" says pinHidden and the PIN unlocks', async () => {
  const w = world();
  let unlocked = 0;
  const hubPeers = [];
  class HubPeer { constructor(id) { emitter(this); this.id = id; hubPeers.push(this); } destroy() {} }
  const hub = C.createSession({ Peer: HubPeer, timers: w.timers, settleMs: 10, verify: async (p) => p === '2580', onUnlock: () => unlocked++,
    pinOk: () => false, finger: () => ({ allow: ['A'.repeat(20)] }), verifyAssert: () => false });
  hub.start();
  class PhonePeer {
    constructor() { emitter(this); setImmediate(() => this.emit('open', 'phone')); }
    connect(id) {
      assert.equal(id, hub.id());
      const toHub = emitter({ send: (m) => setImmediate(() => toPhone.emit('data', m)), close() {} });
      const toPhone = emitter({ send: (m) => setImmediate(() => toHub.emit('data', m)), close() {} });
      setImmediate(() => { hubPeers[0].emit('connection', toHub); toHub.emit('open'); toPhone.emit('open'); });
      return toPhone;
    }
    destroy() {}
  }
  const states = [];
  const cl = Client({ Peer: PhonePeer, id: hub.id(), timers: w.timers, onState: (s, info) => states.push([s, info]) });
  cl.connect();
  for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r));
  assert.deepEqual(states[1], ['ready', { pin: true, finger: true, pinHidden: true }]);
  assert.equal(states[2][0], 'chal');
  assert.equal(cl.send('2580'), true);
  for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r));
  assert.equal(states[states.length - 1][0], 'ok');
  assert.equal(unlocked, 1);
});

test('Hub side: disconnected shows a code, reconnects with the same ID, and drops the pending new-ID retry', () => {
  const w = world(), st = [];
  const hubPeers = [];
  class HubPeer { constructor(id) { emitter(this); this.id = id; this.reconnects = 0; hubPeers.push(this); } reconnect() { this.reconnects++; } destroy() { this.destroyed = true; } }
  const s = C.createRegSession({ Peer: HubPeer, timers: w.timers, onCred: () => ({ ok: true }), onState: (a, info) => st.push([a, info && info.type]) });
  s.start();
  hubPeers[0].emit('open');
  hubPeers[0].emit('disconnected');
  assert.deepEqual(st[st.length - 1], ['error', 'disconnected']);
  assert.equal(hubPeers[0].reconnects, 1);
  assert.ok(w.pending().includes(15000));
  hubPeers[0].emit('open');   // back on the server
  assert.equal(st[st.length - 1][0], 'ready');
  assert.equal(w.pending().includes(15000), false, 'no new ID needed');
  w.run(15000);
  assert.equal(hubPeers.length, 1);
  hubPeers[0].emit('error', { type: 'server-error' });
  assert.deepEqual(st[st.length - 1], ['error', 'server-error']);
  w.run(15000);
  assert.equal(hubPeers.length, 2, 'still retries with a new ID');
  s.stop();
});

/* ---------- the page itself (unlock.html ids) in a tiny fake DOM ---------- */
function phonePage(hash, PeerCls) {
  const els = {};
  const mkEl = (id, hidden) => (els[id] = { id, hidden: !!hidden, disabled: false, value: '', textContent: '', className: '', ev: {},
    addEventListener(k, f) { (this.ev[k] = this.ev[k] || []).push(f); }, focus() {}, click() { (this.ev.click || []).forEach((f) => f({ preventDefault() {} })); } });
  ['form', 'pin', 'go', 'msg', 'title', 'lead'].forEach((i) => mkEl(i));
  mkEl('fp', true); mkEl('code', true); mkEl('again', true); mkEl('usepin', true);
  const win = { document: { getElementById: (i) => els[i] || null }, location: { hash, pathname: '/sites/unlock.html', hostname: 'jor-teron.github.io' },
    history: { replaceState() {} }, navigator: { userAgent: 'Android' }, Peer: PeerCls, HubLockCore: C };
  win.window = win;
  const ctx = vm.createContext(Object.assign(win, { setTimeout: () => 0, clearTimeout() {}, Promise, console }));
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'hub/core/hub_unlock.js'), 'utf8'), ctx);
  return els;
}
test('page: a failure shows "Error code: ..." and Try again; Try again reconnects; Use PIN instead reveals the PIN box', () => {
  const peers = [];
  class P { constructor() { emitter(this); this.conns = []; peers.push(this); } connect() { const c = emitter({ sent: [], send(m) { this.sent.push(m); }, close() {} }); this.conns.push(c); return c; } destroy() {} }
  const e = phonePage('#' + ID, P);
  assert.equal(peers.length, 1);
  peers[0].emit('error', { type: 'peer-unavailable' });
  assert.match(e.msg.textContent, /Could not reach the computer/);
  assert.equal(e.code.hidden, false);
  assert.equal(e.code.textContent, 'Error code: peer-unavailable');
  assert.equal(e.again.hidden, false);
  e.again.click();
  assert.equal(peers.length, 2, 'Try again made a new phone peer');
  assert.equal(e.again.hidden, true);
  assert.equal(e.code.hidden, true);
  peers[1].emit('open');
  peers[1].conns[0].emit('data', { t: 'hello', v: 2, nonce: 'n', pin: true, pinHidden: true, finger: true });
  assert.equal(e.form.hidden, true, 'PIN box waits behind Use PIN instead');
  assert.equal(e.usepin.hidden, false);
  e.usepin.click();
  assert.equal(e.form.hidden, false);
  assert.equal(e.pin.disabled, false);
  e.pin.value = '2580';
  (e.form.ev.submit || []).forEach((f) => f({ preventDefault() {} }));
  assert.deepEqual(JSON.parse(JSON.stringify(peers[1].conns[0].sent[0])), { t: 'pin', pin: '2580', nonce: 'n' });
  // no PeerJS at all: code no-peerjs, no Try again
  const e2 = phonePage('#r:' + ID, undefined);
  assert.equal(e2.code.textContent, 'Error code: no-peerjs');
  assert.equal(e2.again.hidden, true);
  // PIN only: the box shows at once, no Use PIN instead
  const peers3 = [];
  class P3 extends P { constructor() { super(); peers3.push(this); } }
  const e3 = phonePage('#' + ID, P3);
  peers3[0].emit('open'); peers3[0].conns[0].emit('data', { t: 'hello', v: 1, nonce: 'm' });
  assert.equal(e3.form.hidden, false); assert.equal(e3.usepin.hidden, true);
});

test('unlock.html has the H143.1 elements; the Hub screens show error codes', () => {
  const h = fs.readFileSync(path.join(ROOT, 'unlock.html'), 'utf8');
  assert.match(h, /<button id="usepin" type="button" hidden>Use PIN instead<\/button>/);
  assert.match(h, /<p id="code" hidden><\/p>/);
  assert.match(h, /<button id="again" type="button" hidden>Try again<\/button>/);
  assert.match(fs.readFileSync(path.join(ROOT, 'hub/core/hub_lock.js'), 'utf8'), /' \(Error code: ' \+ \(\(info && info\.type\) \|\| 'unknown'\)/);
  assert.match(fs.readFileSync(path.join(ROOT, 'apps/system/settings/sec_lock.js'), 'utf8'), /Retrying\\u2026 \(Error code: /);
});
