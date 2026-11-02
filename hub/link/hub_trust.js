/*
 * H97 HubTrust (hub/link/hub_trust.js): per-device trust passcode, like a Bluetooth pairing PIN.
 * Each device has its own 6-digit passcode (localStorage 'hub-trust-passcode', device-only, made on first run).
 * B pairs with A by typing A's passcode instead of A tapping Allow: B {k:'hi'} → A {k:'nonce', n} → B {k:'proof', n,
 *   h: HMAC-SHA256(passcode, n + '|' + B's public key)} (the envelope is H51-signed with that key) → A {k:'ok'} | {k:'no'}.
 *   The passcode never travels. On ok both add each other to the H51 trust list (how 'passcode', permanent).
 * Throttle: 5 wrong proofs from one device → its attempts are refused for 15 min (this page run).
 * API window.HubTrust (apps: window.top.HubTrust):
 *   isTrusted(numberOrDeviceId) → bool   myPasscode() → '123456'   setPasscode(p) → bool (6 digits; paired devices stay)
 *   pair(numberOrDeviceId, passcode) → Promise<{ok, reason?}>  reason: 'offline' | 'no-key' | 'timeout' | 'wrong' | 'blocked' | 'bad-passcode'
 *   list() → HubMesh.trusted()   remove(deviceId) → bool   window event 'hub-trust-changed' {detail:{deviceId}}
 */
