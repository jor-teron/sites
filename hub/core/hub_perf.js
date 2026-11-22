/*
 * H166 ?perf=1 debug overlay (hub/core/hub_perf.js).
 * desktop/desktop.html loads this file only when the page URL has ?perf=1; otherwise it is
 * never fetched and this code never runs (zero cost). The WM / splash still record cheap
 * performance.mark calls when the flag is off; those are no-ops for the user.
 *
 * Overlay: boot time (navigation start → desktop shown), last app-open time (open request →
 * iframe load), and a rolling 10 s stalled-frame / long-task count (rAF deltas > 50 ms, and
 * PerformanceObserver 'longtask' where the browser supports it).
 */
(function (global) {
  'use strict';

  const STALL_MS = 50;
  const ROLL_MS = 10000;

  function wantPerf(search) {
    return /(?:^|[?&])perf=1(?:&|$)/.test(String(search || ''));
  }

  function fmtMs(ms) {
    if (ms == null || !isFinite(ms)) return '\u2014';
    const n = Number(ms);
    if (n < 1000) return Math.round(n) + ' ms';
    return (n / 1000).toFixed(2) + ' s';
  }

  function markTime(name) {
    try {
      const list = performance.getEntriesByName(name, 'mark');
      return list.length ? list[list.length - 1].startTime : null;
    } catch (_) { return null; }
  }

  function lastMeasure(name) {
    try {
      const list = performance.getEntriesByName(name, 'measure');
      return list.length ? list[list.length - 1] : null;
    } catch (_) { return null; }
  }

  function bootInfo() {
    const ready = markTime('hub-boot-ready');
    const shown = markTime('hub-boot-shown');
    const started = markTime('hub-desktop-started');
    const boot = shown != null ? shown : (ready != null ? ready : started);
    const splashMin = (global.HubSplash && global.HubSplash.SHOW_MIN_MS) || 3000;
    return { boot: boot, ready: ready, shown: shown, started: started, splashMin: splashMin };
  }

  /** Rolling window of stall / long-task durations. */
  function StallRoll(windowMs, stallMs) {
    this.windowMs = windowMs == null ? ROLL_MS : windowMs;
    this.stallMs = stallMs == null ? STALL_MS : stallMs;
    this.events = [];
  }
  StallRoll.prototype.trim = function (now) {
    const cut = now - this.windowMs;
    const ev = this.events;
    let i = 0;
    while (i < ev.length && ev[i].t < cut) i++;
    if (i) this.events = ev.slice(i);
  };
  StallRoll.prototype.add = function (now, dur) {
    if (!(dur > this.stallMs)) return false;
    this.events.push({ t: now, dur: dur });
    this.trim(now);
    return true;
  };
  StallRoll.prototype.frame = function (now, delta) { return this.add(now, delta); };
  StallRoll.prototype.count = function (now) { if (now != null) this.trim(now); return this.events.length; };
  StallRoll.prototype.longest = function (now) {
    if (now != null) this.trim(now);
    let m = 0;
    for (let i = 0; i < this.events.length; i++) if (this.events[i].dur > m) m = this.events[i].dur;
    return m;
  };

  function bootLines(info) {
    const lines = [];
    lines.push('boot  ' + fmtMs(info.boot));
    if (info.ready != null && info.shown != null && Math.abs(info.shown - info.ready) >= 20) {
      lines.push('      ready ' + fmtMs(info.ready) + ' \u00b7 splash min ' + fmtMs(info.splashMin));
    } else if (info.ready != null && info.boot != null && info.ready !== info.boot) {
      lines.push('      ready ' + fmtMs(info.ready));
    }
    return lines;
  }

  const api = {
    wantPerf: wantPerf,
    fmtMs: fmtMs,
    STALL_MS: STALL_MS,
    ROLL_MS: ROLL_MS,
    StallRoll: StallRoll,
    markTime: markTime,
    lastMeasure: lastMeasure,
    bootInfo: bootInfo,
    bootLines: bootLines
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;

  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  window.HubPerf = api;

  function el() {
    let n = document.getElementById('hub-perf');
    if (n) return n;
    n = document.createElement('div');
    n.id = 'hub-perf';
    n.setAttribute('role', 'status');
    n.setAttribute('aria-live', 'polite');
    n.setAttribute('aria-label', 'Hub performance');
    n.style.cssText = [
      'position:fixed',
      'right:10px',
      'bottom:52px',
      'z-index:2147483646',
      'pointer-events:none',
      'font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
      'color:#f4f7fb',
      'background:rgba(10,14,24,0.84)',
      'border:1px solid rgba(255,255,255,0.22)',
      'border-radius:8px',
      'padding:8px 10px',
      'min-width:168px',
      'max-width:240px',
      'white-space:pre',
      'text-shadow:0 1px 2px rgba(0,0,0,0.55)',
      'box-shadow:0 2px 10px rgba(0,0,0,0.35)',
      'backdrop-filter:blur(8px)'
    ].join(';');
    const root = document.documentElement;
    if (root) root.appendChild(n);
    else if (document.body) document.body.appendChild(n);
    return n;
  }

  const frames = new StallRoll();
  const tasks = new StallRoll();
  let lastApp = null;
  let lastPaint = 0;
  let lastTs = 0;

  function readApp() {
    const m = lastMeasure('hub-app-open');
    if (!m) return lastApp;
    lastApp = { ms: m.duration, at: m.startTime };
    return lastApp;
  }

  function text() {
    const info = bootInfo();
    const app = readApp();
    const now = (performance && performance.now) ? performance.now() : 0;
    const fc = frames.count(now), fl = frames.longest(now);
    const tc = tasks.count(now), tl = tasks.longest(now);
    const lines = ['Hub perf'];
    bootLines(info).forEach(function (l) { lines.push(l); });
    if (!info.boot) lines.push('boot  \u2026');
    lines.push('app   ' + (app ? fmtMs(app.ms) : '\u2014'));
    lines.push('jank  ' + fc + ' / ' + (fl ? fmtMs(fl) : '\u2014') + '  (10s)');
    if (api._longtask) lines.push('long  ' + tc + (tl ? ' / ' + fmtMs(tl) : ''));
    return lines.join('\n');
  }

  function paint(force) {
    const t = (performance && performance.now) ? performance.now() : Date.now();
    if (!force && t - lastPaint < 200) return;
    lastPaint = t;
    const n = el();
    const s = text();
    if (n.textContent !== s) n.textContent = s;
  }

  function onFrame(ts) {
    if (lastTs) frames.frame(ts, ts - lastTs);
    lastTs = ts;
    paint(false);
    try { requestAnimationFrame(onFrame); } catch (_) { /* no rAF */ }
  }

  function watchLongtask() {
    if (typeof PerformanceObserver !== 'function') return;
    let types = [];
    try { types = PerformanceObserver.supportedEntryTypes || []; } catch (_) { types = []; }
    if (types.indexOf && types.indexOf('longtask') < 0 && types.length) return;
    try {
      const obs = new PerformanceObserver(function (list) {
        const now = performance.now();
        const ev = list.getEntries();
        for (let i = 0; i < ev.length; i++) tasks.add(now, ev[i].duration);
        paint(true);
      });
      obs.observe({ type: 'longtask', buffered: true });
      api._longtask = true;
    } catch (_) { /* Safari / Firefox may lack longtask */ }
  }

  function watchMeasures() {
    if (typeof PerformanceObserver !== 'function') return;
    try {
      const obs = new PerformanceObserver(function () { paint(true); });
      obs.observe({ type: 'measure', buffered: true });
    } catch (_) {
      try {
        const obs = new PerformanceObserver(function () { paint(true); });
        obs.observe({ entryTypes: ['measure', 'mark'] });
      } catch (__) { /* old */ }
    }
  }

  function hookEvents() {
    window.addEventListener('hub-desktop-started', function () { paint(true); });
    window.addEventListener('hub-wm-session-restored', function () { paint(true); });
    window.addEventListener('hub-wm-frame-load', function () { readApp(); paint(true); });
  }

  function start() {
    hookEvents();
    watchMeasures();
    watchLongtask();
    paint(true);
    try { requestAnimationFrame(onFrame); } catch (_) { /* no rAF */ }
    // In case the splash already finished before this file ran, fill boot from marks / state.
    setTimeout(function () { paint(true); }, 0);
  }

  api.start = start;
  api.paint = paint;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
