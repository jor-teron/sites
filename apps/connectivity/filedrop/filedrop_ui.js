/*
 * File Drop — filedrop_ui.js
 * Screens (pair ↔ room), QR + code, file list with thumbnails and progress, overall bar with
 * files done/total + speed + ETA, drag-drop anywhere, viewer, sounds/vibration, wake lock, keys
 * (Esc closes, Ctrl+O picks files). Boots everything last.
 */
(function (FD) {
  'use strict';
  const P = FD.proto, PAIR = FD.pair, SEND = FD.send, RECV = FD.recv, SCAN = FD.scan;
  const C = () => FD.config;
  const $ = (id) => document.getElementById(id);
  const rows = new Map();          // item → {li, meta, bar, btns, thumb}
  let view = 'pair', showFiles = false, codeExp = 0, codeTick = 0, wake = null;
  let batch = [], meter = P.meter(), lastPaint = 0;

  // ----- small helpers -----
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function btn(text, cls, fn) {
    const b = el('button', 'btn ' + (cls || ''), text);
    b.type = 'button';
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  }
  function toast(text, kind) {
    const n = el('div', 'toast', text);
    if (kind) n.dataset.kind = kind;
    $('toasts').append(n);
    while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
    setTimeout(() => n.remove(), kind === 'err' ? 5000 : 3500);
  }

  // ----- sound / vibration -----
  let actx = null;
  function chime(kind) {
    if (C().vibrate && navigator.vibrate) { try { navigator.vibrate(kind === 'done' ? [30, 60, 30] : 40); } catch (_) { /* ignore */ } }
    if (!C().sound) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const notes = kind === 'done' ? [880, 1175] : [660, 990];
      notes.forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain();
        const t0 = actx.currentTime + i * 0.11;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
        o.connect(g).connect(actx.destination);
        o.start(t0); o.stop(t0 + 0.18);
      });
    } catch (_) { /* audio not allowed yet */ }
  }
  const unlockAudio = () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (_) { /* ignore */ } };

  async function holdAwake(on) {
    try {
      if (on && !wake && navigator.wakeLock && document.visibilityState === 'visible') {
        wake = await navigator.wakeLock.request('screen');
        wake.addEventListener('release', () => { wake = null; });
      } else if (!on && wake) { const w = wake; wake = null; await w.release(); }
    } catch (_) { wake = null; }
  }

  // ----- QR + code -----
  let qrUrl = '';
  function renderQr() {
    const host = $('qr');
    if (!qrUrl || typeof qrcode === 'undefined') { host.textContent = typeof qrcode === 'undefined' ? 'QR library missing' : ''; return; }
    const wrap = $('qr-wrap');
    const px = Math.floor(Math.max(90, Math.min(wrap.clientWidth, wrap.clientHeight, 320) - 12));
    if (host.dataset.url === qrUrl && host.dataset.px === String(px)) return;
    const qr = qrcode(0, 'M');
    qr.addData(qrUrl); qr.make();
    host.innerHTML = qr.createSvgTag(4, 0);
    const svg = host.querySelector('svg');
    if (svg) { svg.setAttribute('width', px); svg.setAttribute('height', px); }
    host.dataset.url = qrUrl; host.dataset.px = String(px);
    host.title = qrUrl;
  }
  function renderCode(code, exp) {
    codeExp = exp;
    $('code').textContent = code || '····';
    clearInterval(codeTick);
    const tick = () => {
      if (!code) { $('code-timer').textContent = 'getting a code…'; return; }
      $('code-timer').textContent = 'new code in ' + P.clock(codeExp - Date.now());
    };
    tick();
    if (code) codeTick = setInterval(tick, 500);
  }

  // ----- screens -----
  function sync() {
    const st = PAIR.state(), partner = PAIR.partner();
    const inRoom = !!partner || showFiles;
    view = inRoom ? 'room' : 'pair';
    $('pair').hidden = inRoom;
    $('room').hidden = !inRoom;
    $('pair-state').hidden = st !== 'connecting';
    const all = SEND.items.length + RECV.items.length;
    $('files-btn').hidden = inRoom || !all;
    $('files-n').textContent = all;
    const pre = SEND.items.filter((t) => t.status === 'queued').length;
    $('pre-n').textContent = pre ? '· ' + pre + ' queued' : '';
    $('disc').hidden = !partner;
    $('back').hidden = !!partner;
    const dot = $('dot');
    dot.className = 'dot' + (st === 'linked' ? '' : partner ? ' wait' : ' off');
    $('peer').textContent = st === 'linked' ? 'Connected to ' + partner.name
      : partner ? 'Reconnecting to ' + partner.name + '…' : 'Not connected';
    $('save-all').hidden = RECV.items.filter((r) => r.status === 'done').length < 2;
    $('empty').hidden = all > 0;
    if (view === 'pair' && st !== 'connecting') { SCAN.start(); requestAnimationFrame(renderQr); } else SCAN.stop();
  }

  // ----- list -----
  function thumbFor(it) {
    const th = el('div', 'thumb');
    const kind = it.kind || P.kind(it.type, it.name);
    if (kind === 'image' && (it.url || it.file)) {
      const img = el('img');
      img.alt = '';
      img.decoding = 'async';
      img.src = it.url || (it.thumbUrl = it.thumbUrl || URL.createObjectURL(it.file));
      img.onerror = () => { img.remove(); th.prepend(P.icon(kind)); };
      th.append(img);
    } else th.append(P.icon(kind));
    th.append(el('span', 'dir', it.dir === 'out' ? '↑' : '↓'));
    return th;
  }
  function ensureRow(it) {
    let r = rows.get(it);
    if (r) return r;
    const li = el('li', 'item');
    li.dataset.dir = it.dir;
    const info = el('div', 'info');
    const name = el('div', 'name', it.name);
    name.title = it.name;
    const meta = el('div', 'meta');
    const track = el('div', 'track'), bar = el('span');
    track.append(bar);
    info.append(name, meta, track);
    const btns = el('div', 'item-btns');
    const thumb = thumbFor(it);
    li.append(thumb, info, btns);
    li.addEventListener('click', () => { if (it.dir === 'in' && it.status === 'done') openViewer(it); });
    r = { li: li, meta: meta, bar: bar, btns: btns, thumb: thumb };
    rows.set(it, r);
    $('list').prepend(li);
    return r;
  }
  function shown(it) { return it.dir === 'out' ? SEND.shownBytes(it) : it.bytes; }
  function paintRow(it) {
    const r = ensureRow(it);
    r.li.dataset.status = it.status;
    r.li.classList.toggle('openable', it.dir === 'in' && it.status === 'done');
    const b = shown(it);
    const pct = it.size ? Math.min(100, b / it.size * 100) : 100;
    r.bar.style.width = pct.toFixed(1) + '%';
    let text = P.bytes(it.size);
    if (it.status === 'active') {
      const sp = it.speed ? ' · ' + P.bytes(it.speed) + '/s' : '';
      text += ' · ' + (it.dir === 'out' ? 'Sending ' : 'Receiving ') + Math.floor(pct) + '%' + sp + (it.note ? ' · ' + it.note : '');
    } else if (it.note) text += ' · ' + it.note;
    r.meta.textContent = text;
    const key = it.status + (it.dir === 'in' && it.status === 'done' ? '1' : '');
    if (r.btnKey !== key) {
      r.btnKey = key;
      r.btns.replaceChildren();
      if (['queued', 'offered', 'active', 'sent'].includes(it.status)) r.btns.append(btn('Cancel', 'ghost', () => (it.dir === 'out' ? SEND.cancel(it) : RECV.cancel(it))));
      if (it.dir === 'in' && it.status === 'done') {
        if (SEND.isIOS && RECV.canShareFiles(it.file)) r.btns.append(btn('Save', 'primary', () => RECV.share(it)));
        else r.btns.append(btn('Save', '', () => RECV.download(it)));
        if (it.kind === 'image' && !r.thumb.querySelector('img')) { const th = thumbFor(it); r.thumb.replaceWith(th); r.thumb = th; }
      }
    }
  }

  // ----- overall progress -----
  function paintOverall(force) {
    const now = performance.now();
    if (!force && now - lastPaint < 200) return;
    lastPaint = now;
    for (const it of batch) {
      if (it.status !== 'active') { it.speed = 0; continue; }
      it.meterObj = it.meterObj || P.meter();
      it.speed = it.meterObj.add(shown(it), now);
      paintRow(it);
    }
    const live = batch.filter((it) => it.status !== 'cancelled' && it.status !== 'failed');
    if (!live.length) { $('overall').hidden = true; return; }
    let total = 0, got = 0, done = 0;
    for (const it of live) { total += it.size; got += it.status === 'done' ? it.size : shown(it); if (it.status === 'done') done++; }
    const allDone = done === live.length;
    const rate = meter.add(got, now);
    $('overall').hidden = false;
    $('overall').classList.toggle('done', allDone);
    $('ov-bar').style.width = (total ? got / total * 100 : 100).toFixed(1) + '%';
    const dirs = new Set(live.map((it) => it.dir));
    const verb = allDone ? 'Done' : dirs.size > 1 ? 'Transferring' : dirs.has('out') ? 'Sending' : 'Receiving';
    $('ov-left').textContent = verb + ' · ' + done + ' / ' + live.length + ' files · ' + P.bytes(got) + ' of ' + P.bytes(total);
    $('ov-right').textContent = allDone ? '' : PAIR.state() !== 'linked' ? 'paused' :
      rate > 0 ? P.bytes(rate) + '/s' + (now - batchT > 2500 ? ' · ' + P.eta((total - got) / rate) + ' left' : '') : '';
  }
  // A batch = files moving close together (both directions); a new one starts after a quiet gap.
  let quietSince = 0, batchT = 0;
  function addToBatch(it) {
    const busy = batch.some((b) => ['queued', 'offered', 'active', 'sent'].includes(b.status));
    if (!busy && !batch.includes(it) && performance.now() - quietSince > 2500) { batch = []; meter.reset(); batchT = performance.now(); }
    if (!batch.includes(it)) { batch.push(it); batch.doneChimed = false; }
  }
  function batchFinished() {
    return batch.length && batch.every((b) => ['done', 'failed', 'cancelled'].includes(b.status));
  }

  // ----- viewer -----
  function openViewer(it) {
    const body = $('v-body');
    body.replaceChildren();
    $('v-name').textContent = it.name;
    $('v-share').hidden = !RECV.canShareFiles(it.file);
    $('viewer').hidden = false;
    $('viewer').itemRef = it;
    const k = it.kind;
    if (k === 'image') { const i = el('img'); i.src = it.url; i.alt = it.name; body.append(i); }
    else if (k === 'video' || k === 'audio') { const v = el(k); v.src = it.url; v.controls = true; v.playsInline = true; body.append(v); }
    else if (k === 'pdf' && !SEND.isIOS) { const f = el('iframe'); f.src = it.url; f.title = it.name; body.append(f); }
    else if (k === 'pdf') { window.open(it.url, '_blank', 'noopener'); closeViewer(); return; }
    else if (k === 'text' && it.size <= 2 * 1024 * 1024) { const pre = el('pre'); it.file.text().then((t) => { pre.textContent = t; }); body.append(pre); }
    else body.append(el('p', 'none', 'No preview for this file type. Use Save' + (RECV.canShareFiles(it.file) ? ' or Share.' : '.')));
    $('v-close').focus();
  }
  function closeViewer() {
    $('viewer').hidden = true;
    $('v-body').replaceChildren();
    $('viewer').itemRef = null;
  }

  // ----- events from the modules -----
  FD.on('toast', toast);
  FD.on('qr', (url) => { qrUrl = url; renderQr(); });
  FD.on('code', renderCode);
  FD.on('state', (st) => { sync(); if (st === 'linked') holdAwake(true); else if (st === 'idle') holdAwake(false); });
  FD.on('link', (c, wasPaired) => { if (!wasPaired) { chime('link'); toast('Connected to ' + PAIR.partner().name); } showFiles = false; sync(); });
  FD.on('item', (it) => {
    if (['queued', 'offered', 'active'].includes(it.status)) addToBatch(it);
    paintRow(it);
    sync();
    paintOverall(true);
    if (batchFinished()) quietSince = performance.now();
    if (batchFinished() && !batch.doneChimed) {
      batch.doneChimed = true;
      if (batch.some((b) => b.status === 'done')) chime('done');
    }
  });
  FD.on('progress', () => paintOverall(false));
  setInterval(() => { if (batch.some((b) => b.status === 'active')) paintOverall(true); }, 500);

  // ----- input -----
  function pick() { $('file').click(); }
  function addFiles(list) {
    const files = Array.from(list || []);
    if (!files.length) return;
    unlockAudio();
    const n = SEND.add(files);
    if (n && !PAIR.link()) toast(n + (n === 1 ? ' file' : ' files') + ' queued — will send when connected');
  }

  function boot() {
    SCAN.init($('cam'), $('cam-msg'));
    $('file').addEventListener('change', () => { const f = $('file').files; addFiles(f); $('file').value = ''; });
    $('pick').addEventListener('click', pick);
    $('pick-pre').addEventListener('click', pick);
    $('save-all').addEventListener('click', () => RECV.saveAll());
    $('disc').addEventListener('click', () => { PAIR.disconnect(); });
    $('back').addEventListener('click', () => { showFiles = false; sync(); });
    $('files-btn').addEventListener('click', () => { showFiles = true; sync(); });
    $('code-form').addEventListener('submit', (e) => { e.preventDefault(); unlockAudio(); if (PAIR.joinCode($('code-in').value)) $('code-in').value = ''; });
    $('code-in').addEventListener('input', (e) => {
      const v = e.target.value.replace(/\D/g, '').slice(0, 4);
      e.target.value = v;
      if (v.length === 4 && PAIR.state() === 'idle') { unlockAudio(); if (PAIR.joinCode(v)) e.target.value = ''; }
    });
    $('cam').parentNode.addEventListener('click', () => SCAN.start(true));
    $('v-close').addEventListener('click', closeViewer);
    $('v-save').addEventListener('click', () => { const it = $('viewer').itemRef; if (it) RECV.download(it); });
    $('v-share').addEventListener('click', () => { const it = $('viewer').itemRef; if (it) RECV.share(it); });

    // drag & drop anywhere
    let depth = 0;
    const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    window.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; $('veil').hidden = false; });
    window.addEventListener('dragover', (e) => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
    window.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; $('veil').hidden = true; } });
    window.addEventListener('drop', (e) => { e.preventDefault(); depth = 0; $('veil').hidden = true; if (e.dataTransfer) addFiles(e.dataTransfer.files); });
    // paste files
    window.addEventListener('paste', (e) => { if (e.target && e.target.id === 'code-in') return; const f = e.clipboardData && e.clipboardData.files; if (f && f.length) addFiles(f); });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!$('viewer').hidden) { e.preventDefault(); closeViewer(); }
        else if (showFiles) { e.preventDefault(); showFiles = false; sync(); }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); pick(); }
    });
    window.addEventListener('beforeunload', (e) => {
      if (SEND.busy() || RECV.busy()) { e.preventDefault(); e.returnValue = ''; }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { if (PAIR.state() === 'linked') holdAwake(true); if (view === 'pair' && PAIR.state() !== 'connecting') SCAN.start(true); }
      else SCAN.stop();
    });
    window.addEventListener('pointerdown', unlockAudio, { once: true });
    if (window.ResizeObserver) new ResizeObserver(() => renderQr()).observe($('qr-wrap'));

    if (typeof Peer === 'undefined' || !window.RTCPeerConnection) {
      toast('This browser cannot run WebRTC, or PeerJS failed to load.', 'err');
      $('code-go').disabled = true;
      return;
    }
    PAIR.start();
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  FD.ui = { sync: sync, toast: toast };
})(window.FD);
