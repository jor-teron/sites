/* Screen Recorder SC1 UI. Settings 'screenrec-settings-v1': { quality:'720'|'1080'|'native', fps:'15'|'30'|'60', theme:'system'|'light'|'dark', mic, sys }. */
(() => {
  const SKEY = 'screenrec-settings-v1', SWIPE = 75, $ = (id) => document.getElementById(id);
  const P = { quality: '1080', fps: '30', theme: 'dark', mic: false, sys: true };
  try { Object.assign(P, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch (_) {}
  const saveP = () => { try { localStorage.setItem(SKEY, JSON.stringify(P)); } catch (_) {} };
  const mq = matchMedia('(prefers-color-scheme: dark)');
  function theme() { let v = null; try { v = localStorage.getItem('sites-hub.theme'); } catch (_) {} const sys = v ? v === 'dark' : mq.matches; document.documentElement.classList.toggle('dark', P.theme === 'dark' || (P.theme === 'system' && sys)); }
  theme(); mq.addEventListener && mq.addEventListener('change', theme);
  addEventListener('storage', (e) => { if (e.key === 'sites-hub.theme') theme(); });

  let toastT; function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2200); }
  function notify(t) { try { if (window.top.HubNotify && window.top.HubNotify.notice) { window.top.HubNotify.notice({ title: 'Screen Recorder', body: t, text: t }); return; } } catch (_) {} toast(t); }
  function confirmDlg(t, yes) { return new Promise((r) => { $('dlg-t').textContent = t; $('dlg-yes').textContent = yes; $('dialog').hidden = false; $('dlg-yes').onclick = () => { $('dialog').hidden = true; r(true); }; $('dlg-no').onclick = () => { $('dialog').hidden = true; r(false); }; }); }

  /* screens */
  let idx = 0; const track = $('track'), dots = document.querySelectorAll('.dot');
  function go(i) { idx = (i + 2) % 2; track.style.transform = `translateX(${-idx * 50}%)`; dots.forEach((d, k) => d.classList.toggle('on', k === idx)); }
  dots.forEach((d) => d.onclick = () => go(+d.dataset.i)); go(0);
  let sx = null, sy = 0;
  $('viewport').addEventListener('pointerdown', (e) => { if (e.target.closest('video,input,button,.seg')) return; sx = e.clientX; sy = e.clientY; });
  addEventListener('pointerup', (e) => { if (sx === null) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null; if (Math.abs(dx) >= SWIPE && Math.abs(dx) > Math.abs(dy)) go(idx + (dx < 0 ? 1 : -1)); });

  /* settings */
  function render() { document.querySelectorAll('.seg').forEach((g) => g.querySelectorAll('button').forEach((b) => b.classList.toggle('on', String(P[g.dataset.key]) === b.dataset.v))); $('opt-mic').checked = !!P.mic; $('opt-sys').checked = !!P.sys; }
  document.querySelectorAll('.seg').forEach((g) => g.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; P[g.dataset.key] = b.dataset.v; saveP(); theme(); render(); });
  $('opt-mic').onchange = (e) => { P.mic = e.target.checked; saveP(); };
  $('opt-sys').onchange = (e) => { P.sys = e.target.checked; saveP(); };
  render();

  if (!SCCapture.supported()) { $('unsupported').hidden = false; $('rec-ui').hidden = true; return; }

  /* recording */
  let cap = null, blob = null, ext = 'webm', url = null, t0 = 0, acc = 0, tick = null, state = 'idle';
  const fmt = (ms) => { const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60, p = (n) => String(n).padStart(2, '0'); return (h ? h + ':' : '') + p(m) + ':' + p(x); };
  const mb = (b) => b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
  const elapsed = () => acc + (state === 'rec' ? Date.now() - t0 : 0);
  function ui(s) {
    state = s; const app = $('app'); app.classList.toggle('rec', s === 'rec'); app.classList.toggle('paused', s === 'paused');
    $('rec-btn').hidden = !(s === 'idle'); $('pause-btn').hidden = $('stop-btn').hidden = !(s === 'rec' || s === 'paused');
    $('pause-btn').textContent = s === 'paused' ? 'Resume' : 'Pause';
    $('save-btn').hidden = $('discard-btn').hidden = s !== 'done'; $('preview').hidden = s !== 'done'; $('idle').hidden = s === 'done';
    $('opt-mic').disabled = $('opt-sys').disabled = s !== 'idle' && s !== 'done';
    $('status').textContent = { idle: 'Ready', rec: 'Recording', paused: 'Paused', done: '' }[s] || '';
  }
  const stamp = () => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; };
  async function countdown() { const c = $('count'); c.hidden = false; for (const n of [3, 2, 1]) { c.textContent = n; await new Promise((r) => setTimeout(r, 1000)); } c.hidden = true; }

  $('rec-btn').onclick = async () => {
    $('rec-btn').disabled = true;
    try {
      cap = await SCCapture.start({ quality: P.quality, fps: P.fps, mic: P.mic, sys: P.sys, onWarn: toast,
        onSize: (b) => { $('size').textContent = mb(b); },
        onDone: (b, e) => { clearInterval(tick); acc = elapsed(); blob = b; ext = e; if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(b); $('preview').src = url; $('size').textContent = mb(b.size); ui('done'); } });
      await countdown();
      if (cap.rec.state === 'inactive' && cap.disp.active === false) { ui('idle'); return; }
      cap.begin(); acc = 0; t0 = Date.now(); $('size').textContent = '0 KB'; ui('rec');
      tick = setInterval(() => { $('timer').textContent = fmt(elapsed()); }, 250);
    } catch (e) { $('count').hidden = true; if (e && e.name !== 'NotAllowedError') toast('Could not start: ' + (e.message || e)); else toast('Sharing cancelled'); ui('idle'); }
    finally { $('rec-btn').disabled = false; }
  };
  $('pause-btn').onclick = () => { if (state === 'rec') { acc = elapsed(); cap.pause(); ui('paused'); } else if (state === 'paused') { t0 = Date.now(); cap.resume(); ui('rec'); } };
  $('stop-btn').onclick = () => { if (state === 'rec') acc = elapsed(); cap && cap.stop(); };
  $('save-btn').onclick = async () => { const name = `screen-${stamp()}.${ext}`; if (await SCSave.save(blob, name)) notify('Saved ' + name); };
  $('discard-btn').onclick = async () => { if (!(await confirmDlg('Discard this recording?', 'Discard'))) return; blob = null; $('preview').removeAttribute('src'); $('timer').textContent = '00:00'; $('size').textContent = ''; ui('idle'); };
  addEventListener('beforeunload', (e) => { if (state === 'rec' || state === 'paused' || (state === 'done' && blob)) { e.preventDefault(); e.returnValue = ''; } });
  window.__sc = { get blob() { return blob; }, get state() { return state; } };
  ui('idle');
})();
