/*
 * Data used this session (apps/system/sysmon/sm_data.js), H21 — an ESTIMATE of what the Hub's pages
 * loaded since the Hub opened, from the Resource Timing API (performance 'resource' + 'navigation'
 * entries): this page (PerformanceObserver), and where reachable (same origin) the Hub page around us
 * (window.parent / top) and every same-origin frame inside it (the other open apps).
 *   bytes = transferSize, or encodedBodySize when the browser gives no transferSize.
 *   transferSize 0 with a body (encoded / decoded size > 0) = 'From offline or browser cache' (no data used;
 *   the API cannot tell the Hub's offline cache from the browser's own cache).
 *   Groups: Hub files (hub/, shared/, hub.html, sw.js and the rest of this site), Apps (apps/), Other
 *   sites (cross-origin; sizes are often 0 without Timing-Allow-Origin → counted, 'size hidden').
 * Entries are remembered once seen (key: page time origin + start time + URL), so a closed app's loads
 * stay counted while System Monitor is open; loads in a frame that closed before we looked are missed.
 * Standalone / file://: only this page (file:// entries have no size).
 * API: window.SMData = { scan() → totals, render() → <div> (sm_net.js puts it in a card), update() }
 */
window.SMData = (function () {
  'use strict';
  const seen = new Map();   // key → { group, bytes, cache, hidden }
  const ORIGIN = location.origin;

  function topWin() {
    let w = window;
    try { while (w.parent && w.parent !== w) { void w.parent.document; w = w.parent; } } catch (_) { /* cross-origin parent: stop here */ }
    return w;
  }
  /** Every same-origin window from the top we can reach, frames included. */
  function windows() {
    const out = [], q = [topWin()];
    while (q.length && out.length < 64) {
      const w = q.shift();
      try { void w.document; if (out.indexOf(w) >= 0) continue; out.push(w); } catch (_) { continue; }
      try { if (w.performance && w.performance.setResourceTimingBufferSize && !w.__smBuf) { w.performance.setResourceTimingBufferSize(3000); w.__smBuf = 1; } } catch (_) { /* ignore */ }
      try { for (let i = 0; i < w.frames.length; i++) q.push(w.frames[i]); } catch (_) { /* ignore */ }
    }
    if (out.indexOf(window) < 0) out.push(window);
    return out;
  }
  function group(url) {
    let u;
    try { u = new URL(url); } catch (_) { return 'hub'; }
    if (u.protocol === 'data:' || u.protocol === 'blob:') return '';
    if (u.origin !== ORIGIN && !(u.protocol === 'file:' && location.protocol === 'file:')) return 'other';
    return /\/apps\//.test(u.pathname) ? 'apps' : 'hub';
  }
  function add(e, w) {
    const g = group(e.name);
    if (!g) return;
    let to = 0;
    try { to = w.performance.timeOrigin || 0; } catch (_) { /* ignore */ }
    const key = to + '|' + e.startTime + '|' + e.name;
    if (seen.has(key)) return;
    const body = (e.encodedBodySize || 0) || (e.decodedBodySize || 0);
    const ts = e.transferSize;
    const r = { group: g, bytes: 0, cache: 0, hidden: false };
    if (ts > 0) r.bytes = ts;
    else if (ts == null) r.bytes = e.encodedBodySize || 0;
    else if (body > 0) r.cache = body;
    else r.hidden = g === 'other';
    seen.set(key, r);
  }
  function collect(w) {
    try { (w.performance.getEntriesByType('navigation') || []).forEach((e) => add(e, w)); } catch (_) { /* ignore */ }
    try { (w.performance.getEntriesByType('resource') || []).forEach((e) => add(e, w)); } catch (_) { /* ignore */ }
  }
  try {
    if (window.PerformanceObserver) new PerformanceObserver((l) => l.getEntries().forEach((e) => add(e, window))).observe({ type: 'resource', buffered: true });
  } catch (_) { /* old browser: polled below */ }

  function scan() {
    windows().forEach(collect);
    const t = { hub: { n: 0, b: 0 }, apps: { n: 0, b: 0 }, other: { n: 0, b: 0, hidden: 0 }, cache: { n: 0, b: 0 }, total: 0, n: 0, frames: 0 };
    seen.forEach((r) => {
      if (r.cache) { t.cache.n++; t.cache.b += r.cache; return; }
      const g = t[r.group]; g.n++; g.b += r.bytes; if (r.hidden) g.hidden++;
      t.total += r.bytes; t.n++;
    });
    t.frames = windows().length;
    let start = 0;
    try { start = topWin().performance.timeOrigin; } catch (_) { /* ignore */ }
    t.start = start || (performance.timeOrigin || Date.now());
    t.inHub = topWin() !== window;
    return t;
  }

  let box = null;
  function fmtStart(ms) {
    const d = new Date(ms), mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' (' + (mins < 60 ? mins + ' min' : Math.floor(mins / 60) + ' h ' + (mins % 60) + ' min') + ' ago)';
  }
  function update() {
    if (!box) return;
    const B = SM.bytes, t = scan();
    const req = (n) => n + (n === 1 ? ' request' : ' requests');
    const big = SM.el('p', 'big', B(t.total));
    const other = t.other.n ? B(t.other.b) + ' \u00b7 ' + req(t.other.n) + (t.other.hidden ? ' (' + t.other.hidden + ' size hidden)' : '') : 'None';
    box.replaceChildren(big, SM.kv([
      ['Hub files', B(t.hub.b) + ' \u00b7 ' + req(t.hub.n)],
      ['Apps', B(t.apps.b) + ' \u00b7 ' + req(t.apps.n)],
      ['Other sites', other],
      ['From offline or browser cache (no data used)', B(t.cache.b) + ' \u00b7 ' + req(t.cache.n)],
      [t.inHub ? 'Hub opened' : 'Page opened', fmtStart(t.start)],
      ['Pages looked at', String(t.frames)]
    ]), SM.el('p', 'muted small', (t.inHub ? 'Estimate of what the Hub and its open apps loaded since the Hub opened'
      : 'Running outside the Hub: only this page is counted') + '. Other sites often hide their sizes; apps closed before System Monitor opened are not counted' +
      (location.protocol === 'file:' ? '; opened as a file, so local files have no size.' : '.')));
  }
  function render() { box = SM.el('div', 'data-used'); update(); return box; }
  return { scan, render, update };
})();
