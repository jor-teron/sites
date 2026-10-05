/**
 * Hub — received-file overlay (images + PDFs). HubViewer.push(item) adds {url,name,type}
 * to a queue and auto-opens; HubViewer.open(url,name,type) jumps to / adds one item.
 * White 80% backdrop, content ~80% of the screen. Esc / controller B ("x") closes;
 * ← → (and hub D-pad) move the queue; ↑ ↓ / wheel / touch scroll a multi-page PDF.
 * Download keeps the existing save. Uses each card's blob URL (hub_notify.js revokes it).
 * PDF pages: hub_viewer_pdf.js + shared/vendor/pdfjs/.
 */
(function () {
  'use strict';
  const queue = [];          // {url, name, type, kind}
  let box = null, stage = null, img = null, pdfHost = null, bar = null, prevBtn = null, nextBtn = null, label = null;
  let idx = -1, cur = null, frameWin = null, pdfHandle = null, loading = 0;

  function kindOf(type, name) {
    const t = String(type || '').toLowerCase();
    const ext = String(name || '').toLowerCase().split('.').pop();
    if (t.indexOf('image/') === 0 || /^(png|jpe?g|gif|webp|bmp|svg|avif|heic)$/.test(ext)) return 'image';
    if (t === 'application/pdf' || ext === 'pdf') return 'pdf';
    return 'other';
  }
  function btn(text, cls, fn) {
    const b = document.createElement('button');
    b.type = 'button'; if (cls) b.className = cls; b.textContent = text;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  }
  function build() {
    box = document.createElement('div');
    box.id = 'hub-viewer'; box.hidden = true;
    box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
    stage = document.createElement('div'); stage.className = 'hv-stage';
    stage.addEventListener('click', (e) => e.stopPropagation());
    img = document.createElement('img'); img.hidden = true; img.alt = '';
    pdfHost = document.createElement('div'); pdfHost.className = 'hv-pdf'; pdfHost.hidden = true;
    stage.append(img, pdfHost);
    bar = document.createElement('div'); bar.className = 'hv-bar';
    prevBtn = btn('←', 'hv-nav', () => step(-1));
    nextBtn = btn('→', 'hv-nav', () => step(1));
    label = document.createElement('span'); label.className = 'hv-label';
    bar.append(prevBtn, nextBtn, label, btn('Download', '', save), btn('✕', '', close));
    box.append(stage, bar);
    box.addEventListener('click', close);
    document.body.appendChild(box);
  }
  function save() {
    if (!cur) return;
    const a = document.createElement('a');
    a.href = cur.url; a.download = cur.name || 'file'; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
  }
  function clearStage() {
    if (pdfHandle) { try { pdfHandle.clear(); } catch (_) { /* ignore */ } pdfHandle = null; }
    pdfHost.innerHTML = ''; pdfHost.hidden = true;
    img.hidden = true; img.removeAttribute('src');
  }
  async function show(i) {
    if (!queue.length) { close(); return; }
    idx = ((i % queue.length) + queue.length) % queue.length;
    cur = queue[idx];
    loading++;
    const my = loading;
    clearStage();
    box.setAttribute('aria-label', cur.name);
    label.textContent = (idx + 1) + ' / ' + queue.length + ' · ' + cur.name;
    const many = queue.length > 1;
    prevBtn.hidden = nextBtn.hidden = !many;
    box.hidden = false;                 // visible before PDF layout (clientWidth)
    syncWatch();
    if (cur.kind === 'image') {
      img.hidden = false; img.alt = cur.name; img.src = cur.url;
    } else if (cur.kind === 'pdf') {
      pdfHost.hidden = false;
      const tip = document.createElement('div'); tip.className = 'hv-tip'; tip.textContent = 'Loading PDF…';
      pdfHost.appendChild(tip);
      try {
        if (!window.HubViewerPdf) throw new Error('PDF viewer missing');
        const h = await HubViewerPdf.render(pdfHost, cur.url);
        tip.remove();
        if (my !== loading) { h.clear(); return; }   // a newer show() won
        pdfHandle = h;
      } catch (err) {
        if (my !== loading) return;
        tip.textContent = 'Could not open PDF';
        console.warn('hub viewer pdf', err);
      }
    } else {
      pdfHost.hidden = false;
      pdfHost.textContent = cur.name || 'File';
    }
  }
  function step(dir) { if (queue.length > 1) show(idx + dir); }
  function scrollStage(dy) { stage.scrollBy({ top: dy, behavior: 'auto' }); }

  function onKey(e) {
    if (box.hidden) return;
    const k = e.key;
    const closeKey = k === 'Escape' || k === 'x' || k === 'X';
    const nav = k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown';
    if (!closeKey && !nav) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.type !== 'keydown') return;
    if (closeKey) close();
    else if (k === 'ArrowLeft') step(-1);
    else if (k === 'ArrowRight') step(1);
    else if (k === 'ArrowUp') scrollStage(-Math.max(120, stage.clientHeight * 0.4));
    else if (k === 'ArrowDown') scrollStage(Math.max(120, stage.clientHeight * 0.4));
  }
  let watching = false;
  function syncWatch() {
    const want = !box.hidden;
    if (want === watching) return;
    watching = want;
    const f = want ? 'addEventListener' : 'removeEventListener';
    window[f]('keydown', onKey, true); window[f]('keyup', onKey, true);
    if (want) {
      try {
        const fr = document.getElementById('app-frame');
        frameWin = fr && fr.contentWindow && fr.contentWindow.document ? fr.contentWindow : null;
      } catch (_) { frameWin = null; }
    }
    try { if (frameWin) { frameWin[f]('keydown', onKey, true); frameWin[f]('keyup', onKey, true); } } catch (_) { /* cross-origin */ }
    if (!want) frameWin = null;
  }

  function push(item) {
    if (!item || !item.url) return -1;
    if (!box) build();
    const kind = item.kind || kindOf(item.type, item.name);
    if (kind !== 'image' && kind !== 'pdf') return -1;   // only images + PDFs join the overlay queue
    const i = queue.findIndex((x) => x.url === item.url);
    if (i >= 0) return i;
    queue.push({ url: item.url, name: item.name || 'file', type: item.type || '', kind: kind });
    return queue.length - 1;
  }
  function open(url, name, type) {
    const i = push({ url: url, name: name, type: type });
    if (i < 0) return;
    show(i);
  }
  /** Add and show (auto-open on receive). */
  function pushAndShow(item) {
    const i = push(item);
    if (i < 0) return;
    show(i);
  }
  function close() {
    if (box.hidden && !cur) return;
    loading++;                         // cancel any in-flight PDF render
    clearStage();
    cur = null; idx = -1;
    if (box) box.hidden = true;
    syncWatch();
  }
  function holds(url) { return queue.some((x) => x.url === url); }

  window.HubViewer = {
    open: open, push: push, pushAndShow: pushAndShow, close: close, holds: holds,
    get isOpen() { return !!(box && !box.hidden); },
    get count() { return queue.length; },
  };
})();
