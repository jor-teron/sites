/*
 * Paper Scan — ps_filter.js
 * PS.filter.apply(imageData, name) in place. Names: original | document | gray | bw.
 * - document: per-channel white balance from the paper (98th percentile → 255), black point
 *   from the 2nd percentile of luminance, then a curve that whitens paper and darkens ink.
 * - gray: luminance only.  - bw: adaptive threshold (local mean via integral image).
 */
(function () {
  'use strict';
  const PS = window.PS = window.PS || {};
  const lum = (r, g, b) => (r * 77 + g * 150 + b * 29) >> 8;

  function pct(hist, total, p) {
    let acc = 0; const lim = total * p;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= lim) return i; }
    return 255;
  }

  function documentF(d) {
    const px = d.data, n = px.length / 4;
    const hr = new Uint32Array(256), hg = new Uint32Array(256), hb = new Uint32Array(256), hl = new Uint32Array(256);
    const step = Math.max(1, Math.floor(n / 200000)) * 4;
    let cnt = 0;
    for (let i = 0; i < px.length; i += step) { hr[px[i]]++; hg[px[i + 1]]++; hb[px[i + 2]]++; hl[lum(px[i], px[i + 1], px[i + 2])]++; cnt++; }
    const wr = Math.max(64, pct(hr, cnt, 0.9)), wg = Math.max(64, pct(hg, cnt, 0.9)), wb = Math.max(64, pct(hb, cnt, 0.9));
    const black = Math.min(pct(hl, cnt, 0.02), 120) * 0.8;
    const lut = new Uint8Array(256);
    for (let v = 0; v < 256; v++) {
      let t = (v - black) / (255 - black); t = t < 0 ? 0 : t > 1 ? 1 : t;
      t = t >= 0.85 ? 1 : Math.pow(t / 0.85, 1.6);            // paper → white, ink darker
      lut[v] = Math.round(t * 255);
    }
    const sr = 255 / wr, sg = 255 / wg, sb = 255 / wb;
    for (let i = 0; i < px.length; i += 4) {
      px[i] = lut[Math.min(255, px[i] * sr) | 0];
      px[i + 1] = lut[Math.min(255, px[i + 1] * sg) | 0];
      px[i + 2] = lut[Math.min(255, px[i + 2] * sb) | 0];
    }
  }

  function gray(d) {
    const px = d.data;
    for (let i = 0; i < px.length; i += 4) { const l = lum(px[i], px[i + 1], px[i + 2]); px[i] = px[i + 1] = px[i + 2] = l; }
  }

  function bw(d) {
    const { width: w, height: h, data: px } = d;
    const L = new Uint8Array(w * h), I = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4, l = lum(px[i], px[i + 1], px[i + 2]);
        L[y * w + x] = l; row += l;
        I[(y + 1) * (w + 1) + x + 1] = I[y * (w + 1) + x + 1] + row;
      }
    }
    const r = Math.max(8, Math.round(Math.max(w, h) / 40));
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
        const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
        const mean = s / ((x1 - x0) * (y1 - y0));
        const v = L[y * w + x] < mean * 0.88 ? 0 : 255, i = (y * w + x) * 4;
        px[i] = px[i + 1] = px[i + 2] = v;
      }
    }
  }

  PS.filter = {
    names: ['original', 'document', 'gray', 'bw'],
    apply(d, name) {
      if (name === 'document') documentF(d);
      else if (name === 'gray') gray(d);
      else if (name === 'bw') bw(d);
      return d;
    }
  };
})();
