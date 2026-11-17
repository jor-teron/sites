/*
 * Hub Live Wallpaper engine (hub/drives/hub_live_wallpaper.js)
 * Procedural HTML5 Canvas desktop background engine.
 *
 * // Known bug / Won't fix:   (before H158)
 * //   - Desktop shell canvas (#hub-live-canvas) remains static in browser environments despite
 * //     Settings card previews animating. Tracked as known limitation; do not fix.
 * H158: desktop live wallpaper keeps animating on an empty desktop (same-id set() no longer
 *   resets state; the loop marks itself paused when it should stop, so checkState can resume;
 *   maximised windows still pause, except on the other workspace).
 *
 * Presets:
 *   - live:aurora        Harmonic flowing color ribbons over a cached teal-to-indigo sky (H158b: slower waves)
 *   - live:constellation Sparse cyan stars with a soft blue haze, thin links and faint triangles (H158b)
 *   // - live:circadian     24-hour diurnal dynamic sky with drifting atmospheric clouds   (before H158b)
 *   - live:rain          Rain on glass: soft drops sliding down a blurred blue-grey pane (H158b)
 *   - live:lava          Lava flow: warm blobs slowly merging on a downscaled buffer (H158b)
 *   - live:geo           Geometric drift: a muted hex grid with a slow colour wave (H158b)
 *
 * Governance & Performance:
 *   - 30 FPS cap via timestamp delta in requestAnimationFrame
 *   - Auto-pause on tab hidden, screen locked (hub-locked), or break locked (hub-break)
 *   - Settings live preview attachment via attachPreview(canvasEl, id)
 *   // - Accessibility: respects prefers-reduced-motion and sites-hub.motion ('reduced' / 'off')
 *   //   by drawing a single static frame and stopping animation   (before H158a)
 *   - Accessibility: only the OS setting prefers-reduced-motion: reduce draws a still frame.
 *     Hub Motion Off / Reduced (html.hub-motion-off / hub-motion-reduced) does not freeze live wallpapers (H158a).
 *   - H158b: cached backgrounds / glow sprites, no per-frame ctx.filter or shadowBlur, small canvases use fewer items
 */
