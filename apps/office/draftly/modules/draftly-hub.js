/* ============================================================
   FILE: modules/draftly-hub.js
   PROJECT: Draftly
   ROLE: Sites hub bridge (v:1, same rules as tic-tac-toe / hub-gamebar.js).
         Only active in a frame. In the hub, Draftly's own top row is hidden
         (body.in-hub) and the hub's title bar shows the tabs and file name.
     app → hub  {type:'hub-ready'}                                   on load
     hub → app  {type:'hub-hello'}                 → body.in-hub, reply hub-app
     app → hub  {type:'hub-app', app:'Draftly', tabs:[{id, label, menu?}], activeTab, title}
     app → hub  {type:'hub-tab', id}               ribbon tab changed
     app → hub  {type:'hub-title', value}          file name changed (rename / open / new)
     hub → app  {type:'hub-action', id:'tab:<id>'} switch tab; 'tab:file' opens the File menu
   All messages carry v:1. The message shapes live in Draftly.hub.shape below,
   so a change on the hub side is a one-place edit here.
   DEPENDS: Draftly.ribbon, Draftly.storage (wraps selectTab / setCurrentName)
   ============================================================ */

Draftly.hub = {
  V: 1,
  linked: false,
  /* Message shapes: the one place to change if the hub's protocol changes. */
  shape: {
    ready: function () { return { type: 'hub-ready' }; },
    app: function (s) { return { type: 'hub-app', app: 'Draftly', tabs: Draftly.hub.tabs, activeTab: s.tab, title: s.title }; },
    tab: function (id) { return { type: 'hub-tab', id: id }; },
    title: function (v) { return { type: 'hub-title', value: v }; },
    actionPrefix: 'tab:'
  },
  tabs: [
    { id: 'file', label: 'File', menu: true },
    { id: 'home', label: 'Home' },
    { id: 'insert', label: 'Insert' },
    { id: 'page', label: 'Page' },
    { id: 'merge', label: 'Merge' }
  ],
  menuInset: 8          /* px from the frame's top-left for the File menu */
};

(function () {
  var H = Draftly.hub;
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
  function title() { return Draftly.storage.currentName(); }

  function sendApp() {
    lastTab = activeTab(); lastTitle = title();
    post(H.shape.app({ tab: lastTab, title: lastTitle }));
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
  H.openFile = function () {
    var open = !Draftly.ribbon.isFileOpen();
    Draftly.ribbon.setFile(open, false);
    if (open) {
      var m = document.getElementById('fileMenu');
      m.style.top = H.menuInset + 'px';
      m.style.left = H.menuInset + 'px';
    }
  };

  /* Wrap the two places that change the tab and the name. */
  var selectTab = Draftly.ribbon.selectTab;
  Draftly.ribbon.selectTab = function (name, focus) { selectTab.call(this, name, focus); sendTab(); };
  var setName = Draftly.storage.setCurrentName;
  Draftly.storage.setCurrentName = function (name, persist) { setName.call(this, name, persist); sendTitle(); };
  var input = document.getElementById('fileNameInput');
  if (input) { input.addEventListener('input', sendTitle); input.addEventListener('change', sendTitle); }

  /* File > Rename uses Draftly.dialog (draftly-ribbon.js); setCurrentName above sends hub-title. */

  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || !originOk(e.origin)) return;
    var d = e.data;
    if (!d || typeof d !== 'object' || d.v !== H.V) return;
    if (d.type === 'hub-hello') {
      if (!H.linked) { H.linked = true; document.body.classList.add('in-hub'); }
      sendApp();
    } else if (d.type === 'hub-action' && H.linked && typeof d.id === 'string' && d.id.indexOf(H.shape.actionPrefix) === 0) {
      var id = d.id.slice(H.shape.actionPrefix.length);
      if (id === 'file') H.openFile();
      else if (H.tabs.some(function (t) { return t.id === id && !t.menu; })) {
        if (Draftly.ribbon.isFileOpen()) Draftly.ribbon.setFile(false);
        Draftly.ribbon.selectTab(id);
      }
    }
  });
  post(H.shape.ready());
})();
