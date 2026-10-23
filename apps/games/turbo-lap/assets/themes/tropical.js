/* Turbo Lap — theme 6: Tropical Island. Bright teal sky and puffy clouds, a sea horizon with a far island, beach sand,
   palm trees, flowers and tiki torches. Drawn in code. */
(() => {
  const A = TL.art, TAU = Math.PI * 2;

  function sea(c, w, h) {                                        // island humps above a sea band with glitter
    const top = h * 0.5;
    const g = c.createLinearGradient(0, top, 0, h); g.addColorStop(0, '#2cc6d4'); g.addColorStop(1, '#0f8fb5');
    c.fillStyle = g; c.fillRect(0, top, w, h - top + 2);
    const r = A.rng(4);
    [[0.18, 0.2], [0.62, 0.3], [0.9, 0.14]].forEach(p => {
      const cx = p[0] * w, iw = h * (0.9 + p[1] * 2), ih = h * (0.16 + p[1] * 0.5);
      A.wrap(w, cx - iw / 2, iw, x0 => {
        c.fillStyle = '#4ba98a'; c.beginPath(); c.moveTo(x0, top + 1); c.quadraticCurveTo(x0 + iw * 0.3, top - ih * 1.3, x0 + iw * 0.5, top - ih); c.quadraticCurveTo(x0 + iw * 0.75, top - ih * 1.1, x0 + iw, top + 1); c.closePath(); c.fill();
        c.fillStyle = '#2f8f6a'; c.beginPath(); c.moveTo(x0 + iw * 0.5, top - ih); c.quadraticCurveTo(x0 + iw * 0.75, top - ih * 1.1, x0 + iw, top + 1); c.lineTo(x0 + iw * 0.6, top + 1); c.closePath(); c.fill();
      });
    });
    c.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < w / 14; i++) c.fillRect(r() * w, top + 2 + r() * (h - top - 4), 3 + r() * 6, 1);
  }
  function dunes(c, w, h) {
    A.fillRidge(c, w, h, { seed: 0.37, rough: 0.4, color: '#efd9a0', sc: 2.2 });
    const r = A.rng(8);
    for (let i = 0; i < 9; i++) {                                // a few distant palm silhouettes on the dunes
      const x = (i + r() * 0.8) / 9 * w, ph = h * (0.35 + r() * 0.3);
      A.wrap(w, x - ph, ph * 2, x0 => {
        c.strokeStyle = '#2a6a48'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x0, h * 0.82); c.quadraticCurveTo(x0 + ph * 0.1, h * 0.82 - ph * 0.5, x0 + ph * 0.18, h * 0.82 - ph); c.stroke();
        c.fillStyle = '#237a4f'; for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(x0 + ph * 0.18, h * 0.82 - ph); c.quadraticCurveTo(x0 + ph * 0.18 + k * ph * 0.22, h * 0.82 - ph - ph * 0.28, x0 + ph * 0.18 + k * ph * 0.4, h * 0.82 - ph + ph * 0.1); c.quadraticCurveTo(x0 + ph * 0.18 + k * ph * 0.22, h * 0.82 - ph - ph * 0.12, x0 + ph * 0.18, h * 0.82 - ph); c.fill(); }
      });
    }
  }

  const palm = (c, cx, by, w, v) => {
    const h = w * 1.667 * (0.9 + (v % 3) * 0.06), f = v % 2 ? -1 : 1, tx = cx + f * w * 0.22, ty = by - h * 0.86;
    A.shadow(c, cx + f * w * 0.1, by, w * 0.4, 0.2);
    c.lineCap = 'round';
    c.strokeStyle = '#7a5a34'; c.lineWidth = Math.max(1, w * 0.1);
    c.beginPath(); c.moveTo(cx, by); c.quadraticCurveTo(cx - f * w * 0.04, by - h * 0.5, tx, ty); c.stroke();
    c.strokeStyle = '#a07a48'; c.lineWidth = Math.max(1, w * 0.04);
    c.beginPath(); c.moveTo(cx - w * 0.02, by); c.quadraticCurveTo(cx - f * w * 0.07, by - h * 0.5, tx - w * 0.02, ty); c.stroke();
    c.lineCap = 'butt';
    const fr = [[-1, 0.0], [-0.7, -0.5], [-0.25, -0.85], [0.25, -0.85], [0.7, -0.5], [1, 0.0], [0, -0.7]];
    fr.forEach((p, i) => {
      const ex = tx + p[0] * w * 0.62, ey = ty + p[1] * h * 0.2 + h * 0.1 * Math.abs(p[0]), mx = tx + p[0] * w * 0.3, my = ty + p[1] * h * 0.32 - h * 0.05;
      c.fillStyle = i % 2 ? '#1f8a4c' : '#2fb35f'; c.beginPath(); c.moveTo(tx, ty);
      c.quadraticCurveTo(mx, my - h * 0.07, ex, ey); c.quadraticCurveTo(mx, my + h * 0.07, tx, ty); c.fill();
    });
    A.blob(c, tx - w * 0.04, ty + h * 0.03, w * 0.05, w * 0.05, '#5a3a1c'); A.blob(c, tx + w * 0.05, ty + h * 0.04, w * 0.05, w * 0.05, '#6a4a24');
  };

  TL.themes.register(TL.makeTheme({
    id: 'tropical', name: 'Tropical Island', blurb: 'Teal sky, palms, beach',
    colors: {
      light: { road: '#5d6a72', grass: '#f3dea0', rumble: '#ffffff', lane: '#ffffff' },
      dark: { road: '#56626a', grass: '#ead394', rumble: '#ff6b5a', lane: null }
    },
    fog: '#d4f7f0',
    sky: { top: '#0aa7c4', bottom: '#c4f6ef' },
    paintSky(c, W, H) {
      const k = W / 800 + 0.4;
      A.cloud(c, W * 0.16, H * 0.2, 70 * k, 'rgba(255,255,255,0.9)'); A.cloud(c, W * 0.55, H * 0.1, 90 * k, 'rgba(255,255,255,0.85)'); A.cloud(c, W * 0.85, H * 0.27, 60 * k, 'rgba(255,255,255,0.8)');
    },
    celestial(c, W, H, R) {
      const x = A.skyX(W, R), y = H * 0.14, r = Math.min(W, H) * 0.05;
      A.glow(c, '#fff6b0', x, y, r * 4, 0.85); A.blob(c, x, y, r, r, '#fffbe0');
    },
    layers: [
      { h: 0.14, off: 'sky', fill: '#0f8fb5', paint: sea },
      { h: 0.08, off: 'hill', fill: '#efd9a0', paint: dunes },
      { h: 0.03, off: 'tree', fill: '#f1dc9c', paint: (c, w, h) => A.fillRidge(c, w, h, { seed: 0.71, rough: 2, color: '#f1dc9c' }) }
    ],
    tree: palm,
    bush(c, cx, by, w, v) {
      const h = w * 0.633;
      A.shadow(c, cx, by, w * 0.45, 0.18);
      [[-0.3, -0.6, 0.35, '#1f8a4c'], [0.3, -0.5, 0.33, '#2fb35f'], [0, -0.85, 0.3, '#29a057'], [-0.1, -0.35, 0.4, '#1f8a4c']].forEach(p => {
        c.fillStyle = p[3]; c.beginPath(); c.moveTo(cx + p[0] * w, by); c.quadraticCurveTo(cx + p[0] * w - w * 0.2, by + p[1] * h * 0.6, cx + p[0] * w, by + p[1] * h); c.quadraticCurveTo(cx + p[0] * w + w * 0.2, by + p[1] * h * 0.6, cx + p[0] * w, by); c.fill();
      });
      const fl = ['#ff5a7a', '#ffd23f', '#ff8a3d'][v % 3];
      A.blob(c, cx - w * 0.08, by - h * 0.7, w * 0.1, w * 0.1, fl); A.blob(c, cx + w * 0.22, by - h * 0.5, w * 0.08, w * 0.08, fl); A.blob(c, cx - w * 0.3, by - h * 0.45, w * 0.07, w * 0.07, fl);
    },
    lamp: (c, x, y, w, v, dir) => A.lamp(c, x, y, w, dir, {
      pole: '#8a6a3a', glow: '#ff9a3a', glowR: 3.4, glowA: 0.75,
      head(c, x, y, w, d) { c.fillStyle = '#5a3a1c'; c.fillRect(x - w * 0.5 * d - w * 0.4, y - w * 0.1, w * 0.9, w * 0.3);
        c.fillStyle = '#ff8a1f'; c.beginPath(); c.moveTo(x - w * 0.5 * d, y - w * 0.1); c.quadraticCurveTo(x - w * 0.95 * d, y - w * 0.8, x - w * 0.5 * d, y - w * 1.6); c.quadraticCurveTo(x - w * 0.05 * d, y - w * 0.8, x - w * 0.5 * d, y - w * 0.1); c.fill();
        c.fillStyle = '#ffe070'; c.beginPath(); c.ellipse(x - w * 0.5 * d, y - w * 0.55, w * 0.18, w * 0.4, 0, 0, TAU); c.fill(); }
    }),
    sign: (c, x, y, w, v, dir) => A.chevron(c, x, y, w, dir, { post: '#7a5a30', bg: '#0e8fb0', border: '#ffffff', fg: '#ffffff' })
  }));
})();
