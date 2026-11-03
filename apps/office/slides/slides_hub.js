/* Hub Office Slides SL4 — Hub app-bar bridge (SLHub), same v:1 protocol as Spreadsheet (spreadsheet_hub.js) and Draftly
   (draftly-hub.js), Hub side hub/link/hub-gamebar.js. Only active in a frame; standalone nothing changes.
     app -> hub {type:'hub-ready'}                                  on load
     hub -> app {type:'hub-hello'}          -> body.in-hub (own top row hidden), reply hub-app + caps
     app -> hub {type:'hub-app', app:'Slides', tabs:[{id,label,menu?}], activeTab, title}   title = deck name
     app -> hub {type:'hub-tab', id} · {type:'hub-title', value}
     hub -> app {type:'hub-action', id:'tab:<id>'}   switch tab; 'tab:file' opens the File menu (top-left in the frame)
     hub -> app {type:'hub-settings'}       open Settings · app -> hub {type:'hub-app-caps', settings:true}
   The H49 title bar (Quick Access buttons + the same tabs, hubTitleBar*) is ../shared/office-quick.js + office-hubbar.js;
   its tabs replace these in the Desktop window bar, Phone mode keeps these.
   SLHub.init({ tabs, activeTab(), selectTab(id), openFile(), title(), openSettings() }) · SLHub.tab() · SLHub.title() */
(function () {
  'use strict';
  var V = 1, A = null, linked = false, lastTab = null, lastTitle = null;
  var IN_FRAME = (function () { try { return window.parent && window.parent !== window; } catch (e) { return true; } })();
  function post(m) { if (!IN_FRAME) return; try { window.parent.postMessage(Object.assign({ v: V }, m), (location.origin && location.origin !== 'null') ? location.origin : '*'); } catch (_) { /* parent gone */ } }
  function originOk(o) { return o === location.origin || o === 'null' || location.origin === 'null' || String(o).indexOf('file:') === 0; }
  function tabs() { return [{ id: 'file', label: 'File', menu: true }].concat(A.tabs.map(function (t) { return { id: t.id, label: t.label }; })); }
  function sendApp() {
    lastTab = A.activeTab(); lastTitle = A.title();
    post({ type: 'hub-app', app: 'Slides', tabs: tabs(), activeTab: lastTab, title: lastTitle });
    post({ type: 'hub-app-caps', settings: true });
  }
  var H = {
    linked: function () { return linked; },
    init: function (o) {
      A = o;
      if (!IN_FRAME) return;
      addEventListener('message', function (e) {
        if (e.source !== window.parent || !originOk(e.origin)) return;
        var d = e.data; if (!d || typeof d !== 'object') return;
        if (d.type === 'hub-settings') { A.openSettings(); return; }
        if (d.v !== V) return;
        if (d.type === 'hub-hello') {
          if (!linked) { linked = true; document.body.classList.add('in-hub'); }
          sendApp();
        } else if (d.type === 'hub-action' && linked && typeof d.id === 'string' && d.id.indexOf('tab:') === 0) {
          var id = d.id.slice(4);
          if (id === 'file') A.openFile();
          else if (A.tabs.some(function (t) { return t.id === id; })) A.selectTab(id);
        }
      });
      post({ type: 'hub-ready' });
    },
    tab: function () { if (!linked) return; var t = A.activeTab(); if (t !== lastTab) { lastTab = t; post({ type: 'hub-tab', id: t }); } },
    title: function () { if (!linked) return; var v = A.title(); if (v !== lastTitle) { lastTitle = v; post({ type: 'hub-title', value: v }); } }
  };
  window.SLHub = H;
})();
