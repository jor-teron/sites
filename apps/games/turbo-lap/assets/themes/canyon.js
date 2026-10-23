/* Turbo Lap — theme 8: Canyon. Tall red terraced cliff walls with strata, dusty haze and drifting dust streaks, red-clay
   ground, rock pillars, dry bushes and wooden posts. Drawn in code. */
(() => {
  const A = TL.art, TAU = Math.PI * 2;

  function cliffs(c, w, h, o) {
    const r = A.rng(o.seed), n = o.n, pts = [[0, h]];
    let x = 0;
    for (let i = 0; i < n; i++) {                                // stepped skyline: flat tops with terraces
      const sw = w / n * (0.6 + r() * 0.8), top = h * (o.lo + r() * (o.hi - o.lo));
      const nx = i === n - 1 ? w : Math.min(w, x + sw);
      pts.push([x, h - top], [nx, h - top]); x = nx; if (x >= w) break;
    }
    pts.push([w, h], [0, h]);
    c.save(); c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.clip();
    c.fillStyle = o.cols[0]; c.fillRect(0, 0, w, h + 2);
    for (let y = h; y > 0; y -= h / 9) {                         // strata bands
      c.fillStyle = o.cols[1]; c.globalAlpha = 0.55; c.fillRect(0, y - h / 18, w, h / 36); c.globalAlpha = 1;
      c.fillStyle = 'rgba(40,10,5,0.18)'; c.fillRect(0, y - h / 9, w, 1);
    }
    for (let i = 1; i < pts.length - 2; i += 2) {                // each terrace's right side is in shade
      const a = pts[i], b = pts[i + 1], nxt = pts[i + 2];
      if (nxt && nxt[1] !== b[1]) { c.fillStyle = 'rgba(40,10,5,0.28)'; c.fillRect(b[0] - Math.min(14, (b[0] - a[0]) * 0.3), Math.min(b[1], nxt[1]), Math.min(14, (b[0] - a[0]) * 0.3), h); }
    }
    c.restore();
  }

  TL.themes.register(TL.makeTheme({
    id: 'canyon', name: 'Canyon', blurb: 'Red cliffs, dust, dry bushes',
    colors: {
      light: { road: '#6b5f59', grass: '#b25a34', rumble: '#ecd9bd', lane: '#eadfc8' },
      dark: { road: '#645953', grass: '#a2502e', rumble: '#7d3320', lane: null }
    },
    fog: '#e8b790',
    sky: { top: '#b24a22', bottom: '#f4c79a' },
    paintSky(c, W, H) {
      c.globalAlpha = 0.28; c.fillStyle = '#ffe2b8';
      [[0.25, 0.16, 140], [0.7, 0.1, 170], [0.95, 0.25, 90]].forEach(p => { c.beginPath(); c.ellipse(W * p[0], H * p[1], p[2] * W / 800 + 30, 6, 0, 0, TAU); c.fill(); });
      c.globalAlpha = 1;
    },
    celestial(c, W, H, R) {
      const x = A.skyX(W, R), y = H * 0.2, r = Math.min(W, H) * 0.04;
      A.glow(c, '#ffc27a', x, y, r * 4, 0.7); A.blob(c, x, y, r, r, '#fff0c0');
    },
    layers: [
      { h: 0.3, off: 'sky', fill: '#9a4325', paint: (c, w, h) => cliffs(c, w, h, { seed: 5, n: 9, lo: 0.45, hi: 1, cols: ['#b5532f', '#d07a4a'] }) },
      { h: 0.18, off: 'hill', fill: '#8a3a20', paint: (c, w, h) => cliffs(c, w, h, { seed: 14, n: 12, lo: 0.4, hi: 1, cols: ['#8f3d22', '#b85a32'] }) },
      { h: 0.06, off: 'tree', fill: '#a34a2a', paint: (c, w, h) => A.fillRidge(c, w, h, { seed: 0.71, rough: 2, color: '#a34a2a' }) }
    ],
    tree(c, cx, by, w, v) {                                       // rock pillar (hoodoo)
      const h = w * 1.667, tiers = [[0.55, 0.0, 0.22], [0.42, 0.22, 0.4], [0.34, 0.4, 0.55], [0.5, 0.55, 0.66], [0.38, 0.66, 0.9]];
      A.shadow(c, cx, by, w * 0.4, 0.25);
      tiers.forEach((t, i) => {
        const tw = w * t[0] * (v % 2 ? 1 : 0.9), y0 = by - h * t[2], y1 = by - h * t[1], l = cx - tw / 2;
        c.fillStyle = i % 2 ? '#b85a32' : '#a84c2a'; c.fillRect(l, y0, tw, y1 - y0 + 1);
        c.fillStyle = 'rgba(40,10,5,0.28)'; c.fillRect(l + tw * 0.65, y0, tw * 0.35, y1 - y0 + 1);
        c.fillStyle = '#d08050'; c.fillRect(l, y0, tw, Math.max(1, w * 0.02));
      });
      A.blob(c, cx, by - h * 0.9, w * 0.2, w * 0.05, '#c46a3c');
    },
    bush(c, cx, by, w, v) {                                       // dry bush / tumbleweed
      const h = w * 0.633, cy = by - h * 0.45;
      A.shadow(c, cx, by, w * 0.4, 0.2);
      c.strokeStyle = v % 2 ? '#7a5a30' : '#8a6a3a'; c.lineWidth = Math.max(1, w * 0.025);
      c.beginPath(); c.ellipse(cx, cy, w * 0.34, h * 0.45, 0, 0, TAU); c.moveTo(cx + w * 0.22, cy); c.ellipse(cx, cy, w * 0.22, h * 0.3, 0.5, 0, TAU);
      c.moveTo(cx - w * 0.3, cy - h * 0.2); c.lineTo(cx + w * 0.3, cy + h * 0.2); c.moveTo(cx - w * 0.28, cy + h * 0.25); c.lineTo(cx + w * 0.28, cy - h * 0.25); c.moveTo(cx, cy - h * 0.45); c.lineTo(cx, cy + h * 0.45); c.stroke();
      c.fillStyle = 'rgba(140,110,60,0.35)'; c.beginPath(); c.ellipse(cx, cy, w * 0.3, h * 0.4, 0, 0, TAU); c.fill();
    },
    lamp: (c, x, y, w, v, dir) => A.lamp(c, x, y, w, dir, { pole: '#5a3a22', lamp: '#ffd27a', glow: '#ffb84a', glowR: 3, glowA: 0.6 }),
    sign: (c, x, y, w, v, dir) => A.chevron(c, x, y, w, dir, { post: '#4a2f1c', bg: '#7a4a28', border: '#f0dcb8', fg: '#f0dcb8' }),
    fx(c, W, H, t) {
      A.particles(c, W, H, t, { n: 22, seed: 5, size: [0.8, 1.4], vx: -90, vy: 3, sway: 0.7, amp: 5, colors: ['#f0d0a0'], alpha: 0.4, kind: 'streak' });
    }
  }));
})();
