/* Stopwatch logic. State in localStorage 'stopwatch-state-v1':
   { mode:'sw'|'lap', running, start (Date.now at last start), acc (ms before start), laps:[total ms,...] } */
(function () {
  'use strict';
  const KEY = 'stopwatch-state-v1', SWIPE = 75, TAP_MOVE = 10, TAP_MS = 500;
  const $ = (id) => document.getElementById(id);
  const S = { mode: 'sw', running: false, start: 0, acc: 0, laps: [] };
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { /* bad data */ }
  if (S.mode !== 'lap') S.mode = 'sw';
  if (!Array.isArray(S.laps)) S.laps = [];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) { /* blocked */ } };

  /* theme: hub pref else system */
  const mq = matchMedia('(prefers-color-scheme: dark)');
  function theme() {
    let v = null; try { v = localStorage.getItem('sites-hub.theme'); } catch (_) { /* blocked */ }
    document.documentElement.classList.toggle('dark', v === 'dark' ? true : v === 'light' ? false : mq.matches);
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
  const toggleMode = () => setMode(S.mode === 'sw' ? 'lap' : 'sw');

  /* dialog */
  const dlg = $('dialog');
  function openDlg() { dlg.hidden = false; $('dlg-yes').focus(); }
  function closeDlg() { dlg.hidden = true; }
  $('dlg-no').onclick = closeDlg;
  $('dlg-yes').onclick = () => { closeDlg(); doReset(); };
  dlg.addEventListener('pointerdown', (e) => { if (e.target === dlg) closeDlg(); });

  /* render */
  const track = $('track'), app = $('app');
  function place(dx) { track.style.transform = 'translateX(calc(' + (S.mode === 'lap' ? -50 : 0) + '% + ' + dx + 'px))'; }
  function render() {
    app.classList.toggle('running', S.running); app.classList.toggle('paused', !S.running && elapsed() > 0);
    document.querySelectorAll('.dot').forEach((d) => { const on = d.dataset.mode === S.mode; d.classList.toggle('on', on); d.setAttribute('aria-selected', on); });
    $('hint-sw').textContent = S.running ? '' : elapsed() ? 'Paused · tap to resume' : 'Tap to start';
    $('lap-btn').disabled = !S.running;
    $('copy-btn').disabled = $('csv-btn').disabled = !S.laps.length;
    tick();
  }
  function tick() { const t = fmt(elapsed()); $('time-sw').textContent = t; $('time-lap').textContent = t; }
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
  const isControl = (el) => el.closest && el.closest('button, a, input, #dialog, #laps li');
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
      const lim = S.mode === 'sw' ? Math.min(0, dx) : Math.max(0, dx); /* slide toward the other pane */
      place(lim || dx * 0.3);
    }
  });
  function end(e, cancel) {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y, gg = g; g = null;
    track.classList.remove('drag');
    if (!cancel && gg.axis === 'x' && Math.abs(dx) >= SWIPE && Math.abs(dx) > Math.abs(dy)) { toggleMode(); return; }
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
    if (k === ' ') { e.preventDefault(); toggleRun(); }
    else if (k === 'arrowleft' || k === 'arrowright') { e.preventDefault(); toggleMode(); }
    else if (k === 'l') lap();
    else if (k === 'r') reset();
  });
  addEventListener('storage', (e) => { if (e.key === KEY) { try { Object.assign(S, JSON.parse(e.newValue || '{}')); } catch (_) { /* */ } renderLaps(); place(0); render(); } });

  renderLaps(); place(0); render();
})();
