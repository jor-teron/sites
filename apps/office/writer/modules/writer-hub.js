/* ============================================================
   FILE: modules/writer-hub.js
   DF25: was modules/draftly-hub.js (global Draftly is now Writer).
   PROJECT: Writer
   ROLE: Sites hub bridge (v:1, same rules as tic-tac-toe / hub-gamebar.js).
         Only active in a frame. In the hub, Writer's own top row is hidden
         (body.in-hub) and the hub's title bar shows the tabs and file name.
     app → hub  {type:'hub-ready'}                                   on load
     hub → app  {type:'hub-hello'}                 → body.in-hub, reply hub-app
     app → hub  {type:'hub-app', app:'Writer', tabs:[{id, label, menu?}], activeTab, title}
     app → hub  {type:'hub-tab', id}               ribbon tab changed
     app → hub  {type:'hub-title', value}          file name changed (rename / open / new)
     hub → app  {type:'hub-action', id:'tab:<id>', hover?} switch tab; 'tab:file' opens the File menu
                (hover:true = open-only, marked hover-opened; collapsed ribbon peeks)
     hub → app  {type:'hub-menu-leave', id, delay}  DF13c: close a hover-opened File menu after
                delay ms unless the pointer is on it (click-opened menus ignore this)
     app → hub  {type:'hub-app-caps', settings, hoverTabs, ribbonCollapsed}
   All messages carry v:1. The message shapes live in Writer.hub.shape below,
   so a change on the hub side is a one-place edit here.
   DEPENDS: Writer.ribbon, Writer.storage (wraps selectTab / setCurrentName)
   ============================================================ */

Writer.hub = {
  V: 1,
  linked: false,
  /* Message shapes: the one place to change if the hub's protocol changes. */
  shape: {
    ready: function () { return { type: 'hub-ready' }; },
    /* (before DF24) app: function (s) { return { type: 'hub-app', app: 'Draftly', tabs: Draftly.hub.tabs, activeTab: s.tab, title: s.title }; }, */
    app: function (s) { return { type: 'hub-app', app: 'Writer', tabs: Writer.hub.tabs, activeTab: s.tab, title: s.title }; },
    tab: function (id) { return { type: 'hub-tab', id: id }; },
    title: function (v) { return { type: 'hub-title', value: v }; },
    actionPrefix: 'tab:'
  },
  tabs: [
    { id: 'file', label: 'File', menu: true },
    { id: 'home', label: 'Home' },
    { id: 'insert', label: 'Insert' },
    { id: 'page', label: 'Page' },
    /* (before DF21) { id: 'merge', label: 'Merge' } */
    { id: 'merge', label: 'Merge' },
    { id: 'review', label: 'Review' }   /* DF21 */
  ],
  menuInset: 8          /* px from the frame's top-left for the File menu */
};