(function () {
  'use strict';

  // H158b: offscreen cache for static backgrounds / sprites (redraw only when size changes)
  function makeOffscreen(w, h) {
    w = Math.max(1, w | 0);
    h = Math.max(1, h | 0);
    let c = null;
    try {
      if (typeof document !== 'undefined' && document.createElement) c = document.createElement('canvas');
    } catch (_) { c = null; }
    if (!c) c = { width: w, height: h, getContext: function () { return null; } };
    c.width = w;
    c.height = h;
    return c;
  }
  function cacheCanvas(state, key, w, h, paint) {
    let c = state[key];
    if (!c || c.width !== w || c.height !== h) {
      c = makeOffscreen(w, h);
      const x = c.getContext && c.getContext('2d');
      if (x) paint(x, w, h);
      state[key] = c;
    }
    return c;
  }
  function blit(ctx, canvas, w, h) {
    if (!ctx || !canvas) return;
    try { ctx.drawImage(canvas, 0, 0, w, h); } catch (_) { /* stub ctx in tests */ }
  }

  // Procedural presets
  const PRESETS = {
    'live:aurora': {
      id: 'live:aurora',
      name: 'Aurora waves',
      desc: 'Slow harmonic ribbons over a teal-to-indigo sky',
      color: '#071525',
      init(state, w, h) {
        state.t = 0;
        state.stars = [];
        const isSmall = Math.min(w, h) < 150;
        const count = isSmall ? 10 : 28;
        for (let i = 0; i < count; i++) {
          state.stars.push({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.3,
            vy: (Math.random() * 0.3 + 0.15),
            r: Math.random() * 1.4 + 0.5,
            alpha: Math.random() * 0.55 + 0.25
          });
        }
      },
      render(ctx, w, h, state) {
        // state.t += 0.035; // smooth, vibrant undulating flow   (before H158b)
        state.t += 0.012; // H158b: about one third of the previous wave speed
        const bg = cacheCanvas(state, 'bg', w, h, (g, gw, gh) => {
          const grd = g.createLinearGradient(0, 0, 0, gh);
          grd.addColorStop(0, '#04151c');
          grd.addColorStop(0.4, '#0a3d45');
          grd.addColorStop(0.75, '#1a1c52');
          grd.addColorStop(1, '#1b1540');
          g.fillStyle = grd;
          g.fillRect(0, 0, gw, gh);
          const haze = g.createRadialGradient(gw * 0.5, gh * 0.7, 0, gw * 0.5, gh * 0.7, Math.max(gw, gh) * 0.55);
          haze.addColorStop(0, 'rgba(20, 80, 110, 0.35)');
          haze.addColorStop(1, 'rgba(10, 16, 40, 0)');
          g.fillStyle = haze;
          g.fillRect(0, 0, gw, gh);
        });
        blit(ctx, bg, w, h);

        const ribbons = [
          { color: 'rgba(14, 165, 233, 0.26)', yBase: h * 0.42, amp: h * 0.15, freq: 0.003, speed: 1.2 },
          { color: 'rgba(16, 185, 129, 0.24)', yBase: h * 0.52, amp: h * 0.18, freq: 0.0025, speed: 1.0 },
          { color: 'rgba(99, 102, 241, 0.22)', yBase: h * 0.62, amp: h * 0.14, freq: 0.0035, speed: 1.4 },
          { color: 'rgba(236, 72, 153, 0.18)', yBase: h * 0.48, amp: h * 0.12, freq: 0.004, speed: 0.8 }
        ];

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let r = 0; r < ribbons.length; r++) {
          const rib = ribbons[r];
          ctx.beginPath();
          ctx.moveTo(0, h);
          const step = Math.min(w, h) < 150 ? 6 : 10;
          for (let x = 0; x <= w; x += step) {
            const y = rib.yBase + Math.sin(x * rib.freq + state.t * rib.speed) * rib.amp
                                + Math.sin(x * rib.freq * 0.6 + state.t * rib.speed * 0.7) * (rib.amp * 0.5);
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.closePath();
          ctx.fillStyle = rib.color;
          ctx.fill();
        }

        if (state.stars) {
          for (let i = 0; i < state.stars.length; i++) {
            const s = state.stars[i];
            s.x += s.vx + Math.sin(state.t * 0.5 + i) * 0.12;
            s.y -= s.vy;
            if (s.x < 0) s.x = w; else if (s.x > w) s.x = 0;
            if (s.y < 0) s.y = h;
            const a = s.alpha * (0.65 + Math.sin(state.t * 0.85 + i) * 0.35);
            ctx.fillStyle = 'rgba(180, 240, 255, ' + Math.max(0.1, Math.min(1, a)).toFixed(2) + ')';
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
    },

    'live:constellation': {
      id: 'live:constellation',
      name: 'Constellation',
      desc: 'Sparse cyan stars with thin links on a soft blue haze',
      color: '#1b2560',
      init(state, w, h) {
        state.t = 0;
        state.stars = [];
        const isSmall = Math.min(w, h) < 150;
        const count = isSmall ? 7 : 18;
        for (let i = 0; i < count; i++) {
          state.stars.push({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * (isSmall ? 0.08 : 0.14),
            vy: (Math.random() - 0.5) * (isSmall ? 0.08 : 0.14),
            r: Math.random() * 1.1 + 1.1,
            pulse: Math.random() * Math.PI * 2,
            pulseSpeed: Math.random() * 0.018 + 0.01
          });
        }
        const spr = 48;
        state.glow = makeOffscreen(spr, spr);
        const gctx = state.glow.getContext && state.glow.getContext('2d');
        if (gctx) {
          const cx = spr / 2, R = spr / 2 - 1;
          const grd = gctx.createRadialGradient(cx, cx, 0, cx, cx, R);
          grd.addColorStop(0, 'rgba(210, 250, 255, 0.95)');
          grd.addColorStop(0.12, 'rgba(160, 230, 255, 0.55)');
          grd.addColorStop(0.38, 'rgba(80, 190, 255, 0.16)');
          grd.addColorStop(1, 'rgba(40, 100, 200, 0)');
          gctx.fillStyle = grd;
          gctx.fillRect(0, 0, spr, spr);
          gctx.beginPath();
          gctx.arc(cx, cx, 5.2, 0, Math.PI * 2);
          gctx.strokeStyle = 'rgba(190, 240, 255, 0.85)';
          gctx.lineWidth = 1.2;
          gctx.stroke();
        }
      },
      render(ctx, w, h, state) {
        state.t += 1;
        const bg = cacheCanvas(state, 'bg', w, h, (g, gw, gh) => {
          g.fillStyle = '#1b2560';
          g.fillRect(0, 0, gw, gh);
          const haze = g.createRadialGradient(gw * 0.5, gh * 0.72, gw * 0.05, gw * 0.5, gh * 0.62, Math.max(gw, gh) * 0.7);
          haze.addColorStop(0, 'rgba(63, 85, 168, 0.95)');
          haze.addColorStop(0.45, 'rgba(50, 70, 150, 0.45)');
          haze.addColorStop(1, 'rgba(27, 37, 96, 0)');
          g.fillStyle = haze;
          g.fillRect(0, 0, gw, gh);
        });
        blit(ctx, bg, w, h);

        const stars = state.stars;
        if (!stars || !stars.length) return;
        const isSmall = Math.min(w, h) < 150;
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          s.x += s.vx;
          s.y += s.vy;
          if (s.x < 0) s.x = w; else if (s.x > w) s.x = 0;
          if (s.y < 0) s.y = h; else if (s.y > h) s.y = 0;
        }

        const maxDist = isSmall ? 52 : Math.max(120, Math.min(180, Math.round(Math.sqrt(w * h) * 0.13)));
        const links = [];
        for (let i = 0; i < stars.length; i++) {
          for (let j = i + 1; j < stars.length; j++) {
            const dx = stars[i].x - stars[j].x, dy = stars[i].y - stars[j].y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < maxDist) links.push([i, j, d]);
          }
        }
        const near = {};
        for (let k = 0; k < links.length; k++) {
          const a = links[k][0], b = links[k][1];
          if (!near[a]) near[a] = {};
          if (!near[b]) near[b] = {};
          near[a][b] = true;
          near[b][a] = true;
        }
        ctx.fillStyle = 'rgba(140, 210, 255, 0.055)';
        for (let i = 0; i < stars.length; i++) {
          const nb = near[i];
          if (!nb) continue;
          const ids = [];
          for (const k in nb) ids.push(+k);
          for (let a = 0; a < ids.length; a++) {
            for (let b = a + 1; b < ids.length; b++) {
              if (ids[b] > i && near[ids[a]] && near[ids[a]][ids[b]]) {
                ctx.beginPath();
                ctx.moveTo(stars[i].x, stars[i].y);
                ctx.lineTo(stars[ids[a]].x, stars[ids[a]].y);
                ctx.lineTo(stars[ids[b]].x, stars[ids[b]].y);
                ctx.closePath();
                ctx.fill();
              }
            }
          }
        }
        ctx.lineWidth = isSmall ? 0.7 : 1;
        ctx.strokeStyle = 'rgba(170, 230, 255, 0.42)';
        for (let k = 0; k < links.length; k++) {
          const a = stars[links[k][0]], b = stars[links[k][1]];
          const fade = 1 - links[k][2] / maxDist;
          ctx.globalAlpha = 0.25 + fade * 0.55;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        const glow = state.glow;
        const gs = glow ? glow.width : 48;
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          const pulse = 0.72 + Math.sin(state.t * s.pulseSpeed + s.pulse) * 0.28;
          const size = gs * (0.55 + s.r * 0.12) * (isSmall ? 0.7 : 1);
          if (glow) {
            ctx.globalAlpha = pulse;
            try { ctx.drawImage(glow, s.x - size / 2, s.y - size / 2, size, size); } catch (_) { /* stub */ }
            ctx.globalAlpha = 1;
          }
          ctx.fillStyle = 'rgba(230, 255, 255, ' + (0.85 + pulse * 0.15).toFixed(2) + ')';
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 0.7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },

    'live:rain': {
      id: 'live:rain',
      name: 'Rain on glass',
      desc: 'Soft drops sliding down a blurred blue-grey pane',
      color: '#2a3540',
      init(state, w, h) {
        state.t = 0;
        const isSmall = Math.min(w, h) < 150;
        const count = isSmall ? 12 : 42;
        state.drops = [];
        for (let i = 0; i < count; i++) {
          state.drops.push({
            x: Math.random() * w,
            y: Math.random() * h,
            len: (Math.random() * 10 + 8) * (isSmall ? 0.6 : 1),
            speed: (Math.random() * 1.4 + 0.9) * (isSmall ? 0.7 : 1),
            width: Math.random() * 1.1 + 0.7,
            alpha: Math.random() * 0.35 + 0.25
          });
        }
      },
      render(ctx, w, h, state) {
        state.t += 1;
        const isSmall = Math.min(w, h) < 150;
        const bg = cacheCanvas(state, 'bg', w, h, (g, gw, gh) => {
          // Draw a soft gradient at half size, then scale up for a cheap blur
          const sw = Math.max(1, gw >> 1), sh = Math.max(1, gh >> 1);
          const tmp = makeOffscreen(sw, sh);
          const t = tmp.getContext && tmp.getContext('2d');
          if (t) {
            const grd = t.createLinearGradient(0, 0, 0, sh);
            grd.addColorStop(0, '#3a4a58');
            grd.addColorStop(0.45, '#2c3a48');
            grd.addColorStop(1, '#1c2832');
            t.fillStyle = grd;
            t.fillRect(0, 0, sw, sh);
            const haze = t.createRadialGradient(sw * 0.4, sh * 0.25, 0, sw * 0.4, sh * 0.3, Math.max(sw, sh) * 0.6);
            haze.addColorStop(0, 'rgba(160, 185, 205, 0.28)');
            haze.addColorStop(1, 'rgba(40, 50, 60, 0)');
            t.fillStyle = haze;
            t.fillRect(0, 0, sw, sh);
            g.imageSmoothingEnabled = true;
            try { g.drawImage(tmp, 0, 0, gw, gh); } catch (_) { g.fillStyle = '#2a3540'; g.fillRect(0, 0, gw, gh); }
          } else {
            g.fillStyle = '#2a3540';
            g.fillRect(0, 0, gw, gh);
          }
        });
        blit(ctx, bg, w, h);

        const drops = state.drops;
        if (!drops) return;
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(210, 225, 235, 0.55)';
        for (let i = 0; i < drops.length; i++) {
          const d = drops[i];
          d.y += d.speed;
          if (d.y - d.len > h) {
            d.y = -d.len;
            d.x = Math.random() * w;
          }
          ctx.globalAlpha = d.alpha;
          ctx.lineWidth = d.width;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y - d.len);
          ctx.lineTo(d.x, d.y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        // Occasional merge: if two calm drops share a column, keep the faster one and respawn the other
        if (!isSmall && (state.t % 45) === 0) {
          for (let i = 0; i < drops.length; i++) {
            for (let j = i + 1; j < drops.length; j++) {
              const a = drops[i], b = drops[j];
              if (Math.abs(a.x - b.x) < 3 && Math.abs(a.y - b.y) < 18) {
                const keep = a.speed >= b.speed ? a : b;
                const drop = keep === a ? b : a;
                keep.len = Math.min(22, keep.len + 2);
                keep.alpha = Math.min(0.7, keep.alpha + 0.08);
                drop.y = -drop.len;
                drop.x = Math.random() * w;
              }
            }
          }
        }
      }
    },

    'live:lava': {
      id: 'live:lava',
      name: 'Lava flow',
      desc: 'Warm blobs slowly merging and splitting',
      color: '#2a0a12',
      init(state, w, h) {
        state.t = 0;
        const isSmall = Math.min(w, h) < 150;
        const count = isSmall ? 4 : 7;
        const pal = ['#e85d12', '#f07828', '#e04d7a', '#c43a90', '#8a2a9a', '#d94a2a'];
        state.blobs = [];
        for (let i = 0; i < count; i++) {
          const r = (isSmall ? 28 : 90) * (0.55 + Math.random() * 0.7);
          state.blobs.push({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.35,
            vy: (Math.random() - 0.5) * 0.3,
            r: r,
            color: pal[i % pal.length]
          });
        }
      },
      render(ctx, w, h, state) {
        state.t += 1;
        const blobs = state.blobs;
        if (!blobs) return;
        for (let i = 0; i < blobs.length; i++) {
          const b = blobs[i];
          b.x += b.vx;
          b.y += b.vy;
          if (b.x < -b.r) b.x = w + b.r; else if (b.x > w + b.r) b.x = -b.r;
          if (b.y < -b.r) b.y = h + b.r; else if (b.y > h + b.r) b.y = -b.r;
        }
        // Cheap split / merge: push overlapping blobs apart slightly, and slowly breathe radius
        for (let i = 0; i < blobs.length; i++) {
          blobs[i].r += Math.sin(state.t * 0.012 + i) * 0.12;
          for (let j = i + 1; j < blobs.length; j++) {
            const a = blobs[i], b = blobs[j];
            const dx = b.x - a.x, dy = b.y - a.y;
            const d = Math.sqrt(dx * dx + dy * dy) || 1;
            const min = (a.r + b.r) * 0.55;
            if (d < min) {
              const push = (min - d) * 0.004;
              a.vx -= (dx / d) * push;
              a.vy -= (dy / d) * push;
              b.vx += (dx / d) * push;
              b.vy += (dy / d) * push;
            }
          }
        }

        const scale = Math.min(w, h) < 150 ? 3 : 4;
        const sw = Math.max(1, Math.round(w / scale)), sh = Math.max(1, Math.round(h / scale));
        let buf = state.buf;
        if (!buf || buf.width !== sw || buf.height !== sh) {
          buf = makeOffscreen(sw, sh);
          state.buf = buf;
        }
        const g = buf.getContext && buf.getContext('2d');
        if (g) {
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.globalCompositeOperation = 'source-over';
          g.fillStyle = '#1a060c';
          g.fillRect(0, 0, sw, sh);
          g.globalCompositeOperation = 'lighter';
          const sx = sw / w, sy = sh / h;
          for (let i = 0; i < blobs.length; i++) {
            const b = blobs[i];
            const cx = b.x * sx, cy = b.y * sy, r = b.r * Math.max(sx, sy);
            const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
            grd.addColorStop(0, b.color);
            grd.addColorStop(0.45, b.color);
            grd.addColorStop(1, 'rgba(0,0,0,0)');
            g.fillStyle = grd;
            g.beginPath();
            g.arc(cx, cy, r, 0, Math.PI * 2);
            g.fill();
          }
          g.globalCompositeOperation = 'source-over';
          ctx.imageSmoothingEnabled = true;
          try { ctx.drawImage(buf, 0, 0, w, h); } catch (_) {
            ctx.fillStyle = '#2a0a12';
            ctx.fillRect(0, 0, w, h);
          }
        } else {
          ctx.fillStyle = '#2a0a12';
          ctx.fillRect(0, 0, w, h);
        }
      }
    },

    'live:geo': {
      id: 'live:geo',
      name: 'Geometric drift',
      desc: 'A muted hex grid with a slow colour wave',
      color: '#1a2a28',
      init(state, w, h) {
        state.t = 0;
      },
      render(ctx, w, h, state) {
        state.t += 0.018;
        const isSmall = Math.min(w, h) < 150;
        const size = isSmall ? 16 : 34;
        const hexW = size * 1.732;
        const hexH = size * 1.5;
        ctx.fillStyle = '#152422';
        ctx.fillRect(0, 0, w, h);
        const cols = Math.ceil(w / hexW) + 2;
        const rows = Math.ceil(h / hexH) + 2;
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const cx = col * hexW + (row % 2 ? hexW * 0.5 : 0) - size;
            const cy = row * hexH - size * 0.2;
            const wave = 0.5 + 0.5 * Math.sin(col * 0.45 + row * 0.38 + state.t);
            const r = Math.round(45 + (194 - 45) * wave);
            const g = Math.round(92 + (180 - 92) * wave);
            const b = Math.round(90 + (154 - 90) * wave);
            ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
            ctx.beginPath();
            for (let k = 0; k < 6; k++) {
              const a = (Math.PI / 180) * (60 * k - 30);
              const px = cx + size * 0.92 * Math.cos(a);
              const py = cy + size * 0.92 * Math.sin(a);
              if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
          }
        }
      }
    }
  };


  /* (before H158b) previous Aurora / Constellation / Circadian presets:
    'live:aurora': {
      id: 'live:aurora',
      name: 'Aurora waves',
      desc: 'Flowing harmonic color ribbons',
      color: '#081426',
      init(state, w, h) {
        state.t = 0;
        state.stars = [];
        const isSmall = Math.min(w, h) < 150;
        const count = isSmall ? 15 : 45;
        for (let i = 0; i < count; i++) {
          state.stars.push({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.5,
            vy: (Math.random() * 0.5 + 0.25),
            r: Math.random() * 1.5 + 0.6,
            alpha: Math.random() * 0.6 + 0.3
          });
        }
      },
      render(ctx, w, h, state) {
        state.t += 0.035; // smooth, vibrant undulating flow
        ctx.fillStyle = '#050c18';
        ctx.fillRect(0, 0, w, h);

        const ribbons = [
          { color: 'rgba(14, 165, 233, 0.26)', yBase: h * 0.42, amp: h * 0.15, freq: 0.003, speed: 1.2 },
          { color: 'rgba(16, 185, 129, 0.24)', yBase: h * 0.52, amp: h * 0.18, freq: 0.0025, speed: 1.0 },
          { color: 'rgba(99, 102, 241, 0.22)', yBase: h * 0.62, amp: h * 0.14, freq: 0.0035, speed: 1.4 },
          { color: 'rgba(236, 72, 153, 0.18)', yBase: h * 0.48, amp: h * 0.12, freq: 0.004, speed: 0.8 }
        ];

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let r = 0; r < ribbons.length; r++) {
          const rib = ribbons[r];
          ctx.beginPath();
          ctx.moveTo(0, h);
          const step = Math.min(w, h) < 150 ? 6 : 10;
          for (let x = 0; x <= w; x += step) {
            const y = rib.yBase + Math.sin(x * rib.freq + state.t * rib.speed) * rib.amp
                                + Math.sin(x * rib.freq * 0.6 + state.t * rib.speed * 0.7) * (rib.amp * 0.5);
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.closePath();
          ctx.fillStyle = rib.color;
          ctx.fill();
        }

        // Drifting shimmer dust with swaying drift
        if (state.stars) {
          for (let i = 0; i < state.stars.length; i++) {
            const s = state.stars[i];
            s.x += s.vx + Math.sin(state.t * 1.5 + i) * 0.25;
            s.y -= s.vy;
            if (s.x < 0) s.x = w; else if (s.x > w) s.x = 0;
            if (s.y < 0) s.y = h;
            const a = s.alpha * (0.65 + Math.sin(state.t * 2.5 + i) * 0.35);
            ctx.fillStyle = 'rgba(180, 240, 255, ' + Math.max(0.1, Math.min(1, a)).toFixed(2) + ')';
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
    },

    'live:constellation': {
      id: 'live:constellation',
      name: 'Constellation',
      desc: 'Floating stars with proximity line links',
      color: '#0a0d14',
      init(state, w, h) {
        state.stars = [];
        const isSmall = Math.min(w, h) < 150;
        const count = isSmall ? 18 : Math.max(45, Math.min(95, Math.round((w * h) / 18000)));
        for (let i = 0; i < count; i++) {
          state.stars.push({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * (isSmall ? 0.6 : 0.95),
            vy: (Math.random() - 0.5) * (isSmall ? 0.6 : 0.95),
            r: Math.random() * 1.6 + 1.2,
            baseAlpha: Math.random() * 0.5 + 0.45,
            pulseSpeed: Math.random() * 0.05 + 0.025
          });
        }
        state.t = 0;
      },
      render(ctx, w, h, state) {
        state.t += 1;
        ctx.fillStyle = '#080b12';
        ctx.fillRect(0, 0, w, h);

        const stars = state.stars;
        if (!stars || !stars.length) return;

        const isSmall = Math.min(w, h) < 150;
        // Position update
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          s.x += s.vx;
          s.y += s.vy;
          if (s.x < 0) s.x = w; else if (s.x > w) s.x = 0;
          if (s.y < 0) s.y = h; else if (s.y > h) s.y = 0;
        }

        // Proximity lines
        const maxDist = isSmall ? 40 : Math.max(110, Math.min(160, Math.round(Math.sqrt(w * h) * 0.11)));
        ctx.lineWidth = isSmall ? 0.8 : 1;
        for (let i = 0; i < stars.length; i++) {
          const s1 = stars[i];
          for (let j = i + 1; j < stars.length; j++) {
            const s2 = stars[j];
            const dx = s1.x - s2.x;
            const dy = s1.y - s2.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < maxDist) {
              const alpha = (1 - d / maxDist) * 0.35;
              ctx.strokeStyle = 'rgba(165, 215, 255, ' + alpha.toFixed(3) + ')';
              ctx.beginPath();
              ctx.moveTo(s1.x, s1.y);
              ctx.lineTo(s2.x, s2.y);
              ctx.stroke();
            }
          }
        }

        // Star points with soft pulse
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          const a = s.baseAlpha + Math.sin(state.t * s.pulseSpeed) * 0.3;
          const clampedAlpha = Math.max(0.15, Math.min(1, a));
          ctx.fillStyle = 'rgba(215, 240, 255, ' + clampedAlpha.toFixed(2) + ')';
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },

    'live:circadian': {
      id: 'live:circadian',
      name: 'Circadian sky',
      desc: '24-hour dynamic time-of-day sky',
      color: '#091226',
      init(state, w, h) {
        state.t = 0;
        state.stars = [];
        const isSmall = Math.min(w, h) < 150;
        const count = isSmall ? 15 : 45;
        for (let i = 0; i < count; i++) {
          state.stars.push({
            x: Math.random() * w,
            y: Math.random() * (h * 0.72),
            r: Math.random() * 1.3 + 0.8,
            twinkle: Math.random() * 0.06 + 0.03
          });
        }
        state.clouds = [];
        const cloudCount = isSmall ? 4 : 7;
        for (let i = 0; i < cloudCount; i++) {
          state.clouds.push({
            x: Math.random() * w,
            y: (h * 0.12) + (i * (h * (isSmall ? 0.16 : 0.10))),
            w: (Math.random() * 120 + 120) * (isSmall ? 0.45 : 1),
            h: (Math.random() * 30 + 20) * (isSmall ? 0.45 : 1),
            speed: Math.random() * 0.5 + 0.25,
            alpha: Math.random() * 0.12 + 0.18
          });
        }
      },
      render(ctx, w, h, state) {
        state.t += 1;
        let hour = state.mockHour;
        if (typeof hour !== 'number') {
          const d = new Date();
          hour = d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
        }

        let topColor, bottomColor, starAlpha = 0, cloudColor = 'rgba(255,255,255,';
        if (hour < 5 || hour >= 21.5) {
          topColor = '#040711';
          bottomColor = '#0d172e';
          starAlpha = 0.85;
          cloudColor = 'rgba(100,120,160,';
        } else if (hour < 7) {
          const p = (hour - 5) / 2;
          topColor = '#121832';
          bottomColor = p < 0.5 ? '#61324c' : '#c85a53';
          starAlpha = (1 - p) * 0.8;
          cloudColor = 'rgba(255,180,160,';
        } else if (hour < 17) {
          topColor = '#1e4877';
          bottomColor = '#4b79a1';
          starAlpha = 0;
          cloudColor = 'rgba(255,255,255,';
        } else if (hour < 19.5) {
          const p = (hour - 17) / 2.5;
          topColor = p < 0.5 ? '#241b3d' : '#1a132b';
          bottomColor = p < 0.5 ? '#b83b5e' : '#6f2249';
          starAlpha = p * 0.4;
          cloudColor = 'rgba(255,160,140,';
        } else {
          const p = (hour - 19.5) / 2;
          topColor = '#111528';
          bottomColor = '#1d2138';
          starAlpha = 0.4 + p * 0.45;
          cloudColor = 'rgba(120,130,170,';
        }

        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, topColor);
        grad.addColorStop(1, bottomColor);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Horizon subtle atmospheric breathing aura
        const horizonPulse = Math.sin(state.t * 0.02) * (h * 0.02);
        const hGrad = ctx.createLinearGradient(0, h * 0.65, 0, h);
        hGrad.addColorStop(0, 'rgba(255,255,255,0)');
        hGrad.addColorStop(1, bottomColor === '#4b79a1' ? 'rgba(255,255,255,0.08)' : 'rgba(255,180,140,0.06)');
        ctx.fillStyle = hGrad;
        ctx.fillRect(0, h * 0.65 + horizonPulse, w, h * 0.35);

        // Drifting clouds for live daytime and atmospheric movement
        if (state.clouds) {
          for (let i = 0; i < state.clouds.length; i++) {
            const c = state.clouds[i];
            c.x += c.speed;
            if (c.x > w + c.w) c.x = -c.w;
            ctx.fillStyle = cloudColor + c.alpha.toFixed(3) + ')';
            ctx.beginPath();
            if (ctx.ellipse) {
              ctx.ellipse(c.x, c.y, c.w * 0.5, c.h * 0.5, 0, 0, Math.PI * 2);
            } else {
              ctx.arc(c.x, c.y, c.h * 0.5, 0, Math.PI * 2);
            }
            ctx.fill();
          }
        }

        if (starAlpha > 0.05 && state.stars) {
          for (let i = 0; i < state.stars.length; i++) {
            const s = state.stars[i];
            const a = starAlpha * (0.45 + Math.sin(state.t * s.twinkle) * 0.55);
            ctx.fillStyle = 'rgba(230, 240, 255, ' + a.toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  */

  let currentId = '';
  let canvas = null;
  let ctx = null;
  let rafId = null;
  let lastFrameTime = 0;
  let state = {};
  let isPaused = false;
  let mutationObserver = null;
  const previewInstances = new Map();

  function isReducedMotion() {
    if (typeof document === 'undefined') return false;
    // const root = document.documentElement;
    // if (root && (root.classList.contains('hub-motion-reduced') || root.classList.contains('hub-motion-off'))) {
    //   return true;
    // }   (before H158a)
    // H158a: Hub Motion Off / Reduced stills UI chrome only; live wallpapers (desktop + Settings previews) keep running.
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_) {
      return false;
    }
  }

  function shouldPause() {
    if (typeof document === 'undefined') return false;
    if (document.hidden) return true;
    const root = document.documentElement;
    if (root && (root.classList.contains('hub-locked') || root.classList.contains('hub-break'))) return true;
    const body = document.body;
    const isDesktop = body && body.classList.contains('wm-desktop');
    const empty = document.getElementById('empty');
    if (!isDesktop && empty && empty.classList.contains('hidden')) return true;
    // if (isDesktop && document.querySelector && document.querySelector('.wm-max:not(.wm-min)')) return true;   (before H158)
    // H158: a maximised window on the other workspace (.wm-off) must not freeze this one
    if (isDesktop && document.querySelector && document.querySelector('.wm-max:not(.wm-min):not(.wm-off)')) return true;
    return false;
  }

  function ensureCanvas() {
    if (canvas && canvas.parentElement) return canvas;
    if (typeof document === 'undefined') return null;
    canvas = document.getElementById('hub-live-canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.id = 'hub-live-canvas';
      canvas.className = 'hub-live-canvas';
      canvas.setAttribute('aria-hidden', 'true');
      const empty = document.getElementById('empty') || document.body;
      if (empty) empty.insertBefore(canvas, empty.firstChild);
    }
    if (canvas) {
      ctx = canvas.getContext ? canvas.getContext('2d') : null;
      syncSize();
    }
    return canvas;
  }

  function syncSize() {
    if (!canvas) return;
    const parent = canvas.parentElement || document.body;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = Math.max(1, w);
      canvas.height = Math.max(1, h);
      if (state.stars && state.stars.length) {
        for (let i = 0; i < state.stars.length; i++) {
          const s = state.stars[i];
          if (s.x > canvas.width) s.x = Math.random() * canvas.width;
          if (s.y > canvas.height) s.y = Math.random() * canvas.height;
        }
      }
    }
  }

  function frame(now) {
    if (!currentId || !PRESETS[currentId] || isPaused) return;

    if (shouldPause()) {
      isPaused = true;
      rafId = null;
      return;
    }

    const delta = now - lastFrameTime;
    if (delta < 32) {
      rafId = requestAnimationFrame(frame);
      return;
    }

    lastFrameTime = now;
    tick();

    if (!isReducedMotion()) {
      rafId = requestAnimationFrame(frame);
    } else {
      rafId = null;
    }
  }

  function tick() {
    if (!currentId || !PRESETS[currentId]) return;
    ensureCanvas();
    if (!ctx || !canvas) return;
    syncSize();
    PRESETS[currentId].render(ctx, canvas.width, canvas.height, state);
  }

  function startLoop() {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    // isPaused = false;   (before H158)
    lastFrameTime = performance.now ? performance.now() : Date.now();
    tick();
    // if (!isReducedMotion() && !shouldPause()) {
    //   rafId = requestAnimationFrame(frame);
    // }   (before H158)
    // H158: if we should pause (hidden tab, lock, a maximised window), mark isPaused so
    // checkState() can resume later. Leaving isPaused false with no rAF froze the first frame.
    if (isReducedMotion()) {
      isPaused = false;
      return;
    }
    if (shouldPause()) {
      isPaused = true;
      return;
    }
    isPaused = false;
    rafId = requestAnimationFrame(frame);
  }

  function checkState() {
    if (!currentId) return;
    const pauseNow = shouldPause();
    if (pauseNow && !isPaused) {
      pause();
    } else if (!pauseNow && isPaused) {
      resume();
    }
  }

  function pause() {
    isPaused = true;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function resume() {
    if (!currentId) return;
    if (shouldPause()) return;
    isPaused = false;
    startLoop();
  }

  function set(id) {
    // H158b: Circadian sky was removed; older saves keep working as Aurora
    if (id === 'live:circadian') id = 'live:aurora';
    if (!id || !PRESETS[id]) {
      stop();
      return false;
    }
    // H158: same preset already on — keep state.t and the running loop (HubPrefs.apply
    // used to call set() on every prefs change and reset the animation to frame 0).
    if (id === currentId && canvas && canvas.classList.contains('active')) {
      canvas.style.display = 'block';
      checkState();
      return true;
    }
    currentId = id;
    state = {};
    ensureCanvas();
    if (canvas) {
      canvas.classList.add('active');
      canvas.style.display = 'block';
    }
    syncSize();
    if (PRESETS[id].init) {
      PRESETS[id].init(state, canvas ? canvas.width : 300, canvas ? canvas.height : 150);
    }
    startLoop();
    return true;
  }

  function stop() {
    currentId = '';
    isPaused = false;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (canvas) {
      canvas.classList.remove('active');
      canvas.style.display = 'none';
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    state = {};
  }

  // Settings & preview attachment
  function attachPreview(canvasEl, id) {
    if (!canvasEl) return;
    detachPreview(canvasEl);
    if (!id || !PRESETS[id]) return;

    const pCtx = canvasEl.getContext ? canvasEl.getContext('2d') : null;
    if (!pCtx) return;

    const pState = {};
    const w = canvasEl.clientWidth || canvasEl.width || 300;
    const h = canvasEl.clientHeight || canvasEl.height || 170;
    canvasEl.width = w;
    canvasEl.height = h;

    if (PRESETS[id].init) PRESETS[id].init(pState, w, h);

    let lastTime = performance.now ? performance.now() : Date.now();
    let loopId = null;

    function renderLoop(now) {
      if (!previewInstances.has(canvasEl) || (typeof canvasEl.isConnected === 'boolean' && !canvasEl.isConnected)) {
        detachPreview(canvasEl);
        return;
      }
      if (document.hidden) {
        loopId = requestAnimationFrame(renderLoop);
        return;
      }
      const delta = now - lastTime;
      if (delta >= 32) {
        lastTime = now;
        const curW = canvasEl.clientWidth || w;
        const curH = canvasEl.clientHeight || h;
        if (canvasEl.width !== curW || canvasEl.height !== curH) {
          canvasEl.width = curW;
          canvasEl.height = curH;
        }
        PRESETS[id].render(pCtx, canvasEl.width, canvasEl.height, pState);
      }
      if (!isReducedMotion()) {
        loopId = requestAnimationFrame(renderLoop);
      }
    }

    previewInstances.set(canvasEl, {
      stop() {
        if (loopId) cancelAnimationFrame(loopId);
        if (pCtx) pCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      }
    });

    PRESETS[id].render(pCtx, w, h, pState);
    if (!isReducedMotion()) {
      loopId = requestAnimationFrame(renderLoop);
    }
  }

  function detachPreview(canvasEl) {
    if (!canvasEl) {
      for (const inst of previewInstances.values()) inst.stop();
      previewInstances.clear();
      return;
    }
    const inst = previewInstances.get(canvasEl);
    if (inst) {
      inst.stop();
      previewInstances.delete(canvasEl);
    }
  }

  // Lifecycle listeners
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.addEventListener('resize', () => {
      syncSize();
      if (currentId) tick();
    });
    document.addEventListener('visibilitychange', checkState);

    try {
      mutationObserver = new MutationObserver(() => checkState());
      mutationObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      if (document.body) {
        // mutationObserver.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });   (before H158)
        // H158: also watch childList — closing a maximised window is el.remove(), not a class change
        mutationObserver.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'], childList: true });
      }
    } catch (_) { /* environment without MutationObserver */ }
  }

  window.HubLiveWallpaper = {
    set,
    stop,
    pause,
    resume,
    tick,
    checkState,
    shouldPause,
    isReducedMotion,
    attachPreview,
    detachPreview,
    current: () => currentId,
    isRunning: () => !!currentId && !isPaused,
    isPaused: () => isPaused,
    presets: () => Object.keys(PRESETS),
    getState: () => state,
    setState: (s) => { Object.assign(state, s); },
    PRESETS
  };
})();
