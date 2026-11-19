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
 *   - live:waves         Living Waves: silky smooth, dynamic fluid waves with celestial light motes (Web_OS identical)
 *   - live:constellation Glowing constellation nodes with proximity links and geometric polygons (Web_OS identical)
 *   - live:synthwave     Retro Synthwave: neon horizon sun with 3D perspective grid floor (Web_OS identical)
 *   // Retired: live:circadian, live:rain, live:lava, live:geo
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
        if (ctx.restore) ctx.restore();
      }
    },

    'live:waves': {
      id: 'live:waves',
      name: 'Living Waves',
      desc: 'Silky smooth, dynamic fluid waves with celestial light motes',
      color: '#080c16',
      init(state, w, h) {
        state.t = 0;
        state.startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        state.lastNow = state.startTime;
        state.particles = [];
        const isSmall = Math.min(w || 1920, h || 1080) < 150;
        const count = isSmall ? 14 : 38;
        for (let i = 0; i < count; i++) {
          state.particles.push({
            x: Math.random() * (w || 1920),
            y: Math.random() * (h || 1080),
            radius: 1 + Math.random() * 2.2,
            speedY: 0.15 + Math.random() * 0.35,
            wobbleSpeed: 0.001 + Math.random() * 0.002,
            wobbleAmp: 15 + Math.random() * 25,
            phase: Math.random() * Math.PI * 2,
            alpha: 0.15 + Math.random() * 0.5,
            pulseSpeed: 0.002 + Math.random() * 0.003
          });
        }
        state.stars = state.particles;
      },
      render(ctx, w, h, state) {
        state.t = (state.t || 0) + 1;
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (!state.startTime) state.startTime = now;
        if (!state.lastNow) state.lastNow = now;
        const delta = Math.max(1, Math.min(now - state.lastNow, 100));
        state.lastNow = now;
        const elapsed = (now - state.startTime) * 0.001;
        const dtFactor = Math.min(delta / 16.667, 3);

        const particles = state.particles || state.stars;
        if (!particles || !particles.length) {
          this.init(state, w, h);
          return;
        }

        const docEl = (typeof document !== 'undefined' && document.documentElement) ? document.documentElement : null;
        const isDark = docEl
          ? ((!docEl.dataset || docEl.dataset.mode !== 'light') &&
             (!docEl.classList || (!docEl.classList.contains('hub-light') && !docEl.classList.contains('light'))) &&
             (!docEl.dataset || docEl.dataset.theme !== 'light'))
          : true;

        // Base backdrop gradient
        const bgGrad = ctx.createLinearGradient(0, 0, w * 0.8, h);
        if (isDark) {
          bgGrad.addColorStop(0, '#080c16');
          bgGrad.addColorStop(0.5, '#0f172a');
          bgGrad.addColorStop(1, '#070b14');
        } else {
          bgGrad.addColorStop(0, '#e2e8f0');
          bgGrad.addColorStop(0.5, '#f1f5f9');
          bgGrad.addColorStop(1, '#dbeafe');
        }
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Floating ambient motes with frame-rate independent scaling
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.y -= p.speedY * dtFactor;
          if (p.y < -10) {
            p.y = h + 10;
            p.x = Math.random() * w;
          }
          if (p.x > w) p.x = Math.random() * w;
          const currentX = p.x + Math.sin(elapsed * p.wobbleSpeed * 1000 + p.phase) * p.wobbleAmp;
          const currentAlpha = p.alpha * (0.6 + 0.4 * Math.sin(elapsed * p.pulseSpeed * 1000 + p.phase));

          ctx.beginPath();
          ctx.arc(currentX, p.y, p.radius, 0, Math.PI * 2);
          if (isDark) {
            ctx.fillStyle = `rgba(165, 243, 252, ${currentAlpha * 0.8})`;
          } else {
            ctx.fillStyle = `rgba(59, 130, 246, ${currentAlpha * 0.45})`;
          }
          ctx.fill();
        }

        // Wave configurations
        const waves = isDark
          ? [
              {
                yBase: 0.52,
                amplitude: 36,
                wavelength1: 240,
                wavelength2: 380,
                speed1: 0.45,
                speed2: 0.35,
                colorTop: 'rgba(99, 102, 241, 0.28)',
                colorBottom: 'rgba(67, 56, 202, 0.03)',
                stroke: 'rgba(129, 140, 248, 0.45)',
                lineWidth: 1.5
              },
              {
                yBase: 0.62,
                amplitude: 44,
                wavelength1: 190,
                wavelength2: 310,
                speed1: -0.55,
                speed2: 0.42,
                colorTop: 'rgba(6, 182, 212, 0.26)',
                colorBottom: 'rgba(14, 165, 233, 0.04)',
                stroke: 'rgba(34, 211, 238, 0.5)',
                lineWidth: 1.8
              },
              {
                yBase: 0.74,
                amplitude: 48,
                wavelength1: 220,
                wavelength2: 340,
                speed1: 0.65,
                speed2: -0.48,
                colorTop: 'rgba(217, 70, 239, 0.24)',
                colorBottom: 'rgba(168, 85, 247, 0.03)',
                stroke: 'rgba(244, 114, 182, 0.55)',
                lineWidth: 2
              }
            ]
          : [
              {
                yBase: 0.54,
                amplitude: 32,
                wavelength1: 240,
                wavelength2: 380,
                speed1: 0.45,
                speed2: 0.35,
                colorTop: 'rgba(147, 51, 234, 0.2)',
                colorBottom: 'rgba(192, 132, 252, 0.03)',
                stroke: 'rgba(168, 85, 247, 0.4)',
                lineWidth: 1.5
              },
              {
                yBase: 0.64,
                amplitude: 38,
                wavelength1: 190,
                wavelength2: 310,
                speed1: -0.55,
                speed2: 0.42,
                colorTop: 'rgba(14, 165, 233, 0.22)',
                colorBottom: 'rgba(56, 189, 248, 0.04)',
                stroke: 'rgba(56, 189, 248, 0.45)',
                lineWidth: 1.8
              },
              {
                yBase: 0.76,
                amplitude: 42,
                wavelength1: 220,
                wavelength2: 340,
                speed1: 0.65,
                speed2: -0.48,
                colorTop: 'rgba(236, 72, 153, 0.18)',
                colorBottom: 'rgba(244, 114, 182, 0.03)',
                stroke: 'rgba(244, 114, 182, 0.5)',
                lineWidth: 2
              }
            ];

        const ampScale = h < 300 ? Math.max(0.2, h / 300) : 1;
        const step = Math.min(w, h) < 150 ? 5 : 8;

        // Render each organic harmonic wave
        for (let wIdx = 0; wIdx < waves.length; wIdx++) {
          const cfg = waves[wIdx];
          const waveGrad = ctx.createLinearGradient(0, h * (cfg.yBase - 0.2), 0, h);
          waveGrad.addColorStop(0, cfg.colorTop);
          waveGrad.addColorStop(1, cfg.colorBottom);

          const amp = cfg.amplitude * ampScale;

          ctx.beginPath();
          ctx.moveTo(0, h);

          for (let x = 0; x <= w + step; x += step) {
            const y =
              h * cfg.yBase +
              Math.sin(x / cfg.wavelength1 + elapsed * cfg.speed1) * amp +
              Math.cos(x / cfg.wavelength2 + elapsed * cfg.speed2) * (amp * 0.55);
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.closePath();
          ctx.fillStyle = waveGrad;
          ctx.fill();

          // Crest highlight stroke
          ctx.beginPath();
          for (let x = 0; x <= w + step; x += step) {
            const y =
              h * cfg.yBase +
              Math.sin(x / cfg.wavelength1 + elapsed * cfg.speed1) * amp +
              Math.cos(x / cfg.wavelength2 + elapsed * cfg.speed2) * (amp * 0.55);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.strokeStyle = cfg.stroke;
          ctx.lineWidth = cfg.lineWidth;
          ctx.stroke();
        }
      }
    },

    'live:constellation': {
      id: 'live:constellation',
      name: 'Constellation',
      desc: 'Glowing constellation nodes with proximity links and geometric polygons',
      color: '#030712',
      init(state, w, h) {
        state.t = 0;
        state.startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        state.lastNow = state.startTime;
        state.nodes = [];
        const count = Math.min(Math.floor(((w || 1920) * (h || 1080)) / 36000) + 18, 52);
        for (let i = 0; i < count; i++) {
          state.nodes.push({
            x: Math.random() * (w || 1920),
            y: Math.random() * (h || 1080),
            vx: (Math.random() - 0.5) * 0.55,
            vy: (Math.random() - 0.5) * 0.55,
            radius: 1.6 + Math.random() * 1.8,
            phase: Math.random() * Math.PI * 2
          });
        }
        state.stars = state.nodes;
      },
      render(ctx, w, h, state) {
        state.t = (state.t || 0) + 1;
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (!state.startTime) state.startTime = now;
        if (!state.lastNow) state.lastNow = now;
        const delta = Math.max(1, Math.min(now - state.lastNow, 100));
        state.lastNow = now;
        const elapsed = (now - state.startTime) * 0.001;
        const dtFactor = Math.min(delta / 16.667, 3);

        const nodes = state.nodes || state.stars;
        if (!nodes || !nodes.length) {
          this.init(state, w, h);
          return;
        }

        const docEl = (typeof document !== 'undefined' && document.documentElement) ? document.documentElement : null;
        const isDark = docEl
          ? ((!docEl.dataset || docEl.dataset.mode !== 'light') &&
             (!docEl.classList || (!docEl.classList.contains('hub-light') && !docEl.classList.contains('light'))) &&
             (!docEl.dataset || docEl.dataset.theme !== 'light'))
          : true;

        // Background
        const bgGrad = ctx.createLinearGradient(0, 0, w, h);
        if (isDark) {
          bgGrad.addColorStop(0, '#030712');
          bgGrad.addColorStop(0.5, '#0b1124');
          bgGrad.addColorStop(1, '#050814');
        } else {
          bgGrad.addColorStop(0, '#f8fafc');
          bgGrad.addColorStop(0.5, '#f1f5f9');
          bgGrad.addColorStop(1, '#e0e7ff');
        }
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, w, h);

        // Update nodes
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          n.x += n.vx * dtFactor;
          n.y += n.vy * dtFactor;

          if (n.x < 0) { n.x = 0; n.vx = -n.vx; }
          else if (n.x > w) { n.x = w; n.vx = -n.vx; }
          if (n.y < 0) { n.y = 0; n.vy = -n.vy; }
          else if (n.y > h) { n.y = h; n.vy = -n.vy; }
        }

        // Draw proximity links and subtle triangular faces
        const maxDist = 130;
        const maxDistSq = maxDist * maxDist;
        const triDistSq = 75 * 75;

        ctx.lineWidth = 1;

        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const distSq = dx * dx + dy * dy;

            if (distSq < maxDistSq) {
              const dist = Math.sqrt(distSq);
              const alpha = (1 - dist / maxDist) * (isDark ? 0.35 : 0.28);
              ctx.strokeStyle = isDark
                ? `rgba(56, 189, 248, ${alpha})`
                : `rgba(99, 102, 241, ${alpha})`;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();

              // Check for 3rd node to form faint triangular polygon
              for (let k = j + 1; k < nodes.length; k++) {
                const c = nodes[k];
                const dax = a.x - c.x, day = a.y - c.y;
                const dbx = b.x - c.x, dby = b.y - c.y;
                if (dax * dax + day * day < triDistSq && dbx * dbx + dby * dby < triDistSq) {
                  ctx.fillStyle = isDark
                    ? 'rgba(14, 165, 233, 0.035)'
                    : 'rgba(99, 102, 241, 0.03)';
                  ctx.beginPath();
                  ctx.moveTo(a.x, a.y);
                  ctx.lineTo(b.x, b.y);
                  ctx.lineTo(c.x, c.y);
                  ctx.closePath();
                  ctx.fill();
                }
              }
            }
          }
        }

        // Draw glowing nodes
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i];
          const pulse = 0.8 + 0.2 * Math.sin(elapsed * 2.5 + n.phase);
          const r = (n.radius || 2) * pulse;

          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
          ctx.fillStyle = isDark ? '#38bdf8' : '#6366f1';
          ctx.fill();

          // Node aura
          ctx.beginPath();
          ctx.arc(n.x, n.y, r * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = isDark ? 'rgba(56, 189, 248, 0.12)' : 'rgba(99, 102, 241, 0.1)';
          ctx.fill();
        }
      }
    },

    'live:synthwave': {
      id: 'live:synthwave',
      name: 'Retro Synthwave',
      desc: 'Neon horizon sun with 3D perspective grid floor',
      color: '#1e082b',
      init(state) {
        state.t = 0;
        state.startTime = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      },
      render(ctx, w, h, state) {
        state.t = (state.t || 0) + 1;
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        if (!state.startTime) state.startTime = now;
        const elapsed = (now - state.startTime) * 0.001;

        const docEl = (typeof document !== 'undefined' && document.documentElement) ? document.documentElement : null;
        const isDark = docEl
          ? ((!docEl.dataset || docEl.dataset.mode !== 'light') &&
             (!docEl.classList || (!docEl.classList.contains('hub-light') && !docEl.classList.contains('light'))) &&
             (!docEl.dataset || docEl.dataset.theme !== 'light'))
          : true;

        const horizonY = Math.floor(h * 0.52);
        const centerX = Math.floor(w * 0.5);

        // 1. Sky Gradient
        const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
        if (isDark) {
          skyGrad.addColorStop(0, '#05020a');
          skyGrad.addColorStop(0.4, '#160728');
          skyGrad.addColorStop(0.75, '#3b0745');
          skyGrad.addColorStop(1, '#5b0e52');
        } else {
          skyGrad.addColorStop(0, '#e0e7ff');
          skyGrad.addColorStop(0.45, '#f3e8ff');
          skyGrad.addColorStop(0.8, '#fae8ff');
          skyGrad.addColorStop(1, '#fce7f3');
        }
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, w, horizonY);

        // 2. Neon Horizon Sun with horizontal blind cuts
        const sunRadius = Math.min(w * 0.14, 88);
        const sunCenterY = horizonY - sunRadius * 0.45;

        if (ctx.save) ctx.save();
        ctx.beginPath();
        if (ctx.rect) ctx.rect(0, 0, w, horizonY); // clip sun to sky area
        if (ctx.clip) ctx.clip();

        // Sun outer aura
        const auraGrad = ctx.createRadialGradient(centerX, sunCenterY, sunRadius * 0.4, centerX, sunCenterY, sunRadius * 1.8);
        auraGrad.addColorStop(0, isDark ? 'rgba(244, 63, 94, 0.4)' : 'rgba(251, 146, 60, 0.35)');
        auraGrad.addColorStop(1, 'rgba(244, 63, 94, 0)');
        ctx.fillStyle = auraGrad;
        ctx.beginPath();
        ctx.arc(centerX, sunCenterY, sunRadius * 1.8, 0, Math.PI * 2);
        ctx.fill();

        // Sun body
        const sunGrad = ctx.createLinearGradient(centerX, sunCenterY - sunRadius, centerX, sunCenterY + sunRadius);
        if (isDark) {
          sunGrad.addColorStop(0, '#fde047');
          sunGrad.addColorStop(0.5, '#fb923c');
          sunGrad.addColorStop(1, '#f43f5e');
        } else {
          sunGrad.addColorStop(0, '#f59e0b');
          sunGrad.addColorStop(0.5, '#ec4899');
          sunGrad.addColorStop(1, '#8b5cf6');
        }
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(centerX, sunCenterY, sunRadius, 0, Math.PI * 2);
        ctx.fill();

        // Synthwave horizontal blind slats through the lower half of the sun
        const slatCount = 7;
        for (let s = 1; s <= slatCount; s++) {
          const slatY = sunCenterY + (s / slatCount) * sunRadius;
          const slatHeight = 1.5 + (s / slatCount) * 3.5;
          ctx.fillStyle = isDark ? '#1e082b' : '#f5d0fe';
          ctx.fillRect(centerX - sunRadius - 4, slatY, (sunRadius + 4) * 2, slatHeight);
        }
        if (ctx.restore) ctx.restore();

        // 3. Grid Floor (horizonY to h)
        const floorGrad = ctx.createLinearGradient(0, horizonY, 0, h);
        if (isDark) {
          floorGrad.addColorStop(0, '#080210');
          floorGrad.addColorStop(0.3, '#0e031c');
          floorGrad.addColorStop(1, '#04010a');
        } else {
          floorGrad.addColorStop(0, '#fdf4ff');
          floorGrad.addColorStop(0.4, '#f5f3ff');
          floorGrad.addColorStop(1, '#ede9fe');
        }
        ctx.fillStyle = floorGrad;
        ctx.fillRect(0, horizonY, w, h - horizonY);

        // 4. Perspective Grid Lines radiating outward
        const gridVLines = 28;
        const bottomSpread = w * 2.8;
        const bottomStart = centerX - bottomSpread / 2;

        ctx.lineWidth = 1.2;
        for (let i = 0; i <= gridVLines; i++) {
          const bottomX = bottomStart + (i / gridVLines) * bottomSpread;
          ctx.strokeStyle = isDark ? 'rgba(6, 182, 212, 0.28)' : 'rgba(124, 58, 237, 0.22)';
          ctx.beginPath();
          ctx.moveTo(centerX, horizonY);
          ctx.lineTo(bottomX, h);
          ctx.stroke();
        }

        // 5. Horizontal Grid Lines moving forward with logarithmic 3D foreshortening
        const scrollOffset = (elapsed * 0.45) % 1;
        const hLineCount = 14;
        const floorHeight = h - horizonY;

        for (let i = 0; i <= hLineCount; i++) {
          const progress = (i + scrollOffset) / hLineCount;
          if (progress <= 0 || progress > 1) continue;
          const perspectiveY = horizonY + Math.pow(progress, 2.2) * floorHeight;
          const lineAlpha = Math.pow(progress, 1.4) * (isDark ? 0.65 : 0.45);

          ctx.strokeStyle = isDark
            ? `rgba(244, 63, 94, ${lineAlpha})`
            : `rgba(217, 70, 239, ${lineAlpha})`;
          ctx.lineWidth = 1 + progress * 1.5;
          ctx.beginPath();
          ctx.moveTo(0, perspectiveY);
          ctx.lineTo(w, perspectiveY);
          ctx.stroke();
        }

        // 6. Horizon glow bar
        const hGlow = ctx.createLinearGradient(0, horizonY - 4, 0, horizonY + 6);
        hGlow.addColorStop(0, 'rgba(244, 63, 94, 0)');
        hGlow.addColorStop(0.5, isDark ? 'rgba(244, 63, 94, 0.7)' : 'rgba(168, 85, 247, 0.5)');
        hGlow.addColorStop(1, 'rgba(6, 182, 212, 0)');
        ctx.fillStyle = hGlow;
        ctx.fillRect(0, horizonY - 4, w, 10);
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
        if (ctx.restore) ctx.restore();
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
    // Retired presets resolve to Aurora
    if (id === 'live:circadian' || id === 'live:rain' || id === 'live:lava' || id === 'live:geo') id = 'live:aurora';
    if (id === 'waves' || id === 'living-waves') id = 'live:waves';
    if (id === 'constellation') id = 'live:constellation';
    if (id === 'synthwave') id = 'live:synthwave';
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
