/* Each wave: start second, lane order, invader pattern, spacing. No random difficulty. */
(function (root) {
  'use strict';
  const G = root.GardenGuard || require('./data.js');
  const plans = [
    ['First sprouts', [[25,[2,0,4,1,3],['basic'],9], [83,[0,3,1,4,2],['basic'],5], [132,[2,1,3,0,4],['basic','cone'],3]]],
    ['Ridge patrol', [[23,[1,3,0,4,2],['basic'],7], [72,[0,2,4,1,3,2],['cone','basic'],4], [122,[4,3,2,1,0,2,4],['basic','cone'],3]]],
    ['Heavy footsteps', [[22,[4,2,0,1,3],['basic','cone'],7], [75,[0,1,2,3,4,1],['cone','basic'],4], [130,[2,0,4,3,1,2],['bucket','basic','cone'],4]]],
    ['Chilly welcome', [[20,[0,4,2,1,3],['cone','basic'],7], [70,[4,2,0,3,1,2,4],['cone','bucket','basic'],4], [125,[0,1,2,3,4,2,0,4],['bucket','cone','basic'],3]]],
    ['Garden stand', [[20,[2,0,4,1,3],['cone','basic'],6], [66,[0,2,4,1,3,2,0,4],['bucket','cone','basic'],4], [122,[4,3,2,1,0,4,2,0,1,3],['bucket','cone','basic'],3]]]
  ];
  G.LEVELS = plans.map(([name, waves], level) => {
    const events = [];
    waves.forEach(([at, rows, types, gap], wave) => rows.forEach((row, i) =>
      events.push({ at: at + i * gap, row, kind: types[i % types.length], wave })));
    events.sort((a,b) => a.at - b.at);
    return { name, level, events, flags: waves.map(w => w[0]), end: events[events.length - 1].at };
  });
  if (typeof module !== 'undefined') module.exports = G.LEVELS;
})(typeof window === 'undefined' ? globalThis : window);
