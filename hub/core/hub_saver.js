/*
 * Hub clock screen saver (hub/core/hub_saver.js), R49. Loaded lazily by hub_loader.js ('saver' batch).
 * Full-screen overlay (above windows, taskbar, top bar) with one analog clock. R49c minimalist face:
 * just the circle (no ticks, no numbers), thick hour hand, thinner minute hand, thin red second hand.
 * Second hand 'sites-hub.saverSec' = smooth (rAF sweep, default) | quartz (jumps each second, setTimeout)
 * | off (no second hand; hour / minute redrawn every 10 s). Nothing runs while hidden. Clock centre at 25% of
 * the viewport height, size min(40vh, 70vw); drifts a few px every minute (anti burn-in).
 * Theme: html.hub-light (hub_prefs.js, 'sites-hub.theme') → light bg + dark clock, else dark bg + white clock.
 * Idle: localStorage 'sites-hub.saverIdle' = whole minutes, 0 = off, else clamped to 1..240 (R49b);
 *   missing / invalid = 5 (on). Live via 'storage'.
 * Activity (resets the timer): mousemove / mousedown / keydown / touchstart / wheel on the Hub and on
 *   same-origin app documents, window blur (focus into an app iframe), any hub-* bridge message.
 * Not started while the page is hidden, an element is fullscreen or a video is playing (checked again later).
 * Dismiss: any mouse move, touch, click, wheel or key; the event is swallowed (capture + stop), so it never
 *   reaches the app / desktop below (the click that follows a press is swallowed too).
 * API: window.HubSaver = { start(), stop(), set(min), active(), minutes(), secMode(m?) }.
 */
