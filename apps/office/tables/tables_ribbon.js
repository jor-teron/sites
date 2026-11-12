/* ============================================================
   FILE: tables_ribbon.js
   ROLE: TB5 Office chrome for Tables. Uses the shared Office
         modules as they are (apps/office/shared is not edited):
         office-ribbon.js (File + tabs), office-hover.js,
         office-collapse.js, office-settings.js, office-quick.js
         and office-hubbar.js (HO1 / H49 Hub title bar), plus the
         older hub-hello / hub-app bridge Spreadsheet uses
         (spreadsheet_hub.js) for the app name, file title, the
         Hub's Settings gear and the File menu.
         Theme still belongs to the .hot file (settings.theme).
         The Settings pop-up only shows it and writes it back
         through tables.js. Collapse ribbon is a device setting
         (localStorage tables_settings), not in the .hot format.
         Undo, Redo and Print are not given to OfficeQuick, so
         they stay greyed out. Tables has no undo and no print.
         Pure helpers are exported for Node (test-tb5-ribbon.js).
   ============================================================ */
(function (root) {
  'use strict';

  var R = {};
  R.RELEASE = 'TB5';
  R.APP = 'Tables';
  R.SETTINGS_KEY = 'tables_settings';
  R.TAB_KEY = 'tables-ribbon-tab';
  R.TABS = [{ id: 'home', label: 'Home' }];
  R.THEMES = [['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']];
  /* File menu, top to bottom. sep = a line before the item. */
  R.FILE_ITEMS = [
    { id: 'btn-new', label: 'New', icon: 'fileNew' },
    { id: 'btn-open-hot', label: 'Open .hot', icon: 'fileOpen' },
    { id: 'btn-save', label: 'Save', icon: 'fileSave', sep: true },
    { id: 'btn-save-as', label: 'Save As', icon: 'fileSave' },
    { id: 'btn-import', label: 'Import CSV', icon: 'fileOpen', sep: true },
    { id: 'btn-export', label: 'Export CSV', icon: 'fileExport' },
    { id: 'settingsMenuBtn', label: 'Settings', icon: 'fileSettings', sep: true }
  ];
  /* Home tab, left to right: the commands that were on the flat toolbar. */
  R.HOME_COMMANDS = [
    { id: 'btn-view-grid', label: 'Grid', group: 'view' },
    { id: 'btn-view-cards', label: 'Cards', group: 'view' },
    { id: 'btn-new-record', label: 'New record', group: 'records' },
    { id: 'btn-add-row', label: '+ Row', group: 'records' },
    { id: 'btn-del-row', label: '− Row', group: 'records' },
    { id: 'btn-add-col', label: '+ Column', group: 'table' },
    { id: 'btn-rename', label: 'Rename', group: 'table' },
    { id: 'btn-del-table', label: 'Delete table', group: 'table' }
  ];
  R.QUICK_DISABLED = ['undo', 'redo', 'print'];

  /* New asks first only when there is something that would be lost. */
  R.needsNewConfirm = function needsNewConfirm(s) {
    s = s || {};
    return !!s.unsaved && !s.blank;
  };
  R.themeOf = function themeOf(v) {
    return v === 'light' || v === 'dark' ? v : 'auto';
  };
  /* Settings -> Theme writes the open file's theme (db.theme -> .hot settings.theme). */
  R.applyThemeChoice = function applyThemeChoice(db, mode) {
    if (!db) return 'auto';
    db.theme = R.themeOf(mode);
    return db.theme;
  };
  R.hubTabs = function hubTabs() {
    return [{ id: 'file', label: 'File', menu: true }].concat(R.TABS.map(function (t) { return { id: t.id, label: t.label }; }));
  };
  R.quickTabs = function quickTabs() {
    return [{ id: 'file', label: 'File' }].concat(R.TABS.map(function (t) { return { id: t.id, label: t.label }; }));
  };
  R.settingsDefaults = function settingsDefaults() {
    /* theme is not here on purpose: it lives in the .hot file. */
    return { ribbonCollapsed: false };
  };
  /* OfficeQuick.register options. No undo / redo / print keys, so those buttons stay disabled. */
  R.quickOptions = function quickOptions(app, els) {
    els = els || {};
    return {
      app: R.APP,
      save: function () { return app.save(); },
      canSave: function () { return app.canSave(); },
      tabs: R.quickTabs,
      activeTab: function () { return app.activeTab ? app.activeTab() : 'home'; },
      onTab: function (id) { if (app.onTab) app.onTab(id); },
      mount: els.mount || null,
      before: els.before || null,
      fallback: els.fallback || null
    };
  };
  R.title = function title() { return R.APP + ' ' + R.RELEASE; };

  /* ---------- DOM wiring (browser only) ---------- */
  var A = null;          // tables.js API
  var S = null;          // OfficeSettings
  var RB = null;         // OfficeRibbon
  var C = null;          // OfficeCollapse
  var H = { V: 1, linked: false, menuInset: 8 };
  R.hub = H;

  function $(id) { return document.getElementById(id); }
  function fileMenu() { return $('of-file-menu'); }
  function isFileOpen() { var m = fileMenu(); return !!(m && !m.hidden); }
  function setFile(v) { if (RB) RB.setFile(v); }
  function selectTab(id, focus) { if (RB) RB.select(id, focus); }
  function activeTab() { return RB && RB.current ? RB.current : 'home'; }
  function quickRefresh() { if (root.OfficeQuick && OfficeQuick.refresh) OfficeQuick.refresh(); }
  function toast(msg) { if (A && A.status) A.status(msg); }

  function initSettings() {
    if (!root.OfficeSettings) return;
    S = OfficeSettings.create({
      key: R.SETTINGS_KEY,
      defaults: R.settingsDefaults(),
      gearBtn: $('settingsBtn'),
      sections: [
        { title: 'View', rows: [
          { key: 'theme', type: 'select', id: 'set-theme', label: 'Theme', options: R.THEMES },
          { key: 'ribbonCollapsed', type: 'switch', id: 'set-ribbon-collapsed', label: 'Collapse ribbon' }
        ] },
        { title: 'About', rows: [{ type: 'about', id: 'set-version', text: R.title() }] }
      ],
      resetMessage: 'Reset Tables settings to their defaults? Your .hot files and their theme are not touched.',
      onChange: function (k, v) {
        if (k === 'theme') { if (A) A.setTheme(v); S.s.theme = A ? A.getTheme() : R.themeOf(v); }
        if (k === 'ribbonCollapsed') { if (C) C.apply(!!v); sendCaps(); }
      },
      onReset: function () {
        S.s.theme = A ? A.getTheme() : 'auto';   // the file's theme stays
        if (C) C.apply(!!S.s.ribbonCollapsed);
        sendCaps();
      },
      confirm: function (msg) {
        return root.OfficeDialog && OfficeDialog.confirm
          ? OfficeDialog.confirm({ title: 'Reset settings?', message: msg, okLabel: 'Reset' })
          : Promise.resolve(false);
      },
      toast: toast
    });
    /* Keep theme out of tables_settings: only device settings are stored there. */
    S.save = function () {
      var out = {}, d = R.settingsDefaults(), k;
      for (k in d) out[k] = S.s[k];
      try { localStorage.setItem(R.SETTINGS_KEY, JSON.stringify(out)); } catch (e) { /* blocked */ }
    };
    S.save();
    S.s.theme = A ? A.getTheme() : 'auto';
    S.syncForm();
    var item = $('settingsMenuBtn');
    if (item) item.addEventListener('click', function () { setFile(false); S.open(); });
  }

  function initRibbon() {
    var tabsEl = $('of-tabs');
    if (!tabsEl || !root.OfficeRibbon) return;
    var fb = $('of-file-btn'), fm = fileMenu();
    RB = OfficeRibbon.create({ tabs: R.TABS, storageKey: R.TAB_KEY, tabsEl: tabsEl, fileBtn: fb, fileMenu: fm });
    if (root.OfficeHover) {
      OfficeHover.attach({
        tabsEl: tabsEl, tabSelector: '.of-tab',
        selectTab: function (id) { selectTab(id); if (C) C.peek(); },
        fileBtn: fb, fileMenu: fm,
        isFileOpen: isFileOpen,
        setFile: setFile
      });
    }
    var rib = $('of-ribbon');
    if (root.OfficeCollapse && rib) {
      rib.classList.add('of-collapsible');
      C = OfficeCollapse.attach({
        tabsEl: tabsEl, tabSelector: '.of-tab', ribbonEl: rib,
        /* a click in the grid or the cards hides a peeked ribbon */
        docEl: { contains: function (n) { var g = $('grid-wrap'), c = $('cards-wrap'); return !!((g && g.contains(n)) || (c && c.contains(n))); } },
        collapsed: !!(S && S.s.ribbonCollapsed),
        onUserChange: function (v) { if (S) S.set('ribbonCollapsed', v); else C.apply(v); }
      });
    }
    var sel = RB.select;
    RB.select = function () { var r = sel.apply(this, arguments); quickRefresh(); sendTab(); return r; };
    var nb = $('btn-new');
    if (nb) nb.addEventListener('click', function () { if (A) A.newFile(); });
  }

  function onTab(id) {
    if (id === 'file') { openFile(false); return; }
    if (isFileOpen()) setFile(false);
    selectTab(id);
    if (C) C.peek(true);
  }

  function initQuick() {
    if (!root.OfficeQuick || !A) return;
    OfficeQuick.register(R.quickOptions({
      save: A.save, canSave: A.canSave, activeTab: activeTab, onTab: onTab
    }, { mount: $('of-topbar'), before: $('of-file-btn'), fallback: $('of-topbar') }));
  }

  /* ---------- Hub (same v:1 bridge as spreadsheet_hub.js) ---------- */
  var IN_FRAME = (function () { try { return root.parent && root.parent !== root; } catch (e) { return true; } })();
  var lastTab = null, lastTitle = null;
  function post(msg) {
    if (!IN_FRAME) return;
    var m = { v: H.V }, k;
    for (k in msg) m[k] = msg[k];
    try { root.parent.postMessage(m, '*'); } catch (e) { /* parent gone */ }
  }
  function originOk(origin) {
    return origin === location.origin || origin === 'null' || location.origin === 'null' || String(origin).indexOf('file:') === 0;
  }
  function title() { return (A && A.fileName && A.fileName()) || R.APP; }
  function sendCaps() {
    if (!H.linked) return;
    post({ type: 'hub-app-caps', settings: !!S, hoverTabs: true, ribbonCollapsed: !!(S && S.s.ribbonCollapsed) });
  }
  function sendApp() {
    lastTab = activeTab(); lastTitle = title();
    post({ type: 'hub-app', app: R.APP, tabs: R.hubTabs(), activeTab: lastTab, title: lastTitle });
    sendCaps();
  }
  function sendTab() { if (!H.linked) return; var t = activeTab(); if (t !== lastTab) { lastTab = t; post({ type: 'hub-tab', id: t }); } }
  function sendTitle() { if (!H.linked) return; var v = title(); if (v !== lastTitle) { lastTitle = v; post({ type: 'hub-title', value: v }); } }
  R.noteName = function () { sendTitle(); };

  var hoverFile = false, leaveT = null, overMenu = false;
  function clearLeave() { if (leaveT) { clearTimeout(leaveT); leaveT = null; } }
  function startLeave(ms) {
    clearLeave();
    leaveT = setTimeout(function () {
      leaveT = null;
      if (hoverFile && !overMenu && isFileOpen()) setFile(false);
      if (!isFileOpen()) hoverFile = false;
    }, ms);
  }
  function openFile(hover) {
    var open = isFileOpen();
    clearLeave();
    if (hover) { if (!open) { hoverFile = true; setFile(true); } }
    else { hoverFile = false; setFile(!open); }
    if (isFileOpen() && document.body.classList.contains('in-hub')) {
      var m = fileMenu(); m.style.top = H.menuInset + 'px'; m.style.left = H.menuInset + 'px';
    }
  }
  H.openFile = openFile;

  function initHub() {
    if (!IN_FRAME) return;
    var m0 = fileMenu();
    if (m0) {
      m0.addEventListener('pointerenter', function () { overMenu = true; clearLeave(); });
      m0.addEventListener('pointerleave', function () { overMenu = false; if (hoverFile && isFileOpen()) startLeave(300); });
    }
    root.addEventListener('message', function (e) {
      if (e.source !== root.parent || !originOk(e.origin)) return;
      var d = e.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'hub-settings') { if (S) S.open(); return; }
      if (d.v !== H.V) return;
      if (d.type === 'hub-hello') {
        if (!H.linked) { H.linked = true; document.body.classList.add('in-hub'); }
        sendApp();
      } else if (d.type === 'hub-action' && H.linked && typeof d.id === 'string' && d.id.indexOf('tab:') === 0) {
        var id = d.id.slice(4);
        if (id === 'file') openFile(d.hover === true);
        else if (R.TABS.some(function (t) { return t.id === id; })) onTab(id);
      } else if (d.type === 'hub-menu-leave' && H.linked) {
        if (hoverFile && isFileOpen()) { var ms = Number(d.delay); startLeave(ms >= 0 && ms < 5000 ? ms : 300); }
      }
    });
    post({ type: 'hub-ready' });
  }

  /* Called by tables.js boot() after bind() and the first render. */
  R.init = function init(api) {
    A = api;
    initSettings();
    initRibbon();
    initQuick();
    initHub();
    if (root.OfficeIcons && OfficeIcons.fill) OfficeIcons.fill();
  };
  /* tables.js calls this after the theme changes (Settings, a file opened, New). */
  R.syncTheme = function syncTheme(mode) {
    if (!S) return;
    S.s.theme = R.themeOf(mode);
    S.syncForm();
  };
  R.refresh = quickRefresh;

  if (typeof module === 'object' && module.exports) module.exports = R;
  if (root) root.TablesRibbon = R;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
