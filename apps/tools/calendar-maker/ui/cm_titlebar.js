/* Calendar Maker CM16 ui: page tabs + Print / PDF in the Hub window title bar (Hub H49 hubTitleBar contract;
   same pattern as apps/office/shared/office-hubbar.js). Only after the Hub says hubTitleBarHello (Desktop mode):
   then body.hub-titlebar hides the in-app top row. Standalone, file:// without Hub, Phone mode: nothing changes. */
(function () {
  'use strict';
  const CM = window.CM, V = 1;
  if (!CM || !CM.showPage || window.parent === window) return;
  /* Tab order (Jor, CM16); CM15 added About as the last tab */
  CM.TABS = [
    { id: 'design', label: 'Design' },
    { id: 'list', label: 'Holiday List' },
    { id: 'ovw', label: 'Year Overview' },
    { id: 'hol', label: 'Holidays' },
    { id: 'about', label: 'About' }, /* CM15 */
  ];
  /* Print / PDF act on the active page's own buttons (Holidays and About have none: greyed out) */
  const ACT = { design: ['print', 'pdf'], list: ['list-print', 'list-pdf'], ovw: ['ovw-print', 'ovw-pdf'] };
  let linked = false;
  const target = (location.origin && location.origin !== 'null') ? location.origin : '*';
  function post(body) { body.v = V; try { window.parent.postMessage({ hubTitleBar: body }, target); } catch (_) { /* parent gone */ } }
  function buttons() {
    const on = !!ACT[CM.page];
    return [{ id: 'print', label: 'Print', icon: '⎙', enabled: on, title: 'Print this page' },
      { id: 'pdf', label: 'PDF', icon: '⤓', enabled: on, title: 'Download this page as PDF' }];
  }
  CM.onPage(() => { if (linked) post({ op: 'update', activeTab: CM.page, buttons: buttons() }); });
  window.addEventListener('message', (e) => {
    if (e.source !== window.parent || (target !== '*' && e.origin !== target)) return;
    const d = e.data; if (!d || typeof d !== 'object') return;
    if (d.hubTitleBarHello && d.hubTitleBarHello.v === V) {
      linked = true;
      document.body.classList.add('hub-titlebar');
      post({ op: 'set', buttons: buttons(), tabs: CM.TABS.slice(0, 10), activeTab: CM.page });
    } else if (linked && d.hubTitleBarClick && d.hubTitleBarClick.v === V && typeof d.hubTitleBarClick.id === 'string') {
      const c = d.hubTitleBarClick;
      if (c.kind === 'tab' && CM.TABS.some((t) => t.id === c.id)) CM.showPage(c.id);
      else if (c.kind === 'button' && ACT[CM.page] && (c.id === 'print' || c.id === 'pdf')) {
        const b = document.getElementById(ACT[CM.page][c.id === 'print' ? 0 : 1]); if (b && b.onclick) b.onclick();
      }
    }
  });
})();
