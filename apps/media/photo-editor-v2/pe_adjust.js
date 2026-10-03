/*
 * Photo Editor v2 — pe_adjust.js
 * Brightness / Contrast / Saturation / Warmth (one slider shown at a time),
 * presets (B&W, Sepia, Vivid) and Reset.
 * The same pixel function is used for the screen preview (on the small preview copy,
 * see pe_view.js) and for the full-size save (pe_io.js), so what you see is what you get.
 */
(function (PE) {
  'use strict';

  const A = PE.adjust = {};
  const S = PE.state;
  const cfg = () => PE.config.adjust;
  let cur = 'b';
  let slider, valueBtn, chipsEl, presetsEl;

  const presetById = (id) => cfg().presets.find((p) => p.id === id) || null;
  const clampV = (v) => Math.max(-100, Math.min(100, v || 0));

  // Slider values + preset -> effective values.
  A.effective = (e) => {
    const p = presetById(e.preset) || {};
    const pa = p.adj || {};
    return {
      b: clampV(e.adj.b + (pa.b || 0)),
      c: clampV(e.adj.c + (pa.c || 0)),
      s: clampV(e.adj.s + (pa.s || 0)),
      w: clampV(e.adj.w + (pa.w || 0)),
      matrix: p.matrix || null
    };
  };
  A.isIdentity = (eff) => !eff.b && !eff.c && !eff.s && !eff.w && !eff.matrix;

  // Build lookup tables (brightness, contrast, warmth are per channel) and a 3x3 colour
  // matrix (saturation, then the preset matrix).
  A.build = (eff) => {
    const lr = new Uint8ClampedArray(256), lg = new Uint8ClampedArray(256), lb = new Uint8ClampedArray(256);
    const k = eff.c >= 0 ? 1 + eff.c / 50 : 1 + eff.c / 100;   // contrast x0 .. x3
    const bf = eff.b / 100;                                      // brightness: lift towards white / scale towards black
    const wr = eff.w * 0.35, wg = eff.w * 0.06, wb = -eff.w * 0.35;
    for (let v = 0; v < 256; v++) {
      let x = (v - 128) * k + 128;
      x = Math.max(0, Math.min(255, x));
      x = bf >= 0 ? x + (255 - x) * bf * 0.8 : x * (1 + bf * 0.8);
      lr[v] = x + wr; lg[v] = x + wg; lb[v] = x + wb;
    }
    let M = null;
    if (eff.s) {
      const s = 1 + eff.s / 100;
      const R = 0.299 * (1 - s), G = 0.587 * (1 - s), B = 0.114 * (1 - s);
      M = [R + s, G, B, R, G + s, B, R, G, B + s];
    }
    if (eff.matrix) M = M ? mul3(eff.matrix, M) : eff.matrix.slice();
    return { lr, lg, lb, M };
  };

  function mul3(A2, B2) {
    const o = new Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      o[r * 3 + c] = A2[r * 3] * B2[c] + A2[r * 3 + 1] * B2[3 + c] + A2[r * 3 + 2] * B2[6 + c];
    }
    return o;
  }

  // Process RGBA pixels in place (Uint8ClampedArray rounds and clamps on write).
  A.process = (d, L) => {
    const lr = L.lr, lg = L.lg, lb = L.lb, M = L.M, n = d.length;
    if (!M) {
      for (let i = 0; i < n; i += 4) { d[i] = lr[d[i]]; d[i + 1] = lg[d[i + 1]]; d[i + 2] = lb[d[i + 2]]; }
      return;
    }
    const m0 = M[0], m1 = M[1], m2 = M[2], m3 = M[3], m4 = M[4], m5 = M[5], m6 = M[6], m7 = M[7], m8 = M[8];
    for (let i = 0; i < n; i += 4) {
      const r = lr[d[i]], g = lg[d[i + 1]], b = lb[d[i + 2]];
      d[i] = m0 * r + m1 * g + m2 * b;
      d[i + 1] = m3 * r + m4 * g + m5 * b;
      d[i + 2] = m6 * r + m7 * g + m8 * b;
    }
  };

  // ---------- panel ----------
  A.init = () => {
    const onTap = PE.ui.onTap;
    slider = document.getElementById('adj-slider');
    valueBtn = document.getElementById('adj-value');
    chipsEl = document.getElementById('adj-chips');
    presetsEl = document.getElementById('preset-chips');
    slider.min = cfg().min; slider.max = cfg().max; slider.step = 1;

    for (const sd of cfg().sliders) {
      const b = document.createElement('button');
      b.type = 'button'; b.tabIndex = -1; b.className = 'chip'; b.dataset.id = sd.id; b.textContent = sd.label;
      onTap(b, () => { cur = sd.id; A.sync(); });
      chipsEl.appendChild(b);
    }
    for (const p of cfg().presets) {
      const b = document.createElement('button');
      b.type = 'button'; b.tabIndex = -1; b.className = 'chip'; b.dataset.id = p.id; b.textContent = p.label;
      onTap(b, () => S.apply((e) => { e.preset = p.id; }, 'adj'));
      presetsEl.appendChild(b);
    }
    const reset = document.createElement('button');
    reset.type = 'button'; reset.tabIndex = -1; reset.className = 'chip ghost'; reset.textContent = 'Reset';
    onTap(reset, () => A.resetAll());
    presetsEl.appendChild(reset);

    slider.addEventListener('input', () => {
      if (!S.photo) return;
      S.edits.adj[cur] = +slider.value;
      const t0 = performance.now();
      PE.emit('adjlive');                  // preview only; recorded on 'change'
      A.lastStepMs = performance.now() - t0;
    });
    slider.addEventListener('change', () => { if (S.photo) S.commit('adj'); });
    onTap(valueBtn, () => S.apply((e) => { e.adj[cur] = 0; }, 'adj'));   // tap the number to zero it

    PE.on(() => A.sync());
    A.sync();
  };

  A.resetAll = () => S.apply((e) => { e.adj = { b: 0, c: 0, s: 0, w: 0 }; e.preset = 'none'; }, 'adj');
  A.current = () => cur;

  A.sync = () => {
    if (!slider) return;
    const e = S.edits;
    const v = e ? e.adj[cur] : 0;
    if (+slider.value !== v) slider.value = v;
    valueBtn.textContent = (v > 0 ? '+' : '') + v;
    for (const b of chipsEl.children) {
      b.classList.toggle('sel', b.dataset.id === cur);
      b.classList.toggle('changed', !!(e && e.adj[b.dataset.id]));
    }
    for (const b of presetsEl.children) {
      if (b.dataset.id) b.classList.toggle('sel', !!e && e.preset === b.dataset.id);
    }
  };
})(window.PE);
