/* Stopwatch logic. Settings in 'stopwatch-settings-v1': { face:'analog'|'digital', theme:'system'|'light'|'dark' }.
   State in localStorage 'stopwatch-state-v1':
   { mode:'sw'|'lap'|'set', running, start (Date.now at last start), acc (ms before start), laps:[total ms,...] } */
(function () {
  'use strict';
  const KEY = 'stopwatch-state-v1', SKEY = 'stopwatch-settings-v1', VERSION = '1.1', SWIPE = 75, TAP_MOVE = 10, TAP_MS = 500;
  const MODES = ['sw', 'lap', 'set'];
  const $ = (id) => document.getElementById(id);
  const S = { mode: 'sw', running: false, start: 0, acc: 0, laps: [] };
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { /* bad data */ }
  if (MODES.indexOf(S.mode) < 0) S.mode = 'sw';
  /* settings (new in 1.1; older saved state keeps its time, laps and mode, settings start at defaults) */
  const P = { face: 'analog', theme: 'dark' };
  try { Object.assign(P, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch (_) { /* bad data */ }
  if (P.face !== 'digital') P.face = 'analog';
  if (['system', 'light', 'dark'].indexOf(P.theme) < 0) P.theme = 'dark';
  const saveP = () => { try { localStorage.setItem(SKEY, JSON.stringify(P)); } catch (_) { /* blocked */ } };
  if (!Array.isArray(S.laps)) S.laps = [];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) { /* blocked */ } };

  /* theme: hub pref else system */
  const mq = matchMedia('(prefers-color-scheme: dark)');
  function theme() {
    let v = null; try { v = localStorage.getItem('sites-hub.theme'); } catch (_) { /* blocked */ }
    const sys = v === 'dark' ? true : v === 'light' ? false : mq.matches;
    document.documentElement.classList.toggle('dark', P.theme === 'dark' || (P.theme === 'system' && sys));
  }
  theme(); mq.addEventListener && mq.addEventListener('change', theme);
  addEventListener('storage', (e) => { if (e.key === 'sites-hub.theme') theme(); });

  const elapsed = () => S.acc + (S.running ? Math.max(0, Date.now() - S.start) : 0);
  function fmt(ms) {
    ms = Math.max(0, Math.floor(ms));
    const cs = Math.floor(ms / 10) % 100, s = Math.floor(ms / 1000) % 60, m = Math.floor(ms / 60000) % 60, h = Math.floor(ms / 3600000);
    const p = (n) => String(n).padStart(2, '0');
    return (h ? h + ':' + p(m) : p(m)) + ':' + p(s) + '.' + p(cs);
  }
  const deltas = () => S.laps.map((t, i) => t - (i ? S.laps[i - 1] : 0));

  function toggleRun() {
    if (S.running) { S.acc = elapsed(); S.running = false; }
    else { S.start = Date.now(); S.running = true; }
    save(); render();
  }
  function lap() {
    if (S.mode !== 'lap') return;
    const t = elapsed(); if (!t || !S.running) return;
    S.laps.push(t); save(); renderLaps(); render();
  }
  function doReset() { S.running = false; S.acc = 0; S.start = 0; S.laps = []; save(); renderLaps(); render(); }
  function reset() { if (S.laps.length) openDlg(); else doReset(); }
  function setMode(m) { S.mode = m; save(); place(0); render(); }
  const step = (d) => setMode(MODES[(MODES.indexOf(S.mode) + d + MODES.length) % MODES.length]);

  /* dialog */
  const dlg = $('dialog');
  function openDlg() { dlg.hidden = false; $('dlg-yes').focus(); }
  function closeDlg() { dlg.hidden = true; }
  $('dlg-no').onclick = closeDlg;
  $('dlg-yes').onclick = () => { closeDlg(); doReset(); };
  dlg.addEventListener('pointerdown', (e) => { if (e.target === dlg) closeDlg(); });

  /* render */
  const track = $('track'), app = $('app');
  function place(dx) { track.style.transform = 'translateX(calc(' + (-100 / 3 * MODES.indexOf(S.mode)) + '% + ' + dx + 'px))'; }
  function render() {
    app.classList.toggle('running', S.running); app.classList.toggle('paused', !S.running && elapsed() > 0);
    document.querySelectorAll('.dot').forEach((d) => { const on = d.dataset.mode === S.mode; d.classList.toggle('on', on); d.setAttribute('aria-selected', on); });
    $('hint-sw').textContent = S.running ? '' : elapsed() ? 'Paused · tap to resume' : 'Tap to start';
    $('lap-btn').disabled = !S.running;
    $('copy-btn').disabled = $('csv-btn').disabled = !S.laps.length;
    app.classList.toggle('analog', P.face === 'analog');
    document.querySelectorAll('.seg').forEach((g) => g.querySelectorAll('button').forEach((b) => b.classList.toggle('on', P[g.dataset.key] === b.dataset.v)));
    tick();
  }
  /* analog face: 60 s sweep, inner 30-minute sub-dial */
  const NS = 'http://www.w3.org/2000/svg', faces = [];
  function el(n, a, p) { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); p && p.appendChild(e); return e; }
  function buildFace(host) {
    const svg = el('svg', { viewBox: '0 0 200 200', 'aria-hidden': 'true' }, host);
    el('circle', { cx: 100, cy: 100, r: 96, class: 'f-ring' }, svg);
    for (let i = 0; i < 60; i++) {
      const a = i * Math.PI / 30, big = i % 5 === 0, r1 = big ? 82 : 87;
      el('line', { x1: 100 + r1 * Math.sin(a), y1: 100 - r1 * Math.cos(a), x2: 100 + 91 * Math.sin(a), y2: 100 - 91 * Math.cos(a), class: 'f-tick' + (big ? ' big' : ''), 'stroke-width': big ? 2 : 1 }, svg);
      if (big) el('text', { x: 100 + 72 * Math.sin(a), y: 100 - 72 * Math.cos(a), class: 'f-num' }, svg).textContent = i || 60;
    }
    el('circle', { cx: 100, cy: 62, r: 18, class: 'f-sub' }, svg);
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; el('line', { x1: 100 + 14 * Math.sin(a), y1: 62 - 14 * Math.cos(a), x2: 100 + 18 * Math.sin(a), y2: 62 - 18 * Math.cos(a), class: 'f-tick', 'stroke-width': 1 }, svg); }
    const mh = el('line', { x1: 100, y1: 62, x2: 100, y2: 48, class: 'f-subhand' }, svg);
    const sh = el('line', { x1: 100, y1: 116, x2: 100, y2: 12, class: 'f-hand' }, svg);
    el('circle', { cx: 100, cy: 100, r: 4, class: 'f-hub' }, svg);
    faces.push({ mh, sh });
  }
  buildFace($('face-sw')); buildFace($('face-lap'));
  function tick() {
    const ms = elapsed(), t = fmt(ms); $('time-sw').textContent = t; $('time-lap').textContent = t;
    if (P.face === 'analog') {
      const sa = (ms % 60000) / 60000 * 360, ma = (ms % 1800000) / 1800000 * 360;
      faces.forEach((f) => { f.sh.setAttribute('transform', 'rotate(' + sa.toFixed(2) + ' 100 100)'); f.mh.setAttribute('transform', 'rotate(' + ma.toFixed(2) + ' 100 62)'); });
    }
  }
  $('ver').textContent = 'v' + VERSION;
  document.querySelectorAll('.seg').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    P[g.dataset.key] = b.dataset.v; saveP(); theme(); render();
  }));
  function renderLaps() {
    const d = deltas(), n = d.length, ol = $('laps');
    let fi = -1, si = -1;
    if (n >= 3) { fi = 0; si = 0; d.forEach((v, i) => { if (v < d[fi]) fi = i; if (v > d[si]) si = i; }); }
    ol.innerHTML = '';
    for (let i = n - 1; i >= 0; i--) {
      const li = document.createElement('li');
      if (i === fi) li.className = 'fast'; else if (i === si) li.className = 'slow';
      li.innerHTML = '<span>' + (i + 1) + '</span><span>' + fmt(d[i]) + '</span><span>' + fmt(S.laps[i]) + '</span>';
      ol.appendChild(li);
    }
    $('lap-count').textContent = n ? n + (n === 1 ? ' lap' : ' laps') : 'No laps';
  }
  (function loop() { tick(); requestAnimationFrame(loop); })();

  /* export */
  let tt; function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 1500); }
  const lapText = () => deltas().map((v, i) => 'Lap ' + (i + 1) + '\t' + fmt(v) + '\t' + fmt(S.laps[i])).join('\n');
  $('copy-btn').onclick = async () => {
    try { await navigator.clipboard.writeText(lapText()); toast('Laps copied'); }
    catch (_) { toast('Copy not allowed'); }
  };
  $('csv-btn').onclick = () => {
    const csv = 'lap,lap_time,total,lap_ms,total_ms\n' + deltas().map((v, i) => [i + 1, fmt(v), fmt(S.laps[i]), v, S.laps[i]].join(',')).join('\n') + '\n';
    const a = document.createElement('a'), d = new Date(), p = (n) => String(n).padStart(2, '0');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'laps-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.csv';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  $('lap-btn').onclick = lap;
  $('reset-btn').onclick = reset;
  document.querySelectorAll('.dot').forEach((d) => { d.onclick = () => setMode(d.dataset.mode); });

  /* tap anywhere / swipe */
  const isControl = (el) => el.closest && el.closest('button, a, input, #dialog, #laps li, #pane-set');
  let g = null;
  app.addEventListener('pointerdown', (e) => {
    if (!dlg.hidden || (e.pointerType === 'mouse' && e.button !== 0)) return;
    g = { x: e.clientX, y: e.clientY, t: Date.now(), ctl: !!isControl(e.target), axis: null, id: e.pointerId };
  });
  app.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.axis && (Math.abs(dx) > TAP_MOVE || Math.abs(dy) > TAP_MOVE)) g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (g.axis === 'x') {
      track.classList.add('drag');
      const i = MODES.indexOf(S.mode), edge = (i === 0 && dx > 0) || (i === MODES.length - 1 && dx < 0);
      place(edge ? dx * 0.3 : dx); /* wrap-around ends: damped pull */
    }
  });
  function end(e, cancel) {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y, gg = g; g = null;
    track.classList.remove('drag');
    if (!cancel && gg.axis === 'x' && Math.abs(dx) >= SWIPE && Math.abs(dx) > Math.abs(dy)) { step(dx < 0 ? 1 : -1); return; }
    place(0);
    if (!cancel && !gg.axis && !gg.ctl && Date.now() - gg.t < TAP_MS) toggleRun();
  }
  app.addEventListener('pointerup', (e) => end(e, false));
  app.addEventListener('pointercancel', (e) => end(e, true));

  /* keys */
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!dlg.hidden) { if (e.key === 'Escape') closeDlg(); return; }
    const k = e.key.toLowerCase();
    if (k === ' ') { if (S.mode === 'set') return; e.preventDefault(); toggleRun(); }
    else if (k === 'arrowright') { e.preventDefault(); step(1); }
    else if (k === 'arrowleft') { e.preventDefault(); step(-1); }
    else if (k === 'l') lap();
    else if (k === 'r') reset();
  });
  addEventListener('storage', (e) => { if (e.key === SKEY) { try { Object.assign(P, JSON.parse(e.newValue || '{}')); } catch (_) { /* */ } theme(); render(); } });
  addEventListener('storage', (e) => { if (e.key === KEY) { try { Object.assign(S, JSON.parse(e.newValue || '{}')); } catch (_) { /* */ } renderLaps(); place(0); render(); } });

  renderLaps(); place(0); render();
})();