(function () {
  'use strict';
  if (window.HubSaver) return;
  const KEY = 'sites-hub.saverIdle';
  const DEF = 5, MAX = 240;   // R49b (R49 allowed only 0 / 10 / 15 / 30, default off)
  /** R49b: whole minutes; 0 = off; 1..240 (clamped); missing / invalid → 5. */
  function norm(v) {
    const s = String(v == null ? '' : v).trim();
    if (!/^-?\d+$/.test(s)) return DEF;
    const n = parseInt(s, 10);
    return n <= 0 ? (n === 0 ? 0 : DEF) : Math.min(n, MAX);
  }
  const NS = 'http://www.w3.org/2000/svg';
  const SEC_KEY = 'sites-hub.saverSec', SEC_MODES = ['smooth', 'quartz', 'off'];   // R49c
  let secMode = 'smooth', timer = 0, draws = 0;
  let idleMin = 0, last = Date.now(), el = null, raf = 0, driftT = 0, shownAt = 0, swallowUntil = 0;
  const hooked = new WeakSet();

  function readPref() {
    let v = null;
    try { v = localStorage.getItem(KEY); } catch (_) { /* blocked */ }
    idleMin = norm(v);
  }
  function readSec() {
    let v = null;
    try { v = localStorage.getItem(SEC_KEY); } catch (_) { /* blocked */ }
    secMode = SEC_MODES.indexOf(v) >= 0 ? v : 'smooth';
  }
  const poke = () => { last = Date.now(); };

  const css = '#hub-saver{position:fixed;inset:0;z-index:2147483600;background:#0a0b0d;color:#fff;cursor:none;touch-action:none}' +
    'html.hub-light #hub-saver{background:var(--bg,#e9ecf1);color:var(--text,#1d2330)}' +
    '#hub-saver svg{position:absolute;left:50%;top:25vh;width:min(40vh,70vw);height:min(40vh,70vw);transform:translate(-50%,-50%);transition:margin 2s ease;overflow:visible}' +
    '#hub-saver *{stroke:currentColor;fill:none;stroke-linecap:round}#hub-saver .hs-s{stroke:#e53935}';

  function build() {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    el = document.createElement('div'); el.id = 'hub-saver'; el.hidden = true; el.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '-100 -100 200 200');
    const add = (tag, a) => { const n = document.createElementNS(NS, tag); for (const k in a) n.setAttribute(k, a[k]); svg.appendChild(n); return n; };
    add('circle', { r: 96, 'stroke-width': 7, class: 'hs-face' });   // R49c: face only (no ticks), 3 → 7
    el.h = add('line', { x1: 0, y1: 10, x2: 0, y2: -50, 'stroke-width': 8, class: 'hs-h' });
    el.m = add('line', { x1: 0, y1: 12, x2: 0, y2: -76, 'stroke-width': 3.5, class: 'hs-m' });
    el.s = add('line', { x1: 0, y1: 16, x2: 0, y2: -84, 'stroke-width': 1.5, class: 'hs-s' });
    add('circle', { r: 2.5, 'stroke-width': 3, class: 'hs-pin' });
    el.svg = svg; el.appendChild(svg); document.body.appendChild(el);
  }
  /** Angles (deg) for a Date: hour, minute, second (smooth). */
  function angles(d) {
    const s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
    return { h: h * 30, m: m * 6, s: s * 6 };
  }
  /** Draw the hands for now; quartz uses whole seconds. */
  function draw() {
    const d = new Date();
    if (secMode === 'quartz') d.setMilliseconds(0);
    const a = angles(d);
    el.h.setAttribute('transform', 'rotate(' + a.h + ')');
    el.m.setAttribute('transform', 'rotate(' + a.m + ')');
    // R49d: SVG elements have no .hidden property; use the SVG display attribute
    if (secMode === 'off') el.s.setAttribute('display', 'none'); else el.s.removeAttribute('display');
    if (secMode !== 'off') el.s.setAttribute('transform', 'rotate(' + a.s + ')');
    draws++;
  }
  /** R49c: one scheduler; every (re)start cancels the previous rAF / timer first. */
  function halt() { cancelAnimationFrame(raf); clearTimeout(timer); raf = timer = 0; }
  function tick() {
    halt();
    if (!active() || document.hidden) return;
    draw();
    if (secMode === 'smooth') raf = requestAnimationFrame(tick);
    else {
      const step = secMode === 'quartz' ? 1000 : 10000;
      timer = setTimeout(tick, step - (Date.now() % step) + 5);   // aligned to the next 1 s / 10 s boundary
    }
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) halt(); else if (active()) tick(); });
  function drift() {
    const r = () => Math.round(Math.random() * 12 - 6) + 'px';
    el.svg.style.marginLeft = r(); el.svg.style.marginTop = r();
  }
  function start() {
    if (!el) build();
    if (!el.hidden) return;
    el.hidden = false; shownAt = Date.now();
    tick(); driftT = setInterval(drift, 60000);
  }
  function stop() {
    if (!el || el.hidden) return;
    el.hidden = true; halt(); clearInterval(driftT);
    el.svg.style.marginLeft = el.svg.style.marginTop = '';
    poke();
  }
  const active = () => !!(el && !el.hidden);

  // Dismiss + swallow while shown (window capture runs before anything else on the page).
  function guard(e) {
    if (Date.now() < swallowUntil && /^(click|mouseup|pointerup|contextmenu|dblclick|touchend)$/.test(e.type)) {
      e.stopPropagation(); e.preventDefault(); return;
    }
    if (!active()) { if (e.type !== 'click') poke(); return; }
    if ((e.type === 'mousemove' || e.type === 'pointermove') && Date.now() - shownAt < 300) { e.stopPropagation(); return; }
    e.stopPropagation(); if (e.cancelable) e.preventDefault();
    swallowUntil = Date.now() + 600;
    stop();
  }
  ['mousemove', 'pointermove', 'mousedown', 'pointerdown', 'mouseup', 'pointerup', 'click', 'dblclick', 'contextmenu',
    'keydown', 'keyup', 'touchstart', 'touchend', 'wheel'].forEach((t) => window.addEventListener(t, guard, { capture: true, passive: false }));
  window.addEventListener('blur', poke);
  window.addEventListener('message', (e) => { const d = e.data; if (d && typeof d.type === 'string' && d.type.indexOf('hub-') === 0) poke(); });
  window.addEventListener('storage', (e) => {
    if (e.key === KEY || e.key === null) { readPref(); poke(); }
    if (e.key === SEC_KEY || e.key === null) { readSec(); if (active()) tick(); }   // R49c
  });

  /** Same-origin app documents: their input counts as activity too. */
  function hookFrames() {
    document.querySelectorAll('iframe').forEach((f) => {
      try {
        const d = f.contentDocument;
        if (!d || hooked.has(d)) return;
        hooked.add(d);
        ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'].forEach((t) => d.addEventListener(t, poke, { capture: true, passive: true }));
      } catch (_) { /* cross-origin */ }
    });
  }
  function videoPlaying() {
    const docs = [document];
    document.querySelectorAll('iframe').forEach((f) => { try { if (f.contentDocument) docs.push(f.contentDocument); } catch (_) { /* x-origin */ } });
    return docs.some((d) => Array.prototype.some.call(d.querySelectorAll('video'), (v) => !v.paused && !v.ended && v.readyState > 2));
  }
  function check() {
    hookFrames();
    if (!idleMin || active()) return;
    if (document.hidden || document.fullscreenElement || videoPlaying()) { poke(); return; }   // delay
    if (Date.now() - last >= idleMin * 60000) start();
  }
  readPref();
  readSec();
  setInterval(check, 5000);
  window.HubSaver = {
    start, stop, active,
    set(min) {
      const v = norm(min);
      try { localStorage.setItem(KEY, String(v)); } catch (_) { /* blocked */ }
      idleMin = v; poke();
    },
    minutes: () => idleMin,   // R49b
    /** R49c: second hand mode getter / setter ('smooth' | 'quartz' | 'off'; invalid → 'smooth'). */
    secMode(m) {
      if (m === undefined) return secMode;
      secMode = SEC_MODES.indexOf(m) >= 0 ? m : 'smooth';
      try { localStorage.setItem(SEC_KEY, secMode); } catch (_) { /* blocked */ }
      if (active()) tick();
      return secMode;
    },
    _draws: () => draws, _busy: () => ({ raf: !!raf, timer: !!timer }),
    _angles: angles
  };
})();
