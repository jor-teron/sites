/* GIF Maker GM2 app: screens, swipes, settings, theme, trim UI and the make pipeline.
   Settings in 'gifmaker-settings-v1': { theme, width, fps, colors, loop, src, delay, fit }. */
(function () {
  'use strict';
  const SKEY = 'gifmaker-settings-v1', SWIPE = 75, TAP_MOVE = 10, MAXLEN = 15, LONG_MS = 5000;
  const $ = (id) => document.getElementById(id);
  const P = { theme: 'dark', width: '360', fps: '10', colors: '256', loop: '1', src: 'video', delay: 500, fit: 'black' };
  try { Object.assign(P, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch (_) { /* */ }
  const saveP = () => { try { localStorage.setItem(SKEY, JSON.stringify(P)); } catch (_) { /* */ } };

  /* theme: System follows the hub pref, then the device */
  const mq = matchMedia('(prefers-color-scheme: dark)');
  function theme() {
    let h = null; try { h = localStorage.getItem('sites-hub.theme'); } catch (_) { /* */ }
    const sys = h === 'dark' || h === 'light' ? h === 'dark' : mq.matches;
    document.documentElement.classList.toggle('dark', P.theme === 'dark' || (P.theme === 'system' && sys));
  }
  theme(); mq.addEventListener && mq.addEventListener('change', theme);
  addEventListener('storage', (e) => { if (e.key === 'sites-hub.theme') theme(); });

  /* dialogs + toast (never alert) */
  let dlgRes = null;
  function dialog(text, confirm) {
    $('dlg-t').textContent = text; $('dlg-no').hidden = !confirm; $('dialog').hidden = false; $('dlg-ok').focus();
    return new Promise((r) => { dlgRes = r; });
  }
  function closeDlg(v) { $('dialog').hidden = true; const r = dlgRes; dlgRes = null; r && r(v); }
  $('dlg-ok').onclick = () => closeDlg(true); $('dlg-no').onclick = () => closeDlg(false);
  let toastT = 0;
  function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 3000); }
  function notify(title, text) {
    let N = null; try { N = window.top && window.top !== window && window.top.HubNotify; } catch (_) { /* cross-origin */ }
    if (N && N.notice) { try { N.notice({ icon: '\uD83C\uDF9E\uFE0F', title, text, timeoutMs: 6000 }); return; } catch (_) { /* */ } }
    toast(title + ' — ' + text);
  }

  /* segmented controls */
  function renderSeg() { document.querySelectorAll('.seg').forEach((g) => g.querySelectorAll('button').forEach((b) => b.classList.toggle('on', P[g.dataset.key] === b.dataset.v))); }
  document.querySelectorAll('.seg').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    P[g.dataset.key] = b.dataset.v; saveP(); theme(); renderSeg(); srcMode(); estimate();
  }));
  renderSeg();

  /* video + trim */
  const vid = $('vid'); let V = null; /* { url, name, dur } */
  const T = { s: 0, e: 0 };
  const fmt = (x) => (Math.round(x * 10) / 10).toFixed(1);
  function openFile(f) {
    if (!f) return;
    if (!/^video\//.test(f.type) && !/\.(mp4|webm|mov|m4v|mkv|ogv)$/i.test(f.name)) { dialog('That file is not a video.'); return; }
    if (busy) return;
    if (V) URL.revokeObjectURL(V.url);
    V = { url: URL.createObjectURL(f), name: f.name.replace(/\.[^.]+$/, '') || 'video', dur: 0 };
    clearResult(); vid.src = V.url; vid.hidden = false; $('drop').hidden = true; $('vname').textContent = f.name;
  }
  vid.addEventListener('loadedmetadata', () => {
    if (!V) return;
    V.dur = isFinite(vid.duration) ? vid.duration : 0;
    if (!V.dur) { dialog('Could not read the video length.'); return; }
    ['r-start', 'r-end'].forEach((id) => { $(id).max = V.dur; });
    $('n-start').max = $('n-end').max = V.dur;
    setTrim(0, Math.min(V.dur, MAXLEN), 'e');
    canMake();
  });
  vid.addEventListener('error', () => { if (V) dialog('This video format is not supported by the browser.'); });
  /* keep preview playback inside the range */
  vid.addEventListener('timeupdate', () => { if (V && !vid.paused && vid.currentTime >= T.e) { vid.currentTime = T.s; } });
  function setTrim(s, e, moved) {
    const d = V ? V.dur : 0;
    s = Math.max(0, Math.min(+s || 0, d)); e = Math.max(0, Math.min(+e || 0, d));
    if (e - s < 0.1) { if (moved === 's') s = Math.max(0, e - 0.1); else e = Math.min(d, s + 0.1); }
    let capped = false;
    if (e - s > MAXLEN) { capped = true; if (moved === 's') e = s + MAXLEN; else s = e - MAXLEN; }
    T.s = s; T.e = e;
    $('r-start').value = s; $('r-end').value = e; $('n-start').value = fmt(s); $('n-end').value = fmt(e);
    const pc = (x) => (d ? x / d * 100 : 0) + '%';
    $('sel').style.left = pc(s); $('sel').style.width = d ? ((e - s) / d * 100) + '%' : '0';
    $('trim-len').textContent = fmt(e - s) + ' s';
    const w = $('warn'); w.hidden = !capped && d <= MAXLEN; w.textContent = capped ? 'Limited to ' + MAXLEN + ' s — GIFs get big fast.' : 'Max ' + MAXLEN + ' s per GIF.';
    if (V && vid.readyState >= 1) vid.currentTime = moved === 'e' ? e : s;
    estimate();
  }
  $('r-start').addEventListener('input', () => setTrim($('r-start').value, T.e, 's'));
  $('r-end').addEventListener('input', () => setTrim(T.s, $('r-end').value, 'e'));
  $('n-start').addEventListener('change', () => setTrim($('n-start').value, T.e, 's'));
  $('n-end').addEventListener('change', () => setTrim(T.s, $('n-end').value, 'e'));

  /* rough size: bytes/pixel/frame after LZW, by palette */
  function estimate() {
    if (P.src === 'photos') {
      const L = GMPhotos.list; if (!L.length) { $('est').textContent = '—'; return; }
      const { w, h } = GMPhotos.dims(+P.width), bpp = { 64: 0.2, 128: 0.25, 256: 0.3 }[P.colors] || 0.3;
      $('est').textContent = w + '×' + h + ' · ' + L.length + ' frames · ≈ ' + size(w * h * L.length * bpp * 1.5); return;
    }
    if (!V || !V.dur) { $('est').textContent = '—'; return; }
    const { w, h } = GMVideo.dims(vid.videoWidth || 16, vid.videoHeight || 9, +P.width);
    const n = Math.max(1, Math.round((T.e - T.s) * +P.fps)), bpp = { 64: 0.2, 128: 0.25, 256: 0.3 }[P.colors] || 0.3;
    $('est').textContent = w + '×' + h + ' · ' + n + ' frames · ≈ ' + size(w * h * n * bpp);
  }
  function size(b) { return b < 1024 * 1024 ? Math.max(1, Math.round(b / 1024)) + ' KB' : (b / 1048576).toFixed(1) + ' MB'; }

  /* source switch + photos */
  function canMake() { $('make-btn').disabled = busy || (P.src === 'photos' ? GMPhotos.list.length < 1 : !V || !V.dur); }
  function srcMode() {
    const ph = P.src === 'photos'; document.body.classList.toggle('src-photos', ph);
    if (!result) { $('photos').hidden = !ph; vid.hidden = ph || !V; $('drop').hidden = ph || !!V; if (ph) vid.pause(); }
    canMake();
  }
  $('d-def').value = P.delay;
  $('d-def').addEventListener('change', () => { P.delay = GMPhotos.clampDelay($('d-def').value); $('d-def').value = P.delay; saveP(); });
  $('d-all').onclick = () => { P.delay = GMPhotos.clampDelay($('d-def').value); $('d-def').value = P.delay; saveP(); GMPhotos.setAll(P.delay); toast('Delay ' + P.delay + ' ms on all frames'); };
  GMPhotos.init({ defDelay: () => P.delay, onChange: () => { canMake(); estimate(); } });
  async function addPhotos(files) {
    if (busy || !files.length) return;
    clearResult();
    const r = await GMPhotos.add(files);
    if (!r.added) dialog('No images could be opened.'); else if (r.skipped) toast(r.skipped + ' file(s) skipped');
  }
  $('ph-open').onclick = $('ph-add').onclick = () => $('pfile').click();
  $('pfile').onchange = (e) => { addPhotos([...e.target.files]); e.target.value = ''; };

  /* open / drop */
  $('open-btn').onclick = () => $('file').click();
  $('vname').onclick = () => { if (!busy) $('file').click(); };
  $('file').onchange = (e) => { openFile(e.target.files[0]); e.target.value = ''; };
  const drop = $('pane-make');
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); $('drop').classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => $('drop').classList.remove('over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); const f = [...e.dataTransfer.files]; if (P.src === 'photos') addPhotos(f); else openFile(f[0]); });

  /* make */
  let busy = false, cancelled = false, enc = null, result = null;
  function clearResult() { if (result) URL.revokeObjectURL(result.url); result = null; $('result').hidden = true; srcMode(); }
  $('discard-btn').onclick = clearResult;
  $('save-btn').onclick = () => {
    if (!result) return;
    const d = new Date(), p = (x) => String(x).padStart(2, '0');
    GMSave.save(result.blob, result.base + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds()) + '.gif').then((n) => toast('Saved ' + n));
  };
  function setBusy(b) {
    busy = b; $('prog').hidden = !b; canMake();
    document.querySelectorAll('.ctl input, .ctl .seg button, #d-all, #ph-bar button, #strip .x').forEach((el) => { el.disabled = b; });
  }
  function progress(f, t) { $('bar').style.width = Math.round(f * 100) + '%'; $('prog-t').textContent = t; }
  $('cancel-btn').onclick = () => { cancelled = true; enc && enc.cancel(); };
  $('make-btn').onclick = async () => {
    if (!V || busy) return;
    vid.pause(); clearResult(); cancelled = false; setBusy(true); progress(0, 'Starting…');
    const t0 = performance.now(), fps = +P.fps, photos = P.src === 'photos';
    try {
      let r;
      if (photos) {
        const L = GMPhotos.list, { w, h } = GMPhotos.dims(+P.width);
        enc = await GMEncode.open({ w, h, colors: +P.colors, loop: P.loop === '1', delay: 500 });
        for (let i = 0; i < L.length && !cancelled; i++) {
          await enc.add(GMPhotos.render(i, w, h, P.fit), L[i].delay);
          progress((i + 1) / L.length, 'Frame ' + (i + 1) + ' / ' + L.length);
        }
        r = { w, h, n: L.length };
      } else {
      const { w, h } = GMVideo.dims(vid.videoWidth, vid.videoHeight, +P.width);
      enc = await GMEncode.open({ w, h, colors: +P.colors, loop: P.loop === '1', delay: Math.round(1000 / fps) });
      r = await GMVideo.grab(V.url, { start: T.s, end: T.e, fps, width: +P.width },
        async (img, i, n) => { if (cancelled) return; await enc.add(img); progress((i + 1) / n, 'Frame ' + (i + 1) + ' / ' + n); },
        () => cancelled);
      }
      if (cancelled) throw new Error('cancel');
      progress(1, 'Finishing…');
      const blob = await enc.finish();
      const ms = performance.now() - t0;
      result = { blob, url: URL.createObjectURL(blob), base: photos ? 'photos' : V.name, ms };
      $('gif-img').src = result.url; $('result').hidden = false; vid.hidden = true; $('photos').hidden = true;
      $('gif-info').textContent = r.w + '×' + r.h + ' · ' + r.n + ' frames · ' + size(blob.size) + ' · ' + (ms / 1000).toFixed(1) + ' s';
      document.body.dataset.encMode = enc.mode; document.body.dataset.encMs = Math.round(ms);
      if (ms > LONG_MS) notify('GIF ready', size(blob.size) + ', ' + r.n + ' frames'); else toast('GIF ready · ' + size(blob.size));
    } catch (err) {
      if (!cancelled) dialog('Could not make the GIF: ' + (err && err.message || err)); else toast('Cancelled');
    } finally { enc = null; setBusy(false); }
  };

  /* screens + swipes (75 px, wrap-around, left = next) */
  const N = 2, track = $('track'), app = $('app'), dots = [...document.querySelectorAll('#dots i')];
  let cur = 0;
  function place(dx) { track.style.transform = 'translateX(calc(' + (-cur * 100) + '% + ' + dx + 'px))'; }
  function go(i) { cur = (i + N) % N; place(0); dots.forEach((d, k) => d.classList.toggle('on', k === cur)); }
  go(0);
  const noSwipe = (el) => el.closest && el.closest('input, video, .noswipe, .seg, button, #dialog, #result img');
  let g = null;
  app.addEventListener('pointerdown', (e) => {
    if (!$('dialog').hidden || (e.pointerType === 'mouse' && e.button !== 0) || noSwipe(e.target)) { g = null; return; }
    g = { x: e.clientX, y: e.clientY, axis: null, id: e.pointerId };
  });
  app.addEventListener('pointermove', (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.axis && (Math.abs(dx) > TAP_MOVE || Math.abs(dy) > TAP_MOVE)) g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (g.axis === 'x') { track.classList.add('drag'); const edge = (cur === 0 && dx > 0) || (cur === N - 1 && dx < 0); place(edge ? dx * 0.3 : dx); }
  });
  function end(e, cancel) {
    if (!g || e.pointerId !== g.id) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y, gg = g; g = null; track.classList.remove('drag');
    if (!cancel && gg.axis === 'x' && Math.abs(dx) >= SWIPE && Math.abs(dx) > Math.abs(dy)) go(cur + (dx < 0 ? 1 : -1)); else place(0);
  }
  app.addEventListener('pointerup', (e) => end(e, false));
  app.addEventListener('pointercancel', (e) => end(e, true));
  addEventListener('keydown', (e) => {
    if (!$('dialog').hidden) { if (e.key === 'Escape') closeDlg(false); if (e.key === 'Enter') closeDlg(true); return; }
    if (e.target.closest && e.target.closest('input')) return;
    if (e.key === 'ArrowRight') go(cur + 1); else if (e.key === 'ArrowLeft') go(cur - 1);
  });
  addEventListener('storage', (e) => { if (e.key === SKEY) { try { Object.assign(P, JSON.parse(e.newValue || '{}')); } catch (_) { /* */ } theme(); renderSeg(); srcMode(); estimate(); } });
  srcMode();
  window.GMApp = { go, get screen() { return cur; } };
})();
