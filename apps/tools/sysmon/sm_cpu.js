/*
 * CPU tab (apps/tools/sysmon/sm_cpu.js) — navigator.hardwareConcurrency (logical cores) and a live
 * "busy" graph: an ESTIMATE of how busy the Hub's main thread is (timer lag + long tasks,
 * shared/perf/busy_meter.js), one point per second, 60 s. Also the long tasks seen in the last minute.
 */
(function () {
  'use strict';
  const { el, card, kv, na, hist, pct } = SM;
  const H = hist(60), L = hist(60);
  const meter = window.BusyMeter ? BusyMeter.create() : null;
  let cv = null, info = null;
  function sample() {
    if (!meter) return;
    meter.start();
    const v = meter.take();
    H.push(v); L.push(v > 0.05 ? 1 : 0);
  }
  function draw() {
    if (!cv) return;
    SMChart.draw(cv, H.list(), { max: 1, label: pct, color: ['#50e6aa', '#3dd6ff', '#7c5cff'] });
    const l = H.list(), avg = l.length ? l.reduce((a, b) => a + b, 0) / l.length : null;
    info.replaceChildren(kv([
      ['Logical cores', navigator.hardwareConcurrency ? String(navigator.hardwareConcurrency) : 'Not available'],
      ['Busy now (estimate)', pct(H.last())],
      ['Average, last minute', pct(avg)],
      ['Seconds with work (>5%)', L.list().reduce((a, b) => a + b, 0) + ' of ' + l.length],
      ['Long-task timing', meter && meter.longTasks ? 'Yes' : 'Not available (timer lag only)']
    ]));
  }
  // no measuring while hidden / minimised (no wasted work): SM calls pause(); hidden stops at once
  document.addEventListener('visibilitychange', () => { if (meter && document.hidden) meter.stop(); });
  SM.tab({
    id: 'cpu', title: 'CPU', icon: '\u2699\uFE0F',
    render(pane) {
      info = el('div');
      cv = el('canvas', 'graph');
      pane.append(card('Hub main thread busy (estimate)', meter ? cv : na(), info,
        el('p', 'muted small', 'Web pages cannot read real CPU use. This shows how often the Hub\u2019s own scripts kept the page busy.')));
    },
    sample, draw,
    pause() { if (meter) meter.stop(); }
  });
})();
