/* Turbo Lap — theme base (TLQ1b): TL.makeTheme(spec) and the small drawing toolkit TL.art that every theme shares.
   Everything is canvas code (no image files), so it is sharp at any size. Plain script, loaded after core/render.js and
   before the theme files (assets/themes/*.js), which call TL.themes.register(TL.makeTheme({...})).

   Spec:
     id, name, blurb
     colors { light, dark, start }   road bands, each { road, grass, rumble, lane }  (start has lane: null)
     fog                              colour the distance fades into
     sky { top, bottom }              gradient over the top 60 % of the screen
     paintSky(c, W, H)                optional STATIC extras on the sky (stars, planets, clouds): cached
     celestial(c, W, H, R)            optional MOVING sun / moon (drawn every frame, cheap)
     layers [ { h, off, fill, paint(c, w, h, S) } ]   far -> near background layers, h = height as a fraction of the screen
                                      height, off = 'sky' | 'hill' | 'tree' (which parallax offset moves it), fill = colour
                                      under it. paint draws one periodic strip w = 2 x screen width wide, its ground line at
                                      y = h; the strips are pre-rendered into offscreen canvases and only redone when the size
                                      or the theme changes (so a rich skyline costs a few drawImage calls per frame).
     tree / bush / lamp / sign (ctx, cx, by, w, v, dir)   roadside objects from the SAME world SIZES as before; v = a stable
                                      per-object number (variety), dir = the way a lamp arm / chevron points
     fx(ctx, W, H, t, R)              optional ambient effect, deterministic from the clock (no Math.random)
   Coastline passes drawBackground itself (the original code, so it stays pixel-identical). */
