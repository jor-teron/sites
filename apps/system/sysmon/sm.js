/*
 * System Monitor start-up (apps/system/sysmon/sm.js) — tab bar, open the tab from #hash (default
 * Tasks), follow hash changes, start the 1 s sampler (it pauses itself when hidden / minimised).
 */
(function () {
  'use strict';
  SM.drawTabs();
  SM.open((location.hash || '#tasks').slice(1), true);
  window.addEventListener('hashchange', () => SM.open(location.hash.slice(1), true));
  window.addEventListener('resize', () => { if (SM.current && SM.current.draw) SM.current.draw(); });
  SM.startSampler();
})();

