/*
 * Hub clock screen saver (hub/core/hub_saver.js), R49. Loaded lazily by hub_loader.js ('saver' batch).
 * Full-screen overlay (above windows, taskbar, top bar) with one analog clock: circle, 12 ticks,
 * hour / minute / thin sweeping second hand, one stroke style, no numbers. Clock centre at 25% of
 * the viewport height, size min(40vh, 70vw); drifts a few px every minute (anti burn-in).
 * Theme: html.hub-light (hub_prefs.js, 'sites-hub.theme') → light bg + dark clock, else dark bg + white clock.
 * Idle: localStorage 'sites-hub.saverIdle' = 0 (off, default) | 10 | 15 | 30 minutes; live via 'storage'.
 * Activity (resets the timer): mousemove / mousedown / keydown / touchstart / wheel on the Hub and on
 *   same-origin app documents, window blur (focus into an app iframe), any hub-* bridge message.
 * Not started while the page is hidden, an element is fullscreen or a video is playing (checked again later).
 * Dismiss: any mouse move, touch, click, wheel or key; the event is swallowed (capture + stop), so it never
 *   reaches the app / desktop below (the click that follows a press is swallowed too).
 * API: window.HubSaver = { start(), stop(), set(min), active() }.
 */
(function () {
  'use strict';
  if (window.HubSaver) return;
  const KEY = 'sites-hub.saverIdle';
  const OK = [0, 10, 15, 30];
  const NS = 'http://www.w3.org/2000/svg';
  let idleMin = 0, last = Date.now(), el = null, raf = 0, driftT = 0, shownAt = 0, swallowUntil = 0;
  const hooked = new WeakSet();

  function readPref() {
    let v = 0;
    try { v = parseInt(localStorage.getItem(KEY), 10); } catch (_) { /* blocked */ }
    idleMin = OK.indexOf(v) >= 0 ? v : 0;
  }
  const poke = () => { last = Date.now(); };

  const css = '#hub-saver{position:fixed;inset:0;z-index:2147483600;background:#0a0b0d;color:#fff;cursor:none;touch-action:none}' +
    'html.hub-light #hub-saver{background:var(--bg,#e9ecf1);color:var(--text,#1d2330)}' +
    '#hub-saver svg{position:absolute;left:50%;top:25vh;width:min(40vh,70vw);height:min(40vh,70vw);transform:translate(-50%,-50%);transition:margin 2s ease;overflow:visible}' +
    '#hub-saver *{stroke:currentColor;fill:none;stroke-linecap:round}';

  function build() {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    el = document.createElement('div'); el.id = 'hub-saver'; el.hidden = true; el.setAttribute('aria-hidden', 'true');
    const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '-100 -100 200 200');
    const add = (tag, a) => { const n = document.createElementNS(NS, tag); for (const k in a) n.setAttribute(k, a[k]); svg.appendChild(n); return n; };
    add('circle', { r: 96, 'stroke-width': 3 });
    for (let i = 0; i < 12; i++) add('line', { x1: 0, y1: -88, x2: 0, y2: i % 3 ? -80 : -74, 'stroke-width': 3, transform: 'rotate(' + i * 30 + ')' });
    el.h = add('line', { x1: 0, y1: 10, x2: 0, y2: -50, 'stroke-width': 6, class: 'hs-h' });
    el.m = add('line', { x1: 0, y1: 12, x2: 0, y2: -74, 'stroke-width': 4, class: 'hs-m' });
    el.s = add('line', { x1: 0, y1: 16, x2: 0, y2: -84, 'stroke-width': 1.5, class: 'hs-s' });
    add('circle', { r: 3, 'stroke-width': 3 });
    el.svg = svg; el.appendChild(svg); document.body.appendChild(el);
  }
  /** Angles (deg) for a Date: hour, minute, second (smooth). */
  function angles(d) {
    const s = d.getSeconds() + d.getMilliseconds() / 1000, m = d.getMinutes() + s / 60, h = (d.getHours() % 12) + m / 60;
    return { h: h * 30, m: m * 6, s: s * 6 };
  }
  function tick() {
    const a = angles(new Date());
    el.h.setAttribute('transform', 'rotate(' + a.h + ')');
    el.m.setAttribute('transform', 'rotate(' + a.m + ')');
    el.s.setAttribute('transform', 'rotate(' + a.s + ')');
    raf = requestAnimationFrame(tick);
  }
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
    el.hidden = true; cancelAnimationFrame(raf); clearInterval(driftT);
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
  window.addEventListener('storage', (e) => { if (e.key === KEY || e.key === null) { readPref(); poke(); } });

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
  setInterval(check, 5000);
  window.HubSaver = {
    start, stop, active,
    set(min) {
      const v = OK.indexOf(+min) >= 0 ? +min : 0;
      try { localStorage.setItem(KEY, String(v)); } catch (_) { /* blocked */ }
      idleMin = v; poke();
    },
    _angles: angles
  };
})();
