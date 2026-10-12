/*
 * Paper Scan — ps_edge.js  (auto edge detection, no libraries)
 * PS.edge.find(gray, w, h) → normalized corners [[x,y] TL,TR,BR,BL] or null (pure, node-testable).
 * PS.edge.detect(img) → same, from an <img>/<canvas> (downscaled to ~400 px).
 * How: grayscale → 5×5 box blur → Otsu threshold (paper is the bright part) → largest bright
 * connected blob (not the whole frame) → 4 extreme points (min/max of x+y and x−y) →
 * confidence = blob pixels / quad area and quad size. Low confidence → null (caller uses A4 crop).
 */
(function () {
  'use strict';
  const root = typeof window !== 'undefined' ? window : globalThis;
  const PS = root.PS = root.PS || {};

  function blur(g, w, h) {
    const t = new Float32Array(w * h), o = new Float32Array(w * h), R = 2;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = -R; k <= R; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += g[y * w + xx]; n++; } }
      t[y * w + x] = s / n;
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let s = 0, n = 0;
      for (let k = -R; k <= R; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += t[yy * w + x]; n++; } }
      o[y * w + x] = s / n;
    }
    return o;
  }
  function otsu(g) {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < g.length; i++) hist[Math.max(0, Math.min(255, g[i] | 0))]++;
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sB = 0, wB = 0, best = 0, th = 128;
    for (let t = 0; t < 256; t++) {
      wB += hist[t]; if (!wB) continue;
      const wF = g.length - wB; if (!wF) break;
      sB += t * hist[t];
      const d = sB / wB - (sum - sB) / wF, v = wB * wF * d * d;
      if (v > best) { best = v; th = t; }
    }
    return th;
  }
  const area = (q) => { let a = 0; for (let i = 0; i < 4; i++) { const p = q[i], r = q[(i + 1) % 4]; a += p[0] * r[1] - r[0] * p[1]; } return Math.abs(a) / 2; };

  function find(gray, w, h) {
    const g = blur(gray, w, h), th = otsu(g);
    const lab = new Int32Array(w * h).fill(-1), stack = new Int32Array(w * h);
    let bestPts = null, bestN = 0;
    for (let s = 0; s < w * h; s++) {
      if (lab[s] !== -1 || g[s] <= th) continue;
      let sp = 0, n = 0, a = [1e9, 0, 0], b = [-1e9, 0, 0], c = [-1e9, 0, 0], d = [1e9, 0, 0];
      stack[sp++] = s; lab[s] = s;
      while (sp) {
        const i = stack[--sp], x = i % w, y = (i / w) | 0; n++;
        if (x + y < a[0]) a = [x + y, x, y];
        if (x + y > b[0]) b = [x + y, x, y];
        if (x - y > c[0]) c = [x - y, x, y];
        if (x - y < d[0]) d = [x - y, x, y];
        const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
        for (const j of nb) if (j >= 0 && lab[j] === -1 && g[j] > th) { lab[j] = s; stack[sp++] = j; }
      }
      if (n > bestN) { bestN = n; bestPts = [[a[1], a[2]], [c[1], c[2]], [b[1], b[2]], [d[1], d[2]]]; }
    }
    if (!bestPts) return null;
    const qa = area(bestPts), full = w * h;
    // Confident: big enough, not the whole frame, blob actually fills the quad (it's a quadrilateral).
    if (qa < full * 0.12 || qa > full * 0.97 || bestN / qa < 0.85 || bestN / qa > 1.15) return null;
    return bestPts.map(([x, y]) => [(x + 0.5) / w, (y + 0.5) / h]);
  }

  function detect(img) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!iw || !ih) return null;
    const k = Math.min(1, 400 / Math.max(iw, ih)), w = Math.max(8, Math.round(iw * k)), h = Math.max(8, Math.round(ih * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, w, h);
    const d = cx.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    try { return find(g, w, h); } catch (e) { return null; }
  }

  PS.edge = { find, detect };
})();
