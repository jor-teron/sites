/*
 * Memory tab (apps/system/sysmon/sm_memory.js) — the Hub page's JavaScript heap
 * (performance.memory: Chrome / Edge only; read from the Hub page when we run inside it, which
 * shares one heap with its same-origin apps) as a live 60 s graph, plus navigator.deviceMemory
 * (rounded RAM class, Chrome / Edge). Anything missing says "Not available".
 */
(function () {
  'use strict';
  const { el, card, kv, bytes, na, hist, hub } = SM;
  const H = hist(60);
  let cv = null, info = null;
  function mem() {
    const h = hub();
    try { if (h && h.performance && h.performance.memory) return { m: h.performance.memory, who: 'Hub page' }; } catch (_) { /* ignore */ }
    return performance.memory ? { m: performance.memory, who: 'This page' } : null;
  }
  function sample() { const x = mem(); H.push(x ? x.m.usedJSHeapSize : null); }
  function draw() {
    if (!cv) return;
    const x = mem();
    SMChart.draw(cv, H.list(), { label: bytes });
    info.replaceChildren(kv([
      ['Heap in use (' + (x ? x.who : '\u2014') + ')', x ? bytes(x.m.usedJSHeapSize) : 'Not available'],
      ['Heap reserved', x ? bytes(x.m.totalJSHeapSize) : '\u2014'],
      ['Heap limit', x ? bytes(x.m.jsHeapSizeLimit) : '\u2014'],
      ['Device memory (rounded)', navigator.deviceMemory ? navigator.deviceMemory + ' GB or more' : 'Not available']
    ]));
  }
  SM.tab({
    id: 'memory', title: 'Memory', icon: '\uD83E\uDDE0',
    render(pane) {
      info = el('div');
      const has = !!mem();
      cv = el('canvas', 'graph');
      pane.append(card('JavaScript heap', has ? cv : na('Heap size is only shown in Chrome and Edge.'), info,
        el('p', 'muted small', 'This is the memory the Hub\u2019s scripts use, not your device\u2019s total RAM use.')));
      if (!has) cv = el('canvas');
    },
    sample, draw
  });
})();