window.TL = window.TL || {};
(() => {
  const CFG = TL.CFG, U = TL.util, SP = TL.sprites;
  const TAU = Math.PI * 2;
  const A = TL.art = { TAU, shade: SP.shade, rrect: SP.rrect };

  /** Stable pseudo-random 0..1 from a number (no state, no Math.random). */
  A.hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  /** A small seeded generator: const r = A.rng(7); r() -> 0..1. */
  A.rng = seed => { let s = (seed * 9301 + 49297) % 233280; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; };

  /** The original periodic ridge (u in 0..1 repeats). */
  A.ridge = (u, seed, rough) => 0.5 + 0.25 * Math.sin((u * 3 + seed) * TAU) + 0.15 * Math.sin((u * 7 + seed * 2) * TAU)
    + rough * 0.1 * Math.sin((u * 17 + seed * 3) * TAU);

  A.blob = (c, x, y, rx, ry, col) => { c.fillStyle = col; c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU); c.fill(); };
  A.tri = (c, x1, y1, x2, y2, x3, y3, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineTo(x3, y3); c.closePath(); c.fill(); };
  A.shadow = (c, cx, by, rw, a) => { c.fillStyle = 'rgba(0,0,0,' + (a || 0.22) + ')'; c.beginPath(); c.ellipse(cx, by, rw, Math.max(0.5, rw * 0.16), 0, 0, TAU); c.fill(); };
  /** Draw fn at x and, when the shape (span wide) crosses the strip's end, again one strip to the left: strips tile seamlessly. */
  A.wrap = (w, x, span, fn) => { fn(x); if (x + span > w) fn(x - w); };

  // Soft light sprites ('#rrggbb' -> a 64 px radial glow canvas), cached: a glow costs one drawImage, not a gradient per object.
  const glows = {};
  A.glowSprite = hex => {
    if (glows[hex]) return glows[hex];
    const n = parseInt(hex.slice(1), 16), cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32), rgb = (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
    g.addColorStop(0, 'rgba(' + rgb + ',1)'); g.addColorStop(0.25, 'rgba(' + rgb + ',0.55)'); g.addColorStop(1, 'rgba(' + rgb + ',0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    return (glows[hex] = cv);
  };
  A.glow = (c, hex, x, y, r, a) => {
    if (r < 1) return;
    c.globalAlpha = a == null ? 1 : a; c.drawImage(A.glowSprite(hex), x - r, y - r, r * 2, r * 2); c.globalAlpha = 1;
  };

  /** A periodic ridge polygon in a strip (w x h, ground line at y = h): the original ridge, scaled. */
  A.fillRidge = (c, w, h, o) => {
    c.fillStyle = o.color; c.beginPath(); c.moveTo(0, h + 2);
    const step = Math.max(4, w / 320), top = [];
    for (let x = 0; x <= w + step; x += step) {
      const y = h - h * A.ridge(x / w + (o.shift || 0), o.seed, o.rough) / (o.sc || 1.15);
      top.push([x, y]); c.lineTo(x, y);
    }
    c.lineTo(w, h + 2); c.closePath(); c.fill();
    if (o.cap) {                                            // paler peaks (snow caps, sunlit tops)
      c.fillStyle = o.cap; c.beginPath(); let inside = false;
      const peak = h - h * (o.capAt || 0.78) / (o.sc || 1.15);
      for (const [x, y] of top) {
        if (y < peak) { if (!inside) { c.moveTo(x, peak); inside = true; } c.lineTo(x, y); }
        else if (inside) { c.lineTo(x, peak); c.closePath(); inside = false; }
      }
      c.fill();
    }
  };

  /** Falling / drifting specks, deterministic from the clock t. o: n, seed, size [min,max], vx, vy (units per second at a
   *  500 px screen; negative vy rises), sway, colors [], kind 'dot' | 'leaf' | 'streak' | 'star', alpha. */
  A.particles = (c, W, H, t, o) => {
    const k = Math.min(W, H) / 500, cols = o.colors, nc = cols.length;
    c.save(); if (o.alpha != null) c.globalAlpha = o.alpha;
    for (let ci = 0; ci < nc; ci++) {
      c.fillStyle = cols[ci]; c.strokeStyle = cols[ci]; c.beginPath();
      for (let i = ci; i < o.n; i += nc) {
        const r1 = A.hash(i * 1.7 + o.seed), r2 = A.hash(i * 2.9 + o.seed + 5), r3 = A.hash(i * 4.3 + o.seed + 9);
        const sz = (o.size[0] + (o.size[1] - o.size[0]) * r3) * k, sp = 0.6 + 0.8 * r3;
        const x = U.mod(r1 * W + t * o.vx * k * sp + Math.sin(t * (o.sway || 1) + i * 3.1) * (o.amp || 0) * k, W);
        const y = U.mod(r2 * H + t * o.vy * k * sp, H);
        if (o.kind === 'leaf') {
          const rot = t * 1.4 + i * 2.1, ex = Math.cos(rot) * sz * 1.5, ey = Math.sin(rot) * sz * 1.5;
          c.moveTo(x + ex, y + ey); c.ellipse(x, y, sz * 1.5, sz * 0.7, rot, 0, TAU);
        } else if (o.kind === 'streak') { c.moveTo(x, y); c.lineTo(x + sz * 6, y + sz * 0.3); }
        else if (o.kind === 'star') {
          const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 5.3), s = sz * (0.4 + tw);
          c.moveTo(x, y - s * 1.8); c.lineTo(x + s * 0.4, y - s * 0.4); c.lineTo(x + s * 1.8, y); c.lineTo(x + s * 0.4, y + s * 0.4);
          c.lineTo(x, y + s * 1.8); c.lineTo(x - s * 0.4, y + s * 0.4); c.lineTo(x - s * 1.8, y); c.lineTo(x - s * 0.4, y - s * 0.4); c.closePath();
        } else { c.moveTo(x + sz, y); c.arc(x, y, sz, 0, TAU); }
      }
      if (o.kind === 'streak') { c.lineWidth = Math.max(1, 1.2 * k); c.stroke(); } else c.fill();
    }
    c.restore();
  };

  /** Where the sun / moon sits across the screen (moves with the sky parallax, exactly like the original sun). */
  A.skyX = (W, R, f) => U.mod((f == null ? 0.75 : f) - R.skyOffset * 2, 2) / 2 * W * 2 - W * 0.25;

  /** A lamp post like the original (same size and arm) in the theme's colours. o: pole, lamp, glow (hex) + glowR, head(c, x, y, w, dir). */
  A.lamp = (c, cx, by, w, dir, o) => {
    const h = w * SP.SIZES.lamp[1] / SP.SIZES.lamp[0], arm = w * 4 * dir;
    c.fillStyle = o.pole;
    c.fillRect(cx - w * 0.25, by - h, w * 0.5, h);
    c.fillRect(cx - w * 0.6, by - h * 0.06, w * 1.2, h * 0.06);
    c.strokeStyle = o.pole; c.lineWidth = Math.max(1, w * 0.35);
    c.beginPath(); c.moveTo(cx, by - h); c.quadraticCurveTo(cx + arm * 0.5, by - h * 1.04, cx + arm, by - h * 0.99); c.stroke();
    if (o.head) o.head(c, cx + arm, by - h * 0.985, w, dir, h);
    else { c.fillStyle = o.lamp; c.fillRect(cx + arm - w * 0.8 * dir, by - h * 0.985, w * 1.2 * dir, h * 0.025); }
    if (o.glow) A.glow(c, o.glow, cx + arm - w * 0.2 * dir, by - h * 0.975, w * (o.glowR || 3.2), o.glowA);
  };
  /** A chevron sign like the original (same size) in the theme's colours. o: post, bg, border, fg, glow (hex), top (snow cap colour). */
  A.chevron = (c, cx, by, w, dir, o) => {
    const h = w * SP.SIZES.signL[1] / SP.SIZES.signL[0];
    if (o.glow) A.glow(c, o.glow, cx, by - h * 0.75, w * 1.3, o.glowA || 0.55);
    c.fillStyle = o.post; c.fillRect(cx - w * 0.05, by - h * 0.55, w * 0.1, h * 0.55);
    c.fillStyle = o.bg; c.fillRect(cx - w / 2, by - h, w, h * 0.5);
    c.strokeStyle = o.border; c.lineWidth = Math.max(1, w * 0.04); c.strokeRect(cx - w / 2, by - h, w, h * 0.5);
    c.fillStyle = o.fg;
    for (let k = 0; k < 2; k++) {
      const ox = cx + (k - 0.5) * w * 0.38;
      c.beginPath();
      c.moveTo(ox - dir * w * 0.12, by - h * 0.92); c.lineTo(ox + dir * w * 0.12, by - h * 0.75);
      c.lineTo(ox - dir * w * 0.12, by - h * 0.58); c.lineTo(ox - dir * w * 0.02, by - h * 0.58);
      c.lineTo(ox + dir * w * 0.2, by - h * 0.75); c.lineTo(ox - dir * w * 0.02, by - h * 0.92); c.closePath(); c.fill();
    }
    if (o.top) { c.fillStyle = o.top; c.beginPath(); c.ellipse(cx, by - h, w * 0.5, h * 0.05, 0, Math.PI, TAU); c.fill(); }
  };
  /** A puffy cloud. */
  A.cloud = (c, x, y, s, col) => {
    c.fillStyle = col; c.beginPath();
    [[0, 0, 1], [-0.9, 0.2, 0.7], [0.95, 0.15, 0.75], [0.35, -0.35, 0.8], [-0.4, -0.25, 0.65]].forEach(p => { c.moveTo(x + p[0] * s + p[2] * s * 0.5, y + p[1] * s); c.ellipse(x + p[0] * s, y + p[1] * s, p[2] * s * 0.5, p[2] * s * 0.36, 0, 0, TAU); });
    c.fill();
  };
  /** A periodic skyline strip (buildings side by side, w wide, ground line at y = h). o: seed, color, minW, maxW, minH, maxH (of h),
   *  wins [colors] + winP (chance a window is lit), neon [colors] (glowing roof outline), antenna (colour of the roof lights). */
  A.skyline = (c, w, h, o) => {
    const r = A.rng(o.seed), cell = o.cell || 4;
    let x = 0;
    c.save();
    while (x < w - 1) {
      let bw = (o.minW + r() * (o.maxW - o.minW)) * h;
      if (x + bw > w - o.minW * h) bw = w - x;
      const bh = (o.minH + r() * (o.maxH - o.minH)) * h, y = h - bh;
      c.fillStyle = o.color; c.fillRect(x, y, bw, bh + 2);
      if (o.wins) {
        const cols = Math.floor((bw - 2) / cell), rows = Math.floor((bh - 3) / (cell * 1.5));
        for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
          if (r() > o.winP) continue;
          c.fillStyle = o.wins[(i * 3 + j * 5 + Math.floor(x)) % o.wins.length];
          c.fillRect(x + 2 + i * cell, y + 3 + j * cell * 1.5, cell * 0.55, cell * 0.8);
        }
      }
      if (o.neon && r() < 0.7) {
        const col = o.neon[Math.floor(r() * o.neon.length)];
        c.shadowColor = col; c.shadowBlur = 7; c.strokeStyle = col; c.lineWidth = 1.4; c.globalAlpha = 0.9;
        c.beginPath(); c.moveTo(x + 0.5, y + bh); c.lineTo(x + 0.5, y + 0.5); c.lineTo(x + bw - 0.5, y + 0.5); c.lineTo(x + bw - 0.5, y + bh); c.stroke();
        c.shadowBlur = 0; c.globalAlpha = 1;
      }
      if (o.antenna && r() < 0.35) {
        const ax = x + bw * (0.3 + r() * 0.4), ah = bh * 0.2 + 4;
        c.fillStyle = o.color; c.fillRect(ax - 0.6, y - ah, 1.2, ah);
        c.fillStyle = o.antenna; c.fillRect(ax - 1.4, y - ah - 1.5, 2.8, 2.8);
      }
      x += bw;
    }
    c.restore();
  };

  // ---- pre-rendered static layers ------------------------------------------------------------
  function paintSky(th, c, W, H) {
    const g = c.createLinearGradient(0, 0, 0, H * 0.6);
    g.addColorStop(0, th.sky.top); g.addColorStop(1, th.sky.bottom);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (th.paintSky) th.paintSky(c, W, H);
  }
  function makeCanvas(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; }
  function getCache(th, ctx, W, H) {
    const cw = ctx.canvas.width, ch = ctx.canvas.height, key = cw + 'x' + ch + '@' + W + 'x' + H;
    if (th._cache && th._cache.key === key) return th._cache;
    const s = cw / W, cache = th._cache = { key, s, layers: [] };
    cache.sky = makeCanvas(cw, ch);
    const sc = cache.sky.getContext('2d'); sc.setTransform(s, 0, 0, ch / H, 0, 0); paintSky(th, sc, W, H);
    th.layers.forEach(L => {
      const hl = L.h * H, tw = Math.ceil(2 * W * s), tp = Math.ceil(hl * s + 2), cv = makeCanvas(tw, tp), c = cv.getContext('2d');
      c.scale(s, s); L.paint(c, 2 * W, hl, { W, H });
      cache.layers.push(cv);
    });
    return cache;
  }

  /** Sky + celestial + layers behind the road. direct = true draws without the cache (picker previews, any canvas size). */
  function drawBackground(th, ctx, W, H, playerY, R, direct) {
    const lift = U.clamp(playerY / 8000, -1, 1.5) * H * 0.06, base = H * 0.5 + lift + 2;
    let cache = null;
    if (direct) paintSky(th, ctx, W, H);
    else { cache = getCache(th, ctx, W, H); ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(cache.sky, 0, 0); ctx.restore(); }
    if (th.celestial) th.celestial(ctx, W, H, R);
    th.layers.forEach((L, i) => {
      const hl = L.h * H, off = R[L.off === 'sky' ? 'skyOffset' : L.off === 'hill' ? 'hillOffset' : 'treeOffset'];
      if (L.fill && base < H) { ctx.fillStyle = L.fill; ctx.fillRect(0, base, W, H - base); }
      if (direct) {
        ctx.save(); ctx.beginPath(); ctx.rect(0, base - hl, W, hl + 2); ctx.clip();
        const sh = off * 2 * W;
        ctx.translate(-sh, base - hl); L.paint(ctx, 2 * W, hl, { W, H });
        ctx.translate(2 * W, 0); L.paint(ctx, 2 * W, hl, { W, H });
        ctx.restore();
      } else {
        const s = cache.s, cv = cache.layers[i], tw = cv.width, wp = ctx.canvas.width, sh = Math.round(off * 2 * W * s) % tw;
        const first = Math.min(wp, tw - sh), y = base - hl, hp = cv.height;
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
        const dy = Math.round(y * s);
        ctx.drawImage(cv, sh, 0, first, hp, 0, dy, first, hp);
        if (first < wp) ctx.drawImage(cv, 0, 0, wp - first, hp, first, dy, wp - first, hp);
        ctx.restore();
      }
    });
  }

  TL.makeTheme = spec => {
    const th = Object.assign({ layers: [], blurb: '', fx: null }, spec);
    const l = spec.colors.light;
    th.colors = { light: l, dark: spec.colors.dark, start: spec.colors.start || { road: '#ffffff', grass: l.grass, rumble: '#ffffff', lane: null } };
    th.drawBackground = spec.drawBackground || ((ctx, W, H, playerY, R, direct) => drawBackground(th, ctx, W, H, playerY, R, direct));
    return th;
  };

  /** The theme in miniature for the picker: the REAL background, a perspective road with the theme's colours, a few of its
   *  roadside objects, the player's car and its ambient effect, drawn into any canvas (W x H css px, transform already set). */
  TL.drawThemePreview = (ctx, th, W, H) => {
    const R = { skyOffset: 0.07, hillOffset: 0.2, treeOffset: 0.33 }, hz = H * 0.5, span = H - hz;
    th.drawBackground(ctx, W, H, 0, R, true);
    const col = th.colors, N = 14, yAt = k => hz + span * Math.pow(k / N, 2.1);
    const cxAt = y => W / 2 + Math.pow(1 - (y - hz) / span, 2) * W * 0.16;
    const rwAt = y => W * 0.46 * (y - hz) / span;
    ctx.fillStyle = col.light.grass; ctx.fillRect(0, hz, W, span);
    for (let k = N - 1; k >= 0; k--) {
      const y1 = yAt(k + 1), y2 = yAt(k), c = (Math.floor(k / 1) % 2) ? col.dark : col.light;
      const x1 = cxAt(y1), x2 = cxAt(y2), w1 = rwAt(y1), w2 = rwAt(y2), r1 = w1 * 0.16, r2 = w2 * 0.16;
      ctx.fillStyle = c.grass; ctx.fillRect(0, y2, W, y1 - y2 + 1);
      const poly = (a, b, d, e, f, g, h, i, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(d, e); ctx.lineTo(f, g); ctx.lineTo(h, i); ctx.closePath(); ctx.fill(); };
      poly(x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2, c.rumble);
      poly(x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2, c.rumble);
      poly(x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2, c.road);
      if (c.lane) for (let j = 1; j < 3; j++) { const t = j / 3, a = -1 + 2 * t, lw1 = w1 / 40, lw2 = w2 / 40;
        poly(x1 + a * w1 - lw1, y1, x1 + a * w1 + lw1, y1, x2 + a * w2 + lw2, y2, x2 + a * w2 - lw2, y2, c.lane); }
    }
    const fg = ctx.createLinearGradient(0, hz - span * 0.1, 0, hz + span * 0.22);
    fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.5, th.fog); fg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.45; ctx.fillStyle = fg; ctx.fillRect(0, hz - span * 0.1, W, span * 0.32); ctx.globalAlpha = 1;
    const put = (type, k, side, v) => {                                 // an object beside the road at band k (real size ratios)
      const y = yAt(k), rw = rwAt(y), w = rw * { tree: 0.45, bush: 0.3, lamp: 0.06, sign: 0.15 }[type];
      const x = cxAt(y) + side * rw * { tree: 1.9, bush: 1.5, lamp: 1.25, sign: 1.35 }[type];
      if (type === 'lamp') th.lamp(ctx, x, y, w, v, -side); else if (type === 'sign') th.sign(ctx, x, y, w, v, side); else th[type](ctx, x, y, w, v);
    };
    put('tree', 5, -1, 3); put('lamp', 8, 1, 1); put('bush', 8, -1, 2); put('sign', 10, 1, 4); put('tree', 11, 1, 6); put('bush', 12, -1, 5);
    SP.car(ctx, W / 2, H * 0.97, W * 0.2, TL.carSet.color(), { detail: false, accent: TL.carSet.accent(), t: 0 });
    if (th.fx) th.fx(ctx, W, H, 3.7, R);
  };
})();
