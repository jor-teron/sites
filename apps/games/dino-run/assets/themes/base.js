/**
 * Dino Run — theme base (plain script).
 *   DR.makeTheme(spec)  turns a theme spec (palette, background styles, obstacle sets, UI colours) into a theme
 *                       object with drawBackground / drawGround / drawFront / afterDino.
 *   DR.renderScene(ctx, th, S)  paints one whole frame (sky -> ground -> obstacles -> dino -> front -> bar).
 *                       The game and the picker previews both use it, so a preview is the real thing in miniature.
 *
 * Theme spec keys:
 *   id, name, blurb
 *   pal            colours: skyTop skyBottom cloud groundLine ground groundTick dino eye cactus bird birdWing
 *                  shieldRGB barBg barReady barCharging (+ extras the models read: rock coral ice sun far mid near vine gA gB)
 *   sceneryStyle / sunStyle / starStyle / cloudStyle / groundStyle / fxStyle   which background model style to use
 *   sunX, sunY     sun/moon position as a fraction of width / of ground height
 *   obstacles      { ground: [obstacle ids], air: [obstacle ids] } — variant = ids[o.v % ids.length]
 *   ui             CSS custom property overrides for the page chrome (bg, text, muted, accent, card, cardBorder, ...)
 *   pixel          N: render the scene at 1/N size, quantise to 4 greens, scale up with no smoothing
 *   neon           true: dino and obstacles are drawn as glowing outlines
 *   eyeGlow        colour: soft glow around the dino's eye
 */
