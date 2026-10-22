/* Sound Recorder — app shell: screens + top-bar swipe, settings, theme, own dialog, toast, helpers.
   Settings in localStorage 'sound-recorder-settings-v1': { theme:'system'|'light'|'dark', thr:-50|-40|-30, mic }
   State in 'sound-recorder-state-v1': { mode:'rec'|'list'|'play'|'set', cur: recording id }
   Modules hook in with SR.on('mode'|'settings'|'changed', fn). */
const SR = (() => {
  'use strict';
  const VERSION = '1.0', SKEY = 'sound-recorder-settings-v1', KEY = 'sound-recorder-state-v1', SWIPE = 75, MOVE = 10;
  const MODES = ['rec', 'list', 'play', 'set'], NAMES = { rec: 'Recorder', list: 'Recordings', play: 'Player', set: 'Settings' };
  const $ = (id) => document.getElementById(id);
  const P = { theme: 'dark', thr: -40, mic: '' };
  const S = { mode: 'rec', cur: null };
  try { Object.assign(P, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch (_) { /* defaults */ }
  try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (_) { /* defaults */ }
  if (!MODES.includes(S.mode)) S.mode = 'rec';
  const saveP = () => { try { localStorage.setItem(SKEY, JSON.stringify(P)); } catch (_) { /* private mode */ } };
  const saveS = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (_) { /* private mode */ } };
  const hooks = {};
  const on = (k, f) => (hooks[k] = hooks[k] || []).push(f);
  const emit = (k, a) => (hooks[k] || []).forEach((f) => f(a));

  function theme() {
    const t = localStorage.getItem('sites-hub.theme');
    const dark = P.theme === 'dark' || (P.theme === 'system' && (t === 'dark' || (t !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)));
    document.documentElement.classList.toggle('dark', dark);
  }
  const pad = (n) => String(n).padStart(2, '0');
  /* 75.3 -> "1:15" ; tenths -> "1:15.3" ; hours when needed */
  function fmt(s, tenths) {
    s = Math.max(0, s || 0);
    const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, sec = Math.floor(s % 60);
    let r = (h ? h + ':' + pad(m) : m) + ':' + pad(sec);
    if (tenths) r += '.' + Math.floor((s * 10) % 10);
    return r;
  }
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let tt;
  function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 1800); }

  /* own dialog: ask({ text, value?, ok, danger }) -> Promise<true | string | null> */
  let dlgDone = null;
  function ask(o) {
    if (dlgDone) dlgDone(null);
    $('dlg-t').textContent = o.text;
    const inp = $('dlg-in'), yes = $('dlg-yes');
    inp.hidden = o.value == null; if (!inp.hidden) inp.value = o.value;
    yes.textContent = o.ok || 'OK'; yes.className = 'mini ' + (o.danger ? 'danger' : 'primary');
    $('dialog').hidden = false;
    setTimeout(() => (inp.hidden ? yes : inp).focus(), 30);
    if (!inp.hidden) inp.select();
    return new Promise((res) => {
      dlgDone = (v) => { dlgDone = null; $('dialog').hidden = true; res(v); };
    });
  }
  const dlgOpen = () => !$('dialog').hidden;
  function dlgYes() { if (dlgDone) dlgDone($('dlg-in').hidden ? true : $('dlg-in').value.trim()); }

  /* screens */
  const track = () => $('track');
  function place(dx) { track().style.transform = 'translateX(calc(' + (-MODES.indexOf(S.mode) * 25) + '% + ' + (dx || 0) + 'px))'; }
  function setMode(m) {
    if (!MODES.includes(m)) return;
    const prev = S.mode; S.mode = m; saveS(); place(0);
    if (document.activeElement && document.activeElement.closest && !document.activeElement.closest('#pane-' + m)) document.activeElement.blur();
    document.querySelectorAll('.dot').forEach((d) => { const v = d.dataset.mode === m; d.classList.toggle('on', v); d.setAttribute('aria-selected', v); });
    $('scr-name').textContent = NAMES[m];
    emit('mode', { m, prev });
  }
  const step = (k) => setMode(MODES[(MODES.indexOf(S.mode) + k + MODES.length) % MODES.length]);

  function renderSeg() {
    document.querySelectorAll('.seg').forEach((g) => g.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(P[g.dataset.key]) === b.dataset.v)));
  }

  function init() {
    theme(); renderSeg();
    $('ver').textContent = 'v' + VERSION;
    document.querySelectorAll('.dot').forEach((d) => { d.onclick = () => setMode(d.dataset.mode); });
    document.querySelectorAll('.seg').forEach((g) => g.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const k = g.dataset.key; P[k] = k === 'thr' ? Number(b.dataset.v) : b.dataset.v;
      saveP(); theme(); renderSeg(); emit('settings', k);
    }));
    $('dlg-no').onclick = () => dlgDone && dlgDone(null);
    $('dlg-yes').onclick = dlgYes;
    $('dialog').addEventListener('click', (e) => { if (e.target.id === 'dialog' && dlgDone) dlgDone(null); });
    $('dlg-in').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); dlgYes(); } });

    /* top-bar swipe: slides with the finger, >= 75 px switches, wraps around */
    const bar = $('topbar'); let g = null;
    bar.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' && e.button !== 0) return; g = { x: e.clientX, y: e.clientY, axis: null, id: e.pointerId }; try { bar.setPointerCapture(e.pointerId); } catch (_) { /* */ } });
    bar.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y;
      if (!g.axis && (Math.abs(dx) > MOVE || Math.abs(dy) > MOVE)) g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (g.axis === 'x') { track().classList.add('drag'); place(dx); }
    });
    const end = (e, cancel) => {
      if (!g || e.pointerId !== g.id) return;
      const dx = e.clientX - g.x, dy = e.clientY - g.y, gg = g; g = null;
      track().classList.remove('drag');
      if (!cancel && gg.axis === 'x' && Math.abs(dx) >= SWIPE && Math.abs(dx) > Math.abs(dy)) step(dx < 0 ? 1 : -1); else place(0);
    };
    bar.addEventListener('pointerup', (e) => end(e, false));
    bar.addEventListener('pointercancel', (e) => end(e, true));
    $('viewport').addEventListener('scroll', () => { $('viewport').scrollLeft = 0; });

    /* keys: PageUp/PageDown or Alt+Left/Right = screen; screen keys go to modules */
    addEventListener('keydown', (e) => {
      if (dlgOpen()) { if (e.key === 'Escape' && dlgDone) dlgDone(null); return; }
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.ctrlKey || e.metaKey) return;
      if (e.key === 'PageDown' || (e.altKey && e.key === 'ArrowRight')) { e.preventDefault(); step(1); return; }
      if (e.key === 'PageUp' || (e.altKey && e.key === 'ArrowLeft')) { e.preventDefault(); step(-1); return; }
      if (!e.altKey) emit('key', e);
    });
    addEventListener('storage', (e) => {
      if (e.key === 'sites-hub.theme') { theme(); emit('settings', 'theme'); }
      if (e.key === SKEY) { try { Object.assign(P, JSON.parse(e.newValue || '{}')); } catch (_) { /* */ } theme(); renderSeg(); emit('settings', 'all'); }
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { theme(); emit('settings', 'theme'); });
    emit('init');
    setMode(S.mode);
  }
  return { $, P, S, saveP, saveS, on, emit, fmt, esc, toast, ask, setMode, init, MODES };
})();
