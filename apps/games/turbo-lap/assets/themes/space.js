/* Turbo Lap — theme 9: Space Station. Black sky of stars with a ringed planet and nebula glow, station silhouettes on the
   horizon, metal deck with cyan kerbs, glowing pylons, crates, beacon lamps and holo signs. Drawn in code. */
(() => {
  const A = TL.art, TAU = Math.PI * 2;

  function station(c, w, h) {
    const r = A.rng(17);
    let x = 0;
    while (x < w - 1) {
      let bw = (0.25 + r() * 0.6) * h; if (x + bw > w - h * 0.25) bw = w - x;
      const kind = Math.floor(r() * 3), bh = h * (0.3 + r() * 0.6);
      c.fillStyle = '#1a2236';
      if (kind === 0) { c.fillRect(x, h - bh, bw, bh + 2); c.fillStyle = '#232d46'; c.fillRect(x, h - bh, bw, 2); }
      else if (kind === 1) { c.fillRect(x + bw * 0.1, h - bh * 0.8, bw * 0.8, bh * 0.8 + 2); c.beginPath(); c.ellipse(x + bw / 2, h - bh * 0.8, bw * 0.4, bh * 0.2, 0, Math.PI, 0); c.fill(); }
      else {                                                       // solar array on a mast
        c.fillRect(x + bw / 2 - 1, h - bh, 2, bh + 2);
        c.fillStyle = '#26365a'; c.fillRect(x, h - bh, bw, bh * 0.28);
        c.fillStyle = '#3a5a9a'; for (let i = 1; i < 5; i++) c.fillRect(x + (bw / 5) * i - 0.5, h - bh, 1, bh * 0.28);
        c.fillStyle = '#1a2236';
      }
      c.fillStyle = '#7fe9ff'; for (let i = 0; i < 4; i++) if (r() < 0.6) c.fillRect(x + r() * bw, h - r() * bh * 0.7, 1.6, 1.6);
      x += bw;
    }
  }
  function wall(c, w, h) {
    c.fillStyle = '#222b40'; c.fillRect(0, 0, w, h + 2);
    c.fillStyle = '#2d3752'; for (let x = 0; x < w; x += h * 1.4) { c.fillRect(x, h * 0.1, 1, h); }
    c.fillStyle = '#2d3752'; c.fillRect(0, h * 0.1, w, 1); c.fillRect(0, h * 0.55, w, 1);
    c.fillStyle = '#6be4ff'; for (let x = h * 0.3; x < w; x += h * 1.4) { c.fillRect(x, h * 0.3, h * 0.6, 1.6); }
    c.fillStyle = '#ffb02b'; for (let x = h * 0.9; x < w; x += h * 2.8) c.fillRect(x, h * 0.7, 2, 2);
  }

  TL.themes.register(TL.makeTheme({
    id: 'space', name: 'Space Station', blurb: 'Stars, planets, glowing pylons',
    colors: {
      light: { road: '#383d4c', grass: '#262c3b', rumble: '#6be4ff', lane: '#6be4ff' },
      dark: { road: '#323746', grass: '#202533', rumble: '#1b2c4a', lane: null }
    },
    fog: '#0b1230',
    sky: { top: '#010208', bottom: '#101a45' },
    paintSky(c, W, H) {
      A.glow(c, '#6a3cff', W * 0.25, H * 0.2, H * 0.45, 0.28); A.glow(c, '#ff3c9a', W * 0.78, H * 0.3, H * 0.4, 0.16);
      const n = Math.round(W * H / 1500);
      for (let i = 0; i < n; i++) {
        const x = A.hash(i * 1.3 + 2) * W, y = Math.pow(A.hash(i * 2.1 + 6), 1.3) * H * 0.55, s = 0.5 + A.hash(i * 3.7) * 1.3, q = A.hash(i * 7.7);
        c.globalAlpha = 0.4 + A.hash(i * 5.1) * 0.6; c.fillStyle = q < 0.2 ? '#9fd8ff' : q < 0.3 ? '#ffe9a0' : '#ffffff'; c.fillRect(x, y, s, s);
      }
      c.globalAlpha = 1;
    },
    celestial(c, W, H, R) {
      const x = A.skyX(W, R, 0.6), y = H * 0.2, r = Math.min(W, H) * 0.1;
      const g = c.createLinearGradient(x - r, y - r, x + r, y + r); g.addColorStop(0, '#f2b878'); g.addColorStop(0.55, '#b4683a'); g.addColorStop(1, '#4a2418');
      c.save(); c.translate(x, y); c.rotate(-0.35);
      c.strokeStyle = 'rgba(230,200,150,0.55)'; c.lineWidth = r * 0.14; c.beginPath(); c.ellipse(0, 0, r * 1.7, r * 0.42, 0, Math.PI, TAU); c.stroke();       // ring behind
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
      c.fillStyle = 'rgba(80,36,20,0.35)'; c.fillRect(-r, -r * 0.2, r * 2, r * 0.12); c.fillRect(-r, r * 0.25, r * 2, r * 0.08);
      c.save(); c.beginPath(); c.arc(0, 0, r, 0, TAU); c.clip(); c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.arc(r * 0.5, r * 0.3, r * 1.15, 0, TAU); c.fill(); c.restore();
      c.strokeStyle = 'rgba(240,215,170,0.8)'; c.beginPath(); c.ellipse(0, 0, r * 1.7, r * 0.42, 0, 0, Math.PI); c.stroke();                                 // ring in front
      c.restore();
      const x2 = A.skyX(W, R, 0.2) * 1.0, y2 = H * 0.32, r2 = r * 0.28;
      A.blob(c, x2, y2, r2, r2, '#4a8ad8'); A.blob(c, x2 + r2 * 0.3, y2 - r2 * 0.2, r2 * 0.8, r2 * 0.8, '#5aa0ea'); A.blob(c, x2 + r2 * 0.5, y2 + r2 * 0.3, r2 * 0.6, r2 * 0.55, 'rgba(10,20,50,0.55)');
    },
    layers: [
      { h: 0.18, off: 'sky', fill: '#1a2236', paint: station },
      { h: 0.1, off: 'hill', fill: '#222b40', paint: wall },
      { h: 0.04, off: 'tree', fill: '#2a3348', paint: (c, w, h) => { c.fillStyle = '#2a3348'; c.fillRect(0, 0, w, h + 2); c.fillStyle = '#6be4ff'; for (let x = 6; x < w; x += 38) c.fillRect(x, h * 0.4, 14, 1.5); } }
    ],
    tree(c, cx, by, w, v) {                                       // glowing pylon
      const h = w * 1.667, bw = w * 0.26, orb = ['#6be4ff', '#ff6bd6', '#7dff9a'][v % 3];
      A.glow(c, orb, cx, by - h * 0.9, w * 0.9, 0.7);
      A.shadow(c, cx, by, w * 0.35, 0.3);
      c.fillStyle = '#3a4258'; c.beginPath(); c.moveTo(cx - bw * 0.9, by); c.lineTo(cx - bw * 0.35, by - h * 0.85); c.lineTo(cx + bw * 0.35, by - h * 0.85); c.lineTo(cx + bw * 0.9, by); c.closePath(); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.moveTo(cx + bw * 0.1, by); c.lineTo(cx + bw * 0.1, by - h * 0.85); c.lineTo(cx + bw * 0.35, by - h * 0.85); c.lineTo(cx + bw * 0.9, by); c.closePath(); c.fill();
      c.fillStyle = orb; c.fillRect(cx - bw * 0.07, by - h * 0.8, bw * 0.14, h * 0.72);
      for (let i = 0; i < 3; i++) c.fillRect(cx - bw * (0.8 - i * 0.2), by - h * (0.14 + i * 0.22), bw * (1.6 - i * 0.4), Math.max(1, w * 0.012));
      c.fillStyle = '#5a6482'; c.fillRect(cx - bw * 0.5, by - h * 0.88, bw, h * 0.04);
      A.blob(c, cx, by - h * 0.93, w * 0.1, w * 0.1, orb); A.blob(c, cx, by - h * 0.93, w * 0.05, w * 0.05, '#ffffff');
    },
    bush(c, cx, by, w, v) {                                       // cargo module with hazard stripe
      const h = w * 0.633;
      A.shadow(c, cx, by, w * 0.5, 0.3);
      c.fillStyle = '#58627e'; A.rrect(c, cx - w * 0.42, by - h * 0.85, w * 0.84, h * 0.85, w * 0.06); c.fill();
      c.fillStyle = '#434c66'; c.fillRect(cx + w * 0.2, by - h * 0.85, w * 0.22, h * 0.85);
      c.fillStyle = '#ffb02b'; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(cx - w * 0.4 + i * w * 0.16, by - h * 0.3); c.lineTo(cx - w * 0.3 + i * w * 0.16, by - h * 0.3); c.lineTo(cx - w * 0.22 + i * w * 0.16, by - h * 0.12); c.lineTo(cx - w * 0.32 + i * w * 0.16, by - h * 0.12); c.fill(); }
      c.fillStyle = '#6be4ff'; c.fillRect(cx - w * 0.3, by - h * 0.7, w * 0.3, Math.max(1, w * 0.04));
      A.glow(c, '#6be4ff', cx - w * 0.15, by - h * 0.68, w * 0.3, 0.5);
    },
    lamp: (c, x, y, w, v, dir) => A.lamp(c, x, y, w, dir, { pole: '#7a8499', lamp: '#6be4ff', glow: '#6be4ff', glowR: 4, glowA: 0.85 }),
    sign: (c, x, y, w, v, dir) => A.chevron(c, x, y, w, dir, { post: '#7a8499', bg: '#0a1530', border: '#6be4ff', fg: '#6be4ff', glow: '#6be4ff', glowA: 0.45 }),
    fx(c, W, H, t) {
      A.particles(c, W, H, t, { n: 16, seed: 21, size: [0.8, 1.3], vx: -6, vy: 8, sway: 0.7, amp: 8, colors: ['#9fe8ff', '#ffffff'], alpha: 0.7, kind: 'star' });
    }
  }));
})();
