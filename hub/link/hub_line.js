/*
 * H91 Hub Line (hub/link/hub_line.js) — the always-on call / message receptionist of hub.html and /phone.html.
 * While the page is open (background too) this device is on the Hub mesh (hub_meshlink.js keeps it on the public
 * 00000 lobby unless a private Connect Code is on) under its 5-digit number SharedLinkDevices.code(): HubMesh
 * advertises it as roster 'num'. No second PeerJS peer: everything goes through HubMesh channels 'call' and 'msg'
 * (one device only, shape / size checked in hub_mesh.js, H51-signed like every envelope). On a private mesh the
 * Line reaches the devices of that mesh only (the mesh is one code at a time).
 * Wire (data of the envelope):
 *   call: {k:'ring', callId, from:<num>, name, video:bool}   caller → callee
 *         {k:'accept' | 'busy' | 'cancel' | 'end', callId, from:<num>}   either way
 *   msg:  {k:'msg', id, from:<num>, name, text, at}  → answered at once with {k:'ack', id}
 * Incoming ring: an app's onCall(fn) is asked first (fn returns true = handled: no Hub card); else the
 *   HubAttention.ask card (Answer / Decline, 45 s). Do Not Disturb (HubDnd): no card unless allowFavs() and the
 *   number is a favourite (HubDnd.isFav(num) if some app provides it) → a missed-call inbox entry + notice.
 *   Answer → {k:'accept'} + Telephone opens at #call=<callId>&from=<num>; Decline → {k:'busy'};
 *   no answer in 45 s / caller cancels → missed entry {kind:'missed', from, name, at, video}.
 * Incoming msg: stored in localStorage 'hub-line-inbox-v1' (max 200, device-only, not a sites-hub.* key, so H29
 *   never syncs it), dedupe by id, ack, apps' onMessage(fn) told; unless one returns true a 💬 HubNotify card
 *   (DND: notice() is quiet itself) — tap opens Messages at #chat=<num>.
 * Outbox 'hub-line-outbox-v1': sends to a number not online (or not acked in ACK_MS) wait there and go again when
 *   the number shows up in the roster (and every 15 s); kept 7 days, max 200.
 * API window.HubLine (apps: window.top.HubLine):
 *   myNumber() → '12345' | ''
 *   online(num) → Promise<bool>                         the number is an online device in the current mesh
 *   send(num, payload) → Promise<'delivered' | 'queued' | 'offline'>   payload {k:'msg', id, from, name, text, at}
 *        (or a plain string; from is always set to myNumber(), a missing id / at is made here)
 *        delivered = acked; queued = online but no ack in 8 s (kept in the outbox); offline = not online (kept)
 *   call(num, {video}) → Promise<{callId, accepted}>     signalling only (media stays app-to-app P2P);
 *        accepted false on busy / no answer in 45 s / offline; cancel by HubLine.hangup(callId)
 *   hangup(callId) → sends {k:'cancel'} (ringing) / {k:'end'}
 *   onMessage(fn({k:'msg', id, from, name, text, at}) → true if handled) → off()
 *   onCall(fn({kind:'call', callId, from, name, video, at}) → true if handled; then the app calls answer / decline) → off()
 *   onDelivered(fn({id, to})) → off()   on every ack (at once, or later for an outbox message)
 *   takeInbox(kind?) → array, SYNCHRONOUS (kind 'msg' | 'missed' | all) and removes them;  inbox() → a copy
 *   outbox() → a copy of the waiting sends
 *   Inbox entries: {kind:'msg', k:'msg', id, from, name, text, at}; {kind:'missed', from, name, at, video, callId}
 *   call(): resolves on Answer (accepted true), Decline / busy, 45 s no answer, offline (accepted false, + reason).
 */
