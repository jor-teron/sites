/**
 * Hub — received-file overlay (images, PDFs, video, audio). HubViewer.push(item) adds {url,name,type}
 * to a queue and auto-opens; HubViewer.open(url,name,type) jumps to / adds one item.
 * White 95% backdrop, content ~95% of the screen. Filename + ✕ at the top; ← → sit
 * mid-left / mid-right when the queue has 2+ items. Esc / controller B ("x") closes;
 * ← → (and hub D-pad) move the queue; ↑ ↓ / wheel / touch scroll a multi-page PDF.
 * Video/audio autoplay muted (browser rule) with native controls; video loops by default.
 * Space (controller A) plays/pauses. "Print 🖨" hands the image/PDF alone to the browser's print dialog.
 * Files are already auto-saved (no Download button). Uses each card's blob URL
 * (hub_notify.js revokes it). PDF pages: hub_viewer_pdf.js + shared/vendor/pdfjs/.
 */
(function () {
  'use strict';
  const queue = [];          // {url, name, type, kind}
  let box = null, stage = null, img = null, media = null, printBtn = null, printFrame = null, pdfHost = null, bar = null, prevBtn = null, nextBtn = null, label = null, closeBtn = null;
  let idx = -1, cur = null, frameWin = null, pdfHandle = null, loading = 0;

  function kindOf(type, name) {
    const t = String(type || '').toLowerCase();
    const ext = String(name || '').toLowerCase().split('.').pop();
    if (t.indexOf('image/') === 0 || /^(png|jpe?g|gif|webp|bmp|svg|avif|heic)$/.test(ext)) return 'image';
    if (t === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (t.indexOf('video/') === 0 || /^(mp4|webm|mov|mkv|avi|3gp)$/.test(ext)) return 'video';
    if (t.indexOf('audio/') === 0 || /^(mp3|wav|ogg|m4a|aac|flac|opus)$/.test(ext)) return 'audio';
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
    img = document.createElement('img'); img.alt = '';
    pdfHost = document.createElement('div'); pdfHost.className = 'hv-pdf'; pdfHost.hidden = true;
    stage.appendChild(pdfHost);   // img is attached only while showing an image (no empty-src glyph)
    bar = document.createElement('div'); bar.className = 'hv-bar';
    label = document.createElement('span'); label.className = 'hv-label';
    closeBtn = btn('✕', 'hv-close', close);
    closeBtn.title = 'Close'; closeBtn.setAttribute('aria-label', 'Close');
    printBtn = btn('Print 🖨', 'hv-print', printCur);
    printBtn.title = 'Print'; printBtn.setAttribute('aria-label', 'Print');
    bar.append(label, printBtn, closeBtn);
    prevBtn = btn('', 'hv-nav hv-prev', () => step(-1));
    nextBtn = btn('', 'hv-nav hv-next', () => step(1));
    prevBtn.innerHTML = chevron('14.5,3.3 9.5,12 14.5,20.7');   // 120° opening
    nextBtn.innerHTML = chevron('9.5,3.3 14.5,12 9.5,20.7');
    prevBtn.title = 'Previous'; nextBtn.title = 'Next';
    prevBtn.setAttribute('aria-label', 'Previous'); nextBtn.setAttribute('aria-label', 'Next');
    box.append(stage, bar, prevBtn, nextBtn);
    box.addEventListener('click', close);
    document.body.appendChild(box);
  }
  function chevron(pts) {
    return '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><polyline points="' + pts +
      '" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function detachMedia() {
    if (!media) return;
    try { media.pause(); } catch (_) { /* ignore */ }
    media.removeAttribute('src'); try { media.load(); } catch (_) { /* ignore */ }
    media.remove(); media = null;
  }
  function showMedia(kind) {
    media = document.createElement(kind === 'audio' ? 'audio' : 'video');
    media.className = 'hv-media hv-' + kind;
    media.controls = true; media.autoplay = true; media.muted = true; media.playsInline = true;
    if (kind === 'video') media.loop = true;   // reel-style: keep looping
    media.setAttribute('playsinline', ''); media.preload = 'auto';
    media.src = cur.url;
    stage.appendChild(media);
    const p = media.play(); if (p && p.catch) p.catch(() => { /* user can press play */ });
  }
  function toggleMedia() {
    if (!media) return;
    if (media.paused) { media.muted = false; const p = media.play(); if (p && p.catch) p.catch(() => {}); }
    else media.pause();
  }
  // Hand the file alone to the browser's own print dialog; the browser decides all print settings.
  function printCur() {
    if (!cur || (cur.kind !== 'image' && cur.kind !== 'pdf')) return;
    if (printFrame) printFrame.remove();
    const f = printFrame = document.createElement('iframe');
    f.className = 'hv-print-frame'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
    const fire = () => {
      try { f.contentWindow.focus(); f.contentWindow.print(); }
      catch (_) { window.open(cur.url, '_blank'); }   // fallback: browser's own viewer
    };
    if (cur.kind === 'pdf') {
      f.onload = fire; f.src = cur.url;
    } else {
      const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
      f.onload = () => {
        const im = f.contentDocument && f.contentDocument.querySelector('img');
        if (im && !im.complete) im.onload = fire; else fire();
      };
      f.srcdoc = '<!doctype html><title>' + esc(cur.name) + '</title><style>html,body{margin:0}' +
        'img{display:block;max-width:100%;max-height:100vh;margin:auto;object-fit:contain}</style>' +
        '<img src="' + esc(cur.url) + '" alt="">';
    }
    document.body.appendChild(f);
  }
  function detachImg() {
    img.removeAttribute('src');
    img.removeAttribute('alt');
    if (img.parentNode) img.parentNode.removeChild(img);
  }
  function clearStage() {
    if (pdfHandle) { try { pdfHandle.clear(); } catch (_) { /* ignore */ } pdfHandle = null; }
    pdfHost.innerHTML = ''; pdfHost.hidden = true;
    detachImg(); detachMedia();
  }
  async function show(i) {
    if (!queue.length) { close(); return; }
    idx = ((i % queue.length) + queue.length) % queue.length;
    cur = queue[idx];
    loading++;
    const my = loading;
    clearStage();
    box.setAttribute('aria-label', cur.name);
    label.textContent = cur.name + (queue.length > 1 ? '  ·  ' + (idx + 1) + ' / ' + queue.length : '');
    const many = queue.length > 1;
    prevBtn.hidden = nextBtn.hidden = !many;
    printBtn.hidden = !(cur.kind === 'image' || cur.kind === 'pdf');
    box.hidden = false;
    syncWatch();
    if (cur.kind === 'image') {
      img.alt = cur.name; img.src = cur.url;
      stage.appendChild(img);
    } else if (cur.kind === 'video' || cur.kind === 'audio') {
      showMedia(cur.kind);
    } else if (cur.kind === 'pdf') {
      pdfHost.hidden = false;
      const tip = document.createElement('div'); tip.className = 'hv-tip'; tip.textContent = 'Loading PDF…';
      pdfHost.appendChild(tip);
      try {
        if (!window.HubViewerPdf) throw new Error('PDF viewer missing');
        const h = await HubViewerPdf.render(pdfHost, cur.url);
        tip.remove();
        if (my !== loading) { h.clear(); return; }
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
    const space = (k === ' ' || k === 'Spacebar') && !!media;
    if (!closeKey && !nav && !space) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.type !== 'keydown') return;
    if (closeKey) close();
    else if (space) toggleMedia();
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
    if (!/^(image|pdf|video|audio)$/.test(kind)) return -1;
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
  function pushAndShow(item) {
    const i = push(item);
    if (i < 0) return;
    show(i);
  }
  function close() {
    if ((!box || box.hidden) && !cur) return;
    loading++;
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
