/*
 * Network tab (apps/tools/sysmon/sm_net.js) — online / offline (navigator.onLine + events) and,
 * where the browser has it (Chrome / Edge / Android), navigator.connection: type, effectiveType,
 * downlink (Mbit/s estimate), rtt (ms estimate), saveData. Live on change; a 60 s rtt graph.
 */
(function () {
  'use strict';
  const { el, card, kv, hist } = SM;
  const H = hist(60);
  let box = null, cv = null;
  const C = navigator.connection || navigator.mozConnection || navigator.webkitConnection || null;
  function sample() { H.push(C && C.rtt != null ? C.rtt : null); }
  function draw() {
    if (!box) return;
    const on = navigator.onLine;
    const dot = el('span', 'dot ' + (on ? 'ok' : 'bad'));
    const state = el('p', 'big'); state.append(dot, document.createTextNode(on ? ' Online' : ' Offline'));
    box.replaceChildren(state, kv([
      ['Connection type', C && C.type ? C.type : 'Not available'],
      ['Speed class', C && C.effectiveType ? C.effectiveType.toUpperCase() : 'Not available'],
      ['Download (estimate)', C && C.downlink != null ? C.downlink + ' Mbit/s' : 'Not available'],
      ['Round trip (estimate)', C && C.rtt != null ? C.rtt + ' ms' : 'Not available'],
      ['Data saver', C && C.saveData != null ? (C.saveData ? 'On' : 'Off') : 'Not available']
    ]));
    if (cv && C) SMChart.draw(cv, H.list(), { label: (v) => Math.round(v) + ' ms' });
  }
  window.addEventListener('online', () => draw());
  window.addEventListener('offline', () => draw());
  if (C && C.addEventListener) C.addEventListener('change', () => draw());
  SM.tab({
    id: 'network', title: 'Network', icon: '\uD83D\uDCF6',
    render(pane) {
      box = el('div');
      cv = C ? el('canvas', 'graph') : null;
      pane.append(card('Connection', box, cv && el('h3', '', 'Round trip, last minute'), cv,
        el('p', 'muted small', 'Speed and round trip are the browser\u2019s rough estimates (capped and rounded for privacy), not a speed test.')));
    },
    sample, draw
  });
})();
