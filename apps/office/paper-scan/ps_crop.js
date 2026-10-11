/*
 * Paper Scan — ps_crop.js
 * - PS.crop.render(page, preset) → Promise<{blob, w, h}>: perspective-correct the page's quad
 *   (page.corners, normalized [x,y] TL,TR,BR,BL in the original photo) to a flat A4-shaped page
 *   with a homography (inverse mapping + bilinear sampling), apply page.filter, rotate page.rot×90°,
 *   encode JPEG 0.8. Output size: preset long × short side (A4 ratio), portrait unless the quad is wider.
 * - PS.crop.open(page, onDone): full-screen editor with 4 big draggable corner handles,
 *   Rotate, Full (whole photo), filter chips. PS.crop.undo() reverts the last crop/rotate/filter change.
 */
(function () {
  'use strict';
  const PS = window.PS = window.PS || {};
  const PRESETS = { low: [1600, 1131], medium: [2000, 1414], good: [2480, 1754] };
  const INSET = 0.05;
  const defCorners = () => [[INSET, INSET], [1 - INSET, INSET], [1 - INSET, 1 - INSET], [INSET, 1 - INSET]];

  function loadImg(blob) {
    return new Promise((res, rej) => {
      const u = URL.createObjectURL(blob), im = new Image();
      im.onload = () => { URL.revokeObjectURL(u); res(im); };
      im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('Could not read the photo')); };
      im.src = u;
    });
  }

  // Solve 8 unknowns: dest (u,v) → src (x,y).
  function homography(dst, src) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [u, v] = dst[i], [x, y] = src[i];
      A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
      A.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
    }
    for (let c = 0; c < 8; c++) {
      let p = c;
      for (let r = c + 1; r < 8; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
      [A[c], A[p]] = [A[p], A[c]]; [b[c], b[p]] = [b[p], b[c]];
      if (Math.abs(A[c][c]) < 1e-12) throw new Error('Corners are in a line — drag them apart');
      for (let r = 0; r < 8; r++) {
        if (r === c) continue;
        const f = A[r][c] / A[c][c];
        for (let k = c; k < 8; k++) A[r][k] -= f * A[c][k];
        b[r] -= f * b[c];
      }
    }
    return b.map((v, i) => v / A[i][i]);
  }

  function warp(srcData, quad, W, H) {
    const h = homography([[0, 0], [W, 0], [W, H], [0, H]], quad);
    const sw = srcData.width, sh = srcData.height, s = srcData.data;
    const out = new ImageData(W, H), o = out.data;
    for (let v = 0; v < H; v++) {
      const vv = v + 0.5;
      for (let u = 0; u < W; u++) {
        const uu = u + 0.5, den = h[6] * uu + h[7] * vv + 1;
        let x = (h[0] * uu + h[1] * vv + h[2]) / den - 0.5, y = (h[3] * uu + h[4] * vv + h[5]) / den - 0.5;
        if (x < 0) x = 0; else if (x > sw - 1) x = sw - 1;
        if (y < 0) y = 0; else if (y > sh - 1) y = sh - 1;
        const x0 = x | 0, y0 = y | 0, x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1);
        const fx = x - x0, fy = y - y0;
        const a = (y0 * sw + x0) * 4, bb = (y0 * sw + x1) * 4, c = (y1 * sw + x0) * 4, d = (y1 * sw + x1) * 4;
        const k = (v * W + u) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const top = s[a + ch] + (s[bb + ch] - s[a + ch]) * fx, bot = s[c + ch] + (s[d + ch] - s[c + ch]) * fx;
          o[k + ch] = top + (bot - top) * fy;
        }
        o[k + 3] = 255;
      }
    }
    return out;
  }

  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

  async function render(page, preset) {
    const [L, S] = PRESETS[preset] || PRESETS.medium;
    const im = await loadImg(page.src);
    const iw = im.naturalWidth, ih = im.naturalHeight;
    const quad = page.corners.map(([x, y]) => [x * iw, y * ih]);
    const qw = (dist(quad[0], quad[1]) + dist(quad[3], quad[2])) / 2, qh = (dist(quad[0], quad[3]) + dist(quad[1], quad[2])) / 2;
    const land = qw > qh;
    // Don't upscale tiny photos beyond what they hold (keeps files small); never below 600 px.
    const cap = Math.max(600, Math.max(qw, qh) * 1.25);
    const scale = Math.min(1, cap / L);
    let W = Math.round((land ? L : S) * scale), H = Math.round((land ? S : L) * scale);
    const c = document.createElement('canvas'); c.width = iw; c.height = ih;
    const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(im, 0, 0);
    const img = warp(cx.getImageData(0, 0, iw, ih), quad, W, H);
    c.width = c.height = 0;
    PS.filter.apply(img, page.filter || 'document');
    const flat = document.createElement('canvas'); flat.width = W; flat.height = H;
    flat.getContext('2d').putImageData(img, 0, 0);
    const r = ((page.rot || 0) % 4 + 4) % 4;
    const fin = document.createElement('canvas');
    if (r % 2) { fin.width = H; fin.height = W; } else { fin.width = W; fin.height = H; }
    const fx = fin.getContext('2d');
    fx.fillStyle = '#fff'; fx.fillRect(0, 0, fin.width, fin.height);
    fx.translate(fin.width / 2, fin.height / 2); fx.rotate(r * Math.PI / 2); fx.drawImage(flat, -W / 2, -H / 2);
    const blob = await new Promise((res) => fin.toBlob(res, 'image/jpeg', 0.8));
    if (!blob) throw new Error('JPEG encode failed');
    return { blob, w: fin.width, h: fin.height };
  }

  /* ---------- editor ---------- */
  const $ = (id) => document.getElementById(id);
  const undoStack = [];
  let cur = null, done = null, im = null, box = { x: 0, y: 0, w: 1, h: 1 };
  const snap = (p) => ({ id: p.id, corners: p.corners.map((c) => c.slice()), rot: p.rot || 0, filter: p.filter });
  function remember() { if (cur) { undoStack.push(snap(cur)); if (undoStack.length > 50) undoStack.shift(); } }

  function layout() {
    if (!cur || !im) return;
    const st = $('ed-stage'), cv = $('ed-canvas');
    const sw = st.clientWidth, sh = st.clientHeight, pad = 30;
    const k = Math.min((sw - 2 * pad) / im.naturalWidth, (sh - 2 * pad) / im.naturalHeight);
    box = { w: im.naturalWidth * k, h: im.naturalHeight * k };
    box.x = (sw - box.w) / 2; box.y = (sh - box.h) / 2;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(box.w * dpr); cv.height = Math.round(box.h * dpr);
    cv.style.cssText = `left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px`;
    cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
    drawQuad();
  }
  function drawQuad() {
    const pts = cur.corners.map(([x, y]) => [box.x + x * box.w, box.y + y * box.h]);
    document.querySelectorAll('.ps-h').forEach((h, i) => { h.style.left = pts[i][0] + 'px'; h.style.top = pts[i][1] + 'px'; });
    $('ed-quad').querySelector('polygon').setAttribute('points', pts.map((p) => p.join(',')).join(' '));
    $('ed-title').textContent = 'Page ' + (PS.pages ? PS.pages.indexOf(cur) + 1 : '') + ((cur.rot || 0) % 4 ? ' · ⟳ ' + ((cur.rot % 4) * 90) + '°' : '');
    document.querySelectorAll('#ed-filters [data-f]').forEach((b) => b.classList.toggle('on', b.dataset.f === cur.filter));
  }

  function bind() {
    let drag = -1, moved = false;
    document.querySelectorAll('.ps-h').forEach((h) => {
      h.addEventListener('pointerdown', (e) => { drag = +h.dataset.i; moved = false; h.setPointerCapture(e.pointerId); e.preventDefault(); });
      h.addEventListener('pointermove', (e) => {
        if (drag < 0 || !cur) return;
        if (!moved) { remember(); moved = true; }
        const r = $('ed-stage').getBoundingClientRect();
        const x = (e.clientX - r.left - box.x) / box.w, y = (e.clientY - r.top - box.y) / box.h;
        cur.corners[drag] = [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))];
        drawQuad();
      });
      const up = () => { drag = -1; };
      h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    });
    $('ed-rot').addEventListener('click', () => { remember(); cur.rot = ((cur.rot || 0) + 1) % 4; drawQuad(); });
    $('ed-full').addEventListener('click', () => { remember(); cur.corners = [[0, 0], [1, 0], [1, 1], [0, 1]]; drawQuad(); });
    $('ed-filters').addEventListener('click', (e) => {
      const b = e.target.closest('[data-f]'); if (!b || !cur) return;
      remember(); cur.filter = b.dataset.f; drawQuad();
    });
    $('ed-done').addEventListener('click', close);
    window.addEventListener('resize', layout);
  }

  async function open(page, onDone) {
    if (!open.bound) { open.bound = true; bind(); }
    cur = page; done = onDone;
    $('editor').hidden = false;
    im = await loadImg(page.src);
    layout();
    $('ed-done').focus();
  }
  function close() {
    if (!cur) return;
    const p = cur; cur = null; $('editor').hidden = true;
    if (done) done(p);
  }

  // Ctrl+Z: revert the last change (in the editor, or to a page already closed → re-render).
  function undo() {
    const s = undoStack.pop(); if (!s) return null;
    const p = (PS.pages || []).find((x) => x.id === s.id); if (!p) return null;
    p.corners = s.corners; p.rot = s.rot; p.filter = s.filter;
    if (cur === p) drawQuad();
    return cur === p ? null : p;
  }

  PS.crop = { render, open, close, undo, defCorners, PRESETS, isOpen: () => !!cur, remember: (p) => { const c = cur; cur = p; remember(); cur = c; } };
})();
