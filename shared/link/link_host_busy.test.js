/*
 * H136 offline smoke: host-number registration with a mocked Peer.
 * Run: node shared/link/link_host_busy.test.js
 * No network, no browser, no broker. Time is a fake clock.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');
const CODE = '12345';
const PAD = '67890';
const DEV = 'hub-aaaaaaaa-aaa';
const PREFIX = 'jtsites-';
const NUM = PREFIX + CODE;
const ALIAS = PREFIX + PAD;

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error('FAIL: ' + msg);
  } else {
    console.log('ok: ' + msg);
  }
}

function makeStore(seed) {
  const data = Object.assign({}, seed);
  return {
    data: data,
    writes: [],
    api: {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[k] = String(v); this && 0; writesOf(data, k); },
      removeItem: function (k) { delete data[k]; }
    }
  };
}
function writesOf(data, k) { data.__writes = data.__writes || []; data.__writes.push(k); }

function makeClock() {
  const now = { t: 0 };
  const queues = [];
  function attach(ctx) {
    const q = [];
    let seq = 1;
    function arm(fn, ms, interval) {
      const t = { id: ++seq, fn: fn, ms: ms || 0, at: now.t + (ms || 0), interval: !!interval };
      q.push(t);
      return t.id;
    }
    ctx.setTimeout = function (fn, ms) { return arm(fn, ms, false); };
    ctx.setInterval = function (fn, ms) { return arm(fn, ms, true); };
    ctx.clearTimeout = ctx.clearInterval = function (id) {
      const i = q.findIndex(function (t) { return t.id === id; });
      if (i >= 0) q.splice(i, 1);
    };
    queues.push(q);
    return q;
  }
  function advance(ms) {
    const end = now.t + ms;
    let guard = 0;
    while (guard++ < 100000) {
      let best = null, bq = null, bi = -1;
      for (let qi = 0; qi < queues.length; qi++) {
        const q = queues[qi];
        for (let i = 0; i < q.length; i++) {
          if (!best || q[i].at < best.at) { best = q[i]; bq = q; bi = i; }
        }
      }
      if (!best || best.at > end) break;
      now.t = best.at;
      if (best.interval) best.at = now.t + best.ms;
      else bq.splice(bi, 1);
      best.fn();
    }
    now.t = end;
  }
  return { now: now, attach: attach, advance: advance };
}

function makePeer(ctx) {
  function Peer(id) {
    this.id = typeof id === 'string' ? id : ('anon' + (++ctx.anon));
    this.destroyed = false;
    this.open = false;
    this._h = {};
    ctx.created.push(this);
    const self = this;
    const number = this.id === NUM;
    queueMicrotask(function () {
      if (self.destroyed) return;
      if (number && ctx.failLeft > 0) {
        ctx.failLeft--;
        self.emit('error', { type: 'unavailable-id' });
        return;
      }
      self.open = true;
      self.emit('open');
    });
  }
  Peer.prototype.on = function (ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); };
  Peer.prototype.emit = function (ev, a) { (this._h[ev] || []).slice().forEach(function (fn) { fn(a); }); };
  Peer.prototype.destroy = function () { this.destroyed = true; this.open = false; };
  Peer.prototype.reconnect = function () { if (this.destroyed) throw new Error('dead'); this.open = true; this.emit('open'); };
  return Peer;
}

function loadScripts(ctx) {
  const core = fs.readFileSync(path.join(ROOT, 'shared/link/link_devices.js'), 'utf8')
    + '\n' + fs.readFileSync(path.join(ROOT, 'shared/link/link_core.js'), 'utf8');
  vm.runInContext(core, ctx, { filename: 'link_core.js' });
}

function makePage(clock, store, failLeft) {
  const ctx = {
    console: console,
    Math: Math,
    JSON: JSON,
    Date: Date,
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Error: Error,
    Map: Map,
    Set: Set,
    Promise: Promise,
    queueMicrotask: queueMicrotask,
    localStorage: store.api,
    sessionStorage: makeStore({}).api,
    navigator: { userAgent: 'H136 test' },
    document: { head: { appendChild: function () {} }, body: null, addEventListener: function () {} },
    failLeft: failLeft,
    created: [],
    anon: 0,
    busy: [],
    taken: []
  };
  ctx.window = ctx;
  ctx.parent = ctx;
  ctx.Peer = makePeer(ctx);
  clock.attach(ctx);
  vm.createContext(ctx);
  ctx.Date.now = function () { return clock.now.t; };
  loadScripts(ctx);
  ctx.SharedLink.on('busy', function (info) { ctx.busy.push(info); });
  ctx.SharedLink.on('taken', function (c) { ctx.taken.push(c); });
  return ctx;
}

function nums(ctx) { return ctx.created.filter(function (p) { return p.id === NUM; }); }
function aliases(ctx) { return ctx.created.filter(function (p) { return p.id === ALIAS; }); }
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }

function seed() {
  return {
    'shared-link-device-code': CODE,
    'shared-link-device-id': DEV,
    'shared-link-device-name': 'Test Hub'
  };
}

async function boot(ctx, alias) {
  const opts = { prefix: PREFIX, code: CODE };
  if (alias) opts.alias = PAD;
  const p = ctx.SharedLink.host(opts);
  await flush();
  return p;
}

(async function main() {
  const srcUi = fs.readFileSync(path.join(ROOT, 'desktop/controller/hub-controller.js'), 'utf8');
  const srcPhone = fs.readFileSync(path.join(ROOT, 'phone/phone_connect.js'), 'utf8');
  const srcSet = fs.readFileSync(path.join(ROOT, 'apps/system/settings/sec_devices.js'), 'utf8');
  assert(!srcUi.includes('Another Hub is using this number'), 'desktop card no longer says another Hub owns the number');
  assert(srcUi.includes('does not show who has it'), 'desktop card says the holder is unknown');
  assert(srcUi.includes('open on this device'), 'desktop card names a same-device window');
  assert(srcPhone.includes("kind === 'same-device'"), 'phone toast splits same-device from unknown');
  assert(srcSet.includes("info.kind === 'same-device'"), 'settings copy splits same-device from unknown');
  assert(!srcSet.includes('in use by another Hub'), 'settings no longer says another Hub');

  /* 1. Stale registration keeps going past the old 10-retry budget and then opens. Saved number stays. */
  {
    const store = makeStore(seed());
    const clock = makeClock();
    const ctx = makePage(clock, store, 11);
    await boot(ctx, true);
    let guard = 0;
    while (nums(ctx).length < 12 && guard++ < 200) {
      clock.advance(1000);
      await flush();
    }
    const open = nums(ctx).filter(function (p) { return p.open && !p.destroyed; });
    assert(nums(ctx).length >= 12, 'stale id: attempt after the old budget (' + nums(ctx).length + ' number peers)');
    assert(open.length === 1, 'stale id: the later attempt opens');
    assert(ctx.busy.length === 1 && ctx.busy[0].kind === 'unknown' && ctx.busy[0].code === CODE, 'stale id: one honest unknown notice');
    assert(ctx.taken.length === 0, 'stale id: no taken event');
    assert(ctx.SharedLink.code === CODE, 'stale id: host code unchanged');
    assert(store.data['shared-link-device-code'] === CODE, 'stale id: saved number unchanged');
    assert(!(store.data.__writes || []).includes('shared-link-device-code'), 'stale id: saved number key not rewritten');
    assert(aliases(ctx).length === 1 && aliases(ctx)[0].open && !aliases(ctx)[0].destroyed, 'stale id: one live pad alias');
    assert(!JSON.stringify(ctx.busy).toLowerCase().includes('another hub'), 'stale id: notice does not name another Hub');
  }

  /* 2. Same-device pages: no broker churn while the lease is fresh; resume when it is cleared. */
  {
    const store = makeStore(seed());
    const clock = makeClock();
    const A = makePage(clock, store, 0);
    const B = makePage(clock, store, 0);
    await boot(A, true);
    await flush();
    assert(nums(A).length === 1 && nums(A)[0].open, 'holder registered once');
    assert(store.data['shared-link-host-lease'] && store.data['shared-link-host-lease'].indexOf(CODE) >= 0, 'holder wrote the lease');
    await boot(B, true);
    await B.SharedLink.host({ prefix: PREFIX, code: CODE, alias: PAD });
    await flush();
    clock.advance(120000);
    await flush();
    assert(nums(B).length === 0, 'same device: no number peer while the other window is fresh (120s)');
    assert(aliases(B).length === 0, 'same device: no pad peer while waiting');
    assert(B.busy.some(function (b) { return b.kind === 'same-device' && b.code === CODE; }), 'same device: notice names this device');
    assert(B.taken.length === 0, 'same device: no taken event');
    assert(!JSON.stringify(B.busy).toLowerCase().includes('another hub'), 'same device: notice does not name another Hub');
    A.SharedLink.pause();
    assert(!store.data['shared-link-host-lease'], 'pause clears this window\'s lease');
    clock.advance(2000);
    await flush();
    assert(nums(B).filter(function (p) { return p.open && !p.destroyed; }).length === 1, 'same device: waiter registers after the holder pauses');
    assert(B.SharedLink.code === CODE && store.data['shared-link-device-code'] === CODE, 'same device: saved number unchanged after takeover');
    assert(aliases(B).length === 1, 'same device: pad alias starts on takeover');
  }

  /* 3. Lease with no refresh is not a live holder: this page tries the broker again. */
  {
    const store = makeStore(seed());
    const clock = makeClock();
    const A = makePage(clock, store, 0);
    const B = makePage(clock, store, 0);
    await boot(A, true);
    await flush();
    await boot(B, true);
    // A crash leaves the lease behind and stops the heartbeat. pause() clears it; put the old stamp back.
    const lease = JSON.parse(store.data['shared-link-host-lease']);
    A.SharedLink.pause();
    lease.at = clock.now.t - A.SharedLink.HOST_LEASE_MS - 1;
    store.data['shared-link-host-lease'] = JSON.stringify(lease);
    const before = nums(B).length;
    clock.advance(2000);
    await flush();
    assert(nums(B).length > before, 'stale lease: waiter tries the broker once the lease is older than HOST_LEASE_MS');
    assert(B.SharedLink.code === CODE, 'stale lease: code unchanged');
  }

  /* 4. Unknown unavailable-id keeps retrying and does not rotate the number. Alias stays single. */
  {
    const store = makeStore(seed());
    const clock = makeClock();
    const ctx = makePage(clock, store, 30);
    await boot(ctx, true);
    // ID_RETRY_MS cumulative: peers at 0s, 1s, 3s, 6s, 11s, 16s (next would be 24s).
    for (let i = 0; i < 20; i++) { clock.advance(1000); await flush(); }
    const mid = nums(ctx).length;
    assert(mid === 6, 'unknown hold: paced retries match the backoff (got ' + mid + ' peers in 20s)');
    assert(ctx.taken.length === 0, 'unknown hold: still no taken event before the old budget');
    assert(ctx.busy.length === 0, 'unknown hold: no notice before the old budget');
    assert(aliases(ctx).length === 1, 'unknown hold: pad alias not recreated during early retries');
    assert(store.data['shared-link-device-code'] === CODE, 'unknown hold: saved number unchanged');
  }

  /* 5. pause / stop leave no retry timers that open more peers. */
  {
    const store = makeStore(seed());
    const clock = makeClock();
    const ctx = makePage(clock, store, 100);
    await boot(ctx, true);
    const n = nums(ctx).length;
    ctx.SharedLink.pause();
    clock.advance(300000);
    await flush();
    assert(nums(ctx).length === n, 'pause: no further number peers');
    assert(!store.data['shared-link-host-lease'], 'pause: lease cleared');
  }
  {
    const store = makeStore(seed());
    const clock = makeClock();
    const ctx = makePage(clock, store, 100);
    await boot(ctx, true);
    const n = nums(ctx).length;
    ctx.SharedLink.stop(true);
    clock.advance(500);
    await flush();
    clock.advance(300000);
    await flush();
    assert(nums(ctx).length === n, 'stop: no further number peers');
    assert(store.data['shared-link-device-code'] === CODE, 'stop: saved number unchanged');
  }

  /* 6. Successful open, then broker disconnect reconnects without a new number peer or a new pad peer. */
  {
    const store = makeStore(seed());
    const clock = makeClock();
    const ctx = makePage(clock, store, 0);
    await boot(ctx, true);
    await flush();
    const peer = nums(ctx)[0];
    assert(peer && peer.open, 'reconnect: first open');
    peer.emit('disconnected');
    clock.advance(2000);
    await flush();
    assert(nums(ctx).length === 1 && peer.open && !peer.destroyed, 'reconnect: same peer, no second registration');
    assert(aliases(ctx).length === 1 && !aliases(ctx)[0].destroyed, 'reconnect: pad alias kept');
    assert(ctx.SharedLink.code === CODE && store.data['shared-link-device-code'] === CODE, 'reconnect: saved number unchanged');
    assert(ctx.taken.length === 0 && ctx.busy.length === 0, 'reconnect: no busy/taken notice');
  }

  if (failed) {
    console.error(failed + ' failed');
    process.exit(1);
  }
  console.log('all H136 host-registration checks passed');
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