(function () {
  'use strict';
  if (window.HubTrust) return;
  var PK = 'hub-trust-passcode', RE = /^\d{6}$/, NUM_RE = /^[1-9]\d{4}$/, MAX_FAIL = 5, BLOCK_MS = 15 * 60000, NONCE_MS = 60000;
  var subtle = window.crypto && crypto.subtle, enc = new TextEncoder(), nonces = new Map(), fails = new Map(), waits = new Map();
  function M() { return window.HubMesh; }
  function meshes() { var m = M(); if (!m) return []; var p = m.publicLineIf && m.publicLineIf(); return p && p.state() !== 'stopped' ? [m, p] : [m]; }
  function rnd(n) { var a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
  function myPasscode() {
    var p = localStorage.getItem(PK);
    if (!RE.test(p || '')) { p = String(100000 + rnd(900000)); try { localStorage.setItem(PK, p); } catch (_) { /* blocked */ } }
    return p;
  }
  function setPasscode(p) { p = String(p || '').trim(); if (!RE.test(p)) return false; localStorage.setItem(PK, p); changed(''); return true; }
  function changed(d) { window.dispatchEvent(new CustomEvent('hub-trust-changed', { detail: { deviceId: d } })); }
  function hex(b) { return Array.from(new Uint8Array(b)).map(function (x) { return (x < 16 ? '0' : '') + x.toString(16); }).join(''); }
  function proof(pass, n, pk) {
    return subtle.importKey('raw', enc.encode(pass), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      .then(function (k) { return subtle.sign('HMAC', k, enc.encode(n + '|' + pk)); }).then(hex);
  }
  /** A side: check B's proof (nonce used once, 5 wrong = 15 min block) → Promise<{ok, why}> */
  function check(dev, n, h, pk) {
    var f = fails.get(dev) || { c: 0, until: 0 };
    if (f.until > Date.now()) return Promise.resolve({ ok: false, why: 'blocked' });
    var x = nonces.get(dev); nonces.delete(dev);
    if (!pk) return Promise.resolve({ ok: false, why: 'no-key' });
    if (!x || x.n !== n || Date.now() - x.at > NONCE_MS) return Promise.resolve({ ok: false, why: 'timeout' });
    return proof(myPasscode(), n, pk).then(function (want) {
      if (want === h) { fails.delete(dev); return { ok: true }; }
      f.c++; if (f.c >= MAX_FAIL) { f.until = Date.now() + BLOCK_MS; f.c = 0; }
      fails.set(dev, f);
      return { ok: false, why: f.until > Date.now() ? 'blocked' : 'wrong' };
    });
  }
  function nonce(dev) { var a = new Uint8Array(16); crypto.getRandomValues(a); var n = hex(a); nonces.set(dev, { n: n, at: Date.now() }); return n; }
  function myName() { var D = window.SharedLinkDevices; try { return String(D && D.name ? D.name() : 'Device').slice(0, 40); } catch (_) { return 'Device'; } }
  function trust(m, dev, name) { if (m.trustAdd && m.trustAdd(dev, name)) { changed(dev); return true; } return false; }
  var wired = new WeakSet();
  function wireOne(m) {
    if (!m || wired.has(m) || !m.channel) return;
    wired.add(m);
    var ch = m.channel('pair');
    ch.on(function (d, from) {
      if (!d || typeof d !== 'object') return;
      if (d.k === 'hi') ch.send(from, { k: 'nonce', n: nonce(from) });
      else if (d.k === 'proof') check(from, d.n, d.h, m.peerKey(from)).then(function (r) {
        if (r.ok) trust(m, from, d.name);
        ch.send(from, r.ok ? { k: 'ok', name: myName() } : { k: 'no', why: r.why });
      });
      else { var w = waits.get(from); if (w) { waits.delete(from); w(d); } }
    });
  }
  function wire() { meshes().forEach(wireOne); }
  /** device + mesh for a 5-digit number or a device id */
  function find(t) {
    t = String(t || ''); var hit = null;
    meshes().forEach(function (m) {
      if (hit) return;
      var r = (m.roster() || []).concat(m.peers() || []).filter(function (p) { return p && (p.deviceId === t || (NUM_RE.test(t) && p.num === t)); })[0];
      if (r) hit = { m: m, dev: r.deviceId }; else if (m.lobbyId && m.lobbyId() === t) hit = { m: m, dev: t };
    });
    return hit;
  }
  function isTrusted(t) {
    t = String(t || ''); var m = M(); if (!m || !m.trustOf) return false;
    if (!NUM_RE.test(t)) return m.trustOf(t) === 'trusted';
    return meshes().some(function (x) { return (x.roster() || []).some(function (p) { return p.num === t && m.trustOf(p.deviceId) === 'trusted'; }); });
  }
  function ask(m, dev, data, ms) {
    return new Promise(function (res) {
      waits.set(dev, res);
      var r = m.channel('pair').send(dev, data);
      if (r && r.ok === false) { waits.delete(dev); res(null); return; }
      setTimeout(function () { if (waits.get(dev) === res) { waits.delete(dev); res(null); } }, ms);
    });
  }
  function pair(t, pass) {
    pass = String(pass || '').trim();
    if (!RE.test(pass)) return Promise.resolve({ ok: false, reason: 'bad-passcode' });
    wire(); var x = find(t);
    if (!x) return Promise.resolve({ ok: false, reason: 'offline' });
    var pk = x.m.publicKey && x.m.publicKey();
    if (!pk || !subtle) return Promise.resolve({ ok: false, reason: 'no-key' });
    return ask(x.m, x.dev, { k: 'hi' }, 8000).then(function (d) {
      if (!d || d.k !== 'nonce') return { k: 'no', why: d && d.why || 'timeout' };
      return proof(pass, d.n, pk).then(function (h) { return ask(x.m, x.dev, { k: 'proof', n: d.n, h: h, name: myName() }, 8000); });
    }).then(function (d) {
      if (d && d.k === 'ok') { trust(x.m, x.dev, d.name); return { ok: true }; }
      return { ok: false, reason: (d && d.why) || 'timeout' };
    });
  }
  /* B side of an H51 join approval: while the lobby is asking, offer 'Enter passcode' instead (once per wait) */
  var offered = 0;
  function offer() {
    var m = M(), st = m && m.stats && m.stats(), w = st && st.waitApproval;
    if (!w || w === offered || !m.lobbyId()) return;
    offered = w;
    var A = window.HubAttention, title = 'Waiting for Allow on the lobby device', text = 'Or type that device\u2019s passcode (Settings \u203A Devices) to pair now.';
    function go(v) {
      if (v !== true) return;
      var p = window.prompt('Passcode of the lobby device (6 digits)');
      if (p) pair(m.lobbyId(), p).then(function (r) { var N = window.HubNotify; if (N && N.notice) N.notice({ icon: '\uD83D\uDD10', title: r.ok ? 'Paired' : 'Pairing failed', text: r.ok ? 'Trusted both ways.' : r.reason }); });
    }
    if (A && A.ask) A.ask({ id: 'trust-offer', title: title, text: text, ok: 'Enter passcode', no: 'Keep waiting', timeoutMs: 45000 }, go);
  }
  function hook() { var m = M(); if (m && m.on && !hook.done) { hook.done = true; m.on('status', function () { setTimeout(offer, 0); }); } wire(); }
  hook(); setInterval(hook, 15000); myPasscode();
  window.addEventListener('hub-number-changed', wire);
  window.HubTrust = {
    isTrusted: isTrusted, myPasscode: myPasscode, setPasscode: setPasscode, pair: pair,
    list: function () { var m = M(); return m && m.trusted ? m.trusted() : []; },
    remove: function (d) { var m = M(); if (!m || !m.trustOf || m.trustOf(d) !== 'trusted') return false; m.forget(d); changed(d); return true; },
    LIMITS: { MAX_FAIL: MAX_FAIL, BLOCK_MS: BLOCK_MS },
    _proof: proof, _check: check, _nonce: nonce   // tests
  };
})();