(function () {
  const BASE_PAL = {
    skyTop: '#1a1e26', skyBottom: '#0c1016', cloud: 'rgba(255,255,255,0.08)', groundLine: '#5a6070',
    ground: '#161a22', groundTick: 'rgba(255,255,255,0.08)', dino: '#9aa0a6', eye: '#121418', cactus: '#6b9b5a',
    bird: '#9aa0a6', birdWing: '#7a8088', shieldRGB: '110,168,254', barBg: 'rgba(255,255,255,0.1)',
    barReady: '#6ea8fe', barCharging: '#3a4050',
  };

  DR.makeTheme = function (spec) {
    const th = Object.assign({
      obstacles: { ground: ['cactus'], air: ['bird'] }, ui: {}, sceneryStyle: null, sunStyle: null, starStyle: null,
      cloudStyle: 'puff', groundStyle: 'ticks', fxStyle: null, pixel: 0, neon: false, eyeGlow: null,
    }, spec);
    th.pal = Object.assign({}, BASE_PAL, spec.pal);
    th.drawBackground = spec.drawBackground || function (c, e) {
      const g = c.createLinearGradient(0, 0, 0, e.H);
      g.addColorStop(0, this.pal.skyTop);
      g.addColorStop(1, this.pal.skyBottom);
      c.fillStyle = g;
      c.fillRect(0, 0, e.W, e.H);
      DR.bg.stars.draw(c, e, this);
      DR.bg.sunmoon.draw(c, e, this);
      DR.bg.scenery.draw(c, e, this);
      DR.bg.clouds.draw(c, e, this);
    };
    th.drawGround = spec.drawGround || function (c, e) { DR.bg.ground.draw(c, e, this); };
    th.drawFront = spec.drawFront || function (c, e) { DR.bg.particles.draw(c, e, this); };
    th.afterDino = spec.afterDino || function (c, d, e, model) {
      if (!this.eyeGlow || d.pose === 'dead') return;
      const p = model.eye(d), x = d.x + p[0], y = d.y + p[1], r = 14 + Math.sin(e.clock * 3) * 1.5;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, DRX.alpha(this.eyeGlow, 0.85)); g.addColorStop(1, DRX.alpha(this.eyeGlow, 0));
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    };
    return th;
  };

  /** Obstacle model for o under theme th (variants cycle by o.v, no randomness). */
  DR.obstacleModel = function (th, o) {
    const ids = (o.type === 'cactus' ? th.obstacles.ground : th.obstacles.air);
    return DR.obstacles[ids[(o.v || 0) % ids.length]] || DR.obstacles[o.type === 'cactus' ? 'cactus' : 'bird'];
  };

  /** Neon: wraps a context so every fill() becomes a glowing outline over a dark fill. */
  function brightness(col) {
    const m = /^#([0-9a-f]{6})$/i.exec(col);
    let r, g, b;
    if (m) { const n = parseInt(m[1], 16); r = n >> 16; g = (n >> 8) & 255; b = n & 255; }
    else { const k = /rgba?\(([^)]+)\)/.exec(col); if (!k) return null; const p = k[1].split(',').map(Number); r = p[0]; g = p[1]; b = p[2]; }
    return { r, g, b, lum: 0.299 * r + 0.587 * g + 0.114 * b };
  }
  function neonWrap(c) {
    const glow = (t) => {
      const fs = t.fillStyle, b = typeof fs === 'string' ? brightness(fs) : null;
      let col = '#22e6ff';
      if (b) {
        if (b.lum < 70) { t.save(); t.fillStyle = '#ff7af5'; t.fill(); t.restore(); return; }   // dark details (eyes) -> solid bright
        col = DRX.mix('#' + ((1 << 24) | (b.r << 16) | (b.g << 8) | b.b).toString(16).slice(1), '#ffffff', 0.25);
      }
      t.save();
      t.fillStyle = 'rgba(6,2,22,0.88)'; t.fill();
      t.shadowColor = col; t.shadowBlur = 9; t.strokeStyle = col; t.lineWidth = 1.6; t.lineJoin = 'round'; t.stroke();
      t.restore();
    };
    return new Proxy(c, {
      get(t, k) {
        if (k === 'fill') return function () { glow(t); };
        if (k === 'fillRect') return function (x, y, w, h) { t.beginPath(); t.rect(x, y, w, h); glow(t); };
        const v = t[k];
        return typeof v === 'function' ? v.bind(t) : v;
      },
      set(t, k, v) { t[k] = v; return true; },
    });
  }

  let off = null, offCtx = null, off2 = null, off2Ctx = null;
  const GB = [[15, 56, 15], [48, 98, 48], [139, 172, 15], [155, 188, 15]];

  /** Paints a whole frame. S = { env, model (dino), d, obstacles, blink, bar: {frac, ready} | null, pixelN? } */
  DR.renderScene = function (ctx, th, S) {
    const e = S.env, P = th.pal;
    const paintBack = (c) => { th.drawBackground(c, e); th.drawGround(c, e); };
    const paintFront = (c) => {
      for (const o of S.obstacles) DR.obstacleModel(th, o).draw(th.neon ? neonWrap(c) : c, o, e, th);
      S.model.draw(th.neon ? neonWrap(c) : c, S.d, th);
      if (S.d.shield) DRX.shield(c, S.d, P.shieldRGB, S.blink);
      th.afterDino(c, S.d, e, S.model);
      th.drawFront(c, e);
    };
    const paintBar = (c) => {
      if (!S.bar) return;
      c.fillStyle = P.barBg; c.fillRect(14, 14, 60, 4);
      c.fillStyle = S.bar.ready ? P.barReady : P.barCharging; c.fillRect(14, 14, 60 * S.bar.frac, 4);
    };
    const N = S.pixelN || th.pixel;
    if (!N) { paintBack(ctx); paintFront(ctx); paintBar(ctx); return; }
    // Pixel 8-bit: the backdrop is snapped to the 4 greens by luminance; the dino and obstacles are drawn on their own
    // layer and snapped to the darkest / lightest green only (hard edges), so every hero reads clearly on any backdrop.
    const ow = Math.max(1, Math.ceil(e.W / N)), oh = Math.max(1, Math.ceil(e.H / N));
    if (!off) {
      off = document.createElement('canvas'); offCtx = off.getContext('2d', { willReadFrequently: true });
      off2 = document.createElement('canvas'); off2Ctx = off2.getContext('2d', { willReadFrequently: true });
    }
    for (const cv of [off, off2]) if (cv.width !== ow || cv.height !== oh) { cv.width = ow; cv.height = oh; }
    offCtx.setTransform(1 / N, 0, 0, 1 / N, 0, 0);
    offCtx.imageSmoothingEnabled = false;
    paintBack(offCtx);
    offCtx.setTransform(1, 0, 0, 1, 0, 0);
    off2Ctx.setTransform(1, 0, 0, 1, 0, 0);
    off2Ctx.clearRect(0, 0, ow, oh);
    off2Ctx.setTransform(1 / N, 0, 0, 1 / N, 0, 0);
    paintFront(off2Ctx);
    off2Ctx.setTransform(1, 0, 0, 1, 0, 0);
    const img = offCtx.getImageData(0, 0, ow, oh), px = img.data;
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2], g = GB[Math.min(3, (lum / 64) | 0)];
      px[i] = g[0]; px[i + 1] = g[1]; px[i + 2] = g[2]; px[i + 3] = 255;
    }
    const img2 = off2Ctx.getImageData(0, 0, ow, oh), p2 = img2.data;
    for (let i = 0; i < p2.length; i += 4) {
      if (p2[i + 3] < 90) { p2[i + 3] = 0; continue; }
      const lum = 0.299 * p2[i] + 0.587 * p2[i + 1] + 0.114 * p2[i + 2], g = lum < 175 ? GB[0] : GB[3];
      p2[i] = g[0]; p2[i + 1] = g[1]; p2[i + 2] = g[2]; p2[i + 3] = 255;
    }
    // 1px outline (in layer pixels): dark shapes get a light halo and light shapes a dark one, so a hero never melts into the backdrop.
    const src = new Uint8ClampedArray(p2);
    const idx = (x, y) => (y * ow + x) * 4;
    for (let y = 0; y < oh; y++) for (let x = 0; x < ow; x++) {
      const i = idx(x, y);
      if (src[i + 3]) continue;
      let n = -1;
      if (x > 0 && src[idx(x - 1, y) + 3]) n = idx(x - 1, y);
      else if (x < ow - 1 && src[idx(x + 1, y) + 3]) n = idx(x + 1, y);
      else if (y > 0 && src[idx(x, y - 1) + 3]) n = idx(x, y - 1);
      else if (y < oh - 1 && src[idx(x, y + 1) + 3]) n = idx(x, y + 1);
      if (n < 0) continue;
      const g = src[n] < 100 ? GB[3] : GB[0];
      p2[i] = g[0]; p2[i + 1] = g[1]; p2[i + 2] = g[2]; p2[i + 3] = 255;
    }
    offCtx.putImageData(img, 0, 0);
    off2Ctx.putImageData(img2, 0, 0);
    offCtx.drawImage(off2, 0, 0);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, ow * N, oh * N);
    ctx.restore();
    paintBar(ctx);
  };
})();
