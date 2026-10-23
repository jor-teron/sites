/* Turbo Lap — theme 4: Night City. Dark violet sky with stars and a moon, a neon skyline in three depths, glowing lamps,
   lit towers and neon signs by the road. Drawn in code; the skyline is pre-rendered. */
(() => {
  const A = TL.art, TAU = Math.PI * 2;
  const NEON = ['#ff2bd6', '#2bd9ff', '#ffb02b', '#3dffb0'];

  const tower = (c, cx, by, w, v) => {
    const bw = w * 0.62, bh = w * 1.5, x = cx - bw / 2, y = by - bh, neon = NEON[v % 4];
    A.shadow(c, cx, by, bw * 0.6, 0.35);
    c.fillStyle = '#12132a'; c.fillRect(x, y, bw, bh);
    c.fillStyle = '#1d1f40'; c.fillRect(x + bw * 0.72, y, bw * 0.28, bh);
    if (w > 22) {
      const cols = 4, rows = 9, cw = bw / cols, ch = bh * 0.86 / rows;
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        if (A.hash(v * 31 + i * 7 + j * 13) < 0.45) continue;
        c.fillStyle = (i + j + v) % 5 ? '#ffe9a0' : '#7fe9ff';
        c.fillRect(x + i * cw + cw * 0.22, y + bh * 0.07 + j * ch + ch * 0.18, cw * 0.5, ch * 0.5);
      }
    }
    c.fillStyle = neon; c.fillRect(x, y, bw, Math.max(1, w * 0.035)); c.fillRect(x, y, Math.max(1, w * 0.025), bh); c.fillRect(x + bw - Math.max(1, w * 0.025), y, Math.max(1, w * 0.025), bh);
    A.glow(c, neon.length ? neon : '#ff2bd6', cx, y, w * 0.55, 0.55);
    c.fillStyle = '#12132a'; c.fillRect(cx - w * 0.01, y - w * 0.22, Math.max(1, w * 0.02), w * 0.22);
    c.fillStyle = '#ff3b3b'; c.fillRect(cx - w * 0.03, y - w * 0.25, w * 0.06, w * 0.05);
  };

  TL.themes.register(TL.makeTheme({
    id: 'night', name: 'Night City', blurb: 'Neon skyline, glowing lamps',
    colors: {
      light: { road: '#272833', grass: '#15162e', rumble: '#ff3fd0', lane: '#ffe45c' },
      dark: { road: '#22232d', grass: '#10122a', rumble: '#2fe6ff', lane: null }
    },
    fog: '#2a1250',
    sky: { top: '#04051a', bottom: '#4a1760' },
    paintSky(c, W, H) {
      const n = Math.round(W * H / 2600);
      for (let i = 0; i < n; i++) {
        const x = A.hash(i * 1.3) * W, y = Math.pow(A.hash(i * 2.1 + 4), 1.6) * H * 0.5, s = 0.5 + A.hash(i * 3.7) * 1.1;
        c.globalAlpha = 0.35 + A.hash(i * 5.1) * 0.65; c.fillStyle = A.hash(i * 7.7) < 0.2 ? '#a8d8ff' : '#ffffff'; c.fillRect(x, y, s, s);
      }
      c.globalAlpha = 1;
    },
    celestial(c, W, H, R) {
      const x = A.skyX(W, R, 0.3), y = H * 0.17, r = Math.min(W, H) * 0.05;
      A.glow(c, '#9c8cff', x, y, r * 4, 0.55); A.blob(c, x, y, r, r, '#f4f0ff'); A.blob(c, x + r * 0.45, y - r * 0.2, r * 0.9, r * 0.9, '#150f38');
    },
    layers: [
      { h: 0.22, off: 'sky', fill: '#1a1040', paint: (c, w, h) => A.skyline(c, w, h, { seed: 11, color: '#1a1040', minW: 0.1, maxW: 0.24, minH: 0.35, maxH: 0.95, wins: ['#6a5acd', '#c08cff', '#ffd27a'], winP: 0.25, antenna: '#ff3b3b', cell: 3 }) },
      { h: 0.13, off: 'hill', fill: '#120a30', paint: (c, w, h) => A.skyline(c, w, h, { seed: 23, color: '#120a30', minW: 0.14, maxW: 0.3, minH: 0.35, maxH: 0.95, wins: ['#ffe9a0', '#7fe9ff', '#ff8be8'], winP: 0.35, neon: NEON, antenna: '#ff3b3b', cell: 3.6 }) },
      { h: 0.06, off: 'tree', fill: '#0c0a22', paint: (c, w, h) => A.skyline(c, w, h, { seed: 37, color: '#0c0a22', minW: 0.5, maxW: 1.1, minH: 0.35, maxH: 0.95, wins: ['#ffb02b', '#2bd9ff'], winP: 0.4, neon: NEON, cell: 3 }) }
    ],
    tree: tower,
    bush(c, cx, by, w, v) {
      const h = w * 0.633, neon = NEON[(v + 1) % 4];
      A.glow(c, neon, cx, by - h * 0.1, w * 0.75, 0.5);
      A.shadow(c, cx, by, w * 0.5, 0.3);
      A.blob(c, cx - w * 0.2, by - h * 0.3, w * 0.34, h * 0.3, '#0f3a46'); A.blob(c, cx + w * 0.2, by - h * 0.32, w * 0.34, h * 0.32, '#124650'); A.blob(c, cx, by - h * 0.5, w * 0.3, h * 0.28, '#17606a');
      c.fillStyle = neon; for (let i = 0; i < 5; i++) c.fillRect(cx - w * 0.36 + i * w * 0.17, by - h * (0.3 + 0.15 * (i % 2)), Math.max(1, w * 0.04), Math.max(1, w * 0.04));
      c.fillStyle = '#1b1d36'; c.fillRect(cx - w * 0.5, by - h * 0.12, w, h * 0.12); c.fillStyle = neon; c.fillRect(cx - w * 0.5, by - h * 0.12, w, Math.max(1, w * 0.02));
    },
    lamp: (c, x, y, w, v, dir) => A.lamp(c, x, y, w, dir, { pole: '#303449', lamp: '#fff0b0', glow: '#ffcc66', glowR: 6, glowA: 0.9 }),
    sign(c, x, y, w, v, dir) {
      const neon = v % 2 ? '#3dffb0' : '#ff3fd0';
      A.chevron(c, x, y, w, dir, { post: '#303449', bg: '#0a0a1c', border: neon, fg: neon, glow: neon, glowA: 0.6 });
    }
  }));
})();
