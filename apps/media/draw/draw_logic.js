/*
 * Draw — logic. Settings: DRAW_CONFIG (draw_config.js).
 *
 * Model: a fixed-size DOCUMENT (paint layer canvas, transparent, + background
 * colour) is separate from the VIEW canvas on screen. The view shows the document
 * through a transform (scale, offset) for zoom / pan; rotating or resizing only
 * refits the view. A background layer could later be added next to `layers.paint`.
 * Undo / redo store before / after pixel patches of the changed rectangle only.
 * Input: pointer events (finger, stylus, mouse), pinch zoom, wheel zoom, middle /
 * Space drag pan, keyboard shortcuts, clipboard paste, file open. Autosave to
 * localStorage (debounced). Sites hub bridge at the bottom (Undo / Redo / Clear / Save).
 */
(function () {
  'use strict';
  const CFG = DRAW_CONFIG;
  const TX = CFG.text;
  const $ = (id) => document.getElementById(id);

  const stage = $('stage');
  const view = $('view');
  const vctx = view.getContext('2d');
  const zoomBtn = $('zoom-reset');
  const toastEl = $('toast');
  const toolBtns = Array.from(document.querySelectorAll('.tool'));
  const shapeBtn = $('shape-btn');
  const colorBtn = $('color-btn'), colorDot = $('color-dot');
  const sizeBtn = $('size-btn'), sizeDot = $('size-dot');
  const undoBtn = $('undo-btn'), redoBtn = $('redo-btn'), moreBtn = $('more-btn');
  const popColor = $('pop-color'), popSize = $('pop-size'), popMore = $('pop-more');
  const confirmEl = $('confirm'), fileIn = $('file-in');

  // ---------------------------------------------------------------- state
  const state = {
    tool: CFG.startTool,
    shape: CFG.shapes[0],
    color: CFG.colors[0],
    sizeIdx: CFG.startSize,
  };
  /* Document: size in doc px, density = doc px per CSS px at creation. */
  const doc = { w: 0, h: 0, density: 1, bg: CFG.doc.background };
  /* Layers (only paint for now). */
  const layers = { paint: null };
  let pctx = null;
  /* View transform: screen(css) = doc * scale + offset. zoom is relative to fit. */
  const vw = { cssW: 0, cssH: 0, dpr: 1, fit: 1, zoom: 1, ox: 0, oy: 0 };
  let needsRender = true;

  function storeGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function storeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } }
  function storeDel(k) { try { localStorage.removeItem(k); } catch (_) { /* ignore */ } }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function newDocument(w, h, density) {
    doc.w = w; doc.h = h; doc.density = density;
    layers.paint = makeCanvas(w, h);
    pctx = layers.paint.getContext('2d', { willReadFrequently: true });
    scratch = makeCanvas(w, h);
    sctx = scratch.getContext('2d');
  }
  /* Size for a new drawing: the free stage area at (capped) device density. */
  function viewportDocSize() {
    const r = stage.getBoundingClientRect();
    let dens = Math.min(window.devicePixelRatio || 1, CFG.doc.density);
    let w = Math.max(100, Math.round(r.width * dens)), h = Math.max(100, Math.round(r.height * dens));
    const k = Math.min(1, CFG.doc.maxSide / Math.max(w, h));
    w = Math.round(w * k); h = Math.round(h * k); dens *= k;
    return { w, h, density: dens };
  }

  // ---------------------------------------------------------------- view
  const scale = () => vw.fit * vw.zoom;
  function resizeView() {
    const r = stage.getBoundingClientRect();
    const oldScale = scale();
    const centre = vw.cssW ? toDocXY(vw.cssW / 2, vw.cssH / 2) : null;
    vw.cssW = Math.max(1, Math.floor(r.width));
    vw.cssH = Math.max(1, Math.floor(r.height));
    vw.dpr = window.devicePixelRatio || 1;
    view.width = Math.round(vw.cssW * vw.dpr);
    view.height = Math.round(vw.cssH * vw.dpr);
    view.style.width = vw.cssW + 'px';
    view.style.height = vw.cssH + 'px';
    vw.fit = Math.min(vw.cssW / doc.w, vw.cssH / doc.h);
    if (vw.zoom === 1 && isCentred(oldScale)) centreView();
    else if (centre) {                      // keep the same doc point in the middle
      vw.ox = vw.cssW / 2 - centre.x * scale();
      vw.oy = vw.cssH / 2 - centre.y * scale();
    } else centreView();
    updateZoomUi();
    needsRender = true;
  }
  let wasCentred = true;
  function isCentred() { return wasCentred; }
  function centreView() {
    vw.ox = (vw.cssW - doc.w * scale()) / 2;
    vw.oy = (vw.cssH - doc.h * scale()) / 2;
    wasCentred = true;
  }
  function resetZoom() {
    vw.zoom = 1;
    centreView();
    updateZoomUi();
    needsRender = true;
  }
  /* Zoom to z around a screen point (css px in the stage). */
  function zoomAt(z, sx, sy) {
    z = Math.max(CFG.zoom.min, Math.min(CFG.zoom.max, z));
    const d = toDocXY(sx, sy);
    vw.zoom = z;
    vw.ox = sx - d.x * scale();
    vw.oy = sy - d.y * scale();
    wasCentred = false;
    updateZoomUi();
    needsRender = true;
  }
  function panBy(dx, dy) {
    vw.ox += dx; vw.oy += dy;
    wasCentred = false;
    updateZoomUi();
    needsRender = true;
  }
  function updateZoomUi() {
    const show = Math.abs(vw.zoom - 1) > 0.01 || !wasCentred;
    zoomBtn.hidden = !show;
    zoomBtn.textContent = Math.round(vw.zoom * 100) + '%  ⟲';
    zoomBtn.title = TX.resetZoom;
  }
  /* Stage css px → document px. */
  function toDocXY(sx, sy) {
    const s = scale();
    return { x: (sx - vw.ox) / s, y: (sy - vw.oy) / s };
  }
  function eventDoc(e) {
    const r = view.getBoundingClientRect();
    return toDocXY(e.clientX - r.left, e.clientY - r.top);
  }

  function render() {
    needsRender = false;
    const c = vctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = '#e9e9ec';
    c.fillRect(0, 0, view.width, view.height);
    const s = scale() * vw.dpr;
    c.setTransform(s, 0, 0, s, vw.ox * vw.dpr, vw.oy * vw.dpr);
    c.shadowColor = 'rgba(0,0,0,0.15)';
    c.shadowBlur = 8;
    c.fillStyle = doc.bg;
    c.fillRect(0, 0, doc.w, doc.h);
    c.shadowBlur = 0; c.shadowColor = 'transparent';
    c.imageSmoothingEnabled = scale() < 1;
    c.drawImage(layers.paint, 0, 0);
    if (preview) drawShape(c, preview.kind, preview.x0, preview.y0, preview.x1, preview.y1);
  }
  function frame() {
    if (needsRender) render();
    requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------- history
  /* Ops: { x, y, before: ImageData, after: ImageData }. */
  const history = [];
  let histIdx = 0;          // number of applied ops
  let scratch = null, sctx = null;  // copy of the paint layer at op start
  let opActive = false;
  function beginOp() {
    sctx.globalCompositeOperation = 'copy';
    sctx.drawImage(layers.paint, 0, 0);
    sctx.globalCompositeOperation = 'source-over';
    opActive = true;
  }
  function cancelOp() {
    if (!opActive) return;
    pctx.save();
    pctx.globalCompositeOperation = 'copy';
    pctx.drawImage(scratch, 0, 0);
    pctx.restore();
    opActive = false;
    needsRender = true;
  }
  function commitOp(box) {
    if (!opActive) return;
    opActive = false;
    const x = Math.max(0, Math.floor(box.x0)), y = Math.max(0, Math.floor(box.y0));
    const x1 = Math.min(doc.w, Math.ceil(box.x1)), y1 = Math.min(doc.h, Math.ceil(box.y1));
    const w = x1 - x, h = y1 - y;
    if (w <= 0 || h <= 0) return;
    const before = sctx.getImageData(x, y, w, h);
    const after = pctx.getImageData(x, y, w, h);
    history.length = histIdx;
    history.push({ x, y, before, after });
    if (history.length > CFG.historyLimit) history.shift();
    histIdx = history.length;
    afterChange();
  }
  function undo() {
    if (busy() || histIdx === 0) return;
    const op = history[--histIdx];
    pctx.putImageData(op.before, op.x, op.y);
    afterChange();
  }
  function redo() {
    if (busy() || histIdx >= history.length) return;
    const op = history[histIdx++];
    pctx.putImageData(op.after, op.x, op.y);
    afterChange();
  }
  function afterChange() {
    needsRender = true;
    updateUndoUi();
    scheduleSave();
  }
  function updateUndoUi() {
    undoBtn.disabled = histIdx === 0;
    redoBtn.disabled = histIdx >= history.length;
  }
  const FULL = () => ({ x0: 0, y0: 0, x1: doc.w, y1: doc.h });

  // ---------------------------------------------------------------- drawing
  const brush = () => CFG.sizes[state.sizeIdx] * doc.density;
  function strokeStyle(ctx, erase) {
    ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
    ctx.strokeStyle = state.color;
    ctx.fillStyle = state.color;
    ctx.lineWidth = brush();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }
  let stroke = null;   // { pts: [...], box, erase, id }
  function growBox(b, x, y, pad) {
    if (x - pad < b.x0) b.x0 = x - pad;
    if (y - pad < b.y0) b.y0 = y - pad;
    if (x + pad > b.x1) b.x1 = x + pad;
    if (y + pad > b.y1) b.y1 = y + pad;
  }
  function strokeStart(p, id) {
    beginOp();
    const erase = state.tool === 'eraser';
    stroke = { pts: [p], erase, id, box: { x0: p.x, y0: p.y, x1: p.x, y1: p.y } };
    const pad = brush() / 2 + 2;
    growBox(stroke.box, p.x, p.y, pad);
    pctx.save();
    strokeStyle(pctx, erase);
    pctx.beginPath();
    pctx.arc(p.x, p.y, brush() / 2, 0, Math.PI * 2);
    pctx.fill();
    pctx.restore();
    needsRender = true;
  }
  function strokeAdd(p) {
    const pts = stroke.pts;
    const last = pts[pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 0.6) return;
    pts.push(p);
    growBox(stroke.box, p.x, p.y, brush() / 2 + 2);
    pctx.save();
    strokeStyle(pctx, stroke.erase);
    pctx.beginPath();
    const n = pts.length;
    if (n < 3) {
      pctx.moveTo(last.x, last.y);
      pctx.lineTo(p.x, p.y);
    } else {                                   // smooth: midpoint quadratic
      const a = pts[n - 3], b = pts[n - 2];
      pctx.moveTo((a.x + b.x) / 2, (a.y + b.y) / 2);
      pctx.quadraticCurveTo(b.x, b.y, (b.x + p.x) / 2, (b.y + p.y) / 2);
    }
    pctx.stroke();
    pctx.restore();
    needsRender = true;
  }
  function strokeEnd() {
    if (!stroke) return;
    const pts = stroke.pts, n = pts.length;
    if (n >= 3) {                              // finish the tail of the curve
      const b = pts[n - 2], p = pts[n - 1];
      pctx.save();
      strokeStyle(pctx, stroke.erase);
      pctx.beginPath();
      pctx.moveTo((b.x + p.x) / 2, (b.y + p.y) / 2);
      pctx.lineTo(p.x, p.y);
      pctx.stroke();
      pctx.restore();
    }
    const box = stroke.box;
    stroke = null;
    commitOp(box);
  }
  function strokeCancel() {
    stroke = null;
    cancelOp();
  }

  /* Shapes */
  let preview = null;  // { kind, x0, y0, x1, y1, id }
  function drawShape(ctx, kind, x0, y0, x1, y1) {
    ctx.save();
    strokeStyle(ctx, false);
    ctx.beginPath();
    if (kind === 'line') {
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    } else if (kind === 'rect') {
      ctx.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
    } else {
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
      ctx.ellipse(cx, cy, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.restore();
  }
  function shapeCommit() {
    const pv = preview;
    preview = null;
    if (!pv || (Math.abs(pv.x1 - pv.x0) < 1 && Math.abs(pv.y1 - pv.y0) < 1)) { needsRender = true; return; }
    beginOp();
    drawShape(pctx, pv.kind, pv.x0, pv.y0, pv.x1, pv.y1);
    const pad = brush() / 2 + 2;
    commitOp({ x0: Math.min(pv.x0, pv.x1) - pad, y0: Math.min(pv.y0, pv.y1) - pad, x1: Math.max(pv.x0, pv.x1) + pad, y1: Math.max(pv.y0, pv.y1) + pad });
  }

  /* Flood fill (scanline) on the paint layer, comparing colours as seen over the
     background, with CFG.fillTolerance per channel. */
  function hexRgb(hex) {
    let h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function floodFill(px, py) {
    const x0 = Math.floor(px), y0 = Math.floor(py);
    if (x0 < 0 || y0 < 0 || x0 >= doc.w || y0 >= doc.h) return;
    const W = doc.w, H = doc.h;
    const img = pctx.getImageData(0, 0, W, H);
    const d = img.data;
    const bg = hexRgb(doc.bg);
    // seen colour of pixel i (composited over the background), packed in an Int32 view
    const seen = (i, out) => {
      const a = d[i + 3] / 255;
      out[0] = d[i] * a + bg[0] * (1 - a);
      out[1] = d[i + 1] * a + bg[1] * (1 - a);
      out[2] = d[i + 2] * a + bg[2] * (1 - a);
    };
    const target = [0, 0, 0], cur = [0, 0, 0];
    seen((y0 * W + x0) * 4, target);
    const fc = hexRgb(state.color);
    const tol = CFG.fillTolerance;
    if (Math.abs(target[0] - fc[0]) <= 1 && Math.abs(target[1] - fc[1]) <= 1 && Math.abs(target[2] - fc[2]) <= 1) return;
    const done = new Uint8Array(W * H);
    const match = (p) => {
      if (done[p]) return false;
      seen(p * 4, cur);
      return Math.abs(cur[0] - target[0]) <= tol && Math.abs(cur[1] - target[1]) <= tol && Math.abs(cur[2] - target[2]) <= tol;
    };
    let bx0 = x0, by0 = y0, bx1 = x0, by1 = y0;
    const stack = [x0, y0];
    while (stack.length) {
      const y = stack.pop(), x = stack.pop();
      let l = x, r = x;
      const row = y * W;
      if (!match(row + x)) continue;
      while (l > 0 && match(row + l - 1)) l--;
      while (r < W - 1 && match(row + r + 1)) r++;
      for (let i = l; i <= r; i++) {
        const p = row + i, o = p * 4;
        done[p] = 1;
        d[o] = fc[0]; d[o + 1] = fc[1]; d[o + 2] = fc[2]; d[o + 3] = 255;
      }
      if (l < bx0) bx0 = l; if (r > bx1) bx1 = r; if (y < by0) by0 = y; if (y > by1) by1 = y;
      for (const ny of [y - 1, y + 1]) {
        if (ny < 0 || ny >= H) continue;
        const nrow = ny * W;
        let i = l;
        while (i <= r) {
          if (match(nrow + i)) {
            stack.push(i, ny);
            while (i <= r && match(nrow + i)) i++;
          } else i++;
        }
      }
    }
    beginOp();
    pctx.putImageData(img, 0, 0, bx0, by0, bx1 - bx0 + 1, by1 - by0 + 1);
    commitOp({ x0: bx0, y0: by0, x1: bx1 + 1, y1: by1 + 1 });
  }

  /* Image (open / paste): fitted inside the drawing, centred, as one undo step. */
  function placeImage(img, msg) {
    const k = Math.min(doc.w / img.width, doc.h / img.height);
    const w = img.width * k, h = img.height * k;
    const x = (doc.w - w) / 2, y = (doc.h - h) / 2;
    beginOp();
    pctx.save();
    pctx.globalCompositeOperation = 'source-over';
    pctx.drawImage(img, x, y, w, h);
    pctx.restore();
    commitOp({ x0: x, y0: y, x1: x + w, y1: y + h });
    toast(msg);
  }
  function loadImageFile(file, msg) {
    if (!file || !/^image\//.test(file.type)) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); placeImage(img, msg); };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  function clearDrawing() {
    beginOp();
    pctx.clearRect(0, 0, doc.w, doc.h);
    commitOp(FULL());
  }
  /* Flattened PNG (background + drawing). */
  function composite() {
    const c = makeCanvas(doc.w, doc.h), x = c.getContext('2d');
    x.fillStyle = doc.bg; x.fillRect(0, 0, doc.w, doc.h);
    x.drawImage(layers.paint, 0, 0);
    return c;
  }
  function savePng() {
    const c = composite();
    const d = new Date(), pad = (n) => String(n).padStart(2, '0');
    const name = TX.filePrefix + '-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.png';
    c.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      toast(TX.saved);
    }, 'image/png');
  }

  // ---------------------------------------------------------------- autosave
  let saveTimer = 0;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, CFG.autosave.delayMs);
  }
  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    const meta = { w: doc.w, h: doc.h, density: doc.density, bg: doc.bg, tool: state.tool, shape: state.shape, color: state.color, sizeIdx: state.sizeIdx, fmt: 'png' };
    let data = layers.paint.toDataURL('image/png');
    let ok = storeSet(CFG.autosave.key, data);
    if (!ok) {                                 // too big: flattened JPEG instead
      data = composite().toDataURL('image/jpeg', 0.9);
      meta.fmt = 'jpeg';
      storeDel(CFG.autosave.key);
      ok = storeSet(CFG.autosave.key, data);
    }
    if (ok) storeSet(CFG.autosave.metaKey, JSON.stringify(meta));
    else toast(TX.storageFull);
  }
  function savePrefs() {
    const raw = storeGet(CFG.autosave.metaKey);
    if (!raw) return;
    try {
      const m = JSON.parse(raw);
      Object.assign(m, { tool: state.tool, shape: state.shape, color: state.color, sizeIdx: state.sizeIdx });
      storeSet(CFG.autosave.metaKey, JSON.stringify(m));
    } catch (_) { /* ignore */ }
  }
  /* Restore the saved drawing; calls done() when ready. */
  function restore(done) {
    let meta = null;
    try { meta = JSON.parse(storeGet(CFG.autosave.metaKey) || 'null'); } catch (_) { meta = null; }
    const data = storeGet(CFG.autosave.key);
    if (!meta || !data || !(meta.w > 0) || !(meta.h > 0)) { done(false); return; }
    if (CFG.tools.indexOf(meta.tool) >= 0) state.tool = meta.tool;
    if (CFG.shapes.indexOf(meta.shape) >= 0) state.shape = meta.shape;
    if (typeof meta.color === 'string') state.color = meta.color;
    if (CFG.sizes[meta.sizeIdx] !== undefined) state.sizeIdx = meta.sizeIdx;
    newDocument(meta.w, meta.h, meta.density || 1);
    if (meta.bg) doc.bg = meta.bg;
    const img = new Image();
    img.onload = () => { pctx.drawImage(img, 0, 0); needsRender = true; done(true); };
    img.onerror = () => done(true);
    img.src = data;
  }

  // ---------------------------------------------------------------- UI
  /* Buttons act on pointerup (short press, little movement) instead of 'click':
     browsers drop the synthetic click for a tap that comes right after a drag on
     the canvas (e.g. Undo straight after a stroke). Works for touch, pen and mouse. */
  function onTap(el, fn) {
    let down = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      down = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    el.addEventListener('pointerup', (e) => {
      const d = down; down = null;
      if (!d || d.id !== e.pointerId || el.disabled) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 24) return;
      e.preventDefault();
      el.blur();
      fn(e);
    });
    el.addEventListener('pointercancel', () => { down = null; });
  }
  let toastTimer = 0;
  function toast(msg) {
    if (!msg) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 1400);
  }
  function toolLabel() { return state.tool === 'shape' ? TX[state.shape] : TX[state.tool]; }
  function setTool(t) {
    if (CFG.tools.indexOf(t) < 0) return;
    if (t === 'shape' && state.tool === 'shape') {
      state.shape = CFG.shapes[(CFG.shapes.indexOf(state.shape) + 1) % CFG.shapes.length];
      toast(TX[state.shape]);
    }
    state.tool = t;
    updateToolUi();
    savePrefs();
  }
  function updateToolUi() {
    toolBtns.forEach((b) => b.classList.toggle('active', b.dataset.tool === state.tool));
    shapeBtn.dataset.shape = state.shape;
    shapeBtn.title = TX[state.shape] + ' (S)';
    colorDot.style.background = state.color;
    const px = Math.max(4, Math.min(22, CFG.sizes[state.sizeIdx] * 0.8 + 3));
    sizeDot.style.width = sizeDot.style.height = px + 'px';
    sizeDot.style.background = state.tool === 'eraser' ? '#888' : state.color;
    hubSendStats();
  }
  function setColor(c) {
    state.color = c;
    if (state.tool === 'eraser') state.tool = 'pen';
    updateToolUi(); buildPops(); savePrefs();
  }
  function setSize(i) {
    state.sizeIdx = Math.max(0, Math.min(CFG.sizes.length - 1, i));
    updateToolUi(); buildPops(); savePrefs();
  }
  function buildPops() {
    popColor.innerHTML = '';
    CFG.colors.forEach((c) => {
      const b = document.createElement('button');
      b.type = 'button'; b.tabIndex = -1; b.className = 'swatch' + (c === state.color ? ' sel' : '');
      b.style.background = c; b.title = c;
      onTap(b, () => { setColor(c); closePops(); });
      popColor.appendChild(b);
    });
    popSize.innerHTML = '';
    CFG.sizes.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.tabIndex = -1; b.className = 'sizeopt' + (i === state.sizeIdx ? ' sel' : '');
      const dot = document.createElement('span');
      const px = Math.max(3, Math.min(30, s * 0.9 + 2));
      dot.style.width = dot.style.height = px + 'px';
      b.appendChild(dot);
      onTap(b, () => { setSize(i); closePops(); });
      popSize.appendChild(b);
    });
    popMore.querySelectorAll('[data-act]').forEach((b) => {
      const k = { clear: 'clear', save: 'savePng', open: 'open' }[b.dataset.act];
      b.textContent = TX[k];
    });
  }
  function closePops() { popColor.hidden = popSize.hidden = popMore.hidden = true; }
  function togglePop(p) {
    const open = p.hidden;
    closePops();
    p.hidden = !open;
  }
  function askClear() {
    closePops();
    $('confirm-text').textContent = TX.clearAsk;
    $('confirm-yes').textContent = TX.yes;
    $('confirm-no').textContent = TX.cancel;
    confirmEl.hidden = false;
  }
  function openFile() { closePops(); fileIn.value = ''; fileIn.click(); }

  toolBtns.forEach((b) => onTap(b, () => { closePops(); setTool(b.dataset.tool); }));
  onTap(colorBtn, () => togglePop(popColor));
  onTap(sizeBtn, () => togglePop(popSize));
  onTap(moreBtn, () => togglePop(popMore));
  onTap(undoBtn, undo);
  onTap(redoBtn, redo);
  onTap(zoomBtn, resetZoom);
  popMore.querySelectorAll('[data-act]').forEach((b) => onTap(b, () => {
    if (b.dataset.act === 'clear') askClear();
    else if (b.dataset.act === 'save') { closePops(); savePng(); }
    else if (b.dataset.act === 'open') openFile();
  }));
  onTap($('confirm-yes'), () => { confirmEl.hidden = true; clearDrawing(); });
  onTap($('confirm-no'), () => { confirmEl.hidden = true; });
  fileIn.addEventListener('change', () => loadImageFile(fileIn.files && fileIn.files[0], TX.opened));
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button');
    if (b) b.blur();
  });
  // outside tap closes popovers
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.pop') || e.target.closest('#color-btn, #size-btn, #more-btn')) return;
    closePops();
  }, true);
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  // ---------------------------------------------------------------- pointer input
  /* Active pointers on the canvas: id → { x, y (stage css), type, sx, sy, t } */
  const ptrs = new Map();
  let mode = null;      // null | 'draw' | 'shape' | 'fill' | 'pinch' | 'pan'
  let pinch = null;     // { d0, mx0, my0, zoom0, docMid }
  let lockTouch = false; // after a pinch: ignore the remaining finger until all lift
  let spaceHeld = false;
  let fillTap = null;

  function stageXY(e) {
    const r = view.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function busy() { return mode === 'draw' || mode === 'shape' || mode === 'pinch'; }

  function startPinch() {
    if (mode === 'draw') strokeCancel();
    if (mode === 'shape') { preview = null; needsRender = true; }
    fillTap = null;
    const [a, b] = Array.from(ptrs.values());
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    pinch = { d0: Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)), zoom0: vw.zoom, docMid: toDocXY(mx, my) };
    mode = 'pinch';
  }
  function updatePinch() {
    const [a, b] = Array.from(ptrs.values());
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const d = Math.max(10, Math.hypot(a.x - b.x, a.y - b.y));
    const z = Math.max(CFG.zoom.min, Math.min(CFG.zoom.max, pinch.zoom0 * d / pinch.d0));
    vw.zoom = z;
    vw.ox = mx - pinch.docMid.x * scale();       // pinned doc point follows the fingers (pan)
    vw.oy = my - pinch.docMid.y * scale();
    wasCentred = false;
    updateZoomUi();
    needsRender = true;
  }

  view.addEventListener('pointerdown', (e) => {
    if (!confirmEl.hidden) return;
    const touch = e.pointerType === 'touch';
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    try { view.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    const p = stageXY(e);
    ptrs.set(e.pointerId, { x: p.x, y: p.y, type: e.pointerType, sx: p.x, sy: p.y, t: performance.now() });
    if (touch) {
      const touches = Array.from(ptrs.values()).filter((q) => q.type === 'touch').length;
      if (touches === 2) { startPinch(); return; }
      if (touches > 2 || lockTouch || mode) return;
    } else if (mode) return;
    if (e.button === 1 || spaceHeld) { mode = 'pan'; stage.classList.add('panning'); return; }
    const d = eventDoc(e);
    if (state.tool === 'pen' || state.tool === 'eraser') {
      mode = 'draw';
      strokeStart(d, e.pointerId);
    } else if (state.tool === 'shape') {
      mode = 'shape';
      preview = { kind: state.shape, x0: d.x, y0: d.y, x1: d.x, y1: d.y, id: e.pointerId };
      needsRender = true;
    } else if (state.tool === 'fill') {
      mode = 'fill';
      fillTap = { id: e.pointerId, d };
    }
  });
  view.addEventListener('pointermove', (e) => {
    const q = ptrs.get(e.pointerId);
    if (!q) return;
    e.preventDefault();
    const p = stageXY(e);
    const dx = p.x - q.x, dy = p.y - q.y;
    q.x = p.x; q.y = p.y;
    if (mode === 'pinch') { if (ptrs.size >= 2) updatePinch(); return; }
    if (mode === 'pan') { panBy(dx, dy); return; }
    if (mode === 'draw' && stroke && stroke.id === e.pointerId) {
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
      if (evs.length > 1) evs.forEach((ce) => strokeAdd(eventDoc(ce)));
      else strokeAdd(eventDoc(e));
    } else if (mode === 'shape' && preview && preview.id === e.pointerId) {
      const d = eventDoc(e);
      preview.x1 = d.x; preview.y1 = d.y;
      needsRender = true;
    } else if (mode === 'fill' && fillTap && fillTap.id === e.pointerId) {
      if (Math.hypot(p.x - q.sx, p.y - q.sy) > CFG.tapMovePx) fillTap = null;
    }
  });
  function pointerEnd(e, cancelled) {
    const q = ptrs.get(e.pointerId);
    if (!q) return;
    ptrs.delete(e.pointerId);
    const touchesLeft = Array.from(ptrs.values()).filter((r) => r.type === 'touch').length;
    if (mode === 'pinch') {
      if (touchesLeft < 2) { mode = null; pinch = null; lockTouch = touchesLeft > 0; }
      return;
    }
    if (q.type === 'touch' && touchesLeft === 0) lockTouch = false;
    if (mode === 'pan') { mode = null; stage.classList.remove('panning'); return; }
    if (mode === 'draw' && stroke && stroke.id === e.pointerId) {
      mode = null;
      if (cancelled) strokeCancel(); else strokeEnd();
    } else if (mode === 'shape' && preview && preview.id === e.pointerId) {
      mode = null;
      if (cancelled) { preview = null; needsRender = true; } else shapeCommit();
    } else if (mode === 'fill') {
      mode = null;
      const ft = fillTap; fillTap = null;
      if (!cancelled && ft && ft.id === e.pointerId) floodFill(ft.d.x, ft.d.y);
    }
  }
  view.addEventListener('pointerup', (e) => pointerEnd(e, false));
  view.addEventListener('pointercancel', (e) => pointerEnd(e, true));

  // Wheel: zoom around the cursor (mouse wheel and trackpad pinch / ctrl+wheel)
  view.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = stageXY(e);
    const step = e.ctrlKey ? Math.exp(-e.deltaY * 0.01) : (e.deltaY < 0 ? CFG.zoom.wheelStep : 1 / CFG.zoom.wheelStep);
    zoomAt(vw.zoom * step, p.x, p.y);
  }, { passive: false });

  // ---------------------------------------------------------------- keyboard
  const K = CFG.keys;
  window.addEventListener('keydown', (e) => {
    const k = e.key;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey) {
      const lk = k.toLowerCase();
      if (lk === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (lk === 'y' || (lk === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
      else if (lk === 's') { e.preventDefault(); savePng(); }
      return;
    }
    if (e.altKey) return;
    if (k === 'Escape') { closePops(); confirmEl.hidden = true; return; }
    if (k === ' ' || e.code === 'Space') { e.preventDefault(); spaceHeld = true; stage.classList.add('panning'); return; }
    if (e.repeat) return;
    const lk = k.toLowerCase();
    if (lk === K.pen) setTool('pen');
    else if (lk === K.eraser) setTool('eraser');
    else if (lk === K.fill) setTool('fill');
    else if (lk === K.shape) setTool('shape');
    else if (k === K.sizeDown) setSize(state.sizeIdx - 1);
    else if (k === K.sizeUp) setSize(state.sizeIdx + 1);
    else if (k === K.resetZoom) resetZoom();
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.code === 'Space') { spaceHeld = false; if (mode !== 'pan') stage.classList.remove('panning'); }
  });
  window.addEventListener('blur', () => { spaceHeld = false; stage.classList.remove('panning'); });

  // Paste an image from the clipboard (as in Paint, but fitted, not stretched)
  document.addEventListener('paste', (e) => {
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const item of items) {
      if (item.type && item.type.indexOf('image/') === 0) {
        e.preventDefault();
        loadImageFile(item.getAsFile(), TX.pasted);
        return;
      }
    }
  });

  // Save before leaving / hiding the tab
  document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) saveNow(); });
  window.addEventListener('pagehide', () => { if (saveTimer) saveNow(); });

  // ---------------------------------------------------------------- hub bridge
  /*
   * Optional; same protocol as Snake / 2048 / hub-gamebar.js (v:1). Only in a frame:
   *   game → hub  {type:'hub-ready'}                     on load
   *   hub → game  {type:'hub-hello'}                     → body.in-hub, reply hub-app
   *   game → hub  {type:'hub-app', app, stats, buttons}  Tool; Undo / Redo / Save PNG / Clear
   *   game → hub  {type:'hub-stat', id, value}           tool change
   *   hub → game  {type:'hub-action', id:'undo'|'redo'|'clear'|'save'}
   * Accepted only from window.parent with a same-origin / file:// origin.
   */
  const HUB_V = 1;
  const IN_FRAME = (() => { try { return window.parent && window.parent !== window; } catch (_) { return true; } })();
  let hubLinked = false;
  let hubLastTool = null;
  function hubPost(msg) {
    if (!IN_FRAME) return;
    try { window.parent.postMessage(Object.assign({ v: HUB_V }, msg), '*'); } catch (_) { /* ignore */ }
  }
  function hubOriginOk(origin) {
    return origin === location.origin || origin === 'null' || location.origin === 'null' ||
      String(origin).indexOf('file:') === 0;
  }
  function hubSendStats() {
    if (!hubLinked) return;
    const t = toolLabel();
    if (t === hubLastTool) return;
    hubLastTool = t;
    hubPost({ type: 'hub-stat', id: 'tool', value: t });
  }
  function onHubMessage(e) {
    if (e.source !== window.parent || !hubOriginOk(e.origin)) return;
    const d = e.data;
    if (!d || typeof d !== 'object' || d.v !== HUB_V) return;
    if (d.type === 'hub-hello') {
      if (!hubLinked) {
        hubLinked = true;
        document.body.classList.add('in-hub');
      }
      hubLastTool = toolLabel();
      hubPost({
        type: 'hub-app',
        app: { name: CFG.APP.name, version: CFG.APP.version },
        stats: [{ id: 'tool', label: TX.statTool, value: hubLastTool }],
        buttons: [
          // The hub bar shows up to 3 buttons: Clear (4th) stays in the ⋯ menu then
          { id: 'undo', label: TX.undo }, { id: 'redo', label: TX.redo },
          { id: 'save', label: TX.savePng }, { id: 'clear', label: TX.clear },
        ],
      });
    } else if (d.type === 'hub-action' && hubLinked) {
      if (d.id === 'undo') undo();
      else if (d.id === 'redo') redo();
      else if (d.id === 'clear') askClear();
      else if (d.id === 'save') savePng();
    }
  }
  if (IN_FRAME) window.addEventListener('message', onHubMessage);

  // ---------------------------------------------------------------- debug / tests
  window.__draw = {
    get state() { return Object.assign({}, state); },
    get doc() { return Object.assign({}, doc); },
    get view() { return Object.assign({ scale: scale() }, vw); },
    get history() { return { length: history.length, index: histIdx }; },
    get mode() { return mode; },
    pixel(x, y) { return Array.from(pctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data); },
    docToClient(x, y) { const r = view.getBoundingClientRect(); return { x: r.left + vw.ox + x * scale(), y: r.top + vw.oy + y * scale() }; },
    saveNow,
    get inHub() { return hubLinked; },
  };

  // ---------------------------------------------------------------- boot
  function boot(restored) {
    if (!restored) {
      const s = viewportDocSize();
      newDocument(s.w, s.h, s.density);
    }
    buildPops();
    updateToolUi();
    updateUndoUi();
    resizeView();
    if (window.ResizeObserver) new ResizeObserver(resizeView).observe(stage);
    window.addEventListener('resize', resizeView);
    requestAnimationFrame(frame);
    hubPost({ type: 'hub-ready' });
  }
  restore(boot);
})();
