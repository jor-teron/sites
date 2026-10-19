/*
 * Busy meter (shared/perf/busy_meter.js) — an ESTIMATE of how busy this page's main thread is
 * (the Hub and its same-origin apps share one), for apps/tools/sysmon and the Hub's optional
 * taskbar meter (hub/hub_traymeter.js). Browsers do not expose real CPU usage, so it combines:
 *   - timer lag: a 50 ms timer that fires late means the thread was busy;
 *   - long tasks (PerformanceObserver 'longtask', Chrome / Edge) in the same window.
 * API window.BusyMeter.create() → { start(), stop(), take() → 0..1 busy since the last take,
 *   longTasks: true when long-task timing is supported }
 */
window.BusyMeter = (function () {
  'use strict';
  const TICK = 50;
  function create() {
    let t = 0, last = 0, lag = 0, long = 0, since = 0, obs = null;
    const longTasks = !!(window.PerformanceObserver && PerformanceObserver.supportedEntryTypes &&
      PerformanceObserver.supportedEntryTypes.indexOf('longtask') >= 0);
    function tick() {
      const now = performance.now();
      const late = now - last - TICK;
      if (late > 4) lag += Math.min(late, 1000);   // a background-throttled tab is not "busy" past 1 s
      last = now;
    }
    function start() {
      if (t) return;
      last = since = performance.now(); lag = long = 0;
      t = setInterval(tick, TICK);
      if (longTasks && !obs) {
        try {
          obs = new PerformanceObserver((list) => list.getEntries().forEach((e) => { long += e.duration; }));
          obs.observe({ type: 'longtask', buffered: false });
        } catch (_) { obs = null; }
      }
    }
    function stop() {
      clearInterval(t); t = 0;
      if (obs) { obs.disconnect(); obs = null; }
    }
    function take() {
      const now = performance.now(), span = Math.max(1, now - since);
      const v = Math.max(lag, long) / span;
      since = now; lag = 0; long = 0;
      return Math.max(0, Math.min(1, v));
    }
    return { start, stop, take, longTasks };
  }
  return { create };
})();
