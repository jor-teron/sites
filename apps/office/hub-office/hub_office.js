/* Hub Office Suite Start Center — hub_office.js */
/* HO12: a new blank document tab adds ?new=1 so the suite starts
   fresh; opening a file still uses #drive=&file= and loads that file.
   Standalone suites (no flag) still restore their last document.
   HO11: document tabs show the document name (Untitled N until the
   suite reports one). Suites post {hubOfficeDocName:{v:1, name}}
   through office-docname.js; Hub Office does not send hub-hello, so
   the ribbon stays visible. HO10: when Hub Office is in the Hub, it
   relays the active document's Undo, Redo, Save, Print and File
   buttons into the title bar, after 🏠 Home, and says hello to each
   suite iframe so the in-app quick row hides. Ribbon tabs stay inside
   the suite and are not relayed. HO9: a Settings section on the Start
   Page stores shared defaults in office-shared-settings.js. Suites
   are not wired to those yet. HO8a: the Home button shows its label
   and sits on the left. Document tabs stay in the existing row.
   Standalone, suites keep their own quick row and a small Home button
   sits in the tab row. */
(function (root) {
  'use strict';

  /* (before HO6) const was implicit; Start Center was unversioned as HO-SC2 in HTML only. */
  /* (before HO7) const VERSION = 'HO6'; */
  /* (before HO8) const VERSION = 'HO7'; */
  /* (before HO8a) const VERSION = 'HO8'; */
  /* (before HO9) const VERSION = 'HO8a'; */
  /* (before HO10) const VERSION = 'HO9'; */
  /* (before HO11) const VERSION = 'HO10'; */
  /* (before HO12) const VERSION = 'HO11'; */
  const VERSION = 'HO12';

  const SUITES = [
    {
      id: 'writer',
      name: 'Writer',
      /* (before HO6) tagline: 'Word Processor & Documents',
         desc: 'Full-featured word processor with A4 page layout, rich typography, tables, and native .how file support.',
         formats and btnLabel listed on the card. */
      desc: 'Word processor with page layout, typography and tables.',
      icon: '../writer/writer_icon.png',
      url: '../writer/',
      rootUrl: 'apps/office/writer/'
    },
    {
      id: 'spreadsheet',
      name: 'Spreadsheet',
      /* (before HO6) tagline: 'Calculations & Analysis' */
      desc: 'Formulas, multi-sheet calculation, and CSV/XLSX import and export.',
      icon: '../spreadsheet/spreadsheet_icon.png',
      url: '../spreadsheet/',
      rootUrl: 'apps/office/spreadsheet/'
    },
    {
      id: 'slides',
      name: 'Presentation',
      /* (before HO6) tagline: 'Presentations & Slide Decks' */
      desc: '16:9 slide decks with formatting and full-screen presentation.',
      icon: '../slides/slides_icon.png',
      url: '../slides/',
      rootUrl: 'apps/office/slides/'
    },
    {
      id: 'base',
      name: 'Base',
      /* (before HO6) tagline: 'Relational Database' */
      desc: 'Relational database with tables, forms and queries.',
      icon: '../base/base_icon.png',
      url: '../base/',
      rootUrl: 'apps/office/base/'
    },
    {
      id: 'tables',
      name: 'Tables',
      /* (before HO6) tagline: 'Structured Data Grid' */
      desc: 'Lightweight data grid with typed columns, sorting and filtering.',
      icon: '../tables/tables_icon.png',
      url: '../tables/',
      rootUrl: 'apps/office/tables/'
    }
  ];

  /* Truthful open / save / export lists, checked against each app's
     file-input accept lists and File-menu export items in HO6.
     Corrections from the planned lists:
       Writer open dropped .txt and .md (no file picker or drop handler).
       Spreadsheet open dropped .tsv (accept is .xlsx .xls .ods .csv only).
       Presentation export added .pdf (File → Export PDF is in the menu).
       Base open added .tsv .txt .xls .sqlite3 (in accept + base-files.js open()).
       Tables export is .csv. */
  const FORMAT_TABLE = [
    { id: 'writer', open: ['.how', '.docx', '.odt'], save: ['.how'], export: ['.docx', '.odt', '.pdf'] },
    { id: 'spreadsheet', open: ['.hos', '.xlsx', '.xls', '.ods', '.csv'], save: ['.hos'], export: ['.xlsx', '.ods', '.csv'] },
    /* (before PN4) { id: 'slides', open: ['.hop', '.hslides', '.pptx', '.odp'], save: ['.hop'], export: ['.pptx', '.odp', '.png', '.pdf'] }, */
    { id: 'slides', open: ['.hop', '.pptx', '.odp'], save: ['.hop'], export: ['.pptx', '.odp', '.png', '.pdf'] },
    { id: 'base', open: ['.hob', '.hbase', '.odb', '.csv', '.tsv', '.txt', '.xlsx', '.xls', '.json', '.sqlite', '.sqlite3', '.db'], save: ['.hob'], export: ['.odb', '.xlsx', '.csv'] },
    { id: 'tables', open: ['.hot', '.csv'], save: ['.hot'], export: ['.csv'] }
  ];

  const EXT_MAP = {
    how: 'writer',
    docx: 'writer',
    odt: 'writer',
    /* (before HO6) txt: 'writer', md: 'writer', markdown: 'writer' */
    hos: 'spreadsheet',
    xlsx: 'spreadsheet',
    xls: 'spreadsheet',
    ods: 'spreadsheet',
    csv: 'spreadsheet',
    /* (before HO6) tsv: 'spreadsheet' */
    hop: 'slides',
    /* (before PN4) hslides: 'slides', */
    pptx: 'slides',
    odp: 'slides',
    /* (before HO6) ppt: 'slides' — Presentation does not open .ppt */
    hot: 'tables',
    hob: 'base',
    hbase: 'base',
    odb: 'base',
    db: 'base',
    sqlite: 'base',
    sqlite3: 'base',
    json: 'base',
    tsv: 'base',
    txt: 'base'
    /* (before HO6) base: 'base' — Base has no .base file picker */
  };

  const RECENT_KEY = 'sites-hub.recent-office-docs';
  const RECENT_LIMIT = 8;

  // State: Tab tracking
  let tabSeq = 0;
  const appCounters = Object.create(null);
  const openTabs = [
    { id: 'start', title: 'Start Page', type: 'start', icon: '🏠' }
  ];
  let activeTabId = 'start';
  /* HO10: last title-bar button set from each document iframe. */
  const hubBarByTab = Object.create(null);

  function getExt(filename) {
    const m = /\.([^./\\]+)$/.exec(String(filename || ''));
    return m ? m[1].toLowerCase() : '';
  }

  function routeByFilename(filename) {
    const ext = getExt(filename);
    return (ext && EXT_MAP[ext]) || null;
  }

  function openAcceptList() {
    const seen = Object.create(null);
    const out = [];
    FORMAT_TABLE.forEach((row) => {
      (row.open || []).forEach((fmt) => {
        const ext = fmt.charAt(0) === '.' ? fmt : ('.' + fmt);
        if (!seen[ext]) {
          seen[ext] = true;
          out.push(ext);
        }
      });
    });
    return out;
  }

  /* Pure helper: group FORMAT_TABLE open/save/export lists into labelled
     chip rows. The first save format is the native format. */
  function formatChipGroups(row) {
    row = row || {};
    const native = (row.save && row.save[0]) || '';
    const groups = [];
    function add(label, list) {
      const formats = Array.isArray(list) ? list.slice() : [];
      if (!formats.length) return;
      groups.push({ label: label, formats: formats, native: native });
    }
    add('Open', row.open);
    add('Save', row.save);
    add('Export', row.export);
    return groups;
  }

  /* The Start Page stays in openTabs as a persistent record, but it is
     no longer a tab in the strip (before HO8). The document tab row
     only needs to show when at least one document is open. */
  function shouldShowTabBar(tabs) {
    return (Array.isArray(tabs) ? tabs : []).some((t) => t && t.type === 'doc');
  }

  function homeTitleBarButton() {
    /* (before HO8a) return { id: 'home', icon: '🏠', label: 'Home', title: 'Start Page', enabled: true }; */
    return { id: 'home', icon: '🏠', label: 'Home', title: 'Start Page', enabled: true, showLabel: true };
  }

  /* HO10: prefix suite button ids so they cannot collide with Home.
     The Hub allows at most 8 title-bar buttons in total. */
  const TITLE_BAR_PREFIX = 'd:';
  const TITLE_BAR_MAX = 8;

  function copyButton(b) {
    if (!b || typeof b !== 'object') return null;
    const o = {};
    Object.keys(b).forEach((k) => { o[k] = b[k]; });
    return o;
  }

  function prefixTitleBarId(id) {
    return TITLE_BAR_PREFIX + String(id == null ? '' : id);
  }

  function unprefixTitleBarId(id) {
    const s = String(id == null ? '' : id);
    if (s.indexOf(TITLE_BAR_PREFIX) !== 0) return null;
    return s.slice(TITLE_BAR_PREFIX.length);
  }

  function prefixTitleBarButtons(list) {
    return (Array.isArray(list) ? list : []).map((b) => {
      const o = copyButton(b);
      if (!o || o.id == null || o.id === '') return null;
      o.id = prefixTitleBarId(o.id);
      return o;
    }).filter(Boolean);
  }

  /* File arrives as a ribbon tab, not a quick button. Promote only that
     tab to a labelled title-bar button; other tabs stay in the suite. */
  function fileButtonFromTabs(tabs) {
    const list = Array.isArray(tabs) ? tabs : [];
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t && String(t.id) === 'file') {
        return {
          id: 'file',
          label: t.label != null ? String(t.label) : 'File',
          icon: t.icon != null ? String(t.icon) : '📁',
          title: t.title != null ? String(t.title) : (t.label != null ? String(t.label) : 'File'),
          enabled: t.enabled !== false,
          showLabel: true
        };
      }
    }
    return null;
  }

  function applyButtonPatch(buttons, patch) {
    const list = (Array.isArray(buttons) ? buttons : []).map(copyButton).filter(Boolean);
    (Array.isArray(patch) ? patch : []).forEach((p) => {
      if (!p || p.id == null) return;
      let found = -1;
      for (let i = 0; i < list.length; i++) {
        if (list[i] && String(list[i].id) === String(p.id)) { found = i; break; }
      }
      if (found < 0) {
        list.push(copyButton(p));
      } else {
        const o = copyButton(list[found]) || {};
        Object.keys(p).forEach((k) => { o[k] = p[k]; });
        list[found] = o;
      }
    });
    return list;
  }

  function composeTitleBarButtons(homeButton, docState, max) {
    const cap = max > 0 ? max : TITLE_BAR_MAX;
    const home = copyButton(homeButton) || homeTitleBarButton();
    const extras = [];
    const seen = Object.create(null);
    function add(b) {
      if (!b || b.id == null || seen[String(b.id)]) return;
      seen[String(b.id)] = true;
      extras.push(b);
    }
    const state = docState || null;
    if (state) {
      (Array.isArray(state.buttons) ? state.buttons : []).forEach(add);
      add(fileButtonFromTabs(state.tabs));
    }
    return [home].concat(prefixTitleBarButtons(extras)).slice(0, cap);
  }

  function clickKindForRelay(docState, rawId) {
    if (docState && docState.clickKinds && docState.clickKinds[rawId]) {
      return docState.clickKinds[rawId];
    }
    if (rawId === 'file' && fileButtonFromTabs(docState && docState.tabs)) return 'tab';
    return 'button';
  }

  function stateFromSuiteSet(body) {
    const buttons = (body && Array.isArray(body.buttons) ? body.buttons : []).map(copyButton).filter((b) => b && b.id != null);
    const tabs = body && Array.isArray(body.tabs) ? body.tabs.map(copyButton).filter(Boolean) : [];
    const clickKinds = Object.create(null);
    buttons.forEach((b) => { clickKinds[String(b.id)] = 'button'; });
    if (fileButtonFromTabs(tabs) && !clickKinds.file) clickKinds.file = 'tab';
    return { buttons: buttons, tabs: tabs, clickKinds: clickKinds };
  }

  /* Pure planner for the title-bar relay. prev is the last stored state
     for one document; body is the suite's hubTitleBar payload. */
  function planTitleBarRelay(prev, body, isActive, homeButton, max) {
    const op = body && body.op;
    if (op === 'clear') {
      if (!isActive) return { state: null, publish: null };
      return { state: null, publish: 'set', buttons: composeTitleBarButtons(homeButton, null, max) };
    }
    if (op === 'set') {
      const state = stateFromSuiteSet(body);
      if (!isActive) return { state: state, publish: null };
      return { state: state, publish: 'set', buttons: composeTitleBarButtons(homeButton, state, max) };
    }
    if (op === 'update') {
      const base = prev || { buttons: [], tabs: [], clickKinds: Object.create(null) };
      const clickKinds = Object.assign(Object.create(null), base.clickKinds || {});
      const state = {
        buttons: applyButtonPatch(base.buttons, body && body.buttons),
        tabs: Array.isArray(base.tabs) ? base.tabs : [],
        clickKinds: clickKinds
      };
      (state.buttons || []).forEach((b) => {
        if (b && b.id != null && !clickKinds[String(b.id)]) clickKinds[String(b.id)] = 'button';
      });
      if (!isActive) return { state: state, publish: null };
      if (body && Array.isArray(body.buttons) && body.buttons.length) {
        return { state: state, publish: 'update', updateButtons: prefixTitleBarButtons(body.buttons) };
      }
      return { state: state, publish: null };
    }
    return { state: prev || null, publish: null };
  }


  function syncChrome() {
    if (typeof document === 'undefined') return;
    const bar = document.getElementById('ho-tab-bar');
    if (bar) bar.classList.toggle('ho-tab-bar-empty', !shouldShowTabBar(openTabs));
    const home = document.getElementById('btn-home');
    if (home) {
      const onStart = activeTabId === 'start';
      home.classList.toggle('active', onStart);
      home.setAttribute('aria-pressed', onStart ? 'true' : 'false');
    }
  }

  function getSuite(appId) {
    return SUITES.find((s) => s.id === appId) || null;
  }

  function getAppIcon(appId) {
    switch (appId) {
      case 'writer': return '📝';
      case 'spreadsheet': return '📊';
      case 'slides': return '📽️';
      case 'base': return '🗄️';
      case 'tables': return '📋';
      default: return '📄';
    }
  }

  function notify(message) {
    if (typeof window === 'undefined') return;
    if (window.OfficeNotify && typeof window.OfficeNotify.show === 'function') {
      window.OfficeNotify.show(message);
    } else if (window.OfficeDialog && typeof window.OfficeDialog.alert === 'function') {
      window.OfficeDialog.alert({ message: message });
    } else {
      console.warn(message);
    }
  }

  // Switch between tabs
  function switchTab(tabId) {
    if (!openTabs.some((t) => t.id === tabId)) return;
    activeTabId = tabId;

    if (typeof document !== 'undefined') {
      const allTabs = document.querySelectorAll('.ho-tab');
      allTabs.forEach((tab) => {
        const match = tab.dataset.tabId === tabId;
        tab.classList.toggle('active', match);
        tab.setAttribute('aria-selected', match ? 'true' : 'false');
      });

      const allViews = document.querySelectorAll('.ho-view');
      allViews.forEach((view) => {
        const match = view.id === 'view-' + tabId;
        view.classList.toggle('active', match);
      });
    }
    syncChrome();
    publishTitleBar('set');
  }

  // Close an active or background document tab
  function closeTab(tabId) {
    if (tabId === 'start') return; // Start page is persistent

    const idx = openTabs.findIndex((t) => t.id === tabId);
    if (idx < 0) return;

    openTabs.splice(idx, 1);
    delete hubBarByTab[tabId];

    if (typeof document !== 'undefined') {
      const tabEl = document.getElementById('tab-btn-' + tabId);
      if (tabEl) tabEl.remove();

      const viewEl = document.getElementById('view-' + tabId);
      if (viewEl) viewEl.remove();
    }

    // If closing the active tab, switch to adjacent or fallback to start
    if (activeTabId === tabId) {
      const nextTab = openTabs[Math.max(0, idx - 1)] || openTabs[0];
      switchTab(nextTab.id);
    } else {
      syncChrome();
    }
  }

  /* HO11: tab label helpers. Prefer OfficeDocName when the shared
     helper is loaded; keep local fallbacks so tests can run this file
     on its own. */
  function sanitizeDocName(name) {
    if (typeof OfficeDocName !== 'undefined' && OfficeDocName.sanitize) return OfficeDocName.sanitize(name);
    return String(name == null ? '' : name).trim();
  }
  function displayTabLabel(name) {
    if (typeof OfficeDocName !== 'undefined' && OfficeDocName.displayLabel) return OfficeDocName.displayLabel(name);
    const s = sanitizeDocName(name);
    return s.length <= 40 ? s : (s.slice(0, 39) + '\u2026');
  }
  function untitledLabel(n) {
    if (typeof OfficeDocName !== 'undefined' && OfficeDocName.placeholder) return OfficeDocName.placeholder(n);
    const num = Number(n);
    return 'Untitled ' + (isFinite(num) && num >= 1 ? Math.floor(num) : 1);
  }
  function parseDocNameMessage(data) {
    if (typeof OfficeDocName !== 'undefined' && OfficeDocName.parse) return OfficeDocName.parse(data);
    if (!data || typeof data !== 'object' || !data.hubOfficeDocName || data.hubOfficeDocName.v !== 1) return null;
    const name = sanitizeDocName(data.hubOfficeDocName.name);
    return name || null;
  }
  function paintTabTitle(tabId, fullName, label) {
    if (typeof document === 'undefined') return;
    const btn = document.getElementById('tab-btn-' + tabId);
    if (btn) {
      btn.title = fullName;
      const lbl = btn.querySelector('.ho-tab-title');
      if (lbl) {
        lbl.textContent = label;
        lbl.title = fullName;
      }
      const closeBtn = btn.querySelector('.ho-tab-close');
      if (closeBtn) closeBtn.setAttribute('aria-label', 'Close ' + fullName);
    }
    const iframe = frameForTab(tabId);
    if (iframe) iframe.title = fullName;
  }
  function applyDocName(tabId, raw) {
    const name = sanitizeDocName(raw);
    if (!name || !tabId) return false;
    const tab = openTabs.find((t) => t && t.id === tabId);
    if (!tab || tab.type !== 'doc') return false;
    tab.title = name;
    paintTabTitle(tabId, name, displayTabLabel(name));
    return true;
  }

  // Create and mount a new document tab running the suite app
  function createDocTab(appId, options) {
    options = options || {};
    const app = getSuite(appId);
    if (!app) return null;

    tabSeq++;
    const tabId = 'doc-' + tabSeq;
    appCounters[appId] = (appCounters[appId] || 0) + 1;

    /* (before HO11) const title = options.title || (app.name + ' ' + appCounters[appId]); */
    const title = sanitizeDocName(options.title) || untitledLabel(appCounters[appId]);
    const label = displayTabLabel(title);
    /* (before HO12) const hash = options.hash ? ('#' + String(options.hash).replace(/^#/, '')) : ''; */
    const hashRaw = options.hash ? String(options.hash).replace(/^#/, '') : '';
    const src = (typeof OfficeNewDoc !== 'undefined' && OfficeNewDoc.frameSrc)
      ? OfficeNewDoc.frameSrc(app.url, { hash: hashRaw, newBlank: !hashRaw })
      : (app.url + (hashRaw ? ('#' + hashRaw) : ((app.url.indexOf('?') >= 0 ? '&' : '?') + 'new=1')));
    const icon = getAppIcon(appId);

    const tabRecord = {
      id: tabId,
      appId: appId,
      title: title,
      icon: icon,
      /* (before HO12) url: app.url + hash, */
      url: src,
      type: 'doc'
    };
    openTabs.push(tabRecord);

    if (typeof document !== 'undefined') {
      const tabsList = document.getElementById('ho-tabs-list');
      const viewsContainer = document.getElementById('ho-views-container');

      if (tabsList && viewsContainer) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ho-tab';
        btn.id = 'tab-btn-' + tabId;
        btn.dataset.tabId = tabId;
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-selected', 'false');
        btn.title = title;

        const ico = document.createElement('span');
        ico.className = 'ho-tab-icon';
        ico.textContent = icon;

        const lbl = document.createElement('span');
        lbl.className = 'ho-tab-title';
        lbl.textContent = label;
        lbl.title = title;

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'ho-tab-close';
        closeBtn.setAttribute('aria-label', 'Close ' + title);
        closeBtn.innerHTML = '&times;';
        closeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          closeTab(tabId);
        });

        btn.append(ico, lbl, closeBtn);
        btn.addEventListener('click', () => switchTab(tabId));
        tabsList.appendChild(btn);

        const view = document.createElement('div');
        view.className = 'ho-view';
        view.id = 'view-' + tabId;
        view.setAttribute('role', 'tabpanel');
        view.setAttribute('aria-labelledby', 'tab-btn-' + tabId);

        const iframe = document.createElement('iframe');
        iframe.className = 'ho-doc-frame';
        iframe.title = title;
        /* (before HO12) iframe.src = app.url + hash; */
        iframe.src = src;
        /* (before HO10) the iframe was appended with no title-bar hello. */
        iframe.addEventListener('load', function () { helloSuiteFrame(iframe); });

        view.appendChild(iframe);
        viewsContainer.appendChild(view);
      }
    }

    switchTab(tabId);
    return tabRecord;
  }

  function findDriveRef(filename) {
    const D = typeof window !== 'undefined' ? window.FsDrives : null;
    if (!D || typeof D.handle !== 'function' || !filename) return Promise.resolve(null);
    return D.handle('local').then((root) => {
      if (!root) return null;
      return root.getDirectoryHandle('Documents').then((docDir) => {
        return docDir.getFileHandle(filename).then(() => {
          return { drive: 'local', path: 'Documents', name: filename };
        });
      });
    }).catch(() => null);
  }

  function hashForRef(ref) {
    if (!ref) return '';
    if (typeof window !== 'undefined' && window.FsRef && typeof window.FsRef.hash === 'function') {
      return window.FsRef.hash(ref);
    }
    const p = String(ref.path || '').replace(/^\/+|\/+$/g, '');
    return 'drive=' + encodeURIComponent(ref.drive) + (p ? '&path=' + encodeURIComponent(p) : '') + '&file=' + encodeURIComponent(ref.name);
  }

  function openInSuite(appId, title, driveRef, showOpenNote) {
    const app = getSuite(appId);
    const hash = driveRef ? hashForRef(driveRef) : '';
    createDocTab(appId, { title: title, hash: hash });
    if (showOpenNote && !driveRef) {
      const name = app ? app.name : 'the app';
      notify(name + ' is open. Use File → Open to choose ' + title + '.');
    }
  }

  // Open file routing: Hub Documents use #drive=&file=; a dropped File
  // on a standalone page cannot be handed to the iframe, so the suite
  // opens blank with a short in-app note.
  function routeFile(file, driveRef) {
    if (!file) return null;
    const name = file.name || '';
    const appId = routeByFilename(name);
    if (!appId) {
      const ext = getExt(name);
      notify(ext ? ('Hub Office cannot open .' + ext + ' files.') : 'Hub Office cannot open that file.');
      return null;
    }

    trackRecent({
      name: name,
      appId: appId,
      time: Date.now(),
      size: file.size,
      driveRef: driveRef || undefined
    });

    if (driveRef) {
      openInSuite(appId, name, driveRef, false);
      return appId;
    }

    findDriveRef(name).then((found) => {
      if (found) openInSuite(appId, name, found, false);
      else openInSuite(appId, name, null, true);
    });
    return appId;
  }

  function openRecent(item) {
    if (!item || !item.name) return;
    const appId = item.appId || routeByFilename(item.name);
    if (!appId) {
      notify('Hub Office cannot open ' + item.name + '.');
      return;
    }
    if (item.driveRef) {
      openInSuite(appId, item.name, item.driveRef, false);
      return;
    }
    findDriveRef(item.name).then((found) => {
      if (found) openInSuite(appId, item.name, found, false);
      else openInSuite(appId, item.name, null, true);
    });
  }

  // Recent files tracking
  function getLocalRecents() {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (_) {
      return [];
    }
  }

  function trackRecent(entry) {
    try {
      let list = getLocalRecents();
      list = list.filter((item) => item.name !== entry.name);
      list.unshift(entry);
      if (list.length > 25) list = list.slice(0, 25);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
      renderRecents();
    } catch (_) {}
  }

  // Scan Hub Local Drive Documents folder if FsDrives is supported
  async function scanHubDocuments() {
    const D = typeof window !== 'undefined' ? window.FsDrives : null;
    if (!D || !D.handle) return [];
    try {
      const root = await D.handle('local');
      if (!root) return [];
      let docDir = null;
      try {
        docDir = await root.getDirectoryHandle('Documents');
      } catch (_) {
        return [];
      }
      if (!docDir) return [];

      const found = [];
      for await (const [name, handle] of docDir.entries()) {
        if (handle.kind === 'file') {
          const appId = routeByFilename(name);
          if (appId) {
            const file = await handle.getFile();
            found.push({
              name: name,
              appId: appId,
              time: file.lastModified || Date.now(),
              size: file.size,
              driveRef: { drive: 'local', path: 'Documents', name: name }
            });
          }
        }
      }
      return found;
    } catch (_) {
      return [];
    }
  }

  function formatTime(ts, now) {
    if (!ts) return '';
    const diff = (now || Date.now()) - ts;
    const m = Math.floor(diff / 60000);
    if (m < 2) return 'Just now';
    if (m < 60) return m + ' m ago';
    const h = Math.floor(m / 60);
    if (h < 24) return h + ' h ago';
    const d = Math.floor(h / 24);
    if (d < 7) return d + ' d ago';
    return new Date(ts).toLocaleDateString();
  }

  function formatSize(bytes) {
    if (!bytes || bytes <= 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  /* (before HO7) renderNewRow drew the HO6 New icon row. Cards open the apps now. */
  function renderSuites() {
    const grid = document.getElementById('suites-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const tableById = Object.create(null);
    FORMAT_TABLE.forEach((row) => { tableById[row.id] = row; });

    SUITES.forEach((app) => {
      const card = document.createElement('div');
      card.className = 'ho-card';
      card.dataset.id = app.id;
      card.setAttribute('role', 'button');
      card.tabIndex = 0;
      card.setAttribute('aria-label', 'Open ' + app.name);

      function openApp() {
        createDocTab(app.id);
      }
      card.addEventListener('click', openApp);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openApp();
        }
      });

      const header = document.createElement('div');
      header.className = 'ho-card-header';

      const icon = document.createElement('img');
      icon.className = 'ho-card-icon';
      icon.src = app.icon;
      icon.alt = '';
      icon.onerror = () => { icon.style.display = 'none'; };

      const info = document.createElement('div');
      info.className = 'ho-card-info';

      const name = document.createElement('span');
      name.className = 'ho-card-name';
      name.textContent = app.name;
      info.appendChild(name);
      header.append(icon, info);

      const desc = document.createElement('p');
      desc.className = 'ho-card-desc';
      desc.textContent = app.desc || '';

      const fmts = document.createElement('div');
      fmts.className = 'ho-card-formats';
      formatChipGroups(tableById[app.id] || {}).forEach((group) => {
        const g = document.createElement('div');
        g.className = 'ho-fmt-group';
        const label = document.createElement('span');
        label.className = 'ho-fmt-label';
        label.textContent = group.label;
        g.appendChild(label);
        group.formats.forEach((fmt) => {
          const b = document.createElement('span');
          b.className = 'ho-fmt-badge' + (fmt === group.native ? ' ho-fmt-native' : '');
          b.textContent = fmt;
          g.appendChild(b);
        });
        fmts.appendChild(g);
      });

      const actions = document.createElement('div');
      actions.className = 'ho-card-actions';

      const btnNew = document.createElement('button');
      btnNew.type = 'button';
      btnNew.className = 'ho-btn-new';
      const plus = document.createElement('span');
      plus.textContent = '➕';
      const btnLabel = document.createElement('span');
      btnLabel.textContent = 'Open ' + app.name;
      btnNew.append(plus, btnLabel);
      btnNew.addEventListener('click', (e) => {
        e.stopPropagation();
        openApp();
      });
      actions.appendChild(btnNew);

      card.append(header, desc, fmts, actions);
      grid.appendChild(card);
    });
  }

  async function renderRecents() {
    const listEl = document.getElementById('recent-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const localRecents = getLocalRecents();
    const driveRecents = await scanHubDocuments();

    const map = new Map();
    driveRecents.forEach((d) => map.set(d.name, d));
    localRecents.forEach((l) => { if (!map.has(l.name)) map.set(l.name, l); });

    const merged = Array.from(map.values())
      .sort((a, b) => (b.time || 0) - (a.time || 0))
      .slice(0, RECENT_LIMIT);

    if (!merged.length) {
      const empty = document.createElement('div');
      empty.className = 'ho-empty-recent';
      empty.textContent = 'No recent files.';
      listEl.appendChild(empty);
      return;
    }

    merged.forEach((item) => {
      const app = getSuite(item.appId) || { name: 'Office', icon: 'hub_office_icon.png' };
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ho-recent-row';
      row.setAttribute('aria-label', 'Open ' + item.name);

      const icon = document.createElement('img');
      icon.className = 'ho-recent-icon';
      icon.src = app.icon;
      icon.alt = '';
      icon.onerror = () => {
        const span = document.createElement('span');
        span.className = 'ho-recent-icon';
        span.textContent = getAppIcon(item.appId);
        icon.replaceWith(span);
      };

      const name = document.createElement('span');
      name.className = 'ho-recent-name';
      name.textContent = item.name;

      const time = document.createElement('span');
      time.className = 'ho-recent-time';
      time.textContent = item.time ? formatTime(item.time) : '';

      row.append(icon, name, time);
      row.addEventListener('click', () => openRecent(item));
      listEl.appendChild(row);
    });
  }

  /* (before HO7) renderFormatsPanel / initFormatsPanel drew the Supported
     formats link and in-app panel. Cards show the format chips now. */

  function initOpenFile() {
    const input = document.getElementById('file-input');
    const btnOpen = document.getElementById('btn-open-file');

    if (btnOpen && input) {
      btnOpen.addEventListener('click', () => input.click());
    }

    if (input) {
      input.addEventListener('change', () => {
        if (input.files && input.files[0]) {
          routeFile(input.files[0]);
          input.value = '';
        }
      });
    }

    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('keydown', (e) => {
        const mod = e.ctrlKey || e.metaKey;
        if (mod && !e.altKey && (e.key === 'o' || e.key === 'O')) {
          e.preventDefault();
          if (input) input.click();
        }
      });
    }
  }

  function initDropOverlay() {
    const overlay = document.getElementById('ho-drop-overlay');
    const has = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
    let depth = 0;

    function showOverlay(on) {
      if (!overlay) return;
      overlay.hidden = !on;
    }

    function onStartPage() {
      return activeTabId === 'start';
    }

    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    window.addEventListener('dragenter', (e) => {
      if (!has(e) || !onStartPage()) return;
      e.preventDefault();
      depth++;
      showOverlay(true);
    });

    window.addEventListener('dragover', (e) => {
      if (!has(e) || !onStartPage()) return;
      e.preventDefault();
    });

    window.addEventListener('dragleave', () => {
      if (!onStartPage()) return;
      if (--depth <= 0) {
        depth = 0;
        showOverlay(false);
      }
    });

    window.addEventListener('drop', (e) => {
      if (!has(e) || !onStartPage()) {
        depth = 0;
        showOverlay(false);
        return;
      }
      e.preventDefault();
      depth = 0;
      showOverlay(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        routeFile(e.dataTransfer.files[0]);
      }
    });
  }

  /* (before HO8) the Start Page tab (#tab-btn-start) was wired here. */
  function initShortcuts() {
    const btnHome = document.getElementById('btn-home');
    if (btnHome) {
      btnHome.addEventListener('click', () => switchTab('start'));
    }

    const btnAddTab = document.getElementById('btn-add-tab');
    if (btnAddTab) {
      btnAddTab.addEventListener('click', () => createDocTab('writer'));
    }
  }

  function settingsStore() {
    try {
      if (typeof localStorage !== 'undefined') return localStorage;
    } catch (_) {}
    return null;
  }

  function fillSettingsForm(s) {
    if (!s || typeof document === 'undefined') return;
    function setVal(id, value) {
      const el = document.getElementById(id);
      if (el) el.value = value;
    }
    setVal('set-font', s.font);
    setVal('set-font-size', String(s.fontSize));
    setVal('set-paper', s.paper);
    setVal('set-units', s.units);
    setVal('set-date-format', s.dateFormat);
    setVal('set-number-locale', s.numberLocale);
    setVal('set-save-location', s.saveLocation);
    setVal('set-author', s.author);
    const auto = document.getElementById('set-autosave');
    if (auto) auto.checked = s.autosave === true;
  }

  /* Optional ping so an already-open suite iframe can notice a change.
     Suites ignore this message until they are wired in later releases. */
  function notifyOpenSuites() {
    if (typeof document === 'undefined') return;
    const frames = document.querySelectorAll('iframe.ho-doc-frame');
    const target = (typeof location !== 'undefined' && location.origin && location.origin !== 'null')
      ? location.origin
      : '*';
    frames.forEach((frame) => {
      try {
        if (frame.contentWindow) {
          frame.contentWindow.postMessage({ hubOfficeSettings: { v: 1 } }, target);
        }
      } catch (_) {}
    });
  }

  function initSettings() {
    if (typeof OfficeSharedSettings === 'undefined' || typeof document === 'undefined') return;
    if (!document.getElementById('ho-settings')) return;
    const store = settingsStore();

    function apply(s) {
      fillSettingsForm(s);
      notifyOpenSuites();
    }

    apply(OfficeSharedSettings.load(store));

    OfficeSharedSettings.subscribe(apply);

    function patch(partial) {
      const cur = OfficeSharedSettings.load(store);
      const next = OfficeSharedSettings.normalize(Object.assign({}, cur, partial));
      OfficeSharedSettings.save(store, next);
    }

    function bind(id, ev, read) {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener(ev, () => { patch(read(el)); });
    }
    bind('set-font', 'change', (el) => ({ font: el.value }));
    bind('set-font-size', 'change', (el) => ({ fontSize: Number(el.value) }));
    bind('set-paper', 'change', (el) => ({ paper: el.value }));
    bind('set-units', 'change', (el) => ({ units: el.value }));
    bind('set-date-format', 'change', (el) => ({ dateFormat: el.value }));
    bind('set-number-locale', 'change', (el) => ({ numberLocale: el.value }));
    bind('set-autosave', 'change', (el) => ({ autosave: el.checked }));
    bind('set-save-location', 'change', (el) => ({ saveLocation: el.value }));
    bind('set-author', 'change', (el) => ({ author: el.value }));
  }

  function titleBarOrigin() {
    return (typeof location !== 'undefined' && location.origin && location.origin !== 'null') ? location.origin : '*';
  }

  function helloSuiteFrame(iframe) {
    if (typeof HubTitleBar === 'undefined' || !HubTitleBar.linked || !iframe) return;
    try {
      const win = iframe.contentWindow;
      if (!win) return;
      win.postMessage({ hubTitleBarHello: { v: 1 } }, titleBarOrigin());
    } catch (e) { /* frame gone or not yet ready */ }
  }

  function helloAllSuiteFrames() {
    if (typeof document === 'undefined') return;
    const frames = document.querySelectorAll('iframe.ho-doc-frame');
    for (let i = 0; i < frames.length; i++) helloSuiteFrame(frames[i]);
  }

  function frameForTab(tabId) {
    if (typeof document === 'undefined' || !tabId) return null;
    const view = document.getElementById('view-' + tabId);
    return view ? view.querySelector('iframe.ho-doc-frame') : null;
  }

  function tabIdForSource(source) {
    if (!source || typeof document === 'undefined') return null;
    for (let i = 0; i < openTabs.length; i++) {
      const t = openTabs[i];
      if (!t || t.type !== 'doc') continue;
      const frame = frameForTab(t.id);
      try {
        if (frame && frame.contentWindow === source) return t.id;
      } catch (e) { /* ignore */ }
    }
    return null;
  }

  /* Reuse the H49 HubTitleBar hook (office-hubbar.js). After the Hub
     says hello, Home is a title-bar button, and the active document's
     quick buttons are relayed after it. Document tabs and ribbon tabs
     are not sent up — they stay in the in-app rows. Standalone, or a
     frame that never says hello, leaves the in-row Home button visible
     and does not hello the suite iframes, so each suite keeps its own
     quick row. */
  function publishTitleBar(mode, updateButtons) {
    if (typeof HubTitleBar === 'undefined' || !HubTitleBar.linked) return;
    if (mode === 'update' && Array.isArray(updateButtons) && updateButtons.length) {
      HubTitleBar.update({ buttons: updateButtons });
      return;
    }
    const state = (activeTabId && activeTabId !== 'start') ? (hubBarByTab[activeTabId] || null) : null;
    /* (before HO10) HubTitleBar.set({ buttons: [homeTitleBarButton()], align: 'left' }); */
    HubTitleBar.set({ buttons: composeTitleBarButtons(homeTitleBarButton(), state, TITLE_BAR_MAX), align: 'left' });
  }

  function onSuiteTitleBar(tabId, body) {
    const isActive = tabId === activeTabId && activeTabId !== 'start';
    const planned = planTitleBarRelay(hubBarByTab[tabId] || null, body, isActive, homeTitleBarButton(), TITLE_BAR_MAX);
    if (planned.state) hubBarByTab[tabId] = planned.state;
    else delete hubBarByTab[tabId];
    if (planned.publish === 'update') publishTitleBar('update', planned.updateButtons);
    else if (planned.publish === 'set') publishTitleBar('set');
  }

  function forwardTitleBarClick(rawId, kind) {
    if (!rawId || activeTabId === 'start') return;
    const frame = frameForTab(activeTabId);
    if (!frame) return;
    try {
      const win = frame.contentWindow;
      if (!win) return;
      win.postMessage({ hubTitleBarClick: { v: 1, kind: kind, id: rawId } }, titleBarOrigin());
    } catch (e) { /* frame gone */ }
  }

  function initHubHome() {
    if (typeof HubTitleBar === 'undefined') return;
    HubTitleBar.onHello(function () {
      helloAllSuiteFrames();
      publishTitleBar('set');
    });
    HubTitleBar.onClick(function (kind, id) {
      if (kind === 'button' && id === 'home') {
        switchTab('start');
        return;
      }
      if (kind !== 'button') return;
      const raw = unprefixTitleBarId(id);
      if (raw == null || raw === '') return;
      const state = hubBarByTab[activeTabId] || null;
      forwardTitleBarClick(raw, clickKindForRelay(state, raw));
    });
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('message', function (e) {
        if (!e || e.origin !== location.origin) return;
        const d = e.data;
        if (!d || typeof d !== 'object') return;
        const tabId = tabIdForSource(e.source);
        if (!tabId) return;
        if (d.hubTitleBar) onSuiteTitleBar(tabId, d.hubTitleBar);
        /* HO11: a name-only message from the suite iframe. */
        const docName = parseDocNameMessage(d);
        if (docName) applyDocName(tabId, docName);
      });
    }
  }

  function init() {
    initOpenFile();
    initDropOverlay();
    initShortcuts();
    initHubHome();
    initSettings();
    renderSuites();
    renderRecents();
    syncChrome();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

  // Export for testing
  root.HubOffice = {
    VERSION,
    SUITES,
    FORMAT_TABLE,
    EXT_MAP,
    RECENT_LIMIT,
    openTabs,
    getActiveTabId: () => activeTabId,
    createDocTab,
    switchTab,
    closeTab,
    routeFile,
    routeByFilename,
    getExt,
    formatTime,
    formatSize,
    openAcceptList,
    formatChipGroups,
    shouldShowTabBar,
    homeTitleBarButton,
    TITLE_BAR_PREFIX,
    TITLE_BAR_MAX,
    prefixTitleBarId,
    unprefixTitleBarId,
    prefixTitleBarButtons,
    fileButtonFromTabs,
    applyButtonPatch,
    composeTitleBarButtons,
    clickKindForRelay,
    planTitleBarRelay,
    sanitizeDocName,
    displayTabLabel,
    untitledLabel,
    parseDocNameMessage,
    applyDocName
  };

})(typeof window !== 'undefined' ? window : this);
