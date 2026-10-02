'use strict';

/* ============================================================
 * Drop — device-to-device file transfer over WebRTC (PeerJS)
 *
 * Flow: host generates a 4-digit code -> registers PeerJS id
 * `<idPrefix><code>`. Joiner enters the code and connects to that
 * id. Host must approve. After that the signaling connection is
 * dropped and files flow directly between the two browsers.
 *
 * Wire protocol over one raw data channel:
 *   - strings: JSON control messages
 *   - ArrayBuffers: [uint32 transferId][payload]
 *   sender -> receiver: offer, done, abort
 *   receiver -> sender: ready, reject, cancel, received
 * ============================================================ */

const CONFIG = {
  // Make this unique to your org: the public PeerJS cloud id space is shared.
  idPrefix: 'yourorg-drop-',
  codeTtlMs: 2 * 60 * 1000,        // code lifetime
  approveTimeoutMs: 30 * 1000,     // host must accept within this
  connectTimeoutMs: 15 * 1000,     // signaling / ICE setup
  maxFileBytes: 50 * 1024 * 1024,
  chunkBytes: 16 * 1024 - 4,       // 4-byte header + payload = 16 KiB frames
  readBlockBytes: 256 * 1024,
  bufferHigh: 1024 * 1024,         // pause sending above this
  bufferLow: 256 * 1024,           // resume below this
  // Extra PeerJS options. Self-hosting later? { host, port, path, secure: true }
  peerOptions: {},
};

const $ = (id) => document.getElementById(id);

const state = {
  session: 0,
  phase: 'home', // home | host-wait | join-wait | connected
  role: null,    // host | join
  peer: null,
  conn: null,
  approved: false,
  peerLabel: '',
  timer: null,
  tick: null,
  expiresAt: 0,
  reconnects: 0,
  nextId: 1,
  queue: [],
  sending: false,
  outById: new Map(),
  incoming: null,
  urls: [],
  wake: null,
};

const myLabel = deviceLabel();

/* ---------------- helpers ---------------- */

function el(tag, props = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'hidden') n.hidden = v;
    else n.setAttribute(k, v);
  }
  n.append(...kids);
  return n;
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let i = -1;
  do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
  return `${n.toFixed(n >= 100 ? 0 : 1).replace(/\.0$/, '')} ${units[i]}`;
}

function formatClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function makeCode() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 10000).padStart(4, '0');
}

function deviceLabel() {
  const ua = navigator.userAgent || '';
  const os = /iPhone/.test(ua) ? 'iPhone'
    : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'Mac'
    : /CrOS/.test(ua) ? 'Chromebook'
    : /Linux/.test(ua) ? 'Linux'
    : 'Device';
  const br = /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /Chrome|CriOS/.test(ua) ? 'Chrome'
    : /Safari/.test(ua) ? 'Safari'
    : '';
  return br ? `${os} · ${br}` : os;
}

// Anything that came from the other device is untrusted: clean it before display.
function cleanLabel(x) {
  return String(x || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40) || 'Unknown device';
}
function cleanName(x) {
  const s = String(x || '').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_').replace(/^\.+/, '').trim();
  return s.slice(-120) || 'file';
}
// Never let a peer pick a type the browser might render (html, svg, ...).
function safeMime(x) {
  const s = String(x || '').toLowerCase();
  return /^(image\/(png|jpeg|gif|webp|heic|heif|avif|bmp)|video\/[\w.+-]+|audio\/[\w.+-]+|application\/pdf|application\/zip|text\/plain)$/.test(s)
    ? s : 'application/octet-stream';
}

function isArrayBuffer(d) {
  return d instanceof ArrayBuffer || Object.prototype.toString.call(d) === '[object ArrayBuffer]';
}

function toast(message, kind = 'info') {
  const n = el('div', { class: 'toast', 'data-kind': kind }, message);
  $('toasts').append(n);
  setTimeout(() => n.remove(), 4500);
}

function showView(name) {
  state.phase = name;
  for (const v of document.querySelectorAll('.view')) v.hidden = v.id !== `view-${name}`;
}

