// H142 PIN lock screen (hub/core/hub_lock.js) with a tiny fake DOM: no browser, no network, no PeerJS server.
// Run: node --test hub/tests/hub_lock_screen.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const ROOT = path.join(__dirname, '..', '..');
const CORE = fs.readFileSync(path.join(ROOT, 'hub/core/hub_lock_core.js'), 'utf8');
const LOCK = fs.readFileSync(path.join(ROOT, 'hub/core/hub_lock.js'), 'utf8');
const tick = () => new Promise((r) => setImmediate(r));
const settle = async (n) => { for (let i = 0; i < (n || 8); i++) await tick(); };
// PBKDF2 with the real rounds takes a moment: wait until cond() holds (max 5 s)
async function until(cond, what) { const end = Date.now() + 5000; while (!cond()) { if (Date.now() > end) throw new Error('timed out: ' + what); await new Promise((r) => setTimeout(r, 5)); } }
const plain = (v) => JSON.parse(JSON.stringify(v));   // results made in the vm realm

function emitter(o) {
  const ev = {};
  o.on = (k, f) => { (ev[k] = ev[k] || []).push(f); return o; };
  o.emit = (k, ...a) => (ev[k] || []).forEach((f) => f(...a));
  return o;
}
function page(opts) {
  const o = opts || {};
  let doc;
  class ClassList {
    constructor() { this.s = new Set(); }
    add(c) { this.s.add(c); } remove(c) { this.s.delete(c); } contains(c) { return this.s.has(c); }
    toggle(c, v) { if (v === undefined) v = !this.s.has(c); if (v) this.s.add(c); else this.s.delete(c); return v; }
  }
  class Element {
    constructor(tag) {
      this.tagName = tag.toUpperCase(); this.children = []; this.attrs = new Map(); this.hidden = false;
      this.classList = new ClassList(); this.events = {}; this.dataset = {}; this.style = {}; this._text = ''; this.parentNode = null;
    }
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
    appendChild(c) { if (c.parentNode) c.parentNode.children = c.parentNode.children.filter((x) => x !== c); this.children.push(c); c.parentNode = this; if (this === doc.head && c.tagName === 'SCRIPT') doc.scripts.push(c); return c; }
    contains(x) { while (x) { if (x === this) return true; x = x.parentNode; } return false; }
    setAttribute(k, v) { this.attrs.set(k, String(v)); }
    getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
    hasAttribute(k) { return this.attrs.has(k); }
    removeAttribute(k) { this.attrs.delete(k); }
    addEventListener(k, f) { (this.events[k] = this.events[k] || []).push(f); }
    querySelector(sel) { const tag = sel.toUpperCase(); const walk = (e) => { for (const c of e.children) { if (c.tagName === tag) return c; const r = walk(c); if (r) return r; } return null; }; return walk(this); }
    focus() { doc.activeElement = this; }
    blur() { doc.activeElement = doc.body; }
    click() { (this.events.click || []).forEach((f) => f({ target: this, stopPropagation() {}, preventDefault() {} })); }
  }
  doc = { scripts: [], createElement: (t) => new Element(t), addEventListener(k, f) { (doc.events[k] = doc.events[k] || []).push(f); }, events: {}, baseURI: 'https://jor-teron.github.io/sites/' };
  doc.documentElement = new Element('html');
  doc.head = new Element('head'); doc.body = new Element('body');
  doc.documentElement.append(doc.head, doc.body);
  const work = new Element('input'); doc.body.appendChild(work); work.focus();
  if (o.preClass) doc.documentElement.classList.add('hub-locked');
  const store = o.store || new Map();
  const wev = {};
  const peers = [];
  class Peer { constructor(id) { emitter(this); this.id = id; this.destroyed = false; peers.push(this); } destroy() { this.destroyed = true; } }
  const win = {
    addEventListener(k, f) { (wev[k] = wev[k] || []).push(f); },
    dispatchEvent(e) { (wev[e.type] || []).forEach((f) => f(e)); },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    crypto: webcrypto,
    qrcode: () => ({ addData(u) { this.u = u; }, make() {}, createSvgTag() { return '<svg data-u="' + this.u + '"></svg>'; } })
  };
  if (o.peer) win.Peer = Peer;
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  const ctx = {
    window: win, document: doc, localStorage: win.localStorage, location: { protocol: o.protocol || 'https:', href: doc.baseURI + 'desktop/desktop.html' },
    navigator: { onLine: o.online !== false }, CustomEvent, URL, TextEncoder, btoa, atob, console, Uint8Array, Promise,
    // short waits (the reply settle delay) run fast; long ones (2-minute refresh, retries) never fire in a test
    setTimeout: (f, ms) => { const t = setTimeout(f, (ms || 0) <= 1000 ? Math.min(ms || 0, 5) : 2147483647); t.unref(); return t; }, clearTimeout
  };
  win.window = win;
  vm.createContext(ctx);
  vm.runInContext(CORE, ctx);
  vm.runInContext(LOCK, ctx);
  const html = doc.documentElement;
  const lockEl = () => html.children.find((c) => c.attrs && c.id === 'hub-lock') || null;
  const all = (e, out) => { out = out || []; out.push(e); e.children.forEach((c) => all(c, out)); return out; };
  const key = (k) => { const l = lockEl(); return all(l).find((e) => e.dataset && e.dataset.k === k); };
  const press = (digits) => String(digits).split('').forEach((d) => key(d).click());
  const keydown = (k, target) => { const e = { type: 'keydown', key: k, target: target || doc.body, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } }; (wev.keydown || []).forEach((f) => f(e)); return e; };
  return { win, doc, html, store, peers, Peer, lockEl, key, press, keydown, work, api: win.HubLock, storage: (k) => (wev.storage || []).forEach((f) => f({ key: k })) };
}
async function storeWith(pin, on) {
  const p = page();
  if (pin) assert.equal((await p.api.setPin(pin)).ok, true);
  if (on) assert.equal((await p.api.setOn(true)).ok, true);
  return p.store;
}

