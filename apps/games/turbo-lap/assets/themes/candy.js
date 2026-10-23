/* Turbo Lap — theme 10: Candy Land. Pastel pink and mint, a swirl candy sun and cotton clouds, sprinkled hills, lollipop
   trees, gumdrop bushes, candy-cane posts and cookie signs, drifting sparkles. Drawn in code. */
(() => {
  const A = TL.art, TAU = Math.PI * 2;
  const POP = [['#ff6fae', '#ffd0e6'], ['#4fd9a8', '#d2fff0'], ['#ffd23f', '#fff3b8'], ['#a56bff', '#e3d0ff']];

  function swirl(c, x, y, r, col, lw) {                            // an Archimedean spiral in colour
    c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.beginPath();
    for (let i = 0; i <= 44; i++) { const a = i / 44 * TAU * 2.6, rr = r * (i / 44) * 0.92; i ? c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : c.moveTo(x, y); }
    c.stroke(); c.lineCap = 'butt';
  }
  function sprinkles(c, w, h, seed, n) {
    const r = A.rng(seed), cols = ['#ff6fae', '#ffd23f', '#a56bff', '#ffffff', '#4fb0ff'];
    for (let i = 0; i < n; i++) { c.fillStyle = cols[i % 5]; c.save(); c.translate(r() * w, h * (0.35 + r() * 0.6)); c.rotate(r() * 3); c.fillRect(-2.5, -0.8, 5, 1.6); c.restore(); }
  }
  function lolly(c, cx, by, w, v) {
    const h = w * 1.667, col = POP[v % 4], r = w * 0.34, cy = by - h * 0.7;
    A.shadow(c, cx, by, w * 0.3, 0.16);
    c.fillStyle = '#ffffff'; c.fillRect(cx - w * 0.035, cy, w * 0.07, by - cy);
    c.fillStyle = '#f0c8dc'; c.fillRect(cx + w * 0.005, cy, w * 0.03, by - cy);
    A.blob(c, cx, cy, r, r, col[0]);
    if (w > 16) swirl(c, cx, cy, r, '#ffffff', Math.max(1, w * 0.045)); else A.blob(c, cx, cy, r * 0.5, r * 0.5, col[1]);
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = Math.max(1, w * 0.02); c.beginPath(); c.arc(cx, cy, r * 0.97, Math.PI * 1.1, Math.PI * 1.45); c.stroke();
  }

  TL.themes.register(TL.makeTheme({
    id: 'candy', name: 'Candy Land', blurb: 'Pastel pink, lollipops, candy canes',
    colors: {
      light: { road: '#c7a3d0', grass: '#9eeccb', rumble: '#ffffff', lane: '#ffffff' },
      dark: { road: '#bf99ca', grass: '#8fe3c0', rumble: '#ff5fa8', lane: null }
    },
    fog: '#ffeaf6',
    sky: { top: '#ff9ed2', bottom: '#e4fff3' },
    paintSky(c, W, H) {
      const k = W / 800 + 0.4;
      A.cloud(c, W * 0.18, H * 0.22, 80 * k, 'rgba(255,255,255,0.9)'); A.cloud(c, W * 0.58, H * 0.12, 100 * k, 'rgba(255,240,250,0.9)'); A.cloud(c, W * 0.88, H * 0.28, 70 * k, 'rgba(255,255,255,0.85)');
    },
    celestial(c, W, H, R) {
      const x = A.skyX(W, R), y = H * 0.16, r = Math.min(W, H) * 0.06;
      A.glow(c, '#fff2c0', x, y, r * 3.6, 0.8); A.blob(c, x, y, r, r, '#ffe27a'); swirl(c, x, y, r, '#ffffff', Math.max(1, r * 0.14));
    },
    layers: [
      { h: 0.2, off: 'sky', fill: '#ffd0e8', paint: (c, w, h) => A.fillRidge(c, w, h, { seed: 0.1, rough: 1, color: '#ffbbdc', cap: '#ffe0f0', capAt: 0.7 }) },
      { h: 0.12, off: 'hill', fill: '#8ee8c0', paint: (c, w, h) => { A.fillRidge(c, w, h, { seed: 0.37, rough: 0.5, color: '#8ee8c0' }); sprinkles(c, w, h, 3, Math.round(w / 12)); } },
      { h: 0.05, off: 'tree', fill: '#9eeccb', paint: (c, w, h) => { A.fillRidge(c, w, h, { seed: 0.71, rough: 2, color: '#a9f0d2' }); } }
    ],
    tree: lolly,
    bush(c, cx, by, w, v) {                                       // gumdrops
      const h = w * 0.633, k = [[-0.28, 0.32, 0], [0.26, 0.28, 1], [0, 0.4, 2]];
      A.shadow(c, cx, by, w * 0.46, 0.15);
      k.forEach(p => {
        const col = POP[(v + p[2]) % 4], x = cx + p[0] * w, rw = w * p[1] * 0.9, rh = h * (p[1] + 0.15) * 1.4;
        c.fillStyle = col[0]; c.beginPath(); c.moveTo(x - rw, by); c.ellipse(x, by, rw, rh, 0, Math.PI, TAU); c.closePath(); c.fill();
        c.fillStyle = col[1]; c.fillRect(x - rw * 0.55, by - rh * 0.78, Math.max(1, rw * 0.22), Math.max(1, rw * 0.22));
        c.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 4; i++) c.fillRect(x - rw * 0.7 + i * rw * 0.45, by - rh * (0.2 + 0.2 * (i % 2)), Math.max(1, rw * 0.1), Math.max(1, rw * 0.1));
      });
    },
    lamp(c, cx, by, w, v, dir) {                                  // candy cane
      const h = w * 15, r = w * 1.6, lw = w * 0.7;
      c.lineCap = 'butt'; c.strokeStyle = '#ffffff'; c.lineWidth = lw;
      c.beginPath(); c.moveTo(cx, by); c.lineTo(cx, by - h); c.stroke();
      c.beginPath(); if (dir > 0) c.arc(cx + r, by - h, r, Math.PI, TAU, false); else c.arc(cx - r, by - h, r, 0, Math.PI, true); c.stroke();
      c.strokeStyle = '#ff3f8e'; c.setLineDash([lw * 0.9, lw * 1.1]);
      c.beginPath(); c.moveTo(cx, by); c.lineTo(cx, by - h); c.stroke();
      c.setLineDash([lw * 0.9, lw * 1.0]); c.beginPath(); if (dir > 0) c.arc(cx + r, by - h, r, Math.PI, TAU, false); else c.arc(cx - r, by - h, r, 0, Math.PI, true); c.stroke();
      c.setLineDash([]);
    },
    sign(c, cx, by, w, v, dir) {                                  // cookie sign on a peppermint post
      const h = w * 1.4;
      c.fillStyle = '#ffffff'; c.fillRect(cx - w * 0.05, by - h * 0.55, w * 0.1, h * 0.55);
      c.fillStyle = '#ff5fa8'; for (let i = 0; i < 4; i++) c.fillRect(cx - w * 0.05, by - h * 0.55 + i * h * 0.14, w * 0.1, h * 0.06);
      A.rrect(c, cx - w / 2, by - h, w, h * 0.5, w * 0.12); c.fillStyle = '#ff8cc4'; c.fill();
      c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(1, w * 0.05); c.stroke();
      c.fillStyle = '#ffffff';
      for (let k = 0; k < 2; k++) {
        const ox = cx + (k - 0.5) * w * 0.38;
        c.beginPath(); c.moveTo(ox - dir * w * 0.12, by - h * 0.92); c.lineTo(ox + dir * w * 0.12, by - h * 0.75); c.lineTo(ox - dir * w * 0.12, by - h * 0.58); c.lineTo(ox - dir * w * 0.02, by - h * 0.58); c.lineTo(ox + dir * w * 0.2, by - h * 0.75); c.lineTo(ox - dir * w * 0.02, by - h * 0.92); c.closePath(); c.fill();
      }
    },
    fx(c, W, H, t) {
      A.particles(c, W, H, t, { n: 22, seed: 13, size: [1, 1.8], vx: 6, vy: 16, sway: 1.2, amp: 10, colors: ['#ffffff', '#fff2a0', '#ff9ed2'], alpha: 0.9, kind: 'star' });
    }
  }));
})();
