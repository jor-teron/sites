(function (root, factory) {
  const api = factory();
  if (typeof module === 'object') module.exports = api;
  else Object.assign(root.DS = root.DS || {}, api);
})(typeof window === 'object' ? window : globalThis, function () {
  'use strict';
  function mockDefinition(side = 'left') {
    const o = side === 'left' ? -3.5 : 3.5;
    const ring = side === 'left' ? [[183.5,156],[192,167],[196,180],[187,195],[172,195],[156,183.5]] :
      [[176.5,156],[166,167],[164,180],[173,194],[188,194],[196,180],[187,165],[171,166],[156,176.5]];
    return { id: 'mock', name: 'Mock driving test', town: true, mock: true, side,
      spawn: [60 - o, 24, Math.PI / 2], time: 0,
      cards: ['STOP at the first line. Check mirrors, signal and turn left. Follow the rings in order.',
        'Obey signals, yield at crossings and the roundabout. Return round the block and reverse into the final bay.'],
      gates: [[60-o,45],[60-o,60],[90,60+o],[130,60+o],[155,60+o],[180-o,60+o],[180-o,110]].concat(ring,
        [[110,180-o],[60+o,180-o],[60+o,125],[60+o,75],[68,60+o],[90,60+o],[110,60+o],[112,50],[104,45]]),
      parking: { x:104, y:45, heading:0, width:12, height:3 } };
  }
  function testReport(faults, completed, elapsed) {
    const list = faults.map(f => Object.assign({}, f));
    if (!completed) list.push({ code:'incomplete', severity:'serious', reason:'The full route and final parking were not completed.', time: +elapsed.toFixed(1) });
    const serious = list.filter(f => f.severity === 'serious').length, minor = list.length - serious;
    return { pass: completed && serious === 0 && minor <= 10, serious, minor, faults: list,
      elapsed: Math.round(elapsed), completed, score: Math.max(0, 100 - serious * 25 - minor * 5) };
  }
  const quizIDs = ['stop','giveway','noentry','speed50','nopark','nohorn','nouturn','noovertake','oneway','left','right','noped','school','zebra','bendL','bendR','bridge','hump','slip','round'];
  function shuffled(items, rng) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i],out[j]] = [out[j],out[i]]; }
    return out;
  }
  function signQuiz(signs, rng = Math.random) {
    const selected = quizIDs.map(id => signs.find(s => s.id === id)).filter(Boolean);
    return shuffled(selected, rng).map(sign => ({ sign, answer: sign.name,
      choices: shuffled([sign.name].concat(shuffled(signs.filter(s => s.id !== sign.id), rng).slice(0,3).map(s => s.name)), rng) }));
  }
  return { mockDefinition, testReport, signQuiz };
});
