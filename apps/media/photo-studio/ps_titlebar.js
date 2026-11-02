/* Hub Photo Studio HPS5.1: Export (PNG) / Save (.hps) / Print in the Hub window title bar (Hub H49 hubTitleBar
   contract, same pattern as calendar-maker/ui/cm_titlebar.js). Inside the Hub (after hubTitleBarHello) the buttons
   go to the title bar and body.hub-titlebar hides the in-app row. Standalone / file:// / Phone: a slim row of the
   same 3 buttons at the top of the app. Every button just clicks the existing Save-menu button, so no logic is
   duplicated (disabled state and checks stay theirs). */
(function () {
  'use strict';
  const V = 1;
  const BTNS = [
    { id: 'export', label: 'Export', icon: '⤓', title: 'Export as PNG', sel: '[data-act="savePng"]' },
    { id: 'save', label: 'Save', icon: '💾', title: 'Save project (.hps) to keep editing later', sel: '#ps-save-hps' },
    { id: 'print', label: 'Print', icon: '⎙', title: 'Print', sel: '[data-act="print"]' },
  ];
  const run = (id) => { const b = BTNS.find((x) => x.id === id); const el = b && document.querySelector(b.sel); if (el && !el.disabled) el.click(); };

  /* in-app fallback row: floats at the top right of the stage */
  const row = document.createElement('div');
  row.id = 'ps-topbar';
  for (const b of BTNS) {
    const el = document.createElement('button');
    el.type = 'button'; el.tabIndex = -1; el.className = 'ps-top-btn'; el.dataset.top = b.id;
    el.title = b.title; el.textContent = b.label;
    el.addEventListener('click', () => run(b.id));
    row.appendChild(el);
  }
  const app = document.getElementById('stage');
  if (app) app.insertBefore(row, app.firstChild);

  if (window.parent === window) return;
  let linked = false;
  const target = (location.origin && location.origin !== 'null') ? location.origin : '*';
  const post = (body) => { body.v = V; try { window.parent.postMessage({ hubTitleBar: body }, target); } catch (_) { /* parent gone */ } };
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || (target !== '*' && e.origin !== target)) return;
    const d = e.data; if (!d || typeof d !== 'object') return;
    if (d.hubTitleBarHello && d.hubTitleBarHello.v === V) {
      linked = true;
      document.body.classList.add('hub-titlebar');
      post({ op: 'set', buttons: BTNS.map((b) => ({ id: b.id, label: b.label, icon: b.icon, enabled: true, title: b.title })) });
    } else if (linked && d.hubTitleBarClick && d.hubTitleBarClick.v === V && d.hubTitleBarClick.kind === 'button') {
      run(d.hubTitleBarClick.id);
    }
  });
})();