test('off by default: no overlay, no inert, no PeerJS load, Lock now refused', async () => {
  const p = page({ preClass: true });
  assert.equal(p.api.isOn(), false);
  assert.equal(p.lockEl(), null);
  assert.equal(p.html.classList.contains('hub-locked'), false, 'a stale early class is dropped');
  assert.equal(p.doc.body.hasAttribute('inert'), false);
  assert.equal(p.doc.scripts.length, 0, 'no PeerJS script');
  assert.equal(p.api.lockNow(), false);
  assert.equal(p.lockEl(), null);
  const e = p.keydown('a');
  assert.equal(e.prevented, false, 'keys are untouched while unlocked');
});

test('a PIN alone never locks; Activate without a PIN refused; Activate on does not lock until load / Lock now', async () => {
  const p = page();
  assert.deepEqual(plain(await p.api.setOn(true)), { ok: false, error: 'no-pin' });
  assert.equal((await p.api.setPin('1234')).ok, true);
  assert.equal(p.api.isOn(), false);
  assert.equal(p.lockEl(), null);
  assert.equal((await p.api.setOn(true)).ok, true);
  assert.equal(p.api.locked(), false, 'switching on does not lock this page at once');
  assert.equal(p.api.lockNow(), true);
  assert.equal(p.api.locked(), true);
  assert.equal(p.lockEl().hidden, false);
});

test('the lock shows on load when on: body inert + hidden, keys trapped, PeerJS lazy-loaded, PIN pad unlocks', async () => {
  const store = await storeWith('2468', true);
  const p = page({ store });
  assert.equal(p.api.locked(), true);
  const l = p.lockEl();
  assert.ok(l && !l.hidden);
  assert.equal(l.parentNode, p.html);
  assert.equal(p.html.lastElementChild, l, 'after <body>');
  assert.equal(p.doc.body.hasAttribute('inert'), true);
  assert.equal(p.html.classList.contains('hub-locked'), true);
  assert.ok(l.contains(p.doc.activeElement), 'focus pulled to the pad');
  assert.equal(p.doc.scripts.length, 1);
  assert.equal(p.doc.scripts[0].src, 'https://jor-teron.github.io/sites/shared/vendor/peerjs.min.js');
  // Hub shortcuts are stopped
  const e = p.keydown('k');
  assert.equal(e.prevented && e.stopped, true);
  // wrong PIN: stays locked, entry cleared
  p.press('1111');
  await until(() => /Wrong PIN/.test(l.textContent), 'wrong PIN message');
  assert.equal(p.api.locked(), true);
  // keyboard digits work the pad; right PIN unlocks
  ['2', '4', '6', '8'].forEach((d) => p.keydown(d));
  await until(() => !p.api.locked(), 'keypad unlock');
  assert.equal(p.api.locked(), false);
  assert.equal(l.hidden, true);
  assert.equal(p.doc.body.hasAttribute('inert'), false);
  assert.equal(p.html.classList.contains('hub-locked'), false);
  assert.equal(p.doc.activeElement, p.work, 'focus restored');
  assert.equal(p.keydown('k').prevented, false);
});