(function () {
  'use strict';
  if (window.HubLine) return;
  var IN_K = 'hub-line-inbox-v1', OUT_K = 'hub-line-outbox-v1', MAX = 200, OUT_KEEP_MS = 7 * 864e5;
  var RING_MS = 45000, ACK_MS = 8000, NUM_RE = /^[1-9]\d{4}$/;
  var phone = !!window.PhoneLauncher || /\/phone\.html$/.test(location.pathname);
  function M() { return window.HubMesh; }
  function load(k) { try { var v = JSON.parse(localStorage.getItem(k) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v.slice(-MAX))); } catch (_) { /* full / blocked */ } }
  function clip(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, n); }
  function rid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function myNumber() { var D = window.SharedLinkDevices; try { var n = D && D.code ? String(D.code()) : ''; return NUM_RE.test(n) ? n : ''; } catch (_) { return ''; } }
  function myName() { var D = window.SharedLinkDevices; return clip(D && D.name ? D.name() : 'Device', 40); }
  function devOf(num) {
    var m = M(); if (!m || !NUM_RE.test(String(num))) return '';
    var me = m.me && m.me();
    var hit = (m.peers() || []).filter(function (p) { return p.num === String(num) && (!me || p.deviceId !== me.deviceId); });
    if (!hit.length) return '';
    // a number claimed twice: prefer a trusted device (H51), then the newest joiner
    hit.sort(function (a, b) { var ta = m.trustOf && m.trustOf(a.deviceId) === 'trusted', tb = m.trustOf && m.trustOf(b.deviceId) === 'trusted'; return (tb - ta) || (b.joinOrder - a.joinOrder); });
    return hit[0].deviceId;
  }
  function numOf(dev) { var m = M(); var r = m && (m.roster() || []).filter(function (x) { return x.deviceId === dev; })[0]; return r && r.num ? r.num : ''; }
  function chan(name) { var m = M(); try { return m && m.channel ? m.channel(name) : null; } catch (_) { return null; } }

  /* ---------- listeners ---------- */
  var onMsgFns = [], onCallFns = [];
  function add(list, fn) { if (typeof fn !== 'function') return function () {}; list.push(fn); return function () { var i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); }; }
  function tell(list, entry) { var handled = false; list.slice().forEach(function (f) { try { if (f(Object.assign({}, entry)) === true) handled = true; } catch (e) { console.warn('HubLine listener', e); } }); return handled; }

  /* ---------- inbox ---------- */
  function store(entry) {
    var list = load(IN_K);
    var key = entry.kind === 'missed' ? 'callId' : 'id';
    if (list.some(function (x) { return x.kind === entry.kind && x[key] === entry[key]; })) return false;
    list.push(entry); save(IN_K, list);
    try { window.dispatchEvent(new CustomEvent('hub-line-inbox')); } catch (_) { /* old browser */ }
    return true;
  }
  function takeInbox(kind) {
    var list = load(IN_K);
    var out = list.filter(function (x) { return !kind || x.kind === kind; });
    save(IN_K, list.filter(function (x) { return kind && x.kind !== kind; }));
    return out;
  }

  /* ---------- opening apps ---------- */
  function openApp(id, hash) {
    try {
      if (phone && window.PhoneLauncher) {
        var ids = id === 'messages' ? ['messages', 'message'] : [id];
        var ok = ids.some(function (x) { var st = PhoneLauncher.state(); return st && JSON.stringify(st).indexOf('"' + x + '"') >= 0 && (PhoneLauncher.open(x), true); });
        if (!ok) PhoneLauncher.open(ids[0]);
        var f = document.querySelector('iframe[data-app="' + ids[0] + '"], iframe[data-app="' + (ids[1] || ids[0]) + '"]');
        if (f) { try { f.contentWindow.location.hash = hash; } catch (_) { f.src = String(f.src).split('#')[0] + '#' + hash; } }
        return true;
      }
      if (window.__hubOpenApp) return window.__hubOpenApp('apps/connectivity/' + id + '/', { hash: hash });
    } catch (e) { console.warn('HubLine open', e); }
    return false;
  }

  /* ---------- messages ---------- */
  function gotMsg(d, fromDev) {
    var c = chan('msg');
    if (d.k === 'ack') { var w = acks.get(d.id); if (w) { acks.delete(d.id); w(true); } return; }   // delivered() fires from wireMsg
    if (d.k !== 'msg') return;
    var known = numOf(fromDev);
    if (known && known !== d.from) return;   // the number must be the sender's own (roster)
    if (c) c.send(fromDev, { k: 'ack', id: d.id });   // ack at once (also a repeat: the first ack may be lost)
    var msg = { k: 'msg', id: String(d.id), from: String(d.from), name: clip(d.name || 'Device', 40), text: String(d.text), at: Number(d.at) || Date.now() };   // the wire object (apps get this)
    var entry = Object.assign({ kind: 'msg' }, msg);
    if (!store(entry)) return;   // dedupe by id
    if (tell(onMsgFns, msg)) return;
    var N = window.HubNotify;
    if (N && N.notice) N.notice({ icon: '\uD83D\uDCAC', title: entry.name + ' (' + entry.from + ')', text: clip(entry.text, 140), onClick: function () { openApp('messages', 'chat=' + entry.from); } });
  }
  var acks = new Map();   // msg id -> resolve(bool)
  function waitAck(id) { return new Promise(function (res) { acks.set(id, res); setTimeout(function () { if (acks.get(id) === res) { acks.delete(id); res(false); } }, ACK_MS); }); }
  var onDelFns = [];
  function wireMsg(dev, m, to) { var c = chan('msg'); if (!c) return Promise.resolve(false); var r = c.send(dev, m); if (!r || !r.ok) return Promise.resolve(false); return waitAck(m.id).then(function (ok) { if (ok) tell(onDelFns, { id: m.id, to: to }); return ok; }); }
  function queue(num, m) { var q = load(OUT_K).filter(function (x) { return x.m.id !== m.id; }); q.push({ to: num, m: m, at: Date.now() }); save(OUT_K, q); }
  function unqueue(id) { save(OUT_K, load(OUT_K).filter(function (x) { return x.m.id !== id; })); }
  function send(num, payload) {
    num = String(num || '');
    if (!NUM_RE.test(num)) return Promise.reject(new Error('HubLine: bad number'));
    var text = typeof payload === 'string' ? payload : payload && typeof payload.text === 'string' ? payload.text : '';
    if (!text) return Promise.reject(new Error('HubLine: empty message'));
    var P = payload && typeof payload === 'object' ? payload : {};
    // from is always this device's number (the callee checks it against the roster); id / name / at kept from the app
    var m = { k: 'msg', id: (typeof P.id === 'string' && P.id && P.id.length <= 80 && P.id) || rid(myNumber() + '-'), from: myNumber(), name: clip(P.name || myName(), 40), text: text, at: typeof P.at === 'number' ? P.at : Date.now() };
    if (!m.from) return Promise.reject(new Error('HubLine: no number on this device'));
    var M0 = window.HubMesh, big = M0 && M0.LINE ? M0.LINE.MSG_BYTES : 65536;
    try { if (new Blob([JSON.stringify(m)]).size > big) return Promise.reject(new Error('HubLine: message too big (64 KB)')); } catch (_) { /* no Blob */ }
    var dev = devOf(num);
    if (!dev) { queue(num, m); return Promise.resolve('offline'); }
    return wireMsg(dev, m, num).then(function (ok) { if (ok) { unqueue(m.id); return 'delivered'; } queue(num, m); return 'queued'; });
  }
  var flushing = false;
  function flush() {
    if (flushing) return;
    var q = load(OUT_K), now = Date.now();
    var keep = q.filter(function (x) { return x && x.m && now - (x.at || 0) < OUT_KEEP_MS; });
    if (keep.length !== q.length) save(OUT_K, keep);
    var ready = keep.filter(function (x) { return devOf(x.to); });
    if (!ready.length) return;
    flushing = true;
    var me = myNumber();   // H92: a queued message goes out from the current number (it may have been changed)
    ready.reduce(function (p, x) { if (me && x.m.from !== me) x.m.from = me; return p.then(function () { return wireMsg(devOf(x.to), x.m, x.to).then(function (ok) { if (ok) unqueue(x.m.id); }); }); }, Promise.resolve())
      .then(function () { flushing = false; }, function () { flushing = false; });
  }

  /* ---------- calls ---------- */
  var calls = new Map();   // callId -> {dir:'in'|'out', dev, num, resolve, timer, card}
  function callSend(dev, d) { var c = chan('call'); return c ? c.send(dev, Object.assign({ from: myNumber() }, d)) : { ok: false }; }
  function missed(x) {
    var e = { kind: 'missed', from: x.num, name: x.name, at: x.at, video: !!x.video, callId: x.callId };
    if (store(e)) { var N = window.HubNotify; if (N && N.notice) N.notice({ icon: '\uD83D\uDCDE', title: 'Missed call', text: x.name + ' (' + x.num + ')', onClick: function () { openApp('telephone', 'from=' + x.num); } }); }
  }
  function gotCall(d, fromDev) {
    var known = numOf(fromDev);
    if (known && known !== d.from) return;
    var x = calls.get(d.callId);
    if (d.k === 'ring') {
      if (x) return;   // repeat
      x = { dir: 'in', dev: fromDev, num: String(d.from), name: clip(d.name || 'Device', 40), video: !!d.video, callId: d.callId, at: Date.now() };
      calls.set(d.callId, x);
      x.timer = setTimeout(function () { if (calls.get(x.callId) !== x) return; calls.delete(x.callId); if (x.card) x.card.close(); missed(x); }, RING_MS);
      var entry = { kind: 'call', callId: x.callId, from: x.num, name: x.name, video: x.video, at: x.at, missed: false };
      if (tell(onCallFns, entry)) return;   // the app rings itself (and answers with HubLine.answer / decline)
      var D = window.HubDnd, fav = !!(D && D.isFav && D.isFav(x.num));
      if (D && D.isOn() && !(fav && D.allowFavs())) { clearTimeout(x.timer); calls.delete(x.callId); callSend(fromDev, { k: 'busy', callId: x.callId }); missed(x); return; }
      var A = window.HubAttention;
      var title = (x.video ? '\uD83C\uDFA5 ' : '\uD83D\uDCDE ') + x.name + ' (' + x.num + ') is calling';
      if (A && A.ask) x.card = A.ask({ id: 'line-' + x.callId, title: title, text: x.video ? 'Video call' : 'Voice call', ok: 'Answer', no: 'Decline', timeoutMs: RING_MS - 500 }, function (v) { if (v === true) answer(x.callId); else if (v === false) decline(x.callId); });
      return;
    }
    if (!x || x.dev !== fromDev) return;
    if (x.dir === 'out' && (d.k === 'accept' || d.k === 'busy' || d.k === 'end')) { clearTimeout(x.timer); calls.delete(d.callId); x.resolve({ callId: d.callId, accepted: d.k === 'accept' }); return; }
    if (x.dir === 'in' && (d.k === 'cancel' || d.k === 'end')) { clearTimeout(x.timer); calls.delete(d.callId); if (x.card) x.card.close(); if (d.k === 'cancel') missed(x); }
  }
  function answer(callId) {
    var x = calls.get(callId); if (!x || x.dir !== 'in') return false;
    clearTimeout(x.timer); calls.delete(callId);
    callSend(x.dev, { k: 'accept', callId: callId });
    openApp('telephone', 'call=' + encodeURIComponent(callId) + '&from=' + x.num);
    return true;
  }
  function decline(callId) {
    var x = calls.get(callId); if (!x || x.dir !== 'in') return false;
    clearTimeout(x.timer); calls.delete(callId);
    callSend(x.dev, { k: 'busy', callId: callId });
    return true;
  }
  function call(num, o) {
    num = String(num || '');
    if (!NUM_RE.test(num)) return Promise.reject(new Error('HubLine: bad number'));
    if (!myNumber()) return Promise.reject(new Error('HubLine: no number on this device'));
    var dev = devOf(num), callId = rid('c');
    if (!dev) return Promise.resolve({ callId: callId, accepted: false, reason: 'offline' });
    return new Promise(function (res) {
      var x = { dir: 'out', dev: dev, num: num, callId: callId, resolve: res };
      calls.set(callId, x);
      var r = callSend(dev, { k: 'ring', callId: callId, name: myName(), video: !!(o && o.video) });
      if (!r || !r.ok) { calls.delete(callId); res({ callId: callId, accepted: false, reason: 'offline' }); return; }
      x.timer = setTimeout(function () { if (calls.get(callId) !== x) return; calls.delete(callId); callSend(dev, { k: 'cancel', callId: callId }); res({ callId: callId, accepted: false, reason: 'no-answer' }); }, RING_MS);
    });
  }
  function hangup(callId) {
    var x = calls.get(callId);
    if (!x) return false;
    clearTimeout(x.timer); calls.delete(callId);
    callSend(x.dev, { k: x.dir === 'out' ? 'cancel' : 'end', callId: callId });
    if (x.dir === 'out') x.resolve({ callId: callId, accepted: false, reason: 'cancelled' });
    return true;
  }

  /* ---------- wiring ---------- */
  var wired = false;
  function wire() {
    var m = M();
    if (wired || !m || !m.onMsg || !m.on) return;
    wired = true;
    m.onMsg('msg', function (d, from) { if (d && typeof d === 'object') gotMsg(d, from); });
    m.onMsg('call', function (d, from) { if (d && typeof d === 'object') gotCall(d, from); });
    ['roster', 'peers'].forEach(function (ev) { m.on(ev, function () { setTimeout(flush, 300); }); });
  }
  // H92: a new number (SharedLinkDevices.setCode): advertise it on the mesh roster now, then resend the outbox from it.
  window.addEventListener('hub-number-changed', function () { var m = M(); try { if (m && m.refresh) m.refresh(); } catch (_) { /* mesh down */ } setTimeout(flush, 500); });
  wire();
  if (!wired) document.addEventListener('DOMContentLoaded', wire);
  setInterval(function () { wire(); flush(); }, 15000);

  window.HubLine = {
    myNumber: myNumber,
    online: function (num) { return Promise.resolve(!!devOf(num)); },
    send: send, call: call, hangup: hangup, answer: answer, decline: decline,
    onMessage: function (fn) { return add(onMsgFns, fn); },
    onCall: function (fn) { return add(onCallFns, fn); },
    onDelivered: function (fn) { return add(onDelFns, fn); },
    takeInbox: takeInbox,
    inbox: function () { return load(IN_K); },
    outbox: function () { return load(OUT_K); },
    INBOX_KEY: IN_K, OUTBOX_KEY: OUT_K,
    _gotMsg: gotMsg, _gotCall: gotCall, _flush: flush   // tests
  };
})();
