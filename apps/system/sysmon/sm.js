/*
 * System Monitor start-up (apps/system/sysmon/sm.js) — tab bar (H24 order: Device, CPU, Memory,
 * Storage, Network, Battery, then any others), open the tab from #hash (default Device), follow hash changes, start the 1 s sampler (it pauses itself when hidden / minimised).
 */
(function () {
  'use strict';
  const ORDER = ['device', 'cpu', 'memory', 'storage', 'network', 'battery'];
  const rank = (t) => { const i = ORDER.indexOf(t.id); return i < 0 ? ORDER.length : i; };
  SM.tabs.sort((a, b) => rank(a) - rank(b));
  SM.drawTabs();
  SM.open((location.hash || '#device').slice(1), true);
  window.addEventListener('hashchange', () => SM.open(location.hash.slice(1), true));
  window.addEventListener('resize', () => { if (SM.current && SM.current.draw) SM.current.draw(); });
  SM.startSampler();
})();