(function () {
  var H = Writer.hub;
  var IN_FRAME = (function () { try { return window.parent && window.parent !== window; } catch (e) { return true; } })();
  if (!IN_FRAME) return;
  var lastTitle = null, lastTab = null;

  function post(msg) {
    try { window.parent.postMessage(Object.assign({ v: H.V }, msg), '*'); } catch (e) { /* ignore */ }
  }
  function originOk(origin) {
    return origin === location.origin || origin === 'null' || location.origin === 'null' ||
      String(origin).indexOf('file:') === 0;
  }
  function activeTab() {
    var t = document.querySelector('.ribbon-tab[aria-selected="true"]');
    return t ? t.getAttribute('data-tab') : 'home';
  }
  function title() { return Writer.storage.currentName(); }

  function sendCaps() {
    var st = Writer.settings && Writer.settings.s;
    post({ type: 'hub-app-caps', settings: true, hoverTabs: !st || st.hoverTabs !== false, ribbonCollapsed: !!(st && st.ribbonCollapsed) });
  }
  /* Resend caps when the hover setting changes. */
  if (Writer.settings && Writer.settings.apply) {
    var apply = Writer.settings.apply;
    Writer.settings.apply = function (k) { var r = apply.apply(this, arguments); if (H.linked && (k === 'hoverTabs' || k === 'ribbonCollapsed' || !k)) sendCaps(); return r; };
  }
  function sendApp() {
    lastTab = activeTab(); lastTitle = title();
    post(H.shape.app({ tab: lastTab, title: lastTitle }));
    sendCaps();  /* DF12/H16 gear, DF13/H17 hover */
  }
  function sendTab() {
    if (!H.linked) return;
    var t = activeTab();
    if (t !== lastTab) { lastTab = t; post(H.shape.tab(t)); }
  }
  function sendTitle() {
    if (!H.linked) return;
    var v = title();
    if (v !== lastTitle) { lastTitle = v; post(H.shape.title(v)); }
  }

  /* The File menu, anchored top-left inside the frame (its button is hidden). */
  var hoverFile = false, leaveT = null, overMenu = false;
  function clearLeave() { if (leaveT) { clearTimeout(leaveT); leaveT = null; } }
  function startLeave(ms) {
    clearLeave();
    leaveT = setTimeout(function () {
      leaveT = null;
      if (hoverFile && !overMenu && Writer.ribbon.isFileOpen()) Writer.ribbon.setFile(false);
      if (!Writer.ribbon.isFileOpen()) hoverFile = false;
    }, ms);
  }
  var fm = document.getElementById('fileMenu');
  if (fm) {
    fm.addEventListener('pointerenter', function () { overMenu = true; clearLeave(); });
    fm.addEventListener('pointerleave', function () { overMenu = false; if (hoverFile && Writer.ribbon.isFileOpen()) startLeave(300); });
  }
  H.menuLeave = function (ms) {
    if (!hoverFile || !Writer.ribbon.isFileOpen()) return;
    var d = Number(ms); startLeave(d >= 0 && d < 5000 ? d : 300);
  };
  H.openFile = function (hover) {
    var isOpen = Writer.ribbon.isFileOpen();
    clearLeave();
    if (hover) { if (!isOpen) { hoverFile = true; Writer.ribbon.setFile(true, false); } }
    else { hoverFile = false; Writer.ribbon.setFile(!isOpen, false); }
    var open = Writer.ribbon.isFileOpen();
    if (open) {
      var m = document.getElementById('fileMenu');
      m.style.top = H.menuInset + 'px';
      m.style.left = H.menuInset + 'px';
    }
  };

  /* Wrap the two places that change the tab and the name. */
  var selectTab = Writer.ribbon.selectTab;
  Writer.ribbon.selectTab = function (name, focus) { selectTab.call(this, name, focus); sendTab(); };
  var setName = Writer.storage.setCurrentName;
  Writer.storage.setCurrentName = function (name, persist) { setName.call(this, name, persist); sendTitle(); };
  var input = document.getElementById('fileNameInput');
  if (input) { input.addEventListener('input', sendTitle); input.addEventListener('change', sendTitle); }

  /* File > Rename uses Writer.dialog (writer-ribbon.js); setCurrentName above sends hub-title. */

  /* DF12/H16: the hub's title-bar gear opens Writer's Settings panel. */
  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || !originOk(e.origin)) return;
    if (e.data && e.data.type === 'hub-settings' && Writer.settings && Writer.settings.panel) Writer.settings.panel.open();
  });

  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || !originOk(e.origin)) return;
    var d = e.data;
    if (!d || typeof d !== 'object' || d.v !== H.V) return;
    if (d.type === 'hub-hello') {
      if (!H.linked) { H.linked = true; document.body.classList.add('in-hub'); }
      sendApp();
    } else if (d.type === 'hub-action' && H.linked && typeof d.id === 'string' && d.id.indexOf(H.shape.actionPrefix) === 0) {
      var id = d.id.slice(H.shape.actionPrefix.length);
      if (id === 'file') H.openFile(d.hover === true);
      else if (H.tabs.some(function (t) { return t.id === id && !t.menu; })) {
        if (Writer.ribbon.isFileOpen()) Writer.ribbon.setFile(false);
        Writer.ribbon.selectTab(id);
        if (Writer.ribbon.collapse) Writer.ribbon.collapse.peek(true);  /* DF13c */
      }
    } else if (d.type === 'hub-menu-leave' && H.linked) {
      H.menuLeave(d.delay);
    }
  });
  post(H.shape.ready());
})();
