/* Hub Photo Studio HPS5.4: in the Hub the buttons sit left after the app name with icon + label (Hub H110 align:'left', showLabel).
   HPS5.3: Save / Export / Print, icon + label (Hub H49 renders icon OR label, so the Hub gets
   label '💾 Save' etc. with no icon field; left placement needs a Hub change). HPS5.1: Export (PNG) / Save (.hps) / Print in the Hub window title bar (Hub H49 hubTitleBar
   contract, same pattern as calendar-maker/ui/cm_titlebar.js). Inside the Hub (after hubTitleBarHello) the buttons
   go to the title bar and body.hub-titlebar hides the in-app row. Standalone / file:// / Phone: a slim row of the
   same 3 buttons at the top of the app. Every button just clicks the existing Save-menu button, so no logic is
   duplicated (disabled state and checks stay theirs). */
(function () {
  'use strict';
  const V = 1;
  const BTNS = [
    { id: 'save', label: 'Save', icon: '💾', title: 'Save project (.hps) to keep editing later (Ctrl+S)', sel: '#ps-save-hps' },
    { id: 'export', label: 'Export', icon: '⤓', title: 'Export as PNG (Ctrl+E)', sel: '[data-act="savePng"]' },
    { id: 'print', label: 'Print', icon: '⎙', title: 'Print (Ctrl+P)', sel: '[data-act="print"]' },
  ];
  const run = (id) => { const b = BTNS.find((x) => x.id === id); const el = b && document.querySelector(b.sel); if (el && !el.disabled) el.click(); };

  /* in-app fallback row: floats at the top left of the stage; icons only <=480px (CSS) */
  const row = document.createElement('div');
  row.id = 'ps-topbar';
  for (const b of BTNS) {
    const el = document.createElement('button');
    el.type = 'button'; el.tabIndex = -1; el.className = 'ps-top-btn'; el.dataset.top = b.id;
    el.title = b.title; el.setAttribute('aria-label', b.label);
    const ic = document.createElement('span'); ic.className = 'ps-top-ic'; ic.textContent = b.icon;
    const lb = document.createElement('span'); lb.className = 'ps-top-lb'; lb.textContent = b.label;
    el.append(ic, lb);
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
      post({ op: 'set', align: 'left', buttons: BTNS.map((b) => ({ id: b.id, label: b.label, icon: b.icon, showLabel: true, enabled: true, title: b.title })) });   // HPS5.4
    } else if (linked && d.hubTitleBarClick && d.hubTitleBarClick.v === V && d.hubTitleBarClick.kind === 'button') {
      run(d.hubTitleBarClick.id);
    }
  });
})();
