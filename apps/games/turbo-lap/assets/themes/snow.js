/* Turbo Lap — theme 3: Snow. Pale winter sky, snowy peaks and pine woods, white ground, snow-capped pines, glowing lamps,
   falling snow. Drawn in code. */
(() => {
  const A = TL.art, TAU = Math.PI * 2;

  function pines(c, w, h, o) {
    const r = A.rng(o.seed), n = Math.round(w / (h * 0.28));
    for (let i = 0; i < n; i++) {
      const x = (i + r() * 0.8) / n * w, ph = h * (0.55 + r() * 0.45), pw = ph * 0.45;
      A.wrap(w, x - pw / 2, pw, x0 => {
        const cx = x0 + pw / 2;
        for (let t = 0; t < 3; t++) {
          const top = h - ph + t * ph * 0.25, bot = h - ph * 0.12 - (2 - t) * ph * 0.17, hw = pw * (0.28 + t * 0.2);
          A.tri(c, cx, top, cx - hw, bot + ph * 0.12, cx + hw, bot + ph * 0.12, o.color);
          A.tri(c, cx, top, cx - hw * 0.5, top + (bot - top) * 0.55, cx + hw * 0.5, top + (bot - top) * 0.55, 'rgba(255,255,255,0.85)');
        }
      });
    }
  }

  const pine = (c, cx, by, w, v) => {
    const h = w * 1.667, tiers = 4, tw = w * 0.07;
    A.shadow(c, cx, by, w * 0.4, 0.2);
    c.fillStyle = '#5a3b26'; c.fillRect(cx - tw, by - h * 0.14, tw * 2, h * 0.14);
    for (let t = 0; t < tiers; t++) {
      const top = by - h + t * h * 0.2, bot = by - h * 0.1 - (tiers - 1 - t) * h * 0.17, hw = w * (0.22 + t * 0.1);
      A.tri(c, cx, top, cx - hw, bot, cx + hw, bot, t % 2 ? '#2e6354' : '#38715f');
      A.tri(c, cx, top, cx + hw, bot, cx + hw * 0.3, bot, 'rgba(0,0,0,0.14)');
      c.fillStyle = '#f6fbff'; c.beginPath();                      // snow on the tier
      c.moveTo(cx, top); c.lineTo(cx - hw * 0.55, top + (bot - top) * 0.55); c.quadraticCurveTo(cx - hw * 0.2, top + (bot - top) * 0.45, cx, top + (bot - top) * 0.62);
      c.quadraticCurveTo(cx + hw * 0.25, top + (bot - top) * 0.46, cx + hw * 0.55, top + (bot - top) * 0.55); c.closePath(); c.fill();
    }
  };

  TL.themes.register(TL.makeTheme({
    id: 'snow', name: 'Snow', blurb: 'Pale sky, pines, falling snow',
    colors: {
      light: { road: '#6c7078', grass: '#f6f9fd', rumble: '#ffffff', lane: '#f2f6fb' },
      dark: { road: '#656971', grass: '#e5edf6', rumble: '#3f6fb5', lane: null }
    },
    fog: '#e7eff8',
    sky: { top: '#7c9fcb', bottom: '#eaf3fb' },
    paintSky(c, W, H) {
      c.globalAlpha = 0.5;
      A.cloud(c, W * 0.2, H * 0.17, 90 * W / 800 + 30, '#f4f8fd'); A.cloud(c, W * 0.62, H * 0.1, 120 * W / 800 + 30, '#dfe9f5'); A.cloud(c, W * 0.9, H * 0.22, 70 * W / 800 + 25, '#f4f8fd');
      c.globalAlpha = 1;
    },
    celestial(c, W, H, R) {
      const x = A.skyX(W, R), y = H * 0.15, r = Math.min(W, H) * 0.04;
      A.glow(c, '#ffffff', x, y, r * 4, 0.7); A.blob(c, x, y, r, r, 'rgba(255,255,245,0.92)');
    },
    layers: [
      { h: 0.22, off: 'sky', fill: '#9db4d3', paint: (c, w, h) => A.fillRidge(c, w, h, { seed: 0.1, rough: 1, color: '#9db4d3', cap: '#ffffff', capAt: 0.66 }) },
      { h: 0.12, off: 'hill', fill: '#b9cbe0', paint: (c, w, h) => { A.fillRidge(c, w, h, { seed: 0.37, rough: 0.5, color: '#b9cbe0', cap: 'rgba(255,255,255,0.8)', capAt: 0.7 }); pines(c, w, h * 0.7, { seed: 5, color: '#3b6a62' }); } },
      { h: 0.05, off: 'tree', fill: '#f3f7fc', paint: (c, w, h) => A.fillRidge(c, w, h, { seed: 0.71, rough: 2, color: '#f3f7fc' }) }
    ],
    tree: pine,
    bush(c, cx, by, w, v) {
      const h = w * 0.633;
      A.shadow(c, cx, by, w * 0.5, 0.14);
      A.blob(c, cx - w * 0.15, by - h * 0.32, w * 0.42, h * 0.38, '#cfdcec'); A.blob(c, cx + w * 0.18, by - h * 0.3, w * 0.36, h * 0.34, '#dbe6f3');
      A.blob(c, cx - w * 0.05, by - h * 0.42, w * 0.38, h * 0.36, '#fbfdff');
      if (v % 2) { c.strokeStyle = '#7a4a30'; c.lineWidth = Math.max(1, w * 0.025); c.beginPath(); c.moveTo(cx + w * 0.18, by - h * 0.5); c.lineTo(cx + w * 0.3, by - h * 0.95); c.moveTo(cx + w * 0.22, by - h * 0.62); c.lineTo(cx + w * 0.4, by - h * 0.8); c.stroke(); }
    },
    lamp: (c, x, y, w, v, dir) => A.lamp(c, x, y, w, dir, {
      pole: '#4b5563', glow: '#ffe9a0', glowR: 3.6, glowA: 0.85,
      head(c, x, y, w, d) { c.fillStyle = '#ffeeb0'; c.fillRect(x - w * 0.8 * d, y, w * 1.2 * d, w * 0.5); c.fillStyle = '#f7fbff'; c.fillRect(x - w * 0.9 * d, y - w * 0.18, w * 1.4 * d, w * 0.22); }
    }),
    sign: (c, x, y, w, v, dir) => A.chevron(c, x, y, w, dir, { post: '#555b66', bg: '#2b66c9', border: '#ffffff', fg: '#ffffff', top: '#ffffff' }),
    fx(c, W, H, t) {
      A.particles(c, W, H, t, { n: 70, seed: 3, size: [0.8, 1.6], vx: -10, vy: 42, sway: 1.1, amp: 14, colors: ['#ffffff', '#eef5ff'], alpha: 0.85, kind: 'dot' });
      A.particles(c, W, H, t, { n: 24, seed: 40, size: [1.8, 2.8], vx: -16, vy: 70, sway: 0.8, amp: 20, colors: ['#ffffff'], alpha: 0.9, kind: 'dot' });
    }
  }));
})();
