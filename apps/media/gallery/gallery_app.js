/* Gallery GA1 app: screens, swipes (not in the viewer), settings, theme, opening folders / files / drops, remembered folder. */
(function () {
  'use strict';
  const SWIPE = 75, TAP_MOVE = 10, $ = (id) => document.getElementById(id), S = GAStore, P = S.P;

  /* theme */
  const mq = matchMedia('(prefers-color-scheme: dark)');
  function theme() {
    let h = null; try { h = localStorage.getItem('sites-hub.theme'); } catch (_) { /* */ }
    const sys = h === 'dark' || h === 'light' ? h === 'dark' : mq.matches;
    document.documentElement.classList.toggle('dark', P.theme === 'dark' || (P.theme === 'system' && sys));
  }
  theme(); mq.addEventListener && mq.addEventListener('change', theme);
  addEventListener('storage', (e) => { if (e.key === 'sites-hub.theme') theme(); });

  /* dialog + toast */
  let dlgRes = null;
  function dialog(t, confirm, okText) { $('dlg-t').textContent = t; $('dlg-no').hidden = !confirm; $('dlg-ok').textContent = okText || 'OK'; $('dialog').hidden = false; $('dlg-ok').focus(); return new Promise((r) => { dlgRes = r; }); }
  function closeDlg(v) { $('dialog').hidden = true; const r = dlgRes; dlgRes = null; r && r(v); }
  $('dlg-ok').onclick = () => closeDlg(true); $('dlg-no').onclick = () => closeDlg(false);
  let tt = 0; function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(tt); tt = setTimeout(() => { el.hidden = true; }, 2500); }

  /* settings */
  function renderSeg() { document.querySelectorAll('.seg').forEach((g) => g.querySelectorAll('button').forEach((b) => b.classList.toggle('on', P[g.dataset.key] === b.dataset.v))); }
  document.querySelectorAll('.seg').forEach((g) => g.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const k = g.dataset.key; P[k] = b.dataset.v; S.save(); theme(); renderSeg();
    if (k !== 'theme') draw();
  }));
  renderSeg();

  /* grid */
  const gal = $('gal'); GAGrid.bind(gal);
  let srcName = '';
  function draw() {
    gal.className = 'cols-' + P.cols;
    const n = GAGrid.items.length;
    $('empty').hidden = n > 0; $('count').textContent = n ? n + ' photo' + (n === 1 ? '' : 's') + (srcName ? ' · ' + srcName : '') : 'No photos';
    GAGrid.render(gal, { sort: P.sort, group: P.group === '1' });
  }
  function load(list, name) {
    const n = GAGrid.set(list.map((f) => ({ file: f, name: f.name, size: f.size, date: f.lastModified || 0 })));
    srcName = name || '';
    if (!n) { dialog('No images found' + (name ? ' in "' + name + '"' : '') + '.'); }
    draw(); $('pane-gal').scrollTop = 0;
  }
  GAGrid.onOpen((i) => GAViewer.open(GAGrid.items, i));
  GAViewer.init({ toast, onClose: (i) => { const c = gal.querySelector('.cell[data-i="' + i + '"]'); c && c.focus({ preventScroll: false }); } });

  /* open folder: File System Access where supported, else <input webkitdirectory> */
  async function readDir(h, out, depth) {
    for await (const e of h.values()) {
      if (e.kind === 'file') { if (/\.(jpe?g|png|webp|gif|bmp|avif|svg)$/i.test(e.name)) { try { out.push(await e.getFile()); } catch (_) { /* */ } } }
      else if (depth < 4) await readDir(e, out, depth + 1);
    }
    return out;
  }
  async function openHandle(h) { $('count').textContent = 'Reading ' + h.name + '…'; load(await readDir(h, [], 0), h.name); }
  $('folder-btn').onclick = async () => {
    if (S.canHandles) {
      let h; try { h = await window.showDirectoryPicker({ id: 'gallery', mode: 'read' }); } catch (e) { if (e && e.name !== 'AbortError') toast('Could not open folder'); return; }
      await S.putFolder(h); remembered(h); await openHandle(h);
    } else $('dir').click();
  };
  $('dir').onchange = (e) => { const f = [...e.target.files]; const name = f[0] && f[0].webkitRelativePath ? f[0].webkitRelativePath.split('/')[0] : ''; load(f, name); e.target.value = ''; };
  $('files-btn').onclick = () => $('files').click();
  $('files').onchange = (e) => { load([...e.target.files], ''); e.target.value = ''; };

  /* remembered folder (re-permission needs a click) */
  let mem = null;
  function remembered(h) { mem = h; $('reopen-btn').hidden = !h; $('forget-row').hidden = !h; if (h) $('reopen-btn').textContent = '↻ ' + h.name; }
  $('reopen-btn').onclick = async () => {
    if (!mem) return;
    try { if (!(await S.permit(mem))) { toast('Permission not granted'); return; } await openHandle(mem); }
    catch (_) { await S.clearFolder(); remembered(null); dialog('That folder is no longer available.'); }
  };
  $('forget-btn').onclick = async () => { await S.clearFolder(); remembered(null); toast('Folder forgotten'); };
  S.getFolder().then(async (h) => {
    if (!h) return; remembered(h);
    try { if ((await h.queryPermission({ mode: 'read' })) === 'granted') openHandle(h); } catch (_) { /* */ }
  });

  /* drag and drop (files and, where supported, folders) */
  const pg = $('pane-gal');
  ['dragenter', 'dragover'].forEach((t) => pg.addEventListener(t, (e) => { e.preventDefault(); pg.classList.add('over'); }));
  pg.addEventListener('dragleave', (e) => { if (!pg.contains(e.relatedTarget)) pg.classList.remove('over'); });
  pg.addEventListener('drop', async (e) => {
    e.preventDefault(); pg.classList.remove('over');
    const its = [...(e.dataTransfer.items || [])];
    if (its.length === 1 && its[0].getAsFileSystemHandle) {
      try { const h = await its[0].getAsFileSystemHandle(); if (h && h.kind === 'directory') { await S.putFolder(h); remembered(h); return openHandle(h); } } catch (_) { /* */ }
    }
    load([...e.dataTransfer.files], '');
  });

  /* screens + swipes (75 px, wrap-around, left = next); never while the viewer is open */
  const N = 2, track = $('track'), app = $('app'), dots = [...document.querySelectorAll('#dots i')];
  let cur = 0;
  function place(dx) { track.style.transform = 'translateX(calc(' + (-cur * 100) + '% + ' + dx + 'px))'; }
  function go(i) { cur = (i + N) % N; place(0); dots.forEach((d, k) => d.classList.toggle('on', k === cur)); }
  go(0);
  let g = null;
  app.addEventListener('pointerdown', (e) => {
    if (GAViewer.isOpen() || !$('dialog').hidden || (e.pointerType === 'mouse' && e.button !== 0) || (e.target.closest && e.target.closest('input, .seg, .bar button'))) { g = null; return; }
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
    if (!cancel && gg.axis === 'x' && Math.abs(dx) >= SWIPE && Math.abs(dx) > Math.abs(dy)) { go(cur + (dx < 0 ? 1 : -1)); suppress = true; setTimeout(() => { suppress = false; }, 0); } else place(0);
  }
  let suppress = false; /* a swipe ending on a thumbnail must not open it */
  app.addEventListener('click', (e) => { if (suppress) { e.stopPropagation(); e.preventDefault(); } }, true);
  app.addEventListener('pointerup', (e) => end(e, false));
  app.addEventListener('pointercancel', (e) => end(e, true));
  addEventListener('keydown', (e) => {
    if (GAViewer.isOpen()) return;
    if (!$('dialog').hidden) { if (e.key === 'Escape') closeDlg(false); return; }
    if (e.key === 'ArrowRight') go(cur + 1); else if (e.key === 'ArrowLeft') go(cur - 1);
  });
  addEventListener('storage', (e) => { if (e.key === 'gallery-settings-v1') { try { Object.assign(P, JSON.parse(e.newValue || '{}')); } catch (_) { /* */ } theme(); renderSeg(); draw(); } });
  draw();
  window.GAApp = { go, get screen() { return cur; } };
})();
