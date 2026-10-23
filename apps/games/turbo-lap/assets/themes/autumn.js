/* Turbo Lap — theme 5: Autumn Forest. Golden low sun and haze, red / orange / gold trees, rust-coloured ground, falling
   leaves. Drawn in code. */
(() => {
  const A = TL.art, TAU = Math.PI * 2;
  const CAN = [['#c0392b', '#e0553a'], ['#e0701f', '#f5922f'], ['#e8b020', '#f7d24a'], ['#a8431a', '#c9632c']];

  function woods(c, w, h, o) {
    const r = A.rng(o.seed), n = Math.round(w / (h * 0.5));
    for (let i = 0; i < n; i++) {
      const x = (i + r() * 0.8) / n * w, rr = h * (0.3 + r() * 0.3), col = o.cols[Math.floor(r() * o.cols.length)];
      A.wrap(w, x - rr, rr * 2, x0 => { A.blob(c, x0, h - rr * 0.75, rr, rr * 0.8, col); A.blob(c, x0 + rr * 0.3, h - rr * 0.6, rr * 0.8, rr * 0.7, A.shade(col, 0.1)); });
    }
    c.fillStyle = o.under; c.fillRect(0, h - h * 0.18, w, h * 0.2 + 2);
  }

  TL.themes.register(TL.makeTheme({
    id: 'autumn', name: 'Autumn Forest', blurb: 'Golden light, falling leaves',
    colors: {
      light: { road: '#6a625c', grass: '#c47f2f', rumble: '#f4ecd9', lane: '#f1e8d3' },
      dark: { road: '#625a54', grass: '#b4722a', rumble: '#a8321c', lane: null }
    },
    fog: '#f8e0b4',
    sky: { top: '#e0862e', bottom: '#fde6b0' },
    paintSky(c, W, H) {
      c.globalAlpha = 0.3; c.fillStyle = '#fff1cf';
      [[0.2, 0.2, 130], [0.58, 0.12, 170], [0.86, 0.26, 110]].forEach(p => { c.beginPath(); c.ellipse(W * p[0], H * p[1], p[2] * W / 800 + 30, 6, 0, 0, TAU); c.fill(); });
      c.globalAlpha = 1;
    },
    celestial(c, W, H, R) {
      const x = A.skyX(W, R), y = H * 0.22, r = Math.min(W, H) * 0.055;
      A.glow(c, '#ffd27a', x, y, r * 4.5, 0.8); A.blob(c, x, y, r, r, '#fff0b8');
    },
    layers: [
      { h: 0.2, off: 'sky', fill: '#d99a5b', paint: (c, w, h) => A.fillRidge(c, w, h, { seed: 0.1, rough: 1, color: '#dba267' }) },
      { h: 0.12, off: 'hill', fill: '#a8541f', paint: (c, w, h) => { A.fillRidge(c, w, h, { seed: 0.37, rough: 0.5, color: '#c27a3d' }); woods(c, w, h * 0.75, { seed: 9, cols: ['#c0392b', '#d9561f', '#e8a020', '#b8651f'], under: '#8a4418' }); } },
      { h: 0.05, off: 'tree', fill: '#b36a24', paint: (c, w, h) => A.fillRidge(c, w, h, { seed: 0.71, rough: 2, color: '#b36a24' }) }
    ],
    tree(c, cx, by, w, v) {
      const h = w * 1.667, col = CAN[v % 4];
      A.shadow(c, cx, by, w * 0.42, 0.22);
      c.fillStyle = '#5b3a24'; c.fillRect(cx - w * 0.045, by - h * 0.45, w * 0.09, h * 0.45);
      c.fillStyle = '#4a2f1d'; c.fillRect(cx + w * 0.005, by - h * 0.45, w * 0.04, h * 0.45);
      const k = [[0, 0.7, 0.46, 0.2], [-0.24, 0.6, 0.3, 0.16], [0.26, 0.62, 0.3, 0.16], [-0.1, 0.84, 0.3, 0.14], [0.14, 0.82, 0.28, 0.13]];
      k.forEach(p => A.blob(c, cx + p[0] * w, by - h * p[1], w * p[2], h * p[3], col[0]));
      k.forEach((p, i) => A.blob(c, cx + p[0] * w - w * 0.07, by - h * p[1] - h * 0.04, w * p[2] * 0.62, h * p[3] * 0.55, col[1]));
      if (v % 3 === 0) { c.fillStyle = col[1]; for (let i = 0; i < 5; i++) c.fillRect(cx - w * 0.3 + i * w * 0.16, by - h * 0.06, Math.max(1, w * 0.04), Math.max(1, w * 0.025)); }
    },
    bush(c, cx, by, w, v) {
      const h = w * 0.633, col = CAN[(v + 1) % 4];
      A.shadow(c, cx, by, w * 0.46, 0.2);
      A.blob(c, cx - w * 0.2, by - h * 0.32, w * 0.34, h * 0.34, col[0]); A.blob(c, cx + w * 0.2, by - h * 0.34, w * 0.34, h * 0.36, A.shade(col[0], -0.08));
      A.blob(c, cx, by - h * 0.5, w * 0.3, h * 0.32, col[1]);
    },
    lamp: (c, x, y, w, v, dir) => A.lamp(c, x, y, w, dir, { pole: '#4a3a2c', lamp: '#ffd48a', glow: '#ffbb55', glowR: 3.2, glowA: 0.75 }),
    sign: (c, x, y, w, v, dir) => A.chevron(c, x, y, w, dir, { post: '#4a3220', bg: '#7a4a22', border: '#f4e0b0', fg: '#f4e0b0' }),
    fx(c, W, H, t) {
      A.particles(c, W, H, t, { n: 36, seed: 7, size: [2.2, 3.8], vx: -26, vy: 38, sway: 1.5, amp: 22, colors: ['#d9481f', '#f0a020', '#c0392b', '#e8c040'], alpha: 0.95, kind: 'leaf' });
    }
  }));
})();
