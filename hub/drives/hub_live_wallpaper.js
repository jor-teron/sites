/*
 * Hub Live Wallpaper engine (hub/drives/hub_live_wallpaper.js)
 * Procedural HTML5 Canvas desktop background engine.
 *
 * Presets:
 *   - live:aurora        Harmonic flowing gradient ribbons (sine wave ribbons)
 *   - live:constellation Floating starry nodes with proximity line links
 *   - live:circadian     24-hour diurnal dynamic sky
 *
 * Governance & Performance:
 *   - 30 FPS cap via timestamp delta in requestAnimationFrame
 *   - Auto-pause on occlusion (fullscreen, maximised window, screen lock, break lock, hidden tab)
 *   - Accessibility: respects prefers-reduced-motion and sites-hub.motion ('reduced' / 'off')
 *     by drawing a single static frame and stopping animation
 */
(function () {
  'use strict';

  // Procedural presets
  const PRESETS = {
    'live:aurora': {
      id: 'live:aurora',
      name: 'Aurora waves',
      desc: 'Flowing harmonic color ribbons',
      color: '#081426',
      init(state, w, h) {
        state.t = 0;
      },
      render(ctx, w, h, state) {
        state.t += 0.008;
        ctx.fillStyle = '#050c18';
        ctx.fillRect(0, 0, w, h);

        const ribbons = [
          { color: 'rgba(14, 165, 233, 0.18)', yBase: h * 0.45, amp: h * 0.12, freq: 0.003, speed: 1.0 },
          { color: 'rgba(16, 185, 129, 0.16)', yBase: h * 0.55, amp: h * 0.14, freq: 0.0025, speed: 0.8 },
          { color: 'rgba(99, 102, 241, 0.14)', yBase: h * 0.65, amp: h * 0.10, freq: 0.0035, speed: 1.2 },
          { color: 'rgba(236, 72, 153, 0.12)', yBase: h * 0.50, amp: h * 0.08, freq: 0.004, speed: 0.6 }
        ];

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let r = 0; r < ribbons.length; r++) {
          const rib = ribbons[r];
          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let x = 0; x <= w; x += 12) {
            const y = rib.yBase + Math.sin(x * rib.freq + state.t * rib.speed) * rib.amp
                                + Math.sin(x * rib.freq * 0.5 + state.t * rib.speed * 0.7) * (rib.amp * 0.5);
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h);
          ctx.closePath();
          ctx.fillStyle = rib.color;
          ctx.fill();
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
        const count = Math.max(30, Math.min(60, Math.round((w * h) / 25000)));
        for (let i = 0; i < count; i++) {
          state.stars.push({
            x: Math.random() * w,
            y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.45,
            vy: (Math.random() - 0.5) * 0.45,
            r: Math.random() * 1.5 + 1,
            baseAlpha: Math.random() * 0.5 + 0.4,
            pulseSpeed: Math.random() * 0.02 + 0.01
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

        // Position update
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          s.x += s.vx;
          s.y += s.vy;
          if (s.x < 0) s.x = w;
          else if (s.x > w) s.x = 0;
          if (s.y < 0) s.y = h;
          else if (s.y > h) s.y = 0;
        }

        // Proximity lines
        const maxDist = 110;
        ctx.lineWidth = 1;
        for (let i = 0; i < stars.length; i++) {
          const s1 = stars[i];
          for (let j = i + 1; j < stars.length; j++) {
            const s2 = stars[j];
            const dx = s1.x - s2.x;
            const dy = s1.y - s2.y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < maxDist) {
              const alpha = (1 - d / maxDist) * 0.22;
              ctx.strokeStyle = 'rgba(165, 215, 255, ' + alpha.toFixed(3) + ')';
              ctx.beginPath();
              ctx.moveTo(s1.x, s1.y);
              ctx.lineTo(s2.x, s2.y);
              ctx.stroke();
            }
          }
        }

        // Star points
        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          const a = s.baseAlpha + Math.sin(state.t * s.pulseSpeed) * 0.2;
          ctx.fillStyle = 'rgba(210, 235, 255, ' + Math.max(0.1, Math.min(1, a)).toFixed(2) + ')';
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
        for (let i = 0; i < 40; i++) {
          state.stars.push({
            x: Math.random() * w,
            y: Math.random() * (h * 0.7),
            r: Math.random() * 1.2 + 0.8,
            twinkle: Math.random() * 0.03 + 0.01
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

        let topColor, bottomColor, starAlpha = 0;
        if (hour < 5 || hour >= 21.5) {
          topColor = '#040711';
          bottomColor = '#0d172e';
          starAlpha = 0.85;
        } else if (hour < 7) {
          const p = (hour - 5) / 2;
          topColor = '#121832';
          bottomColor = p < 0.5 ? '#61324c' : '#c85a53';
          starAlpha = (1 - p) * 0.8;
        } else if (hour < 17) {
          topColor = '#1e4877';
          bottomColor = '#4b79a1';
          starAlpha = 0;
        } else if (hour < 19.5) {
          const p = (hour - 17) / 2.5;
          topColor = p < 0.5 ? '#241b3d' : '#1a132b';
          bottomColor = p < 0.5 ? '#b83b5e' : '#6f2249';
          starAlpha = p * 0.4;
        } else {
          const p = (hour - 19.5) / 2;
          topColor = '#111528';
          bottomColor = '#1d2138';
          starAlpha = 0.4 + p * 0.45;
        }

        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, topColor);
        grad.addColorStop(1, bottomColor);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        if (starAlpha > 0.05 && state.stars) {
          for (let i = 0; i < state.stars.length; i++) {
            const s = state.stars[i];
            const a = starAlpha * (0.5 + Math.sin(state.t * s.twinkle) * 0.5);
            ctx.fillStyle = 'rgba(230, 240, 255, ' + a.toFixed(3) + ')';
            ctx.beginPath();
            ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }
  };

  let currentId = '';
  let canvas = null;
  let ctx = null;
  let rafId = null;
  let lastFrameTime = 0;
  let state = {};
  let isPaused = false;
  let resizeObserver = null;
  let mutationObserver = null;

  function isReducedMotion() {
    if (typeof document === 'undefined') return false;
    const root = document.documentElement;
    if (root && (root.classList.contains('hub-motion-reduced') || root.classList.contains('hub-motion-off'))) {
      return true;
    }
    try {
      return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (_) {
      return false;
    }
  }

  function shouldPause() {
    if (typeof document === 'undefined') return false;
    if (document.hidden) return true;
    if (document.fullscreenElement || document.webkitFullscreenElement) return true;
    const root = document.documentElement;
    if (root && (root.classList.contains('hub-locked') || root.classList.contains('hub-break'))) return true;
    const body = document.body;
    const isDesktop = body && body.classList.contains('wm-desktop');
    const empty = document.getElementById('empty');
    if (!isDesktop && empty && empty.classList.contains('hidden')) return true;
    if (document.querySelector('.wm-max:not(.wm-min)')) return true;
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
      if (currentId && PRESETS[currentId] && PRESETS[currentId].init) {
        PRESETS[currentId].init(state, canvas.width, canvas.height);
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
    isPaused = false;
    lastFrameTime = performance.now ? performance.now() : Date.now();
    tick();
    if (!isReducedMotion() && !shouldPause()) {
      rafId = requestAnimationFrame(frame);
    }
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
    if (!id || !PRESETS[id]) {
      stop();
      return false;
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

  // Lifecycle listeners
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.addEventListener('resize', () => {
      syncSize();
      if (currentId) tick();
    });
    document.addEventListener('visibilitychange', checkState);
    document.addEventListener('fullscreenchange', checkState);
    document.addEventListener('webkitfullscreenchange', checkState);

    // Watch for window maximization or lock classes
    try {
      mutationObserver = new MutationObserver(() => checkState());
      mutationObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      if (document.body) {
        mutationObserver.observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
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
    current: () => currentId,
    isRunning: () => !!currentId && !isPaused,
    isPaused: () => isPaused,
    presets: () => Object.keys(PRESETS),
    getState: () => state,
    setState: (s) => { Object.assign(state, s); },
    PRESETS
  };
})();