function describeError(err) {
  switch (err && err.type) {
    case 'peer-unavailable':
      return 'No device is waiting with that code. It may have expired, or been mistyped.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'Cannot reach the PeerJS server. Check your internet connection.';
    case 'browser-incompatible':
      return 'This browser does not support WebRTC.';
    case 'webrtc':
      return 'Could not set up a direct connection. Try the same Wi-Fi, or another network.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

/* ---------------- session lifecycle ---------------- */

const alive = (sid) => sid === state.session;

function clearTimers() {
  clearTimeout(state.timer);
  clearInterval(state.tick);
  state.timer = state.tick = null;
}
function armTimer(ms, fn) {
  clearTimeout(state.timer);
  state.timer = setTimeout(fn, ms);
}

// Ends everything. Bumping `session` first makes every stale callback a no-op.
function endSession() {
  state.session++;
  clearTimers();
  for (const t of state.outById.values()) if (t.resolveReady) t.resolveReady(false);
  if (state.conn) { try { state.conn.close(); } catch {} }
  if (state.peer) { try { state.peer.destroy(); } catch {} }
  for (const u of state.urls) URL.revokeObjectURL(u);
  Object.assign(state, {
    peer: null, conn: null, approved: false, role: null, peerLabel: '',
    reconnects: 0, nextId: 1, queue: [], sending: false, incoming: null, urls: [],
  });
  state.outById = new Map();
  $('transfers').replaceChildren();
  $('approve').hidden = true;
  releaseAwake();
}

function newSession() {
  endSession();
  return state.session;
}

function resetToHome(message, kind) {
  endSession();
  showView('home');
  $('code-input').value = '';
  if (message) toast(message, kind);
}

function fail(sid, message) {
  if (alive(sid)) resetToHome(message, 'error');
}

/* ---------------- pairing: host ---------------- */

function renderCode(code) {
  $('code-display').replaceChildren(...[...code].map((d) => el('span', {}, d)));
}

function startHost(attempt = 0) {
  const sid = newSession();
  state.role = 'host';
  showView('host-wait');
  renderCode('····');
  $('code-timer').textContent = formatClock(CONFIG.codeTtlMs);

  const code = makeCode();
  const peer = new Peer(CONFIG.idPrefix + code, CONFIG.peerOptions);
  state.peer = peer;
  armTimer(CONFIG.connectTimeoutMs, () =>
    fail(sid, 'Could not reach the PeerJS server. Check your internet connection.'));

  peer.on('open', () => {
    if (!alive(sid)) return;
    clearTimeout(state.timer);
    renderCode(code);
    state.expiresAt = Date.now() + CONFIG.codeTtlMs;
    state.tick = setInterval(() => {
      if (!alive(sid)) return;
      const left = state.expiresAt - Date.now();
      if (left <= 0) { resetToHome('That code expired. Generate a new one.'); return; }
      $('code-timer').textContent = formatClock(left);
    }, 250);
  });

  peer.on('connection', (conn) => onIncoming(sid, conn));

  peer.on('disconnected', () => {
    if (!alive(sid) || state.phase !== 'host-wait' || state.conn) return;
    if (state.reconnects++ < 3) { try { peer.reconnect(); } catch {} }
    else resetToHome('Lost connection to the PeerJS server.', 'error');
  });

  peer.on('error', (err) => {
    if (!alive(sid) || state.phase === 'connected') return;
    // Someone already holds this code: quietly pick another.
    if (err.type === 'unavailable-id' && attempt < 5) { startHost(attempt + 1); return; }
    console.error(err);
    resetToHome(describeError(err), 'error');
  });
}

function onIncoming(sid, conn) {
  // A code is single-use: only the first caller gets a dialog. Tell latecomers why.
  if (!alive(sid)) { try { conn.close(); } catch {} return; }
  if (state.conn) {
    conn.on('open', () => {
      try { conn.send(JSON.stringify({ t: 'denied', reason: 'busy' })); } catch {}
      setTimeout(() => { try { conn.close(); } catch {} }, 200);
    });
    return;
  }
  state.conn = conn;
  state.approved = false;
  state.peerLabel = cleanLabel(conn.metadata && conn.metadata.label);
  clearInterval(state.tick);
  armTimer(CONFIG.connectTimeoutMs, () => fail(sid, 'Connection attempt failed. Generate a new code.'));

  conn.on('open', () => {
    if (!alive(sid)) return;
    $('approve-label').textContent = state.peerLabel;
    $('approve').hidden = false;
    $('btn-accept').focus();
    armTimer(CONFIG.approveTimeoutMs, () => deny(sid, 'No response in time. That code is now discarded.'));
  });
  wireConn(sid, conn);
}

function acceptPeer() {
  if (state.role !== 'host' || !state.conn || state.approved || !state.conn.open) return;
  state.approved = true;
  $('approve').hidden = true;
  clearTimeout(state.timer);
  sendCtl({ t: 'hello', label: myLabel });
  enterConnected();
}

function deny(sid, message) {
  if (!alive(sid) || state.approved) return;
  clearTimeout(state.timer);
  $('approve').hidden = true;
  sendCtl({ t: 'denied' });
  // Give the message a moment to flush before the channel closes.
  setTimeout(() => { if (alive(sid)) resetToHome(message); }, 150);
}

/* ---------------- pairing: joiner ---------------- */

function startJoin(raw) {
  const code = String(raw).replace(/\D/g, '');
  if (code.length !== 4) { toast('Enter the 4-digit code.', 'error'); return; }

  const sid = newSession();
  state.role = 'join';
  showView('join-wait');
  $('join-status').textContent = 'Connecting…';

  const peer = new Peer(CONFIG.peerOptions);
  state.peer = peer;
  armTimer(CONFIG.connectTimeoutMs, () =>
    fail(sid, 'Could not reach the PeerJS server. Check your internet connection.'));

  peer.on('open', () => {
    if (!alive(sid)) return;
    $('join-status').textContent = 'Looking for the other device…';
    const conn = peer.connect(CONFIG.idPrefix + code, {
      reliable: true,          // ordered delivery: required for file chunks
      serialization: 'raw',    // we frame our own messages
      metadata: { label: myLabel },
    });
    state.conn = conn;
    armTimer(CONFIG.connectTimeoutMs, () =>
      fail(sid, 'Could not connect to that device. Check the code and try again.'));
    conn.on('open', () => {
      if (!alive(sid)) return;
      $('join-status').textContent = 'Waiting for the other device to accept…';
      armTimer(CONFIG.approveTimeoutMs + 5000, () => fail(sid, 'The other device did not accept in time.'));
    });
    wireConn(sid, conn);
  });

  peer.on('error', (err) => {
    if (!alive(sid) || state.phase === 'connected') return;
    console.error(err);
    resetToHome(describeError(err), 'error');
  });
}

function handleHandshake(d) {
  if (typeof d !== 'string') return;
  let m;
  try { m = JSON.parse(d); } catch { return; }
  if (!m) return;
  if (m.t === 'hello') {
    state.approved = true;
    state.peerLabel = cleanLabel(m.label);
    clearTimeout(state.timer);
    enterConnected();
  } else if (m.t === 'denied') {
    resetToHome(m.reason === 'busy'
      ? 'That code is already being used by another device.'
      : 'The other device declined the connection.');
  }
}

/* ---------------- shared connection wiring ---------------- */

function wireConn(sid, conn) {
  conn.on('data', (d) => {
    if (!alive(sid)) return;
    if (state.approved) handleData(d);
    else if (state.role === 'join') handleHandshake(d);
  });
  conn.on('close', () => {
    if (!alive(sid)) return;
    resetToHome(state.phase === 'connected'
      ? 'The other device disconnected.'
      : 'The other device left before connecting.');
  });
  conn.on('error', (err) => {
    if (!alive(sid)) return;
    console.error(err);
    resetToHome('Connection error. Please try again.', 'error');
  });
  conn.on('iceStateChanged', (s) => {
    if (alive(sid) && s === 'failed') {
      resetToHome('Could not set up a direct connection. Try the same Wi-Fi, or another network.', 'error');
    }
  });
}

function enterConnected() {
  clearTimers();
  $('peer-label').textContent = state.peerLabel || 'other device';
  showView('connected');
  refreshEmpty();
  // Free the code and stop talking to the signaling server; the direct link stays up.
  try { state.peer.disconnect(); } catch {}
  holdAwake();
  toast('Connected.');
}

function sendCtl(m) {
  const c = state.conn;
  if (c && c.open) c.send(JSON.stringify(m));
}

/* ---------------- incoming data ---------------- */

function handleData(d) {
  if (typeof d === 'string') {
    let m;
    try { m = JSON.parse(d); } catch { return; }
    handleControl(m);
  } else if (isArrayBuffer(d)) {
    handleChunk(d);
  } else if (ArrayBuffer.isView(d)) {
    handleChunk(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
  }
}

function handleControl(m) {
  if (!m || typeof m !== 'object' || !Number.isInteger(m.id)) return;
  switch (m.t) {
    case 'offer': return onOffer(m);
    case 'done': return onDone(m);
    case 'abort': return onAbort(m);
    case 'ready': case 'reject': case 'cancel': case 'received': return onReply(m);
  }
}

function onOffer(m) {
  const size = m.size;
  if (!Number.isInteger(size) || size < 0) return;
  if (state.incoming) { sendCtl({ t: 'reject', id: m.id, reason: 'Receiver busy' }); return; }
  if (size > CONFIG.maxFileBytes) {
    sendCtl({ t: 'reject', id: m.id, reason: `Over ${formatBytes(CONFIG.maxFileBytes)}` });
    return;
  }
  const t = createTransfer('in', { id: m.id, name: cleanName(m.name), size, mime: safeMime(m.mime) });
  state.incoming = t;
  t.speedAt = performance.now();
  setStatus(t, 'active', 'Receiving…');
  refreshEmpty();
  sendCtl({ t: 'ready', id: m.id });
}

function handleChunk(buf) {
  const t = state.incoming;
  if (!t || buf.byteLength < 4) return;
  if (new DataView(buf).getUint32(0) !== t.id) return;
  const payload = buf.slice(4);
  t.received += payload.byteLength;
  if (t.received > t.size) {
    state.incoming = null;
    t.parts = null;
    setStatus(t, 'failed', 'Received more data than announced');
    sendCtl({ t: 'cancel', id: t.id });
    return;
  }
  t.parts.push(payload);
  setProgress(t, t.received);
}

function onDone(m) {
  const t = state.incoming;
  if (!t || t.id !== m.id) return;
  state.incoming = null;
  if (t.received !== t.size) {
    t.parts = null;
    setStatus(t, 'failed', 'Incomplete transfer');
    sendCtl({ t: 'cancel', id: t.id });
    return;
  }
  const blob = new Blob(t.parts, { type: t.mime });
  t.parts = null;
  const url = URL.createObjectURL(blob);
  state.urls.push(url);
  t.saveLink.href = url;
  t.saveLink.download = t.name;
  setStatus(t, 'done', 'Received');
  sendCtl({ t: 'received', id: t.id });
}

function onAbort(m) {
  const t = state.incoming;
  if (!t || t.id !== m.id) return;
  state.incoming = null;
  t.parts = null;
  setStatus(t, 'cancelled', 'Cancelled by the sender');
}

function onReply(m) {
  const t = state.outById.get(m.id);
  if (!t) return;
  if (m.t === 'ready') {
    if (t.status === 'waiting' && t.resolveReady) t.resolveReady(true);
  } else if (m.t === 'reject') {
    if (t.status === 'waiting') {
      setStatus(t, 'failed', `Declined: ${String(m.reason || 'rejected').slice(0, 60)}`);
      if (t.resolveReady) t.resolveReady(false);
    }
  } else if (m.t === 'cancel') {
    if (['waiting', 'active', 'sent'].includes(t.status)) {
      setStatus(t, 'cancelled', 'Cancelled by the other device');
      if (t.resolveReady) t.resolveReady(false);
    }
  } else if (m.t === 'received') {
    if (t.status === 'sent') setStatus(t, 'done', 'Delivered');
  }
}

/* ---------------- transfer UI ---------------- */

function createTransfer(dir, { id, name, size, mime, file }) {
  const meta = el('div', { class: 'meta' });
  const bar = el('span');
  const cancelBtn = el('button', { class: 'btn small ghost', type: 'button' }, 'Cancel');
  const saveLink = el('a', { class: 'btn small primary', hidden: true }, 'Save');
  const li = el('li', { class: 'transfer', 'data-dir': dir },
    el('div', { class: 'icon', 'aria-hidden': 'true' }, dir === 'out' ? '↑' : '↓'),
    el('div', { class: 'main' },
      el('div', { class: 'name', title: name }, name),
      meta,
      el('div', { class: 'bar' }, bar)),
    el('div', { class: 'actions' }, cancelBtn, saveLink));

  const t = {
    dir, id, name, size, mime, file, li, meta, bar, cancelBtn, saveLink,
    status: 'queued', sent: 0, received: 0, parts: [], offered: false,
    lastPaint: 0, speedAt: 0, speedBytes: 0, speed: 0, resolveReady: null,
  };
  cancelBtn.addEventListener('click', () => cancelTransfer(t));
  $('transfers').append(li);
  return t;
}

function setStatus(t, status, text) {
  t.status = status;
  t.li.dataset.status = status;
  if (text !== undefined) t.meta.textContent = `${formatBytes(t.size)} · ${text}`;
  t.cancelBtn.hidden = !['queued', 'waiting', 'active'].includes(status);
  t.saveLink.hidden = !(t.dir === 'in' && status === 'done');
  if (status === 'done') t.bar.style.width = '100%';
}

function setProgress(t, bytes, force = false) {
  const now = performance.now();
  if (!force && now - t.lastPaint < 120) return;
  t.lastPaint = now;
  const pct = t.size ? Math.min(100, (bytes / t.size) * 100) : 100;
  t.bar.style.width = `${pct.toFixed(1)}%`;
  if (now - t.speedAt >= 500) {
    t.speed = (bytes - t.speedBytes) / ((now - t.speedAt) / 1000);
    t.speedAt = now;
    t.speedBytes = bytes;
  }
  const verb = t.dir === 'out' ? 'Sending' : 'Receiving';
  const speed = t.speed > 0 ? ` · ${formatBytes(t.speed)}/s` : '';
  t.meta.textContent = `${formatBytes(t.size)} · ${verb} ${Math.floor(pct)}%${speed}`;
}

function refreshEmpty() {
  $('empty-hint').hidden = $('transfers').children.length > 0;
}

function hasActiveTransfers() {
  if (state.incoming) return true;
  for (const t of state.outById.values()) {
    if (['queued', 'waiting', 'active'].includes(t.status)) return true;
  }
  return false;
}

function cancelTransfer(t) {
  if (t.dir === 'out') {
    if (!['queued', 'waiting', 'active'].includes(t.status)) return;
    const offered = t.offered;
    setStatus(t, 'cancelled', 'Cancelled');
    if (offered) sendCtl({ t: 'abort', id: t.id });
    if (t.resolveReady) t.resolveReady(false);
  } else {
    if (t.status !== 'active') return;
    if (state.incoming === t) state.incoming = null;
    t.parts = null;
    setStatus(t, 'cancelled', 'Cancelled');
    sendCtl({ t: 'cancel', id: t.id });
  }
}

/* ---------------- sending ---------------- */

function enqueueFiles(files) {
  if (state.phase !== 'connected') return;
  for (const file of files) {
    const name = cleanName(file.name);
    if (file.size > CONFIG.maxFileBytes) {
      toast(`${name} is larger than ${formatBytes(CONFIG.maxFileBytes)}.`, 'error');
      continue;
    }
    if (file.size === 0) {
      toast(`${name} is empty.`, 'error');
      continue;
    }
    const t = createTransfer('out', { id: state.nextId++, name, size: file.size, mime: file.type, file });
    state.outById.set(t.id, t);
    setStatus(t, 'queued', 'Queued');
    state.queue.push(t);
  }
  refreshEmpty();
  pump();
}

async function pump() {
  if (state.sending) return;
  const sid = state.session;
  state.sending = true;
  try {
    while (alive(sid) && state.queue.length) {
      const t = state.queue.shift();
      if (t.status === 'queued') await sendOne(sid, t);
    }
  } finally {
    if (alive(sid)) state.sending = false;
  }
}

async function drain(dc, sid) {
  while (alive(sid) && dc.bufferedAmount > CONFIG.bufferHigh) {
    await new Promise((resolve) => {
      let tm;
      const done = () => {
        clearTimeout(tm);
        dc.removeEventListener('bufferedamountlow', done);
        resolve();
      };
      dc.bufferedAmountLowThreshold = CONFIG.bufferLow;
      dc.addEventListener('bufferedamountlow', done);
      tm = setTimeout(done, 200); // safety net if the event is missed
    });
  }
}

async function sendOne(sid, t) {
  const conn = state.conn;
  const dc = conn && conn.dataChannel;
  if (!dc) { setStatus(t, 'failed', 'Not connected'); return; }

  setStatus(t, 'waiting', 'Waiting for the other device…');
  const ready = new Promise((resolve) => { t.resolveReady = resolve; });
  t.offered = true;
  sendCtl({ t: 'offer', id: t.id, name: t.name, size: t.size, mime: t.file.type });

  const ok = await ready;
  if (!ok || !alive(sid) || t.status !== 'waiting') return;

  setStatus(t, 'active', 'Sending…');
  t.speedAt = performance.now();
  t.speedBytes = 0;

  for (let offset = 0; offset < t.size; ) {
    if (!alive(sid) || t.status !== 'active') return;
    const end = Math.min(offset + CONFIG.readBlockBytes, t.size);
    const block = await t.file.slice(offset, end).arrayBuffer();
    for (let p = 0; p < block.byteLength; p += CONFIG.chunkBytes) {
      const len = Math.min(CONFIG.chunkBytes, block.byteLength - p);
      const frame = new Uint8Array(4 + len);
      new DataView(frame.buffer).setUint32(0, t.id);
      frame.set(new Uint8Array(block, p, len), 4);
      await drain(dc, sid);
      if (!alive(sid) || t.status !== 'active') return;
      conn.send(frame.buffer);
      t.sent += len;
      setProgress(t, Math.max(0, t.sent - dc.bufferedAmount));
    }
    offset = end;
  }

  if (!alive(sid) || t.status !== 'active') return;
  setProgress(t, t.size, true);
  sendCtl({ t: 'done', id: t.id });
  setStatus(t, 'sent', 'Sent · waiting for confirmation');
}

/* ---------------- keep the screen awake while connected ---------------- */

async function holdAwake() {
  try {
    if (!('wakeLock' in navigator) || state.wake) return;
    const w = await navigator.wakeLock.request('screen');
    if (state.phase !== 'connected') { w.release(); return; }
    state.wake = w;
    w.addEventListener('release', () => { if (state.wake === w) state.wake = null; });
  } catch {}
}
function releaseAwake() {
  try { if (state.wake) state.wake.release(); } catch {}
  state.wake = null;
}

/* ---------------- init ---------------- */

function init() {
  $('dz-sub').textContent = `or tap to choose · up to ${formatBytes(CONFIG.maxFileBytes)} each`;

  if (typeof Peer === 'undefined' || !window.RTCPeerConnection) {
    $('btn-generate').disabled = true;
    $('btn-join').disabled = true;
    toast('This browser cannot run WebRTC, or PeerJS failed to load.', 'error');
    return;
  }

  $('btn-generate').addEventListener('click', () => startHost());
  $('join-form').addEventListener('submit', (e) => { e.preventDefault(); startJoin($('code-input').value); });
  $('code-input').addEventListener('input', (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4);
    e.target.value = v;
    if (v.length === 4 && state.phase === 'home') startJoin(v); // connect as soon as the 4th digit lands
  });
  $('btn-cancel-host').addEventListener('click', () => resetToHome());
  $('btn-cancel-join').addEventListener('click', () => resetToHome());
  $('btn-disconnect').addEventListener('click', () => resetToHome('Disconnected.'));
  $('btn-accept').addEventListener('click', acceptPeer);
  $('btn-decline').addEventListener('click', () => deny(state.session, 'Declined. That code is now discarded.'));

  const input = $('file-input');
  const zone = $('dropzone');
  input.addEventListener('change', () => {
    const files = Array.from(input.files || []);
    input.value = '';
    enqueueFiles(files);
  });
  zone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
  });
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    if (e.dataTransfer) enqueueFiles(Array.from(e.dataTransfer.files));
  });
  // A file dropped outside the zone must not navigate the tab away.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  window.addEventListener('beforeunload', (e) => {
    if (state.phase === 'connected' && hasActiveTransfers()) { e.preventDefault(); e.returnValue = ''; }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.phase === 'connected') holdAwake();
  });
}

init();
