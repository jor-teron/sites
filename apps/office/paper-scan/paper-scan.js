/*
 * Paper Scan — paper-scan.js  (main: state, page processing queue, export, keys)
 * PS.pages = ordered page records (see ps_store.js). New photos → centered A4 crop (true proportions;
 * live-camera shots are already A4 → full corners),
 * filter Document → rendered at the chosen quality → saved. Export builds one PDF (ps_pdf.js):
 * ⬇ PDF download, 🖨 Print (hidden iframe + browser print dialog), ↗ Share (navigator.share files),
 * 📤 Send (ps_send.js). Keys: Ctrl+S export, Delete removes the focused/edited page, Ctrl+Z undo,
 * Esc closes the editor, arrows move focus between buttons (Hub D-pad).
 */
(function () {
  'use strict';
  const PS = window.PS;
  const $ = (id) => document.getElementById(id);
  PS.pages = [];
  let quality = PS.store.quality();
  let lastPdf = null;   // {blob, key} cache so Print/Share/Send right after Download reuse it

  PS.ui = { status: (t) => { $('status').textContent = t || ''; } };
  const mb = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const save = (p) => PS.store.put({ id: p.id, src: p.src, out: p.out, w: p.w, h: p.h, corners: p.corners, rot: p.rot, filter: p.filter, q: p.q });
  const saveOrder = () => PS.store.order(PS.pages.map((p) => p.id));

  function sizeLine() {
    const done = PS.pages.filter((p) => p.out);
    if (!PS.pages.length) return PS.ui.status('');
    const est = done.reduce((s, p) => s + p.out.size, 0) + 600 * PS.pages.length;
    PS.ui.status(PS.pages.length + ' page(s) · PDF ≈ ' + mb(est) + (done.length < PS.pages.length ? ' · working…' : ''));
  }

  /* one-at-a-time render queue (big canvases; phones run out of memory in parallel) */
  let chain = Promise.resolve();
  function process(p) {
    p.busy = true; lastPdf = null;
    chain = chain.then(async () => {
      if (!PS.pages.includes(p)) return;
      try {
        const r = await PS.crop.render(p, quality);
        p.out = r.blob; p.w = r.w; p.h = r.h; p.q = quality;
        await save(p);
      } catch (e) { PS.ui.status('Page ' + (PS.pages.indexOf(p) + 1) + ': ' + e.message); }
      p.busy = false;
      PS.list.render(); sizeLine();
    });
    PS.list.render();
    return chain;
  }

  function addFiles(files) {
    files.forEach((f) => {
      const p = { id: uid(), src: f, corners: f.a4 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : null, rot: 0, filter: 'document' };
      PS.pages.push(p); process(p);
    });
    saveOrder();
    // One new photo → straight into crop; several → review in the grid.
    if (files.length === 1 && !files[0].a4) edit(PS.pages[PS.pages.length - 1]);
  }

  function edit(p) { PS.crop.open(p, (q) => process(q)).catch((e) => PS.ui.status(e.message)); }
  function move(p, d) {
    const i = PS.pages.indexOf(p), j = Math.max(0, Math.min(PS.pages.length - 1, i + d));
    if (i < 0 || i === j) return;
    PS.pages.splice(i, 1); PS.pages.splice(j, 0, p); lastPdf = null;
    saveOrder(); PS.list.render();
    const t = document.querySelector('.ps-page[data-id="' + p.id + '"] .row button:nth-child(' + (d < 0 ? 1 : 2) + ')');
    if (t && !t.disabled) t.focus();
  }
  async function retake(p) {
    const f = await PS.capture.retake(); if (!f) return;
    PS.crop.remember(p);
    p.src = f; p.corners = f.a4 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : null; p.rot = 0;
    process(p); edit(p);
  }
  function remove(p) {
    if (!confirm('Delete page ' + (PS.pages.indexOf(p) + 1) + '?')) return;
    PS.pages = PS.pages.filter((x) => x !== p); lastPdf = null;
    PS.store.del(p.id); saveOrder(); PS.list.render(); sizeLine();
  }

  async function makePdf() {
    if (!PS.pages.length) { PS.ui.status('Add a page first'); return null; }
    PS.pages.filter((p) => p.q !== quality || !p.out).forEach((p) => { if (!p.busy) process(p); });
    PS.ui.status('Making PDF…');
    await chain;
    const key = PS.pages.map((p) => p.id + ':' + p.out.size).join('|');
    if (lastPdf && lastPdf.key === key) return lastPdf.file;
    const pages = await Promise.all(PS.pages.map(async (p) => ({ jpeg: new Uint8Array(await p.out.arrayBuffer()), w: p.w, h: p.h })));
    const blob = PS.pdf.build(pages);
    const file = new File([blob], PS.pdf.fileName(), { type: 'application/pdf' });
    lastPdf = { key, file };
    PS.ui.status(PS.pages.length + ' page(s) · ' + file.name + ' · ' + mb(file.size));
    return file;
  }

  function download(file) {
    const a = document.createElement('a'), u = URL.createObjectURL(file);
    a.href = u; a.download = file.name; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 60000);
  }
  let frame = null;
  function printPdf(file) {
    if (frame) { URL.revokeObjectURL(frame.src); frame.remove(); }
    frame = document.createElement('iframe');
    frame.className = 'ps-print-frame'; frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1;
    frame.onload = () => setTimeout(() => { try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (_) { window.open(frame.src, '_blank'); } }, 300);
    frame.src = URL.createObjectURL(file);
    document.body.append(frame);
  }
  async function share(file) {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: file.name }); } catch (e) { if (e.name !== 'AbortError') PS.ui.status('Share failed: ' + e.message); }
    } else { PS.ui.status('This browser cannot share files — downloaded instead'); download(file); }
  }
  const act = (fn) => async () => { try { const f = await makePdf(); if (f) await fn(f); } catch (e) { PS.ui.status('PDF failed: ' + e.message); } };

  async function newScan() {
    if (PS.pages.length && !confirm('Start a new scan? All ' + PS.pages.length + ' page(s) will be removed.')) return;
    PS.pages = []; lastPdf = null; await PS.store.clear(); PS.list.render(); sizeLine();
  }

  function keys(e) {
    const ctrl = e.ctrlKey || e.metaKey, tag = (e.target.tagName || '').toLowerCase();
    if (ctrl && e.key.toLowerCase() === 's') { e.preventDefault(); act(download)(); return; }
    if (ctrl && e.key.toLowerCase() === 'z') { e.preventDefault(); const p = PS.crop.undo(); if (p) process(p); return; }
    if (e.key === 'Escape' && PS.live && PS.live.isOpen()) { PS.live.close(); return; }
    if (e.key === 'Escape' && PS.crop.isOpen()) { PS.crop.close(); return; }
    if (e.key === 'Delete' && tag !== 'input' && tag !== 'select') {
      const li = e.target.closest && e.target.closest('.ps-page');
      const p = li && PS.pages.find((x) => x.id === li.dataset.id);
      if (p) { e.preventDefault(); remove(p); }
      return;
    }
    if (/^Arrow/.test(e.key) && tag !== 'select' && tag !== 'input') {
      const scope = PS.crop.isOpen() ? $('editor') : document;
      const list = Array.from(scope.querySelectorAll('button:not(:disabled), select, .ps-page img')).filter((b) => b.offsetParent && !b.closest('[hidden]'));
      if (!list.length) return;
      const i = list.indexOf(document.activeElement), d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
      e.preventDefault();
      list[(i + d + list.length) % list.length].focus();
    }
  }

  async function init() {
    $('quality').value = quality;
    $('quality').addEventListener('change', () => { quality = PS.store.quality($('quality').value); lastPdf = null; PS.pages.forEach(process); });
    PS.list.init({ edit, move, retake, remove });
    PS.capture.init(addFiles);
    $('export').addEventListener('click', act(download));
    $('print').addEventListener('click', act(printPdf));
    $('share').addEventListener('click', act(share));
    $('send').addEventListener('click', act((f) => PS.send(f)));
    $('newscan').addEventListener('click', newScan);
    document.addEventListener('keydown', keys);
    if (window.SharedLink) window.addEventListener('pagehide', () => SharedLink.pause && SharedLink.role === 'join' && SharedLink.pause());
    const saved = await PS.store.all();
    PS.pages = saved || [];
    PS.list.render(); sizeLine();
    PS.pages.filter((p) => !p.out).forEach(process);
  }
  init();
})();