test('phone QR over a fake Peer: right PIN unlocks, wrong PIN gets a new one-time QR', async () => {
  const store = await storeWith('9753', true);
  const p = page({ store, peer: true });
  assert.equal(p.api.locked(), true);
  assert.equal(p.doc.scripts.length, 0, 'window.Peer already there: no second load');
  await settle();
  assert.equal(p.peers.length, 1);
  const id1 = p.peers[0].id;
  assert.match(id1, /^hublock-[0-9a-f]{16}$/);
  p.peers[0].emit('open', id1);
  const qr = () => p.lockEl().children[0].children[1].children[1];   // wrap › phone side › qr box
  assert.equal(qr().dataset.link, 'https://jor-teron.github.io/sites/unlock.html#' + id1);
  const phone = () => { const c = emitter({ sent: [], send(m) { this.sent.push(m); }, close() {} }); return c; };
  const c1 = phone();
  p.peers[0].emit('connection', c1); c1.emit('open');
  c1.emit('data', { t: 'pin', pin: '0000', nonce: c1.sent[0].nonce });
  await until(() => c1.sent.length > 1, 'phone result');
  assert.deepEqual(plain(c1.sent[1]), { t: 'result', ok: false });
  assert.equal(p.api.locked(), true);
  await until(() => p.peers.length === 2, 'fresh ID');   // settle delay → a fresh ID
  assert.equal(p.peers[0].destroyed, true);
  assert.equal(p.peers.length, 2);
  assert.notEqual(p.peers[1].id, id1);
  const c2 = phone();
  p.peers[1].emit('connection', c2); c2.emit('open');
  c2.emit('data', { t: 'pin', pin: '9753', nonce: c2.sent[0].nonce });
  await until(() => c2.sent.length > 1, 'phone result 2');
  assert.deepEqual(plain(c2.sent[1]), { t: 'result', ok: true });
  assert.equal(p.api.locked(), false);
  await until(() => p.peers[1].destroyed, 'peer destroyed after unlock');
  assert.equal(p.peers.length, 2, 'no session after unlocking');
});

test('offline or file://: pad only, no PeerJS', async () => {
  const store = await storeWith('1357', true);
  const off = page({ store, online: false });
  assert.equal(off.api.locked(), true);
  assert.equal(off.doc.scripts.length, 0);
  assert.match(off.lockEl().textContent, /No internet/);
  const file = page({ store, protocol: 'file:' });
  assert.equal(file.doc.scripts.length, 0);
  assert.match(file.lockEl().textContent, /web address/);
  file.press('1357');
  await until(() => !file.api.locked(), 'file:// keypad unlock');
  assert.equal(file.api.locked(), false);
});

test('removing the PIN turns the lock off (and opens a locked page)', async () => {
  const store = await storeWith('8642', true);
  const p = page({ store });
  assert.equal(p.api.locked(), true);
  assert.deepEqual(plain(await p.api.removePin('1111')), { ok: false, error: 'wrong-current' });
  assert.equal(p.api.locked(), true);
  assert.deepEqual(plain(await p.api.removePin('8642')), { ok: true });
  assert.equal(p.api.isOn(), false);
  assert.equal(p.api.hasPin(), false);
  assert.equal(p.api.locked(), false);
  assert.equal(store.size, 0);
  const again = page({ store });
  assert.equal(again.api.locked(), false);
  // another tab turning it off (with the PIN there) opens this one too
  const s2 = await storeWith('1212', true);
  const q = page({ store: s2 });
  assert.equal(q.api.locked(), true);
  s2.delete('hub-lock.on');
  q.storage('hub-lock.on');
  assert.equal(q.api.locked(), false);
});
