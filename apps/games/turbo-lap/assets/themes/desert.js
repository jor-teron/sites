/* Turbo Lap — theme 2: Desert. Orange sky and a huge low sun, mesas and dunes, sand, saguaro cacti and rock arches,
   wooden lantern posts. Drawn in code, backgrounds pre-rendered. */
(() => {
  const A = TL.art, U = TL.util, TAU = Math.PI * 2;

  function mesas(c, w, h, o) {
    const r = A.rng(o.seed), n = o.n;
    for (let i = 0; i < n; i++) {
      const cx = (i + 0.2 + r() * 0.6) / n * w, bw = (0.05 + r() * 0.07) * w / n * 6, bh = h * (o.lo + r() * (o.hi - o.lo));
      const steps = 2 + Math.floor(r() * 2);
      A.wrap(w, cx - bw / 2, bw * 1.4, x0 => {
        for (let s = 0; s < steps; s++) {                         // stepped mesa: each tier narrower and lighter
          const k = s / steps, tw = bw * (1 - k * 0.32), th = bh * (1 - k * 0.45);
          c.fillStyle = A.shade(o.color, 0.08 * s);
          c.fillRect(x0 + (bw - tw) / 2, h - th, tw, th + 2);
        }
        c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(x0 + bw * 0.62, h - bh, bw * 0.38, bh + 2);   // shaded side
      });
    }
  }

  const cactus = (c, cx, by, w, v) => {
    const H = w * 1.35, f = v % 2 ? -1 : 1, lw = Math.max(1, w * 0.14);
    A.shadow(c, cx, by, w * 0.35);
    c.lineCap = 'round'; c.lineJoin = 'round';
    const stroke = (col, add) => {
      c.strokeStyle = col; c.lineWidth = lw - add;
      c.beginPath(); c.moveTo(cx + add * 0.5, by); c.lineTo(cx + add * 0.5, by - H);
      c.moveTo(cx, by - H * 0.42); c.lineTo(cx - f * w * 0.24, by - H * 0.42); c.lineTo(cx - f * w * 0.24, by - H * 0.72);
      c.moveTo(cx, by - H * 0.3); c.lineTo(cx + f * w * 0.22, by - H * 0.3); c.lineTo(cx + f * w * 0.22, by - H * 0.56);
      c.stroke();
    };
    stroke('#2f7a3e', 0); stroke('#4aa05a', lw * 0.55);
    c.lineCap = 'butt';
  };
  const arch = (c, cx, by, w, v) => {
    const h = w * 1.2, r = w * 0.42, leg = w * 0.2, top = by - h * 0.5;
    A.shadow(c, cx, by, w * 0.55, 0.25);
    c.fillStyle = '#b4532c'; c.fillRect(cx - r - leg / 2, top, leg, by - top); c.fillRect(cx + r - leg / 2, top, leg, by - top);
    c.strokeStyle = '#b4532c'; c.lineWidth = leg; c.beginPath(); c.arc(cx, top, r, Math.PI, 0); c.stroke();
    c.strokeStyle = '#d27a48'; c.lineWidth = leg * 0.35; c.beginPath(); c.arc(cx, top, r - leg * 0.15, Math.PI * 1.1, Math.PI * 1.7); c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(cx + r, top, leg / 2, by - top);
    c.fillStyle = 'rgba(80,30,10,0.22)'; for (let i = 1; i < 4; i++) c.fillRect(cx - r - leg / 2, by - i * (by - top) / 4, leg, Math.max(1, w * 0.02));
  };

  TL.themes.register(TL.makeTheme({
    id: 'desert', name: 'Desert', blurb: 'Orange sky, cacti, rock arches',
    colors: {
      light: { road: '#7a6a60', grass: '#e8c27a', rumble: '#f1e6d2', lane: '#f5ead2' },
      dark: { road: '#72625a', grass: '#dcb46a', rumble: '#b8532a', lane: null }
    },
    fog: '#f4cf9a',
    sky: { top: '#d85a22', bottom: '#fcd896' },
    paintSky(c, W, H) {
      c.globalAlpha = 0.35; c.fillStyle = '#ffe3b0';
      [[0.15, 0.2, 90], [0.5, 0.12, 120], [0.82, 0.24, 80]].forEach(p => { c.beginPath(); c.ellipse(W * p[0], H * p[1], p[2] * W / 800 + 30, 5, 0, 0, TAU); c.fill(); c.beginPath(); c.ellipse(W * p[0] + 40, H * p[1] + 8, p[2] * W / 1200 + 20, 3, 0, 0, TAU); c.fill(); });
      c.globalAlpha = 1;
    },
    celestial(c, W, H, R) {
      const x = A.skyX(W, R), y = H * 0.26, r = Math.min(W, H) * 0.075;
      A.glow(c, '#ffd27a', x, y, r * 4.2, 0.85);
      A.blob(c, x, y, r, r, '#fff3c4');
    },
    layers: [
      { h: 0.2, off: 'sky', fill: '#b9714f', paint: (c, w, h) => mesas(c, w, h, { seed: 3, n: 7, lo: 0.4, hi: 0.95, color: '#c4805c' }) },
      { h: 0.1, off: 'hill', fill: '#d9a15e', paint: (c, w, h) => { A.fillRidge(c, w, h, { seed: 0.37, rough: 0.5, color: '#d6995a' }); A.fillRidge(c, w, h, { seed: 0.52, rough: 0.8, color: '#dca862', sc: 1.5 }); } },
      { h: 0.05, off: 'tree', fill: '#e4b46c', paint: (c, w, h) => A.fillRidge(c, w, h, { seed: 0.71, rough: 2, color: '#e4b46c' }) }
    ],
    tree: (c, x, y, w, v) => (v % 3 === 0 ? arch : cactus)(c, x, y, w, v),
    bush(c, cx, by, w, v) {
      const h = w * 0.633;
      A.shadow(c, cx, by, w * 0.45);
      if (v % 2) {                                               // desert rocks
        A.tri(c, cx - w * 0.5, by, cx - w * 0.2, by - h * 0.9, cx + w * 0.1, by, '#9a7a62');
        A.tri(c, cx - w * 0.05, by, cx + w * 0.22, by - h * 1.15, cx + w * 0.5, by, '#b08a6c');
        A.tri(c, cx + w * 0.22, by - h * 1.15, cx + w * 0.5, by, cx + w * 0.3, by, '#7e604c');
      } else {                                                   // dry sage shrub
        A.blob(c, cx - w * 0.22, by - h * 0.32, w * 0.3, h * 0.34, '#8f9a58'); A.blob(c, cx + w * 0.2, by - h * 0.36, w * 0.32, h * 0.38, '#a2ac68');
        A.blob(c, cx, by - h * 0.55, w * 0.28, h * 0.32, '#b3bb78');
        c.fillStyle = '#f0c850'; c.fillRect(cx - w * 0.04, by - h * 0.85, w * 0.05, w * 0.05);
      }
    },
    lamp: (c, x, y, w, v, dir) => A.lamp(c, x, y, w, dir, { pole: '#6b4a2b', lamp: '#ffcf6a', glow: '#ffb84a', glowR: 3.4, glowA: 0.7 }),
    sign: (c, x, y, w, v, dir) => A.chevron(c, x, y, w, dir, { post: '#5a3a22', bg: '#c4602a', border: '#fff0d0', fg: '#fff0d0' })
  }));
})();
