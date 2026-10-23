/* Turbo Lap — theme 7: Volcano. Red-black sky heavy with ash, erupting cones with glowing craters, dark basalt ground
   with lava-orange kerbs, burnt trees, lava rocks and fire braziers. Falling ash, rising embers. Drawn in code. */
(() => {
  const A = TL.art, TAU = Math.PI * 2;

  function cones(c, w, h) {
    [[0.22, 1.0, 0.6], [0.7, 0.75, 0.5]].forEach(p => {
      const cx = p[0] * w, ch = h * p[1], bw = h * 1.9 * p[2] * 1.4, cr = bw * 0.1;
      A.wrap(w, cx - bw, bw * 2, x0 => {
        const x = x0 + bw;
        c.fillStyle = '#2a1210'; c.beginPath(); c.moveTo(x - bw, h + 1); c.lineTo(x - cr, h - ch); c.lineTo(x + cr, h - ch); c.lineTo(x + bw, h + 1); c.closePath(); c.fill();
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.moveTo(x, h - ch); c.lineTo(x + cr, h - ch); c.lineTo(x + bw, h + 1); c.lineTo(x + bw * 0.1, h + 1); c.closePath(); c.fill();
        A.glow(c, '#ff6a1a', x, h - ch, bw * 0.55, 0.85);
        c.fillStyle = '#ff8a2a'; c.beginPath(); c.ellipse(x, h - ch, cr * 1.05, cr * 0.28, 0, 0, TAU); c.fill();
        c.strokeStyle = '#ff6a1a'; c.lineWidth = 1.3; c.beginPath();                      // lava streaks down the slope
        c.moveTo(x - cr * 0.4, h - ch); c.quadraticCurveTo(x - bw * 0.2, h - ch * 0.55, x - bw * 0.35, h - ch * 0.1);
        c.moveTo(x + cr * 0.5, h - ch); c.quadraticCurveTo(x + bw * 0.16, h - ch * 0.6, x + bw * 0.24, h - ch * 0.2); c.stroke();
        c.fillStyle = 'rgba(40,24,22,0.7)'; [[0, -0.2, 1.1], [0.4, -0.6, 1.5], [-0.1, -1.1, 1.9]].forEach(q => { c.beginPath(); c.ellipse(x + q[0] * bw * 0.4, h - ch + q[1] * ch * 0.5 - cr, cr * q[2], cr * q[2] * 0.7, 0, 0, TAU); c.fill(); });   // ash plume
      });
    });
  }

  TL.themes.register(TL.makeTheme({
    id: 'volcano', name: 'Volcano', blurb: 'Ash, lava glow, dark rock',
    colors: {
      light: { road: '#3d3a3a', grass: '#2d2321', rumble: '#ff7a1a', lane: '#ffb347' },
      dark: { road: '#363333', grass: '#251b19', rumble: '#3a2a28', lane: null }
    },
    fog: '#58180e',
    sky: { top: '#14050a', bottom: '#c2321a' },
    paintSky(c, W, H) {
      c.fillStyle = 'rgba(25,8,8,0.55)';
      [[0.1, 0.1, 150], [0.4, 0.2, 200], [0.7, 0.08, 170], [0.92, 0.22, 130]].forEach(p => { c.beginPath(); c.ellipse(W * p[0], H * p[1], p[2] * W / 800 + 40, 14 * W / 800 + 6, 0, 0, TAU); c.fill(); });
    },
    celestial(c, W, H, R) {
      const x = A.skyX(W, R, 0.5), y = H * 0.3, r = Math.min(W, H) * 0.05;
      A.glow(c, '#ff5a2a', x, y, r * 5, 0.8); A.blob(c, x, y, r, r, 'rgba(255,170,110,0.85)');
    },
    layers: [
      { h: 0.26, off: 'sky', fill: '#2a1210', paint: cones },
      { h: 0.12, off: 'hill', fill: '#1c1010', paint: (c, w, h) => { A.fillRidge(c, w, h, { seed: 0.37, rough: 1.6, color: '#1c1010' }); c.fillStyle = 'rgba(255,90,26,0.55)'; c.fillRect(0, h - 1.5, w, 1.5); } },
      { h: 0.05, off: 'tree', fill: '#140c0c', paint: (c, w, h) => A.fillRidge(c, w, h, { seed: 0.71, rough: 2, color: '#140c0c' }) }
    ],
    tree(c, cx, by, w, v) {                                       // burnt tree with glowing ember tips
      const h = w * 1.667;
      A.glow(c, '#ff5a1a', cx, by - h * 0.05, w * 0.6, 0.45);
      A.shadow(c, cx, by, w * 0.35, 0.35);
      c.strokeStyle = '#120a0a'; c.lineCap = 'round'; c.lineJoin = 'round';
      const f = v % 2 ? -1 : 1, lw = Math.max(1, w * 0.1);
      c.lineWidth = lw; c.beginPath(); c.moveTo(cx, by); c.lineTo(cx + f * w * 0.02, by - h * 0.9);
      c.lineWidth = lw * 0.7; c.moveTo(cx, by - h * 0.35); c.lineTo(cx - f * w * 0.26, by - h * 0.62); c.lineTo(cx - f * w * 0.3, by - h * 0.82);
      c.moveTo(cx + f * w * 0.01, by - h * 0.55); c.lineTo(cx + f * w * 0.24, by - h * 0.75); c.lineTo(cx + f * w * 0.2, by - h * 0.92);
      c.moveTo(cx - f * w * 0.26, by - h * 0.62); c.lineTo(cx - f * w * 0.42, by - h * 0.7); c.stroke();
      c.lineCap = 'butt'; c.fillStyle = '#ff7a2a';
      [[0.02, 0.9], [-0.3, 0.82], [0.2, 0.92]].forEach(p => c.fillRect(cx + f * p[0] * w - w * 0.025, by - h * p[1] - w * 0.025, w * 0.05, w * 0.05));
      c.fillStyle = '#ff6a1a'; c.fillRect(cx - w * 0.12, by - Math.max(1, w * 0.02), w * 0.24, Math.max(1, w * 0.02));
    },
    bush(c, cx, by, w, v) {                                       // lava rock with glowing cracks
      const h = w * 0.633;
      A.glow(c, '#ff5a1a', cx, by - h * 0.1, w * 0.7, 0.55);
      A.tri(c, cx - w * 0.5, by, cx - w * 0.28, by - h * 0.9, cx + w * 0.05, by, '#1e1514');
      A.tri(c, cx - w * 0.1, by, cx + w * 0.12, by - h * 1.2, cx + w * 0.5, by, '#2a1d1a');
      A.tri(c, cx + w * 0.12, by - h * 1.2, cx + w * 0.5, by, cx + w * 0.3, by, '#150e0d');
      c.strokeStyle = '#ff6a1a'; c.lineWidth = Math.max(1, w * 0.03); c.beginPath(); c.moveTo(cx - w * 0.28, by - h * 0.7); c.lineTo(cx - w * 0.22, by - h * 0.3); c.lineTo(cx - w * 0.3, by - h * 0.05);
      c.moveTo(cx + w * 0.12, by - h * 0.95); c.lineTo(cx + w * 0.2, by - h * 0.5); c.lineTo(cx + w * 0.14, by - h * 0.1); c.stroke();
    },
    lamp: (c, x, y, w, v, dir) => A.lamp(c, x, y, w, dir, {
      pole: '#3b3030', glow: '#ff6a1a', glowR: 4.2, glowA: 0.85,
      head(c, x, y, w, d) { c.fillStyle = '#241a18'; c.fillRect(x - w * 0.95 * d - (d < 0 ? w * 0.0 : 0), y + w * 0.05, w * 1.1 * d, w * 0.35);
        c.fillStyle = '#ff7a1a'; c.beginPath(); c.moveTo(x - w * 0.9 * d, y + w * 0.05); c.quadraticCurveTo(x - w * 1.15 * d, y - w * 0.7, x - w * 0.7 * d, y - w * 1.5); c.quadraticCurveTo(x - w * 0.5 * d, y - w * 0.6, x - w * 0.2 * d, y + w * 0.05); c.fill();
        c.fillStyle = '#ffd070'; c.beginPath(); c.ellipse(x - w * 0.62 * d, y - w * 0.35, w * 0.18, w * 0.5, 0, 0, TAU); c.fill(); }
    }),
    sign: (c, x, y, w, v, dir) => A.chevron(c, x, y, w, dir, { post: '#2a2020', bg: '#1a1214', border: '#ff6a1a', fg: '#ff9a3a', glow: '#ff5a1a', glowA: 0.4 }),
    fx(c, W, H, t) {
      A.particles(c, W, H, t, { n: 60, seed: 11, size: [0.8, 1.7], vx: -14, vy: 24, sway: 0.9, amp: 10, colors: ['#8a8078', '#5a5048'], alpha: 0.6, kind: 'dot' });
      A.particles(c, W, H, t, { n: 26, seed: 31, size: [0.8, 1.6], vx: 8, vy: -34, sway: 1.3, amp: 12, colors: ['#ff8a2a', '#ffd070'], alpha: 0.95, kind: 'dot' });
    }
  }));
})();
