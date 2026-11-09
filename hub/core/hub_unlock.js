/*
 * Hub phone unlock (hub/core/hub_unlock.js, for unlock.html), H142. Reads the one-time lock-screen ID from the
 * address (#hublock-<16 hex>), connects to it over PeerJS, waits for the Hub's {t:'hello', nonce}, then sends
 * {t:'pin', pin, nonce} once and shows the Hub's {t:'result', ok}. One try per QR (the Hub then makes a new code).
 * The ID is dropped from the address bar once read. Nothing is stored on the phone.
 *
 * window.HubUnlockClient(opts) — the DOM-free part (Node tests use it with a fake Peer):
 *   opts { Peer, id, onState(state, info), timeoutMs, timers }   states: connecting, ready, sending, ok, wrong,
 *   used, failed, bad-id. Returns { connect(), send(pin) → bool, close() }.
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
          if (d.t === 'hello' && typeof d.nonce === 'string' && !nonce) {
            nonce = d.nonce;
            if (timer) { T.clearTimeout(timer); timer = 0; }
            onState('ready', {});
          } else if (d.t === 'result') {
            if (d.ok === true) finish('ok');
            else finish(d.reason === 'used' ? 'used' : 'wrong', { reason: d.reason || '' });
          }
        });
        conn.on('close', () => { if (!done) finish('failed', { why: 'closed' }); });
        conn.on('error', () => finish('failed', { why: 'conn' }));
      });
    }
    function send(pin) {
      if (done || sent || !nonce || !conn || !C.validPin(pin)) return false;
      sent = true;
      onState('sending', {});
      try { conn.send({ t: 'pin', pin, nonce }); } catch (_) { finish('failed', { why: 'send' }); return false; }
      timer = T.setTimeout(() => { timer = 0; finish('failed', { why: 'timeout' }); }, timeoutMs);
      return true;
    }
    function close() { try { if (conn) conn.close(); } catch (_) { /* gone */ } try { if (peer) peer.destroy(); } catch (_) { /* gone */ } conn = peer = null; }
    return { connect, send, close };
  }
  root.HubUnlockClient = HubUnlockClient;
  if (typeof module === 'object' && module.exports) module.exports = HubUnlockClient;

  /* ---------- unlock.html ---------- */
  const doc = root.document;
  const form = doc && doc.getElementById && doc.getElementById('form');
  if (!form || !C) return;
  const pinEl = doc.getElementById('pin'), go = doc.getElementById('go'), msg = doc.getElementById('msg');
  const id = (root.location.hash || '').replace(/^#/, '');
  try { root.history.replaceState(null, '', root.location.pathname); } catch (_) { /* keep */ }   // the code is one-time: not in history
  const TEXT = {
    connecting: ['Connecting to the computer\u2026', ''],
    ready: ['Connected. Type your PIN and tap Unlock.', ''],
    sending: ['Checking\u2026', ''],
    ok: ['Unlocked. You can close this page.', 'ok'],
    wrong: ['Wrong PIN. Scan the new QR code on the computer to try again.', 'bad'],
    used: ['This code was already used. Scan the new QR code on the computer.', 'bad'],
    failed: ['Could not reach the computer. Scan the QR code again, or use the keypad on the computer.', 'bad'],
    'bad-id': ['This page needs the QR code from the Hub lock screen. Scan it with your camera.', 'bad']
  };
  const show = (s) => { const t = TEXT[s] || ['', '']; msg.textContent = t[0]; msg.className = t[1]; };
  const ready = () => !pinEl.disabled && C.validPin(pinEl.value);
  const client = HubUnlockClient({ Peer: root.Peer, id, onState: (s) => {
    show(s);
    const on = s === 'ready';
    pinEl.disabled = !on;
    go.disabled = !on || !ready();
    if (on) { try { pinEl.focus(); } catch (_) { /* ignore */ } }
  } });
  pinEl.addEventListener('input', () => { pinEl.value = pinEl.value.replace(/\D/g, '').slice(0, 4); go.disabled = !ready(); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!ready()) return;
    const pin = pinEl.value;
    pinEl.value = '';
    pinEl.disabled = true; go.disabled = true;
    client.send(pin);
  });
  if (!root.Peer) show('failed'); else client.connect();
})(typeof window !== 'undefined' ? window : globalThis);
